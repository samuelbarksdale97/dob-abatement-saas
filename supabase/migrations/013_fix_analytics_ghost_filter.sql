-- Migration 013: Fix analytics to exclude ghost and duplicate violations
--
-- Problem: get_analytics() counts ALL violations including ghost (parse_status='pending')
-- and duplicates (parse_status='duplicate'), while get_violation_stats() excludes them.
-- This causes the analytics page to show higher counts than the portfolio home.
--
-- Fix: Add the same parse_status filter to all analytics queries.

CREATE OR REPLACE FUNCTION get_analytics(
  p_date_from DATE DEFAULT (CURRENT_DATE - INTERVAL '90 days')::date,
  p_date_to DATE DEFAULT CURRENT_DATE,
  p_property_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  v_result JSONB;
  v_avg_days NUMERIC;
  v_approval_rate NUMERIC;
  v_total_fines NUMERIC;
  v_opened_closed JSONB;
  v_status_dist JSONB;
  v_fines_by_prop JSONB;
  v_contractor_perf JSONB;
BEGIN
  v_org_id := auth_org_id();

  -- Average resolution days
  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (v.updated_at - v.created_at)) / 86400), 0)
  INTO v_avg_days
  FROM violations v
  WHERE v.org_id = v_org_id
    AND v.status IN ('APPROVED', 'CLOSED')
    AND v.created_at::date BETWEEN p_date_from AND p_date_to
    AND (p_property_id IS NULL OR v.property_id = p_property_id)
    AND (v.parse_status IS NULL OR v.parse_status NOT IN ('pending', 'duplicate'));

  -- Approval rate
  SELECT COALESCE(
    ROUND(
      COUNT(*) FILTER (WHERE v.status = 'APPROVED')::numeric /
      NULLIF(COUNT(*) FILTER (WHERE v.status IN ('APPROVED', 'CLOSED', 'REJECTED')), 0) * 100,
      1
    ), 0
  )
  INTO v_approval_rate
  FROM violations v
  WHERE v.org_id = v_org_id
    AND v.created_at::date BETWEEN p_date_from AND p_date_to
    AND (p_property_id IS NULL OR v.property_id = p_property_id)
    AND (v.parse_status IS NULL OR v.parse_status NOT IN ('pending', 'duplicate'));

  -- Total fines
  SELECT COALESCE(SUM(v.total_fines), 0)
  INTO v_total_fines
  FROM violations v
  WHERE v.org_id = v_org_id
    AND v.created_at::date BETWEEN p_date_from AND p_date_to
    AND (p_property_id IS NULL OR v.property_id = p_property_id)
    AND (v.parse_status IS NULL OR v.parse_status NOT IN ('pending', 'duplicate'));

  -- Opened vs closed by week
  SELECT COALESCE(jsonb_agg(week_data ORDER BY week_data->>'week'), '[]'::JSONB)
  INTO v_opened_closed
  FROM (
    SELECT jsonb_build_object(
      'week', week_start::text,
      'opened', COALESCE(opened, 0),
      'closed', COALESCE(closed, 0)
    ) AS week_data
    FROM generate_series(
      date_trunc('week', p_date_from::timestamp),
      date_trunc('week', p_date_to::timestamp),
      '1 week'::interval
    ) AS week_start
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS opened
      FROM violations v
      WHERE v.org_id = v_org_id
        AND date_trunc('week', v.created_at) = week_start
        AND (p_property_id IS NULL OR v.property_id = p_property_id)
        AND (v.parse_status IS NULL OR v.parse_status NOT IN ('pending', 'duplicate'))
    ) o ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS closed
      FROM violations v
      WHERE v.org_id = v_org_id
        AND v.status IN ('APPROVED', 'CLOSED')
        AND date_trunc('week', v.updated_at) = week_start
        AND (p_property_id IS NULL OR v.property_id = p_property_id)
        AND (v.parse_status IS NULL OR v.parse_status NOT IN ('pending', 'duplicate'))
    ) c ON true
  ) sub;

  -- Status distribution
  SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::JSONB)
  INTO v_status_dist
  FROM (
    SELECT v.status, COUNT(*) AS cnt
    FROM violations v
    WHERE v.org_id = v_org_id
      AND (p_property_id IS NULL OR v.property_id = p_property_id)
      AND (v.parse_status IS NULL OR v.parse_status NOT IN ('pending', 'duplicate'))
    GROUP BY v.status
  ) sub;

  -- Fines by property (top 10)
  SELECT COALESCE(jsonb_agg(prop_data ORDER BY prop_data->>'fines' DESC), '[]'::JSONB)
  INTO v_fines_by_prop
  FROM (
    SELECT jsonb_build_object(
      'address', p.address,
      'fines', COALESCE(SUM(v.total_fines), 0)
    ) AS prop_data
    FROM violations v
    JOIN properties p ON p.id = v.property_id
    WHERE v.org_id = v_org_id
      AND v.created_at::date BETWEEN p_date_from AND p_date_to
      AND (v.parse_status IS NULL OR v.parse_status NOT IN ('pending', 'duplicate'))
    GROUP BY p.id, p.address
    ORDER BY SUM(v.total_fines) DESC NULLS LAST
    LIMIT 10
  ) sub;

  -- Contractor performance
  SELECT COALESCE(jsonb_agg(perf_data), '[]'::JSONB)
  INTO v_contractor_perf
  FROM (
    SELECT jsonb_build_object(
      'contractor_name', wo.contractor_name,
      'total_assignments', COUNT(*),
      'completed', COUNT(*) FILTER (WHERE wo.status = 'COMPLETED'),
      'on_time', COUNT(*) FILTER (WHERE wo.status = 'COMPLETED' AND (wo.due_date IS NULL OR wo.completed_at::date <= wo.due_date::date))
    ) AS perf_data
    FROM work_orders wo
    WHERE wo.org_id = v_org_id
      AND wo.contractor_name IS NOT NULL
      AND wo.created_at::date BETWEEN p_date_from AND p_date_to
    GROUP BY wo.contractor_name
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) sub;

  -- Build result
  v_result := jsonb_build_object(
    'avg_resolution_days', ROUND(v_avg_days, 1),
    'approval_rate', v_approval_rate,
    'total_fines', v_total_fines,
    'opened_vs_closed', v_opened_closed,
    'status_distribution', v_status_dist,
    'fines_by_property', v_fines_by_prop,
    'contractor_performance', v_contractor_perf
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;
