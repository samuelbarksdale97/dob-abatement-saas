-- ============================================================================
-- Migration 007: Notifications & Submissions Enhancements (Sprint 2)
-- ============================================================================
-- Adds:
--   1. priority column to notifications table
--   2. settings JSONB column to profiles table
--   3. generated_pdf_path to submissions table
--   4. Index on notifications for unread queries
-- ============================================================================

-- 1. Add priority to notifications (for deadline urgency levels)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

-- 2. Add settings JSONB to profiles (notification preferences, etc.)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- 3. Add generated_pdf_path to submissions (for evidence PDF storage)
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS generated_pdf_path TEXT;

-- 4. Composite index for efficient unread notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, read)
  WHERE read = false;

-- 5. Index on notifications created_at for ordering
CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON notifications(created_at DESC);
