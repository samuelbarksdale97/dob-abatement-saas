-- Migration 012: Fix stats count and fines inconsistency (BUG-004, BUG-005)
--
-- Problem 1: get_violation_stats() 'total' counts ALL violations including APPROVED/CLOSED,
--            but the UI displays it as "Total Open" — should only count open statuses.
-- Problem 2: get_portfolio_stats() doesn't exclude ghost violations (parse_status='pending'),
--            so property cards show inflated violation counts and fines.

-- Fix get_violation_stats(): 'total' should only count open violations
CREATE OR REPLACE FUNCTION get_violation_stats()
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total', COUNT(*) FILTER (WHERE status NOT IN ('APPROVED', 'CLOSED')),
    'by_status', jsonb_object_agg(COALESCE(status::TEXT, 'UNKNOWN'), cnt),
    'by_priority', jsonb_build_object(
      'P1', COUNT(*) FILTER (WHERE priority = 1 AND status NOT IN ('APPROVED', 'CLOSED')),
      'P2', COUNT(*) FILTER (WHERE priority = 2 AND status NOT IN ('APPROVED', 'CLOSED')),
      'P3', COUNT(*) FILTER (WHERE priority = 3 AND status NOT IN ('APPROVED', 'CLOSED'))
    ),
    'overdue', COUNT(*) FILTER (WHERE abatement_deadline < CURRENT_DATE AND status NOT IN ('APPROVED', 'CLOSED')),
    'due_within_10_days', COUNT(*) FILTER (WHERE abatement_deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 10 AND status NOT IN ('APPROVED', 'CLOSED')),
    'total_fines', COALESCE(SUM(total_fines) FILTER (WHERE status NOT IN ('APPROVED', 'CLOSED')), 0)
  ) INTO result
  FROM (
    SELECT status, priority, abatement_deadline, total_fines, COUNT(*) as cnt
    FROM violations
    WHERE org_id = auth_org_id()
      AND (parse_status IS NULL OR parse_status NOT IN ('pending', 'duplicate'))
    GROUP BY status, priority, abatement_deadline, total_fines
  ) sub;

  RETURN COALESCE(result, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;

-- Fix get_portfolio_stats(): exclude ghost and duplicate violations from property rollups
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
          AND (v2.parse_status IS NULL OR v2.parse_status NOT IN ('pending', 'duplicate'))
          GROUP BY v2.status
        ) s
      ),
      'unit_count', (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id)
    ) as property_row
    FROM properties p
    LEFT JOIN violations v ON v.property_id = p.id
      AND v.org_id = auth_org_id()
      AND (v.parse_status IS NULL OR v.parse_status NOT IN ('pending', 'duplicate'))
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
