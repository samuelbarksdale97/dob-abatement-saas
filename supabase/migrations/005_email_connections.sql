-- Email provider connections for automated NOI intake
-- Supports Gmail OAuth (extensible to Outlook in future)

-- ============================================================
-- EMAIL CONNECTIONS
-- ============================================================

CREATE TABLE email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'gmail',
  connected_email TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  auto_poll_enabled BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  last_sync_message_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',  -- 'active', 'expired', 'disconnected'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, provider)
);

CREATE INDEX idx_email_connections_org_id ON email_connections(org_id);

ALTER TABLE email_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org owners/admins can manage email connections"
  ON email_connections FOR ALL
  USING (org_id = auth_org_id() AND auth_role() IN ('OWNER', 'ADMIN'));

-- ============================================================
-- EMAIL SYNC LOG (track processed messages)
-- ============================================================

CREATE TABLE email_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_connection_id UUID NOT NULL REFERENCES email_connections(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  from_address TEXT,
  subject TEXT,
  received_at TIMESTAMPTZ,
  violation_id UUID REFERENCES violations(id),
  status TEXT DEFAULT 'processed',  -- 'processed', 'skipped', 'failed'
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(email_connection_id, gmail_message_id)
);

CREATE INDEX idx_email_sync_log_org_id ON email_sync_log(org_id);
CREATE INDEX idx_email_sync_log_connection_id ON email_sync_log(email_connection_id);

ALTER TABLE email_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view email sync log"
  ON email_sync_log FOR SELECT
  USING (org_id = auth_org_id());

-- Auto-update timestamps
CREATE TRIGGER trg_email_connections_updated_at
  BEFORE UPDATE ON email_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
