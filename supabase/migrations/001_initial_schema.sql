-- DOB Abatement Automation System - Initial Schema
-- Multi-tenant SaaS-ready with RLS

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('OWNER', 'PROJECT_MANAGER', 'CONTRACTOR', 'ADMIN');

CREATE TYPE violation_status AS ENUM (
  'NEW', 'PARSING', 'PARSED', 'ASSIGNED', 'IN_PROGRESS',
  'AWAITING_PHOTOS', 'PHOTOS_UPLOADED', 'READY_FOR_SUBMISSION',
  'SUBMITTED', 'APPROVED', 'REJECTED', 'ADDITIONAL_INFO_REQUESTED', 'CLOSED'
);

CREATE TYPE work_order_status AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TYPE photo_type AS ENUM ('BEFORE', 'AFTER', 'INSPECTOR', 'REFERENCE');

CREATE TYPE photo_status AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

CREATE TYPE submission_response AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ADDITIONAL_INFO_REQUESTED');

-- ============================================================
-- 1. ORGANIZATIONS
-- ============================================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'free',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. PROFILES (extends Supabase Auth)
-- ============================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'CONTRACTOR',
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_profiles_org_id ON profiles(org_id);

-- ============================================================
-- 3. PROPERTIES
-- ============================================================

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  unit TEXT,
  city TEXT DEFAULT 'Washington',
  state TEXT DEFAULT 'DC',
  zip TEXT,
  is_vacant BOOLEAN DEFAULT false,
  occupant_name TEXT,
  occupant_phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_properties_org_id ON properties(org_id);
CREATE INDEX idx_properties_address ON properties(address);

-- ============================================================
-- 4. VIOLATIONS (replaces n8n's `jobs`)
-- ============================================================

CREATE TABLE violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id),
  notice_id TEXT,                          -- "25NOIR-INS-07709"
  respondent TEXT,                         -- "YOKE LEBAUM LLC"
  infraction_address TEXT,                 -- "557 LEBAUM ST SE, Unit:103"
  date_of_service DATE,
  total_fines NUMERIC(10, 2),
  status violation_status DEFAULT 'NEW',
  priority INTEGER DEFAULT 3,             -- 1=critical, 2=high, 3=normal
  abatement_deadline DATE,
  assigned_to UUID REFERENCES profiles(id),
  pdf_storage_path TEXT,                  -- Supabase Storage path to original NOI PDF
  parse_status TEXT DEFAULT 'pending',    -- pending, processing, completed, failed
  parse_metadata JSONB DEFAULT '{}',      -- Step-level progress for real-time UI
  raw_ai_output JSONB,                    -- Raw structured output from OpenAI for debugging
  source TEXT DEFAULT 'manual',           -- 'parser', 'csv_import', 'manual', 'email'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_violations_org_id ON violations(org_id);
CREATE INDEX idx_violations_status ON violations(status);
CREATE INDEX idx_violations_priority ON violations(priority);
CREATE INDEX idx_violations_notice_id ON violations(notice_id);
CREATE INDEX idx_violations_parse_status ON violations(parse_status);

-- ============================================================
-- 5. VIOLATION_ITEMS (replaces n8n's `work_orders`)
-- ============================================================

CREATE TABLE violation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  violation_id UUID NOT NULL REFERENCES violations(id) ON DELETE CASCADE,
  item_number INTEGER,
  violation_code TEXT,                     -- "12-G DCMR § 309.1"
  priority INTEGER DEFAULT 3,
  abatement_deadline TEXT,                 -- "60 Days"
  fine NUMERIC(10, 2),
  violation_description TEXT,
  specific_location TEXT,                  -- "Sleeping Room"
  floor_number TEXT,                       -- "Interior"
  date_of_infraction DATE,
  time_of_infraction TEXT,
  task_description TEXT,                   -- From "Notes:" section of NOI
  status TEXT DEFAULT 'open',             -- open, in_progress, resolved
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_violation_items_violation_id ON violation_items(violation_id);
CREATE INDEX idx_violation_items_org_id ON violation_items(org_id);

-- ============================================================
-- 6. PHOTOS (replaces n8n's `evidence_images`)
-- ============================================================

CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  violation_id UUID NOT NULL REFERENCES violations(id) ON DELETE CASCADE,
  violation_item_id UUID REFERENCES violation_items(id) ON DELETE SET NULL,
  photo_type photo_type NOT NULL,
  storage_path TEXT NOT NULL,              -- Supabase Storage path
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT DEFAULT 'image/jpeg',
  page_number INTEGER,                     -- PDF page number (for INSPECTOR/REFERENCE photos)
  matched_violation_code TEXT,             -- Gemini-matched violation code
  status photo_status DEFAULT 'PENDING_REVIEW',
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  taken_at TIMESTAMPTZ,                    -- From EXIF data
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_photos_violation_id ON photos(violation_id);
CREATE INDEX idx_photos_violation_item_id ON photos(violation_item_id);
CREATE INDEX idx_photos_org_id ON photos(org_id);

-- ============================================================
-- 7. WORK_ORDERS (actual repair assignments)
-- ============================================================

CREATE TABLE work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  violation_id UUID NOT NULL REFERENCES violations(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id),
  status work_order_status DEFAULT 'ASSIGNED',
  due_date DATE,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_work_orders_violation_id ON work_orders(violation_id);
CREATE INDEX idx_work_orders_assigned_to ON work_orders(assigned_to);
CREATE INDEX idx_work_orders_org_id ON work_orders(org_id);

-- ============================================================
-- 8. SUBMISSIONS
-- ============================================================

CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  violation_id UUID NOT NULL REFERENCES violations(id) ON DELETE CASCADE,
  submitted_by UUID REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ DEFAULT now(),
  confirmation_number TEXT,
  document_storage_path TEXT,              -- Generated evidence document
  response_status submission_response DEFAULT 'PENDING',
  response_notes TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_submissions_violation_id ON submissions(violation_id);
CREATE INDEX idx_submissions_org_id ON submissions(org_id);

-- ============================================================
-- 9. AUDIT_LOG
-- ============================================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,                    -- INSERT, UPDATE, DELETE, STATUS_CHANGE
  old_values JSONB,
  new_values JSONB,
  changed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_log_record_id ON audit_log(record_id);
CREATE INDEX idx_audit_log_org_id ON audit_log(org_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- ============================================================
-- 10. NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  type TEXT DEFAULT 'info',               -- info, warning, error, success
  link TEXT,                               -- In-app navigation link
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_org_id ON notifications(org_id);
CREATE INDEX idx_notifications_read ON notifications(read);

-- ============================================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_violations_updated_at BEFORE UPDATE ON violations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_violation_items_updated_at BEFORE UPDATE ON violation_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_photos_updated_at BEFORE UPDATE ON photos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_work_orders_updated_at BEFORE UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_submissions_updated_at BEFORE UPDATE ON submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- AUDIT LOG TRIGGER (auto-log status changes on violations)
-- ============================================================

CREATE OR REPLACE FUNCTION log_violation_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_log (org_id, table_name, record_id, action, old_values, new_values)
    VALUES (
      NEW.org_id,
      'violations',
      NEW.id,
      'STATUS_CHANGE',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_violations_status_change
  AFTER UPDATE ON violations
  FOR EACH ROW
  EXECUTE FUNCTION log_violation_status_change();

-- ============================================================
-- AUTO-CREATE PROFILE ON USER SIGNUP
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create profile if org_id is provided in metadata
  IF NEW.raw_user_meta_data ->> 'org_id' IS NOT NULL THEN
    INSERT INTO profiles (id, org_id, full_name, email, role)
    VALUES (
      NEW.id,
      (NEW.raw_user_meta_data ->> 'org_id')::UUID,
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
      NEW.email,
      COALESCE((NEW.raw_user_meta_data ->> 'role')::user_role, 'CONTRACTOR')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- CUSTOM ACCESS TOKEN HOOK (injects org_id + role into JWT)
-- ============================================================

CREATE OR REPLACE FUNCTION custom_access_token_hook(event JSONB)
RETURNS JSONB AS $$
DECLARE
  claims JSONB;
  user_org_id TEXT;
  user_role_text TEXT;
BEGIN
  claims := event -> 'claims';

  SELECT p.org_id::TEXT, p.role::TEXT INTO user_org_id, user_role_text
  FROM profiles p
  WHERE p.id = (event ->> 'user_id')::UUID;

  IF user_org_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_metadata}',
      COALESCE(claims -> 'app_metadata', '{}'::JSONB) ||
      jsonb_build_object('org_id', user_org_id, 'role', user_role_text)
    );
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Grant execute to supabase_auth_admin for the hook
GRANT EXECUTE ON FUNCTION custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION custom_access_token_hook FROM authenticated, anon, public;

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE violation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's org_id from JWT
CREATE OR REPLACE FUNCTION auth_org_id()
RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID;
$$ LANGUAGE sql STABLE;

-- Helper: get current user's role from JWT
CREATE OR REPLACE FUNCTION auth_role()
RETURNS user_role AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::user_role;
$$ LANGUAGE sql STABLE;

-- Organizations: members can read their own org
CREATE POLICY "Users can read own org" ON organizations
  FOR SELECT USING (id = auth_org_id());

-- Profiles: same org can read, users can update own
CREATE POLICY "Users can read org profiles" ON profiles
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Properties: org-scoped CRUD
CREATE POLICY "Org members can read properties" ON properties
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "PM/Owner can manage properties" ON properties
  FOR ALL USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));

-- Violations: org-scoped read, PM/Owner can write
CREATE POLICY "Org members can read violations" ON violations
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "PM/Owner can manage violations" ON violations
  FOR ALL USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));

-- Violation Items: org-scoped
CREATE POLICY "Org members can read violation items" ON violation_items
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "PM/Owner can manage violation items" ON violation_items
  FOR ALL USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));

-- Photos: org-scoped read, contractors can insert for assigned work orders
CREATE POLICY "Org members can read photos" ON photos
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "PM/Owner can manage photos" ON photos
  FOR ALL USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));

CREATE POLICY "Contractors can insert photos" ON photos
  FOR INSERT WITH CHECK (org_id = auth_org_id() AND auth_role() = 'CONTRACTOR');

-- Work Orders: org-scoped, contractors see only assigned
CREATE POLICY "PM/Owner can read all work orders" ON work_orders
  FOR SELECT USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));

CREATE POLICY "Contractors see assigned work orders" ON work_orders
  FOR SELECT USING (org_id = auth_org_id() AND assigned_to = auth.uid());

CREATE POLICY "PM/Owner can manage work orders" ON work_orders
  FOR ALL USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));

CREATE POLICY "Contractors can update assigned work orders" ON work_orders
  FOR UPDATE USING (org_id = auth_org_id() AND assigned_to = auth.uid());

-- Submissions: org-scoped
CREATE POLICY "Org members can read submissions" ON submissions
  FOR SELECT USING (org_id = auth_org_id());

CREATE POLICY "PM/Owner can manage submissions" ON submissions
  FOR ALL USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));

-- Audit Log: org-scoped read-only
CREATE POLICY "Org members can read audit log" ON audit_log
  FOR SELECT USING (org_id = auth_org_id());

-- Notifications: user can read/update own
CREATE POLICY "Users can read own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================================
-- GRANT REALTIME ACCESS
-- ============================================================

GRANT SELECT ON violations TO supabase_realtime;
GRANT SELECT ON violation_items TO supabase_realtime;
GRANT SELECT ON photos TO supabase_realtime;
GRANT SELECT ON work_orders TO supabase_realtime;
GRANT SELECT ON notifications TO supabase_realtime;

-- ============================================================
-- STATS RPC FUNCTION (for dashboard)
-- ============================================================

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
    GROUP BY status, priority, abatement_deadline, total_fines
  ) sub;

  RETURN COALESCE(result, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;
