-- Contractors Registry Table
-- Migration 004: Store contractor profiles for easy re-assignment
-- Created: February 2026

-- =============================================================================
-- HELPER FUNCTION (if not already exists)
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- CONTRACTORS TABLE
-- =============================================================================

CREATE TABLE contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Contractor identity
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,

  -- Usage tracking
  total_assignments INTEGER DEFAULT 0,
  last_assigned_at TIMESTAMPTZ,

  -- Status
  active BOOLEAN DEFAULT true,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Unique contractor per org (by email)
  UNIQUE(org_id, email)
);

-- Indexes
CREATE INDEX idx_contractors_org ON contractors(org_id);
CREATE INDEX idx_contractors_email ON contractors(org_id, email);
CREATE INDEX idx_contractors_active ON contractors(org_id, active) WHERE active = true;
CREATE INDEX idx_contractors_recent ON contractors(org_id, last_assigned_at DESC);

-- Update timestamp trigger
CREATE TRIGGER update_contractors_updated_at
  BEFORE UPDATE ON contractors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE contractors IS 'Contractor registry for quick re-assignment via dropdown';
COMMENT ON COLUMN contractors.total_assignments IS 'Count of work orders assigned to this contractor';

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view contractors in their org
CREATE POLICY "Users can view org contractors"
ON contractors FOR SELECT
TO authenticated
USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- PM/Owner/Admin can manage contractors
CREATE POLICY "PM can manage contractors"
ON contractors FOR ALL
TO authenticated
USING (
  org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('PROJECT_MANAGER', 'OWNER', 'ADMIN')
)
WITH CHECK (
  org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
  AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('PROJECT_MANAGER', 'OWNER', 'ADMIN')
);
