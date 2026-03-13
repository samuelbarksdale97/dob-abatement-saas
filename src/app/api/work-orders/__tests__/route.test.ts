import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';
import { NextRequest } from 'next/server';
import { mockViolation, mockProfile, mockWorkOrder } from '@/test/helpers/mock-data';

// Helper: creates a chainable mock object for Supabase query builder
function chainMock(resolveWith: { data: any; error: any }) {
  const chain: any = {};
  const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'in', 'is', 'gt', 'gte', 'lt', 'lte', 'order', 'limit', 'range'];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn().mockResolvedValue(resolveWith);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveWith);
  return chain;
}

// Mock dependencies
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

// Mock Resend
const mockSendEmail = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    get emails() {
      return { send: mockSendEmail };
    }
  },
}));

vi.mock('@/lib/status-transitions', () => ({
  canTransition: vi.fn().mockReturnValue(true),
}));

describe('POST /api/work-orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates work order with valid request', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'pm@example.com' } },
      error: null,
    });

    // 1. Profile lookup
    mockFrom.mockReturnValueOnce(chainMock({
      data: mockProfile({ role: 'PROJECT_MANAGER' }),
      error: null,
    }));

    // 2. Violation lookup
    mockFrom.mockReturnValueOnce(chainMock({
      data: mockViolation({ status: 'PARSED' }),
      error: null,
    }));

    // 3. Contractor lookup (existing check)
    mockFrom.mockReturnValueOnce(chainMock({
      data: null, // no existing contractor
      error: null,
    }));

    // 4. Contractor insert (new contractor)
    mockFrom.mockReturnValueOnce(chainMock({
      data: null,
      error: null,
    }));

    // 5. Work order insert
    mockFrom.mockReturnValueOnce(chainMock({
      data: mockWorkOrder(),
      error: null,
    }));

    // 6. Contractor token insert
    mockFrom.mockReturnValueOnce(chainMock({
      data: { id: 'token-123', token: 'abc-123' },
      error: null,
    }));

    // 7. Violation status update
    mockFrom.mockReturnValueOnce(chainMock({
      data: null,
      error: null,
    }));

    mockSendEmail.mockResolvedValue({ data: { id: 'email-123' }, error: null });

    const request = new NextRequest('http://localhost:3000/api/work-orders', {
      method: 'POST',
      body: JSON.stringify({
        violation_id: 'v-123',
        contractor_name: 'Alex Contractor',
        contractor_email: 'alex@contractor.com',
        due_date: '2024-03-01',
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.work_order).toBeDefined();
    expect(json.token).toBeDefined();
    expect(json.magic_link).toContain('/contractor/');
  });

  it('returns 400 for missing contractor_name', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    // Profile lookup
    mockFrom.mockReturnValueOnce(chainMock({
      data: mockProfile({ role: 'PROJECT_MANAGER' }),
      error: null,
    }));

    const request = new NextRequest('http://localhost:3000/api/work-orders', {
      method: 'POST',
      body: JSON.stringify({
        violation_id: 'v-123',
        contractor_email: 'alex@contractor.com',
        // contractor_name missing
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 401 for unauthenticated user', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    const request = new NextRequest('http://localhost:3000/api/work-orders', {
      method: 'POST',
      body: JSON.stringify({
        violation_id: 'v-123',
        contractor_name: 'Alex',
        contractor_email: 'alex@test.com',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('returns 403 for CONTRACTOR role user', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce(chainMock({
      data: mockProfile({ role: 'CONTRACTOR' }),
      error: null,
    }));

    const request = new NextRequest('http://localhost:3000/api/work-orders', {
      method: 'POST',
      body: JSON.stringify({
        violation_id: 'v-123',
        contractor_name: 'Alex',
        contractor_email: 'alex@test.com',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
  });

  it('returns 404 for nonexistent violation', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce(chainMock({
      data: mockProfile({ role: 'PROJECT_MANAGER' }),
      error: null,
    }));

    mockFrom.mockReturnValueOnce(chainMock({
      data: null,
      error: { message: 'Not found' },
    }));

    const request = new NextRequest('http://localhost:3000/api/work-orders', {
      method: 'POST',
      body: JSON.stringify({
        violation_id: 'invalid-id',
        contractor_name: 'Alex',
        contractor_email: 'alex@test.com',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(404);
  });

  it('returns 409 for CLOSED violation', async () => {
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce(chainMock({
      data: mockProfile({ role: 'PROJECT_MANAGER' }),
      error: null,
    }));

    mockFrom.mockReturnValueOnce(chainMock({
      data: mockViolation({ status: 'CLOSED' }),
      error: null,
    }));

    const request = new NextRequest('http://localhost:3000/api/work-orders', {
      method: 'POST',
      body: JSON.stringify({
        violation_id: 'v-123',
        contractor_name: 'Alex',
        contractor_email: 'alex@test.com',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(409);
  });
});
