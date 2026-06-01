-- ============================================================================
-- Migration 014: Member Deactivation (soft remove)
-- ============================================================================
-- Adds an `active` flag to profiles so org OWNERs can deactivate a team member
-- without destroying history (work orders, audit log, invitations.invited_by).
-- Deactivated members are also banned at the auth layer (see DELETE
-- /api/team/[userId]) so they can no longer sign in. Reactivation restores both
-- the flag (PATCH /api/team/[userId]) and auth access.
--
-- Additive + backward-compatible: existing rows default to active = true, and
-- code that does not select `active` is unaffected. Deploy ordering: apply this
-- migration BEFORE shipping the code that selects `active` in GET /api/team.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- Speeds up active-member and active-owner counts used by team management.
CREATE INDEX IF NOT EXISTS idx_profiles_org_active ON profiles(org_id, active);
