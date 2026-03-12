import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { NextRequest } from 'next/server';

// chainable supabase mock
function chainMock(resolveWith: { data: any; error: any; count?: number | null }) {
  const chain: any = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'is', 'gt', 'gte', 'lt', 'lte', 'or', 'order', 'limit', 'range', 'not'];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn().mockResolvedValue(resolveWith);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveWith);
  // Make the chain itself thenable to support `await query`
  chain.then = (resolve: Function) => resolve(resolveWith);
  return chain;
}

const mockFrom = vi.fn();
const mockAuthGetUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: mockFrom,
    auth: { getUser: mockAuthGetUser },
  }),
}));

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/violations');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url);
}

describe('GET /api/violations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('applies property_id filter', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const chain = chainMock({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await GET(makeRequest({ property_id: 'prop-1' }));
    expect(chain.eq).toHaveBeenCalledWith('property_id', 'prop-1');
  });

  it('applies date_from and date_to filters', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const chain = chainMock({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await GET(makeRequest({ date_from: '2026-01-01', date_to: '2026-03-01' }));
    expect(chain.gte).toHaveBeenCalledWith('abatement_deadline', '2026-01-01');
    expect(chain.lte).toHaveBeenCalledWith('abatement_deadline', '2026-03-01');
  });

  it('applies needs_attention filter', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const chain = chainMock({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await GET(makeRequest({ needs_attention: 'true' }));
    expect(chain.or).toHaveBeenCalledWith(expect.stringContaining('priority.eq.1'));
  });

  it('applies unit_id filter', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const chain = chainMock({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await GET(makeRequest({ unit_id: 'unit-1' }));
    expect(chain.eq).toHaveBeenCalledWith('unit_id', 'unit-1');
  });

  it('applies multi-status filter via statuses param', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const chain = chainMock({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await GET(makeRequest({ statuses: 'NEW,PARSED,ASSIGNED' }));
    expect(chain.in).toHaveBeenCalledWith('status', ['NEW', 'PARSED', 'ASSIGNED']);
  });
});
