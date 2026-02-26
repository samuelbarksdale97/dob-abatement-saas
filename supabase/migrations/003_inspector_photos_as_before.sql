-- Update Auto-Status Trigger: Inspector Photos = BEFORE Photos
-- Migration 003: Contractors only upload AFTER photos (inspector photos serve as BEFORE)
-- Created: February 2026

-- Drop and recreate the trigger with updated logic
DROP TRIGGER IF EXISTS trg_auto_progress_photo_status ON photos;

CREATE OR REPLACE FUNCTION auto_progress_photo_status()
RETURNS TRIGGER AS $$
DECLARE
  wo_id UUID;
  v_id UUID;
  total_items INTEGER;
  items_with_after INTEGER;
BEGIN
  -- Only trigger on contractor AFTER photos
  -- Inspector photos (from NOI PDF) serve as the BEFORE state
  IF NEW.photo_type != 'AFTER' THEN
    RETURN NEW;
  END IF;

  -- Find the active work order for this violation
  SELECT id, violation_id INTO wo_id, v_id
  FROM work_orders
  WHERE violation_id = NEW.violation_id
    AND status IN ('ASSIGNED', 'IN_PROGRESS')
  ORDER BY created_at DESC
  LIMIT 1;

  IF wo_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count total items and AFTER photo coverage
  SELECT COUNT(*) INTO total_items
  FROM violation_items
  WHERE violation_id = v_id;

  SELECT COUNT(DISTINCT violation_item_id) INTO items_with_after
  FROM photos
  WHERE violation_id = v_id
    AND photo_type = 'AFTER'
    AND status != 'REJECTED';

  -- If all items have AFTER photos, mark complete
  -- (Inspector photos from PDF are the implicit BEFORE state)
  IF items_with_after >= total_items THEN
    UPDATE work_orders
    SET status = 'COMPLETED', completed_at = now()
    WHERE id = wo_id AND status != 'COMPLETED';

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

COMMENT ON FUNCTION auto_progress_photo_status IS 'Auto-advances when all items have AFTER photos (inspector photos = before state)';
