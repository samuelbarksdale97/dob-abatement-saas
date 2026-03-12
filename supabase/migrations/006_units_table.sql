-- Migration 006: Units table + property hierarchy
-- Sprint 1: Navigation Hierarchy (Org → Property → Unit → Violation)

-- ============================================================
-- 1. CREATE UNITS TABLE
-- ============================================================

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  is_vacant BOOLEAN DEFAULT false,
  occupant_name TEXT,
  occupant_phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(property_id, unit_number)
);

CREATE INDEX idx_units_property ON units(property_id);
CREATE INDEX idx_units_org ON units(org_id);

-- Auto-update timestamp trigger
CREATE TRIGGER trg_units_updated_at
  BEFORE UPDATE ON units
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 2. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read units" ON units
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "PM/Owner can manage units" ON units
  FOR ALL USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));

-- ============================================================
-- 3. ADD unit_id FK TO VIOLATIONS
-- ============================================================

ALTER TABLE violations ADD COLUMN unit_id UUID REFERENCES units(id) ON DELETE SET NULL;
CREATE INDEX idx_violations_unit ON violations(unit_id) WHERE unit_id IS NOT NULL;

-- ============================================================
-- 4. MIGRATE EXISTING PROPERTY UNIT DATA → UNITS TABLE
-- ============================================================

-- Create unit records from properties that have unit data
INSERT INTO units (org_id, property_id, unit_number, is_vacant, occupant_name, occupant_phone)
SELECT org_id, id, COALESCE(unit, 'Main'), is_vacant, occupant_name, occupant_phone
FROM properties
WHERE unit IS NOT NULL AND unit != '';

-- ============================================================
-- 5. DROP OLD UNIT-LEVEL COLUMNS FROM PROPERTIES
-- ============================================================

ALTER TABLE properties DROP COLUMN IF EXISTS unit;
ALTER TABLE properties DROP COLUMN IF EXISTS is_vacant;
ALTER TABLE properties DROP COLUMN IF EXISTS occupant_name;
ALTER TABLE properties DROP COLUMN IF EXISTS occupant_phone;

-- ============================================================
-- 6. GRANT REALTIME ACCESS
-- ============================================================

GRANT SELECT ON units TO supabase_realtime;

-- ============================================================
-- 7. PORTFOLIO STATS RPC (per-property violation rollups)
-- ============================================================

CREATE OR REPLACE FUNCTION get_portfolio_stats()
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_agg(property_row) INTO result
  FROM (
    SELECT jsonb_build_object(
      'property_id', p.id,
      'address', p.address,
      'city', p.city,
      'state', p.state,
      'zip', p.zip,
      'violation_count', COUNT(v.id),
      'total_fines', COALESCE(SUM(v.total_fines), 0),
      'overdue_count', COUNT(v.id) FILTER (
        WHERE v.abatement_deadline < CURRENT_DATE
        AND v.status NOT IN ('APPROVED', 'CLOSED')
      ),
      'p1_count', COUNT(v.id) FILTER (WHERE v.priority = 1),
      'next_deadline', MIN(v.abatement_deadline) FILTER (
        WHERE v.abatement_deadline >= CURRENT_DATE
        AND v.status NOT IN ('APPROVED', 'CLOSED')
      ),
      'status_counts', (
        SELECT COALESCE(jsonb_object_agg(s.status::text, s.cnt), '{}'::jsonb)
        FROM (
          SELECT v2.status, COUNT(*) as cnt
          FROM violations v2
          WHERE v2.property_id = p.id
          AND v2.org_id = auth_org_id()
          GROUP BY v2.status
        ) s
      ),
      'unit_count', (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id)
    ) as property_row
    FROM properties p
    LEFT JOIN violations v ON v.property_id = p.id AND v.org_id = auth_org_id()
    WHERE p.org_id = auth_org_id()
    GROUP BY p.id, p.address, p.city, p.state, p.zip
    ORDER BY
      COUNT(v.id) FILTER (
        WHERE v.abatement_deadline < CURRENT_DATE
        AND v.status NOT IN ('APPROVED', 'CLOSED')
      ) DESC,
      COUNT(v.id) FILTER (WHERE v.priority = 1) DESC,
      COUNT(v.id) DESC
  ) sub;

  RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;

-- ============================================================
-- 8. PROPERTY DETAIL RPC (per-unit violation rollups)
-- ============================================================

CREATE OR REPLACE FUNCTION get_property_detail(p_property_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  -- Verify property belongs to caller's org
  IF NOT EXISTS (
    SELECT 1 FROM properties WHERE id = p_property_id AND org_id = auth_org_id()
  ) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'property', (
      SELECT jsonb_build_object(
        'id', p.id,
        'address', p.address,
        'city', p.city,
        'state', p.state,
        'zip', p.zip,
        'notes', p.notes,
        'created_at', p.created_at
      )
      FROM properties p
      WHERE p.id = p_property_id
    ),
    'units', COALESCE((
      SELECT jsonb_agg(unit_row ORDER BY u.unit_number)
      FROM (
        SELECT u.id, u.unit_number, u.is_vacant, u.occupant_name, u.occupant_phone,
          jsonb_build_object(
            'id', u.id,
            'unit_number', u.unit_number,
            'is_vacant', u.is_vacant,
            'occupant_name', u.occupant_name,
            'occupant_phone', u.occupant_phone,
            'violation_count', (
              SELECT COUNT(*) FROM violations v
              WHERE v.unit_id = u.id AND v.org_id = auth_org_id()
            ),
            'worst_status', (
              SELECT v.status FROM violations v
              WHERE v.unit_id = u.id AND v.org_id = auth_org_id()
              ORDER BY
                CASE v.status
                  WHEN 'NEW' THEN 1
                  WHEN 'PARSING' THEN 2
                  WHEN 'PARSED' THEN 3
                  WHEN 'ASSIGNED' THEN 4
                  WHEN 'IN_PROGRESS' THEN 5
                  WHEN 'AWAITING_PHOTOS' THEN 6
                  WHEN 'PHOTOS_UPLOADED' THEN 7
                  WHEN 'READY_FOR_SUBMISSION' THEN 8
                  WHEN 'SUBMITTED' THEN 9
                  WHEN 'REJECTED' THEN 10
                  WHEN 'ADDITIONAL_INFO_REQUESTED' THEN 11
                  WHEN 'APPROVED' THEN 12
                  WHEN 'CLOSED' THEN 13
                END ASC
              LIMIT 1
            )
          ) as unit_row
        FROM units u
        WHERE u.property_id = p_property_id AND u.org_id = auth_org_id()
      ) u
    ), '[]'::jsonb),
    'total_violations', (
      SELECT COUNT(*) FROM violations v
      WHERE v.property_id = p_property_id AND v.org_id = auth_org_id()
    ),
    'total_fines', (
      SELECT COALESCE(SUM(v.total_fines), 0) FROM violations v
      WHERE v.property_id = p_property_id AND v.org_id = auth_org_id()
    ),
    'unlinked_violations', (
      SELECT COUNT(*) FROM violations v
      WHERE v.property_id = p_property_id AND v.unit_id IS NULL AND v.org_id = auth_org_id()
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;
