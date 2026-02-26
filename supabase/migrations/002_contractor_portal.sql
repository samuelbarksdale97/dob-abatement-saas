-- Contractor Portal: Magic Links + Photo Upload
-- Migration 002: Enables work order assignment and contractor photo uploads
-- Created: February 2026

-- =============================================================================
-- 1. CONTRACTOR TOKENS TABLE
-- =============================================================================
-- Magic link tokens for external contractor access (no Supabase Auth required)
-- Token is opaque (crypto.randomUUID), not a JWT. Revocable via revoked_at.

CREATE TABLE contractor_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,

  -- Token (opaque, revocable)
  token TEXT NOT NULL UNIQUE,

  -- Contractor identity (no auth.users account)
  contractor_name TEXT NOT NULL,
  contractor_email TEXT NOT NULL,
  contractor_phone TEXT,

  -- Lifecycle
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,           -- NULL = active
  last_accessed_at TIMESTAMPTZ,

  -- Audit
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_expiration CHECK (expires_at > created_at)
);

-- Indexes
CREATE INDEX idx_contractor_tokens_token ON contractor_tokens(token)
  WHERE revoked_at IS NULL;  -- Partial index for active tokens only
CREATE INDEX idx_contractor_tokens_work_order ON contractor_tokens(work_order_id);
CREATE INDEX idx_contractor_tokens_org ON contractor_tokens(org_id);
CREATE INDEX idx_contractor_tokens_expires ON contractor_tokens(expires_at)
  WHERE revoked_at IS NULL;  -- For cleanup cron job

COMMENT ON TABLE contractor_tokens IS 'Magic link tokens for external contractor access (no Supabase Auth required)';
COMMENT ON COLUMN contractor_tokens.token IS 'Opaque random token (crypto.randomUUID), not a JWT. Revocable via revoked_at.';

-- =============================================================================
-- 2. ADD CONTRACTOR FIELDS TO WORK_ORDERS
-- =============================================================================
-- Denormalized contractor info for display (source of truth is contractor_tokens)
-- assigned_to (FK to profiles) is for internal team members
-- contractor_name/email/phone is for external contractors via magic links

ALTER TABLE work_orders
  ADD COLUMN contractor_name TEXT,
  ADD COLUMN contractor_email TEXT,
  ADD COLUMN contractor_phone TEXT;

COMMENT ON COLUMN work_orders.contractor_name IS 'External contractor name (for magic link assignments). NULL if assigned_to is set.';

-- =============================================================================
-- 3. CREATE CONTRACTOR PHOTOS STORAGE BUCKET
-- =============================================================================
-- Separate bucket from noi-pdfs for clear access policies and lifecycle management
-- Path structure: {org_id}/{work_order_id}/{violation_item_id}/{photo_type}_{timestamp}.jpg

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contractor-photos',
  'contractor-photos',
  false,  -- Private; signed URLs required
  10485760,  -- 10MB max per upload
  ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 4. AUTO-STATUS PROGRESSION TRIGGER
-- =============================================================================
-- When all violation items have both BEFORE and AFTER photos, auto-advance status
-- Trigger fires on photos INSERT. Uses SECURITY DEFINER (admin context).

CREATE OR REPLACE FUNCTION auto_progress_photo_status()
RETURNS TRIGGER AS $$
DECLARE
  wo_id UUID;
  v_id UUID;
  total_items INTEGER;
  items_with_before INTEGER;
  items_with_after INTEGER;
BEGIN
  -- Only trigger on contractor BEFORE/AFTER photos (not INSPECTOR/REFERENCE)
  IF NEW.photo_type NOT IN ('BEFORE', 'AFTER') THEN
    RETURN NEW;
  END IF;

  -- Find the active work order for this violation
  SELECT id, violation_id INTO wo_id, v_id
  FROM work_orders
  WHERE violation_id = NEW.violation_id
    AND status IN ('ASSIGNED', 'IN_PROGRESS')
  ORDER BY created_at DESC  -- Most recent if multiple
  LIMIT 1;

  IF wo_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count total items and photo coverage
  SELECT COUNT(*) INTO total_items
  FROM violation_items
  WHERE violation_id = v_id;

  SELECT COUNT(DISTINCT violation_item_id) INTO items_with_before
  FROM photos
  WHERE violation_id = v_id
    AND photo_type = 'BEFORE'
    AND status != 'REJECTED';

  SELECT COUNT(DISTINCT violation_item_id) INTO items_with_after
  FROM photos
  WHERE violation_id = v_id
    AND photo_type = 'AFTER'
    AND status != 'REJECTED';

  -- If all items have both before AND after (excluding rejected), mark complete
  IF items_with_before >= total_items AND items_with_after >= total_items THEN
    -- Update work order status (idempotent)
    UPDATE work_orders
    SET status = 'COMPLETED', completed_at = now()
    WHERE id = wo_id AND status != 'COMPLETED';

    -- Update violation status (conservative — only if not already further along)
    UPDATE violations
    SET status = 'PHOTOS_UPLOADED'
    WHERE id = v_id
      AND status NOT IN ('PHOTOS_UPLOADED', 'READY_FOR_SUBMISSION', 'SUBMITTED', 'APPROVED', 'CLOSED');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_auto_progress_photo_status
  AFTER INSERT ON photos
  FOR EACH ROW
  EXECUTE FUNCTION auto_progress_photo_status();

COMMENT ON FUNCTION auto_progress_photo_status IS 'Auto-advances work order and violation status when all photos uploaded';

-- =============================================================================
-- 5. CLEANUP FUNCTION (FOR CRON)
-- =============================================================================
-- Revoke expired tokens (run daily via pg_cron or external scheduler)

CREATE OR REPLACE FUNCTION cleanup_expired_contractor_tokens()
RETURNS INTEGER AS $$
DECLARE
  revoked_count INTEGER;
BEGIN
  UPDATE contractor_tokens
  SET revoked_at = now()
  WHERE expires_at < now()
    AND revoked_at IS NULL;

  GET DIAGNOSTICS revoked_count = ROW_COUNT;
  RETURN revoked_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_expired_contractor_tokens IS 'Revokes all expired tokens. Run daily via cron.';
