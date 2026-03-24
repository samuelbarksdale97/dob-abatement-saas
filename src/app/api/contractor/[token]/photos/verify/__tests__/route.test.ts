import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';
import { NextRequest } from 'next/server';

// Thenable chain mock — supports .single() and top-level `await chain`
function makeMock(data: any, error: any = null) {
  const result = { data, error };
  const chain: any = {};
  ['select', 'update', 'insert', 'delete', 'upsert', 'neq', 'order', 'limit', 'range'].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  // Make thenable so `await chain` resolves to { data, error }
  chain.then = (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  return chain;
}

const mockValidateToken = vi.fn();
vi.mock('@/lib/contractor-auth', () => ({
  validateContractorToken: (...args: any[]) => mockValidateToken(...args),
}));

const mockFrom = vi.fn();
const mockStorageDownload = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: mockFrom,
    storage: {
      from: vi.fn(() => ({ download: mockStorageDownload })),
    },
  }),
}));

const mockVerifyPhotoAngle = vi.fn();
vi.mock('@/lib/ai/gemini', () => ({
  verifyPhotoAngle: (...args: any[]) => mockVerifyPhotoAngle(...args),
}));

function makeRequest(body: Record<string, unknown>, token = 'valid-token') {
  return new NextRequest(`http://localhost:3000/api/contractor/${token}/photos/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/contractor/[token]/photos/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateToken.mockResolvedValue({
      valid: true,
      data: { work_order_id: 'wo-1', org_id: 'org-1' },
    });
  });

  it('returns 401 for invalid token', async () => {
    mockValidateToken.mockResolvedValue({ valid: false, error: 'Invalid token' });

    const res = await POST(
      makeRequest({ photo_id: 'p-1', inspector_image_data: 'base64' }, 'bad-token'),
      { params: Promise.resolve({ token: 'bad-token' }) },
    );

    expect(res.status).toBe(401);
  });

  it('returns 400 when photo_id is missing', async () => {
    const res = await POST(
      makeRequest({ inspector_image_data: 'base64' }),
      { params: Promise.resolve({ token: 'valid-token' }) },
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when inspector_image_data is missing', async () => {
    const res = await POST(
      makeRequest({ photo_id: 'p-1' }),
      { params: Promise.resolve({ token: 'valid-token' }) },
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when photo does not belong to the work order violation', async () => {
    mockFrom.mockReturnValueOnce(makeMock({ id: 'wo-1', violation_id: 'v-1' }));
    mockFrom.mockReturnValueOnce(
      makeMock({ id: 'p-1', violation_id: 'v-WRONG', storage_path: 'path', metadata: {}, mime_type: 'image/jpeg' }),
    );

    const res = await POST(
      makeRequest({ photo_id: 'p-1', inspector_image_data: 'base64' }),
      { params: Promise.resolve({ token: 'valid-token' }) },
    );

    expect(res.status).toBe(400);
  });

  describe('QA mode (skip_photo_verification = true)', () => {
    it('auto-approves without calling AI and returns skipped=true', async () => {
      mockFrom.mockReturnValueOnce(makeMock({ id: 'wo-1', violation_id: 'v-1' }));
      mockFrom.mockReturnValueOnce(
        makeMock({ id: 'p-1', violation_id: 'v-1', storage_path: 'path', metadata: {}, mime_type: 'image/jpeg' }),
      );
      mockFrom.mockReturnValueOnce(makeMock({ settings: { skip_photo_verification: true } }));
      mockFrom.mockReturnValueOnce(makeMock(null)); // photo update
      mockFrom.mockReturnValueOnce(makeMock([{ id: 'p-1', status: 'APPROVED' }])); // all AFTER photos
      mockFrom.mockReturnValueOnce(makeMock(null)); // violations update

      const res = await POST(
        makeRequest({ photo_id: 'p-1', inspector_image_data: 'base64' }),
        { params: Promise.resolve({ token: 'valid-token' }) },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.verification.skipped).toBe(true);
      expect(json.verification.isMatch).toBe(true);
      expect(json.verification.confidence).toBe(100);
      expect(mockVerifyPhotoAngle).not.toHaveBeenCalled();
    });
  });

  describe('status guard: auto-progression to READY_FOR_SUBMISSION', () => {
    it('uses .eq("status", "PHOTOS_UPLOADED") — not .in() — for the violations update', async () => {
      mockFrom.mockReturnValueOnce(makeMock({ id: 'wo-1', violation_id: 'v-1' }));
      mockFrom.mockReturnValueOnce(
        makeMock({ id: 'p-1', violation_id: 'v-1', storage_path: 'path', metadata: {}, mime_type: 'image/jpeg' }),
      );
      mockFrom.mockReturnValueOnce(makeMock({ settings: { skip_photo_verification: true } }));
      mockFrom.mockReturnValueOnce(makeMock(null)); // photo update
      mockFrom.mockReturnValueOnce(makeMock([{ id: 'p-1', status: 'APPROVED' }])); // all AFTER approved
      const violationsMock = makeMock(null);
      mockFrom.mockReturnValueOnce(violationsMock); // violations update

      await POST(
        makeRequest({ photo_id: 'p-1', inspector_image_data: 'base64' }),
        { params: Promise.resolve({ token: 'valid-token' }) },
      );

      // Must use .eq('status', 'PHOTOS_UPLOADED') — not .in('status', [...])
      expect(violationsMock.update).toHaveBeenCalledWith({ status: 'READY_FOR_SUBMISSION' });
      expect(violationsMock.eq).toHaveBeenCalledWith('status', 'PHOTOS_UPLOADED');
      expect(violationsMock.in).not.toHaveBeenCalled();
    });

    it('does not attempt violations update when photo confidence is below 80%', async () => {
      mockVerifyPhotoAngle.mockResolvedValueOnce({
        result: { isMatch: false, confidence: 55, reasoning: 'Different angle', details: 'Mismatch' },
        meta: { model: 'gemini', usage: { cost_usd: 0.001 } },
      });

      mockFrom.mockReturnValueOnce(makeMock({ id: 'wo-1', violation_id: 'v-1' }));
      mockFrom.mockReturnValueOnce(
        makeMock({ id: 'p-1', violation_id: 'v-1', storage_path: 'path', metadata: {}, mime_type: 'image/jpeg' }),
      );
      mockFrom.mockReturnValueOnce(makeMock({ settings: {} })); // no skip
      mockStorageDownload.mockResolvedValue({ data: new Blob(['img']), error: null });
      mockFrom.mockReturnValueOnce(makeMock(null)); // photo update

      const res = await POST(
        makeRequest({ photo_id: 'p-1', inspector_image_data: 'data:image/jpeg;base64,abc' }),
        { params: Promise.resolve({ token: 'valid-token' }) },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.verification.isMatch).toBe(false);

      // Only 4 from() calls: work_order, photo, org, photo_update
      // (no all-AFTER-photos query or violations update since isApproved=false)
      expect(mockFrom).toHaveBeenCalledTimes(4);
    });

    it('does not update violations when not all AFTER photos are approved', async () => {
      mockFrom.mockReturnValueOnce(makeMock({ id: 'wo-1', violation_id: 'v-1' }));
      mockFrom.mockReturnValueOnce(
        makeMock({ id: 'p-1', violation_id: 'v-1', storage_path: 'path', metadata: {}, mime_type: 'image/jpeg' }),
      );
      mockFrom.mockReturnValueOnce(makeMock({ settings: { skip_photo_verification: true } }));
      mockFrom.mockReturnValueOnce(makeMock(null)); // photo update
      // Two AFTER photos — one still PENDING_REVIEW
      mockFrom.mockReturnValueOnce(
        makeMock([
          { id: 'p-1', status: 'APPROVED' },
          { id: 'p-2', status: 'PENDING_REVIEW' },
        ]),
      );
      // violations update should NOT be called

      await POST(
        makeRequest({ photo_id: 'p-1', inspector_image_data: 'base64' }),
        { params: Promise.resolve({ token: 'valid-token' }) },
      );

      // 5 from() calls: work_order, photo, org, photo_update, all_after_photos
      // No 6th call for violations update
      expect(mockFrom).toHaveBeenCalledTimes(5);
    });
  });
});
