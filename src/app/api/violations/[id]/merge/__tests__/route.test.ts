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

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: mockFrom,
    auth: { getUser: mockAuthGetUser },
  }),
  createAdminClient: () => ({
    from: mockFrom,
  }),
}));

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/violations/target-1/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'target-1' });

describe('POST /api/violations/[id]/merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } });
    const res = await POST(makeRequest({ source_violation_id: 'src-1' }), { params });
    expect(res.status).toBe(401);
  });

  it('returns 400 if source_violation_id is missing', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const res = await POST(makeRequest({}), { params });
    expect(res.status).toBe(400);
  });

  it('returns 404 if target or source violation not found', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const chain = chainMock({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await POST(makeRequest({ source_violation_id: 'src-1' }), { params });
    expect(res.status).toBe(404);
  });
});
