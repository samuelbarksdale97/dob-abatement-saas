import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { NextRequest } from 'next/server';

const mockRpc = vi.fn();
const mockAuthGetUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    rpc: mockRpc,
    auth: { getUser: mockAuthGetUser },
  }),
}));

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/analytics');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url);
}

describe('GET /api/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('calls get_analytics RPC with default params', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockRpc.mockResolvedValue({
      data: { avg_resolution_days: 10, approval_rate: 85, total_fines: 5000 },
      error: null,
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('get_analytics', expect.objectContaining({
      p_property_id: null,
    }));

    const body = await res.json();
    expect(body.avg_resolution_days).toBe(10);
  });

  it('passes property_id filter to RPC', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockRpc.mockResolvedValue({ data: {}, error: null });

    await GET(makeRequest({ property_id: 'prop-123' }));
    expect(mockRpc).toHaveBeenCalledWith('get_analytics', expect.objectContaining({
      p_property_id: 'prop-123',
    }));
  });

  it('passes date range to RPC', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockRpc.mockResolvedValue({ data: {}, error: null });

    await GET(makeRequest({ date_from: '2026-01-01', date_to: '2026-03-01' }));
    expect(mockRpc).toHaveBeenCalledWith('get_analytics', expect.objectContaining({
      p_date_from: '2026-01-01',
      p_date_to: '2026-03-01',
    }));
  });

  it('returns 500 on RPC error', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC failed' } });

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
