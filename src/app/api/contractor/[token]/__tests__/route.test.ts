import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { NextRequest } from 'next/server';
import { mockContractorToken, mockWorkOrder, mockViolation, mockViolationItem, mockPhoto } from '@/test/helpers/mock-data';

// Create mock function first
const mockValidateToken = vi.fn();

// Then use it in the mock
vi.mock('@/lib/contractor-auth', () => ({
  validateContractorToken: (...args: any[]) => mockValidateToken(...args),
}));

// Mock admin client
const mockFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: mockFrom,
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: 'https://signed-url.com/test.pdf' },
          error: null,
        }),
      })),
    },
  }),
}));

describe('GET /api/contractor/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns contractor view data for valid token', async () => {
    // Mock valid token
    mockValidateToken.mockResolvedValue({
      valid: true,
      data: {
        work_order_id: 'wo-123',
        org_id: 'org-123',
      },
    });

    // Mock work order + violation fetch
    const mockWorkOrderData = {
      ...mockWorkOrder(),
      violations: mockViolation(),
    };

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockWorkOrderData, error: null }),
    });

    // Mock violation items fetch
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [mockViolationItem()],
        error: null,
      }),
    });

    // Mock photos fetch (needs to chain order() twice)
    const photosChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),  // First order() returns this for chaining
    };
    // Override the order method to return a promise on second call
    let orderCallCount = 0;
    photosChain.order = vi.fn(() => {
      orderCallCount++;
      if (orderCallCount === 1) return photosChain;  // First call: return for chaining
      return Promise.resolve({ data: [mockPhoto()], error: null });  // Second call: return data
    });
    mockFrom.mockReturnValueOnce(photosChain);

    const request = new NextRequest('http://localhost:3000/api/contractor/abc-123', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ token: 'abc-123' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.work_order).toBeDefined();
    expect(json.violation).toBeDefined();
    expect(json.items).toHaveLength(1);
    expect(json.photos).toHaveLength(1);
    expect(json.pdf_url).toBe('https://signed-url.com/test.pdf');
  });

  it('returns 401 for invalid token', async () => {
    mockValidateToken.mockResolvedValue({
      valid: false,
      error: 'Invalid or expired token',
    });

    const request = new NextRequest('http://localhost:3000/api/contractor/invalid', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ token: 'invalid' }) });
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe('Invalid or expired token');
  });

  it('returns 401 for expired token', async () => {
    mockValidateToken.mockResolvedValue({
      valid: false,
      error: 'Invalid or expired token',
    });

    const request = new NextRequest('http://localhost:3000/api/contractor/expired', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ token: 'expired' }) });

    expect(response.status).toBe(401);
  });

  it('returns 404 if work order not found', async () => {
    mockValidateToken.mockResolvedValue({
      valid: true,
      data: {
        work_order_id: 'wo-nonexistent',
        org_id: 'org-123',
      },
    });

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    });

    const request = new NextRequest('http://localhost:3000/api/contractor/abc-123', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({ token: 'abc-123' }) });

    expect(response.status).toBe(404);
  });
});
