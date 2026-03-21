import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';
import { NextRequest } from 'next/server';

function chainMock(resolveWith: { data: any; error: any }) {
  const chain: any = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'is', 'order', 'limit', 'range'];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn().mockResolvedValue(resolveWith);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveWith);
  return chain;
}

const mockFrom = vi.fn();
const mockAuthGetUser = vi.fn();
const mockInngestSend = vi.fn().mockResolvedValue({});

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: mockFrom,
    auth: { getUser: mockAuthGetUser },
  }),
  createAdminClient: () => ({
    from: mockFrom,
  }),
}));

vi.mock('@/inngest/client', () => ({
  inngest: { send: (...args: any[]) => mockInngestSend(...args) },
}));

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/violations/v1/override-duplicate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'v1' });

describe('POST /api/violations/[id]/override-duplicate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } });
    const res = await POST(makeRequest({ existing_violation_id: 'v2' }), { params });
    expect(res.status).toBe(401);
  });

  it('returns 400 if existing_violation_id is missing', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const res = await POST(makeRequest({}), { params });
    expect(res.status).toBe(400);
  });

  it('returns 404 if violation not found', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const chain = chainMock({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await POST(makeRequest({ existing_violation_id: 'v2' }), { params });
    expect(res.status).toBe(404);
  });
});
