import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

// --- Mocks ---
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockSingle = vi.fn();
const mockSend = vi.fn();

// Track query chains per table
const queryChains: Record<string, any> = {};

function createChain() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: mockSingle,
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

vi.mock('@/inngest/client', () => ({
  inngest: { send: (...args: any[]) => mockSend(...args) },
}));

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/parse/duplicate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/parse/duplicate', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated user
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    // Default chain behavior: returns data on .single()
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      const chain = createChain();
      // First call = profiles, second call = violations
      callCount++;
      if (callCount === 1) {
        chain.single.mockResolvedValue({
          data: { org_id: 'org-123' },
          error: null,
        });
      } else {
        chain.single.mockResolvedValue({
          data: { id: 'v-456', org_id: 'org-123', parse_status: 'duplicate_pending' },
          error: null,
        });
      }
      return chain;
    });

    mockSend.mockResolvedValue(undefined);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Not authenticated' } });

    const res = await POST(makeRequest({ violationId: 'v-456', action: 'overwrite' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when violationId is missing', async () => {
    const res = await POST(makeRequest({ action: 'overwrite' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when action is invalid', async () => {
    const res = await POST(makeRequest({ violationId: 'v-456', action: 'invalid' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when violation not found', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      const chain = createChain();
      callCount++;
      if (callCount === 1) {
        chain.single.mockResolvedValue({ data: { org_id: 'org-123' }, error: null });
      } else {
        chain.single.mockResolvedValue({ data: null, error: null });
      }
      return chain;
    });

    const res = await POST(makeRequest({ violationId: 'nonexistent', action: 'overwrite' }));
    expect(res.status).toBe(404);
  });

  it('returns 409 when violation is not in duplicate_pending state', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      const chain = createChain();
      callCount++;
      if (callCount === 1) {
        chain.single.mockResolvedValue({ data: { org_id: 'org-123' }, error: null });
      } else {
        chain.single.mockResolvedValue({
          data: { id: 'v-456', org_id: 'org-123', parse_status: 'completed' },
          error: null,
        });
      }
      return chain;
    });

    const res = await POST(makeRequest({ violationId: 'v-456', action: 'overwrite' }));
    expect(res.status).toBe(409);
  });

  it('sends overwrite event to Inngest on valid overwrite request', async () => {
    const res = await POST(makeRequest({ violationId: 'v-456', action: 'overwrite' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.action).toBe('overwrite');
    expect(mockSend).toHaveBeenCalledWith({
      name: 'noi/duplicate.resolved',
      data: { violationId: 'v-456', action: 'overwrite' },
    });
  });

  it('sends cancel event to Inngest on valid cancel request', async () => {
    const res = await POST(makeRequest({ violationId: 'v-456', action: 'cancel' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.action).toBe('cancel');
    expect(mockSend).toHaveBeenCalledWith({
      name: 'noi/duplicate.resolved',
      data: { violationId: 'v-456', action: 'cancel' },
    });
  });

  it('returns 404 when violation belongs to different org', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      const chain = createChain();
      callCount++;
      if (callCount === 1) {
        chain.single.mockResolvedValue({ data: { org_id: 'org-123' }, error: null });
      } else {
        chain.single.mockResolvedValue({
          data: { id: 'v-456', org_id: 'org-other', parse_status: 'duplicate_pending' },
          error: null,
        });
      }
      return chain;
    });

    const res = await POST(makeRequest({ violationId: 'v-456', action: 'overwrite' }));
    expect(res.status).toBe(404);
  });
});
