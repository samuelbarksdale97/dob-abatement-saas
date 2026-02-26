import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from '../route';
import { NextRequest } from 'next/server';

const mockValidateToken = vi.fn();
vi.mock('@/lib/contractor-auth', () => ({
  validateContractorToken: (...args: any[]) => mockValidateToken(...args),
}));

const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}));

describe('PATCH /api/contractor/[token]/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transitions from ASSIGNED to IN_PROGRESS', async () => {
    mockValidateToken.mockResolvedValue({
      valid: true,
      data: { work_order_id: 'wo-123' },
    });

    // Mock work order fetch
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'wo-123', status: 'ASSIGNED', violation_id: 'v-123' },
        error: null,
      }),
    });

    // Mock work order update
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'wo-123', status: 'IN_PROGRESS' },
        error: null,
      }),
    });

    // Mock violation update
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    });

    const request = new NextRequest('http://localhost:3000/api/contractor/abc-123/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ token: 'abc-123' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.work_order.status).toBe('IN_PROGRESS');
  });

  it('transitions from IN_PROGRESS to COMPLETED', async () => {
    mockValidateToken.mockResolvedValue({
      valid: true,
      data: { work_order_id: 'wo-123' },
    });

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'wo-123', status: 'IN_PROGRESS', violation_id: 'v-123' },
        error: null,
      }),
    });

    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'wo-123', status: 'COMPLETED', completed_at: new Date().toISOString() },
        error: null,
      }),
    });

    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    });

    const request = new NextRequest('http://localhost:3000/api/contractor/abc-123/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'COMPLETED' }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ token: 'abc-123' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.work_order.status).toBe('COMPLETED');
  });

  it('returns 401 for invalid token', async () => {
    mockValidateToken.mockResolvedValue({
      valid: false,
      error: 'Invalid token',
    });

    const request = new NextRequest('http://localhost:3000/api/contractor/invalid/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ token: 'invalid' }) });

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid status transition', async () => {
    mockValidateToken.mockResolvedValue({
      valid: true,
      data: { work_order_id: 'wo-123' },
    });

    // Mock work order with COMPLETED status (cannot transition back)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'wo-123', status: 'COMPLETED', violation_id: 'v-123' },
        error: null,
      }),
    });

    const request = new NextRequest('http://localhost:3000/api/contractor/abc-123/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ token: 'abc-123' }) });

    expect(response.status).toBe(400);
  });
});
