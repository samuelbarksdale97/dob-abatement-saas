-- ============================================================================
-- Migration 008: Universal Contacts System (Sprint 3)
-- ============================================================================
-- Creates:
--   1. contact_category and interaction_type enums
--   2. contacts table (universal directory)
--   3. contact_interactions table (auto/manual interaction log)
--   4. contact_entity_links table (many-to-many links)
--   5. Migrates contractors → contacts
--   6. Backfills entity links + interactions from work order history
-- ============================================================================

-- 1. Enums
CREATE TYPE contact_category AS ENUM (
  'CONTRACTOR', 'GOVERNMENT', 'TENANT', 'INTERNAL', 'VENDOR', 'OTHER'
);

CREATE TYPE interaction_type AS ENUM (
  'NOTE', 'PHONE_CALL', 'EMAIL', 'MEETING', 'SYSTEM_EVENT'
);

-- 2. Contacts table
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  title TEXT,
  category contact_category NOT NULL DEFAULT 'OTHER',
  tags TEXT[] DEFAULT '{}',
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  legacy_contractor_id UUID,
  active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  notes TEXT,
  last_interaction_at TIMESTAMPTZ,
  total_interactions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (org_id, email)
);

CREATE INDEX idx_contacts_org ON contacts(org_id);
CREATE INDEX idx_contacts_category ON contacts(org_id, category);
CREATE INDEX idx_contacts_active ON contacts(org_id, active) WHERE active = true;
CREATE INDEX idx_contacts_last_interaction ON contacts(org_id, last_interaction_at DESC NULLS LAST);
CREATE INDEX idx_contacts_profile ON contacts(profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX idx_contacts_tags ON contacts USING gin (tags);

-- 3. Contact interactions table
CREATE TABLE contact_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  interaction_type interaction_type NOT NULL DEFAULT 'NOTE',
  subject TEXT,
  body TEXT,
  direction TEXT, -- 'inbound', 'outbound', NULL
  source_table TEXT,
  source_record_id UUID,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  violation_id UUID REFERENCES violations(id) ON DELETE SET NULL,
  work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_interactions_contact ON contact_interactions(contact_id, occurred_at DESC);
CREATE INDEX idx_interactions_org ON contact_interactions(org_id);
CREATE INDEX idx_interactions_violation ON contact_interactions(violation_id) WHERE violation_id IS NOT NULL;

-- 4. Contact entity links table
CREATE TABLE contact_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- 'property', 'violation', 'work_order'
  entity_id UUID NOT NULL,
  role TEXT, -- 'assigned_contractor', 'inspector', 'tenant', 'point_of_contact'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contact_id, entity_type, entity_id)
);

CREATE INDEX idx_contact_links_contact ON contact_entity_links(contact_id);
CREATE INDEX idx_contact_links_entity ON contact_entity_links(entity_type, entity_id);

-- 5. Auto-update trigger for contact last_interaction
CREATE OR REPLACE FUNCTION update_contact_last_interaction()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE contacts
  SET last_interaction_at = NEW.occurred_at,
      total_interactions = total_interactions + 1
  WHERE id = NEW.contact_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_contact_last_interaction
  AFTER INSERT ON contact_interactions
  FOR EACH ROW EXECUTE FUNCTION update_contact_last_interaction();

-- 6. RLS policies
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_entity_links ENABLE ROW LEVEL SECURITY;

-- Contacts: org members can read, PM/Owner/Admin can write
CREATE POLICY "Org members can read contacts" ON contacts
  FOR SELECT USING (org_id = auth_org_id());
CREATE POLICY "PM/Owner/Admin can insert contacts" ON contacts
  FOR INSERT WITH CHECK (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));
CREATE POLICY "PM/Owner/Admin can update contacts" ON contacts
  FOR UPDATE USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));
CREATE POLICY "PM/Owner/Admin can delete contacts" ON contacts
  FOR DELETE USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));

-- Interactions: org members can read, PM/Owner/Admin can write
CREATE POLICY "Org members can read interactions" ON contact_interactions
  FOR SELECT USING (org_id = auth_org_id());
CREATE POLICY "PM/Owner/Admin can insert interactions" ON contact_interactions
  FOR INSERT WITH CHECK (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));

-- Entity links: org members can read, PM/Owner/Admin can write
CREATE POLICY "Org members can read links" ON contact_entity_links
  FOR SELECT USING (org_id = auth_org_id());
CREATE POLICY "PM/Owner/Admin can insert links" ON contact_entity_links
  FOR INSERT WITH CHECK (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));
CREATE POLICY "PM/Owner/Admin can delete links" ON contact_entity_links
  FOR DELETE USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'PROJECT_MANAGER', 'ADMIN'));

-- 7. Realtime access
ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE contact_interactions;

-- ============================================================================
-- 8. Data Migration: contractors → contacts
-- ============================================================================

-- Copy contractors to contacts
INSERT INTO contacts (org_id, full_name, email, phone, category, active, notes, legacy_contractor_id, last_interaction_at, total_interactions, created_at, updated_at)
SELECT org_id, name, email, phone, 'CONTRACTOR'::contact_category, active, notes, id, last_assigned_at, total_assignments, created_at, updated_at
FROM contractors
ON CONFLICT (org_id, email) DO NOTHING;

-- Create entity links from work order history
INSERT INTO contact_entity_links (org_id, contact_id, entity_type, entity_id, role)
SELECT DISTINCT c.org_id, ct.id, 'work_order', wo.id, 'assigned_contractor'
FROM contacts ct
JOIN contractors c ON ct.legacy_contractor_id = c.id
JOIN work_orders wo ON wo.contractor_email = c.email AND wo.org_id = c.org_id
ON CONFLICT DO NOTHING;

-- Backfill interactions from work order assignments
INSERT INTO contact_interactions (org_id, contact_id, interaction_type, subject, source_table, source_record_id, work_order_id, violation_id, occurred_at)
SELECT c.org_id, ct.id, 'SYSTEM_EVENT'::interaction_type, 'Assigned to work order', 'work_orders', wo.id, wo.id, wo.violation_id, wo.created_at
FROM contacts ct
JOIN contractors c ON ct.legacy_contractor_id = c.id
JOIN work_orders wo ON wo.contractor_email = c.email AND wo.org_id = c.org_id;
