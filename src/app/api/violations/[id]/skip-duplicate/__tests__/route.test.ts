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

function makeRequest() {
  return new NextRequest('http://localhost/api/violations/v1/skip-duplicate', {
    method: 'POST',
  });
}

const params = Promise.resolve({ id: 'v1' });

describe('POST /api/violations/[id]/skip-duplicate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } });
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(401);
  });

  it('returns 404 if violation not found', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const chain = chainMock({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it('returns 400 if violation is not a duplicate', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const chain = chainMock({
      data: { id: 'v1', org_id: 'org-1', parse_status: 'completed', parse_metadata: {} },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(400);
  });
});
