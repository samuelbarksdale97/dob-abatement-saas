import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DELETE, PATCH } from '../route';
import { NextRequest } from 'next/server';

// Chainable Supabase query-builder mock. Resolves either via single()/maybeSingle()
// or by awaiting the chain directly (count / update / delete queries).
function chainMock(resolveWith: { data?: any; error?: any; count?: number }) {
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
const mockUpdateUserById = vi.fn().mockResolvedValue({ data: {}, error: null });

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: mockFrom, auth: { getUser: mockAuthGetUser } }),
  createAdminClient: () => ({
    from: mockFrom,
    auth: { admin: { updateUserById: mockUpdateUserById } },
  }),
}));

const ownerUser = () => ({
  data: { user: { id: 'owner-1', app_metadata: { role: 'OWNER', org_id: 'org-1' } } },
  error: null,
});

const params = (userId: string) => ({ params: Promise.resolve({ userId }) });
const req = (method: string, body?: any) =>
  new NextRequest('http://localhost:3000/api/team/u', {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });

describe('DELETE /api/team/[userId] (deactivate)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no' } });
    const res = await DELETE(req('DELETE'), params('u-2'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not OWNER', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'a', app_metadata: { role: 'ADMIN', org_id: 'org-1' } } },
      error: null,
    });
    const res = await DELETE(req('DELETE'), params('u-2'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when targeting self', async () => {
    mockAuthGetUser.mockResolvedValue(ownerUser());
    const res = await DELETE(req('DELETE'), params('owner-1'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when member is not in the org', async () => {
    mockAuthGetUser.mockResolvedValue(ownerUser());
    mockFrom.mockReturnValueOnce(chainMock({ data: null, error: null }));
    const res = await DELETE(req('DELETE'), params('u-2'));
    expect(res.status).toBe(404);
  });

  it('deactivates a non-owner member and bans the auth user', async () => {
    mockAuthGetUser.mockResolvedValue(ownerUser());
    mockFrom.mockReturnValueOnce(chainMock({ data: { id: 'u-2', role: 'PROJECT_MANAGER', active: true }, error: null }));
    mockFrom.mockReturnValueOnce(chainMock({ error: null })); // admin profile update
    const res = await DELETE(req('DELETE'), params('u-2'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.deactivated).toBe('u-2');
    expect(mockUpdateUserById).toHaveBeenCalledWith('u-2', { ban_duration: '876000h' });
  });

  it('returns 400 and does not ban when removing the last active owner', async () => {
    mockAuthGetUser.mockResolvedValue(ownerUser());
    mockFrom.mockReturnValueOnce(chainMock({ data: { id: 'u-2', role: 'OWNER', active: true }, error: null }));
    mockFrom.mockReturnValueOnce(chainMock({ count: 1, data: null, error: null })); // owner count
    const res = await DELETE(req('DELETE'), params('u-2'));
    expect(res.status).toBe(400);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('deactivates an owner when another active owner exists', async () => {
    mockAuthGetUser.mockResolvedValue(ownerUser());
    mockFrom.mockReturnValueOnce(chainMock({ data: { id: 'u-2', role: 'OWNER', active: true }, error: null }));
    mockFrom.mockReturnValueOnce(chainMock({ count: 2, data: null, error: null })); // owner count
    mockFrom.mockReturnValueOnce(chainMock({ error: null })); // admin profile update
    const res = await DELETE(req('DELETE'), params('u-2'));
    expect(res.status).toBe(200);
    expect(mockUpdateUserById).toHaveBeenCalledWith('u-2', { ban_duration: '876000h' });
  });
});

describe('PATCH /api/team/[userId] (reactivate)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when caller is not OWNER', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'a', app_metadata: { role: 'ADMIN', org_id: 'org-1' } } },
      error: null,
    });
    const res = await PATCH(req('PATCH', { active: true }), params('u-2'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when body is not { active: true }', async () => {
    mockAuthGetUser.mockResolvedValue(ownerUser());
    const res = await PATCH(req('PATCH', { active: false }), params('u-2'));
    expect(res.status).toBe(400);
  });

  it('reactivates a member and lifts the ban', async () => {
    mockAuthGetUser.mockResolvedValue(ownerUser());
    mockFrom.mockReturnValueOnce(chainMock({ data: { id: 'u-2' }, error: null })); // target lookup
    mockFrom.mockReturnValueOnce(chainMock({ error: null })); // admin profile update
    const res = await PATCH(req('PATCH', { active: true }), params('u-2'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.reactivated).toBe('u-2');
    expect(mockUpdateUserById).toHaveBeenCalledWith('u-2', { ban_duration: 'none' });
  });
});
