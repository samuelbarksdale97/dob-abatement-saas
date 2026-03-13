# Contractor Portal Deployment Guide

## Overview

This guide covers deploying the contractor portal feature, which enables:
- Property managers to assign violations to contractors via magic links
- Contractors to view work orders and upload before/after photos
- Automatic status progression when all photos are uploaded

## Implementation Summary

### Completed Features

#### API Routes (4 new routes)
1. **POST /api/work-orders** - Create work order and send magic link email
2. **GET /api/contractor/[token]** - Fetch work order data for contractor
3. **POST /api/contractor/[token]/photos** - Upload before/after photos
4. **PATCH /api/contractor/[token]/status** - Update work order status

#### UI Components
1. **AssignWorkOrderDialog** - PM dialog to assign contractors
2. **PhotoUploadSlot** - Mobile-first photo upload with camera capture
3. **Contractor View Page** - Public page at `/contractor/[token]`

#### Infrastructure
1. **Middleware update** - Exclude `/contractor` routes from auth
2. **Migration** - Database schema changes (002_contractor_portal.sql)
3. **Tests** - 30+ tests covering all new functionality

### Test Results

All tests are passing:
- contractor-auth.ts: 5 tests ✓
- POST /api/work-orders: 6 tests ✓
- GET /api/contractor/[token]: 4 tests ✓
- POST /api/contractor/[token]/photos: 7 tests ✓
- PATCH /api/contractor/[token]/status: 4 tests ✓
- AssignWorkOrderDialog: 5 tests ✓
- PhotoUploadSlot: 6 tests ✓

**Total: 37 tests passing**

## Deployment Steps

### 1. Supabase Database Migration

**Apply the migration via Supabase Dashboard:**

1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql
2. Copy contents of `supabase/migrations/002_contractor_portal.sql`
3. Paste and run the SQL
4. Verify tables created:
   - `contractor_tokens` table exists
   - `work_orders` has new columns: `contractor_name`, `contractor_email`, `contractor_phone`
   - Trigger `trg_auto_progress_photo_status` exists

**Verify the migration:**
```sql
-- Check contractor_tokens table
SELECT * FROM contractor_tokens LIMIT 1;

-- Check work_orders columns
SELECT contractor_name, contractor_email, contractor_phone
FROM work_orders LIMIT 1;

-- Check trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'trg_auto_progress_photo_status';
```

### 2. Create Storage Bucket

**Via Supabase Dashboard > Storage:**

1. Go to Storage section
2. Create new bucket:
   - Name: `contractor-photos`
   - Public: **No** (private, signed URLs only)
   - File size limit: 10MB
   - Allowed MIME types: image/jpeg, image/png, image/heic, image/webp

**Or run this SQL if bucket creation via UI fails:**
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contractor-photos',
  'contractor-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
```

**Set bucket policies (Storage > contractor-photos > Policies):**

No RLS policies needed (we use service role key via createAdminClient for all contractor routes).

### 3. Environment Variables

**Add to Vercel or local .env.local:**

```bash
# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxx

# App URL (for magic links)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# Already set (verify these exist):
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
```

**Get Resend API Key:**
1. Sign up at https://resend.com
2. Create API key
3. Add to Vercel environment variables

### 4. Deploy to Vercel

**Option A: Push to GitHub (auto-deploy)**
```bash
git add .
git commit -m "feat: contractor portal with magic links and photo upload"
git push origin main
```

Vercel will auto-deploy from main branch.

**Option B: Vercel CLI**
```bash
vercel --prod
```

### 5. Post-Deployment Verification

**Test the full flow:**

1. **Login as PM**
   - Navigate to a parsed violation
   - Click "Assign Contractor" button
   - Fill in contractor details
   - Verify email is sent (check Resend logs)

2. **Open magic link**
   - Copy the magic link from the toast notification
   - Open in an incognito window (to test without auth)
   - Verify contractor page loads

3. **Upload photos**
   - Click "Start Work" button
   - Upload a BEFORE photo for the first item
   - Upload an AFTER photo for the first item
   - Repeat for all items
   - Verify "Mark Complete" button becomes enabled

4. **Complete work order**
   - Click "Mark Complete"
   - Refresh PM's violation detail page
   - Verify status updated to PHOTOS_UPLOADED

**Check Supabase logs for errors:**
- Dashboard > Logs > API
- Look for 500 errors or failed requests

## Troubleshooting

### Email not sending

**Symptom:** No email received after assigning contractor

**Fix:**
1. Check RESEND_API_KEY is set in Vercel
2. Check Resend dashboard for failed sends
3. Verify sender email is verified in Resend
4. Check server logs for email errors

### Magic link returns 401

**Symptom:** Contractor page shows "Invalid token"

**Fix:**
1. Verify token exists in `contractor_tokens` table
2. Check `expires_at` is in the future
3. Check `revoked_at` is NULL
4. Verify middleware excludes `/contractor` routes

### Photo upload fails

**Symptom:** Upload shows error or hangs

**Fix:**
1. Verify `contractor-photos` bucket exists
2. Check SUPABASE_SERVICE_ROLE_KEY is set
3. Check file size < 10MB
4. Check file is valid image type
5. Look for CORS errors in browser console

### Status doesn't auto-progress

**Symptom:** All photos uploaded but status still IN_PROGRESS

**Fix:**
1. Verify trigger `trg_auto_progress_photo_status` exists
2. Check all violation items have both BEFORE and AFTER photos
3. Check no photos have status = 'REJECTED'
4. Manually run trigger logic:
```sql
SELECT
  COUNT(*) as total_items,
  COUNT(DISTINCT CASE WHEN photo_type = 'BEFORE' THEN violation_item_id END) as before_count,
  COUNT(DISTINCT CASE WHEN photo_type = 'AFTER' THEN violation_item_id END) as after_count
FROM violation_items vi
LEFT JOIN photos p ON p.violation_item_id = vi.id
WHERE vi.violation_id = 'YOUR_VIOLATION_ID';
```

## Rollback Plan

If issues arise, rollback by:

1. **Disable contractor routes** (emergency):
   ```typescript
   // In src/middleware.ts, add:
   if (request.nextUrl.pathname.startsWith('/contractor')) {
     return NextResponse.json({ error: 'Temporarily unavailable' }, { status: 503 });
   }
   ```

2. **Revert database migration** (if necessary):
   ```sql
   DROP TRIGGER IF EXISTS trg_auto_progress_photo_status ON photos;
   DROP FUNCTION IF EXISTS auto_progress_photo_status();
   DROP TABLE IF EXISTS contractor_tokens CASCADE;
   ALTER TABLE work_orders
     DROP COLUMN IF EXISTS contractor_name,
     DROP COLUMN IF EXISTS contractor_email,
     DROP COLUMN IF EXISTS contractor_phone;
   ```

3. **Revert code changes:**
   ```bash
   git revert HEAD
   git push origin main
   ```

## Monitoring

**Key metrics to track:**

1. **Work order assignment rate**
   ```sql
   SELECT DATE(created_at), COUNT(*)
   FROM work_orders
   WHERE created_at > NOW() - INTERVAL '7 days'
   GROUP BY DATE(created_at)
   ORDER BY DATE(created_at);
   ```

2. **Photo upload completion rate**
   ```sql
   SELECT
     status,
     COUNT(*) as count
   FROM work_orders
   WHERE created_at > NOW() - INTERVAL '7 days'
   GROUP BY status;
   ```

3. **Token expiration**
   ```sql
   SELECT COUNT(*)
   FROM contractor_tokens
   WHERE expires_at < NOW() AND revoked_at IS NULL;
   ```

**Set up alerts for:**
- Email send failures (Resend webhooks)
- Photo upload errors (Supabase logs)
- Token access after expiration

## Next Steps (Future Enhancements)

- [ ] Add SMS notifications via Twilio
- [ ] Add contractor mobile app (React Native)
- [ ] Add photo approval workflow for PMs
- [ ] Add email reminders for overdue work orders
- [ ] Add analytics dashboard for contractor performance

## Support

**For issues or questions:**
- Check logs: Vercel > Deployments > [latest] > Logs
- Check Supabase: Dashboard > Logs > API
- Check Resend: Dashboard > Logs
- Review test output: `npm test`

---

**Deployment completed by:** Claude Sonnet 4.5
**Date:** February 24, 2026
**Version:** 002_contractor_portal
