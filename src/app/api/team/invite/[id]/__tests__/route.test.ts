import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DELETE } from '../route';
import { NextRequest } from 'next/server';

function chainMock(resolveWith: { data?: any; error?: any }) {
  const chain: any = {};
  const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'in', 'is', 'gt', 'gte', 'lt', 'lte', 'order', 'limit', 'range'];
  for (const m of methods) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue(resolveWith);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveWith);
  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(resolveWith).then(onFulfilled, onRejected);
  return chain;
}

const mockFrom = vi.fn();
const mockAuthGetUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: mockFrom, auth: { getUser: mockAuthGetUser } }),
}));

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new NextRequest('http://localhost:3000/api/team/invite/i-1', { method: 'DELETE' });

const asRole = (role: string) => ({
  data: { user: { id: 'caller', app_metadata: { role, org_id: 'org-1' } } },
  error: null,
});

describe('DELETE /api/team/invite/[id] (revoke)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no' } });
    expect((await DELETE(req(), params('i-1'))).status).toBe(401);
  });

  it('returns 403 for a PROJECT_MANAGER', async () => {
    mockAuthGetUser.mockResolvedValue(asRole('PROJECT_MANAGER'));
    expect((await DELETE(req(), params('i-1'))).status).toBe(403);
  });

  it('returns 404 when the invitation is not found in the org', async () => {
    mockAuthGetUser.mockResolvedValue(asRole('OWNER'));
    mockFrom.mockReturnValueOnce(chainMock({ data: null, error: null }));
    expect((await DELETE(req(), params('i-1'))).status).toBe(404);
  });

  it('returns 409 when the invitation was already accepted', async () => {
    mockAuthGetUser.mockResolvedValue(asRole('OWNER'));
    mockFrom.mockReturnValueOnce(chainMock({ data: { id: 'i-1', accepted_at: '2026-01-01T00:00:00Z' }, error: null }));
    expect((await DELETE(req(), params('i-1'))).status).toBe(409);
  });

  it('revokes a pending invitation (ADMIN allowed)', async () => {
    mockAuthGetUser.mockResolvedValue(asRole('ADMIN'));
    mockFrom.mockReturnValueOnce(chainMock({ data: { id: 'i-1', accepted_at: null }, error: null })); // lookup
    mockFrom.mockReturnValueOnce(chainMock({ error: null })); // delete
    const res = await DELETE(req(), params('i-1'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.revoked).toBe('i-1');
  });
});
