-- Migration 011: Fix RLS policy gaps found during QA testing
-- BUG-008: audit_log INSERT policy missing (blocks all status transitions)
-- BUG-007: organizations UPDATE policy missing (blocks settings toggle)

-- Fix BUG-008: Allow authenticated users to insert audit_log entries for their org
-- The log_violation_status_change() trigger needs INSERT permission on audit_log
CREATE POLICY "Org members can insert audit log" ON audit_log
  FOR INSERT WITH CHECK (org_id = auth_org_id());

-- Fix BUG-007: Allow owners/admins to update their organization settings
CREATE POLICY "Org admins can update organization" ON organizations
  FOR UPDATE USING (
    id = auth_org_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('OWNER', 'ADMIN')
  )
  WITH CHECK (
    id = auth_org_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('OWNER', 'ADMIN')
  );

-- Fix BUG-003/004/005: Exclude ghost violations (parse_status='pending') from stats
-- Recreate get_violation_stats() to filter out unparsed ghost records
CREATE OR REPLACE FUNCTION get_violation_stats()
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'by_status', jsonb_object_agg(COALESCE(status::TEXT, 'UNKNOWN'), cnt),
    'by_priority', jsonb_build_object(
      'P1', COUNT(*) FILTER (WHERE priority = 1),
      'P2', COUNT(*) FILTER (WHERE priority = 2),
      'P3', COUNT(*) FILTER (WHERE priority = 3)
    ),
    'overdue', COUNT(*) FILTER (WHERE abatement_deadline < CURRENT_DATE AND status NOT IN ('APPROVED', 'CLOSED')),
    'due_within_10_days', COUNT(*) FILTER (WHERE abatement_deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 10 AND status NOT IN ('APPROVED', 'CLOSED')),
    'total_fines', COALESCE(SUM(total_fines), 0)
  ) INTO result
  FROM (
    SELECT status, priority, abatement_deadline, total_fines, COUNT(*) as cnt
    FROM violations
    WHERE org_id = auth_org_id()
      AND (parse_status IS NULL OR parse_status != 'pending')
    GROUP BY status, priority, abatement_deadline, total_fines
  ) sub;

  RETURN COALESCE(result, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;
