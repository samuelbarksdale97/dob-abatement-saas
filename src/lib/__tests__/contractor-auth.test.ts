import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateContractorToken } from '../contractor-auth';
import { mockContractorToken } from '@/test/helpers/mock-data';

// Mock the createAdminClient function
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}));

describe('validateContractorToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('returns valid=true for a valid token', async () => {
    const mockToken = mockContractorToken();

    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockToken, error: null }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

    const result = await validateContractorToken('abc-123-def-456');

    expect(result.valid).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.work_order_id).toBe('wo-123');
    expect(result.data?.contractor_name).toBe('Alex Contractor');
  });

  it('returns valid=false for nonexistent token', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    });

    const result = await validateContractorToken('invalid-token');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid or expired token');
  });

  it('returns valid=false for expired token', async () => {
    // The query filters by gt(expires_at, now()), so expired tokens return no rows
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'No rows' } }),
    });

    const result = await validateContractorToken('expired-token');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid or expired token');
  });

  it('returns valid=false for revoked token', async () => {
    // The query filters by is(revoked_at, null), so revoked tokens return no rows
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'No rows' } }),
    });

    const result = await validateContractorToken('revoked-token');

    expect(result.valid).toBe(false);
  });

  it('updates last_accessed_at timestamp on valid token', async () => {
    const mockToken = mockContractorToken();
    const updateMock = vi.fn().mockReturnThis();

    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockToken, error: null }),
      })
      .mockReturnValueOnce({
        update: updateMock,
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

    await validateContractorToken('abc-123-def-456');

    // Verify the update was called (second from() call)
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenCalledWith({
      last_accessed_at: expect.any(String),
    });
  });
});
