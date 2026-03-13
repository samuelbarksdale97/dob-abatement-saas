import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';
import { NextRequest } from 'next/server';
import { mockPhoto, mockViolationItem } from '@/test/helpers/mock-data';

// Helper: chainable mock for Supabase query builder
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

const mockValidateToken = vi.fn();
vi.mock('@/lib/contractor-auth', () => ({
  validateContractorToken: (...args: any[]) => mockValidateToken(...args),
}));

const mockFrom = vi.fn();
const mockStorageUpload = vi.fn();
const mockCreateSignedUrl = vi.fn();
const mockStorageRemove = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: mockFrom,
    storage: {
      from: vi.fn(() => ({
        upload: mockStorageUpload,
        createSignedUrl: mockCreateSignedUrl,
        remove: mockStorageRemove,
      })),
    },
  }),
}));

describe('POST /api/contractor/[token]/photos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads BEFORE photo successfully', async () => {
    mockValidateToken.mockResolvedValue({
      valid: true,
      data: { work_order_id: 'wo-123', org_id: 'org-123' },
    });

    // 1. Work order fetch
    mockFrom.mockReturnValueOnce(chainMock({
      data: { id: 'wo-123', violation_id: 'v-123' },
      error: null,
    }));

    // 2. Violation item validation
    mockFrom.mockReturnValueOnce(chainMock({
      data: mockViolationItem(),
      error: null,
    }));

    // 3. Existing photo check (none found)
    mockFrom.mockReturnValueOnce(chainMock({
      data: null,
      error: null,
    }));

    // 4. Storage upload
    mockStorageUpload.mockResolvedValue({
      data: { path: 'org-123/wo-123/item-123/BEFORE_123.jpg' },
      error: null,
    });

    // 5. Photo insert
    mockFrom.mockReturnValueOnce(chainMock({
      data: mockPhoto({ photo_type: 'BEFORE' }),
      error: null,
    }));

    // 6. Signed URL
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.com/photo.jpg' },
      error: null,
    });

    const formData = new FormData();
    const file = new File(['mock image'], 'test.jpg', { type: 'image/jpeg' });
    formData.append('file', file);
    formData.append('violation_item_id', 'item-123');
    formData.append('photo_type', 'BEFORE');

    const request = new NextRequest('http://localhost:3000/api/contractor/abc-123/photos', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request, { params: Promise.resolve({ token: 'abc-123' }) });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.photo).toBeDefined();
    expect(json.signed_url).toBe('https://signed.com/photo.jpg');
  });

  it('returns 401 for invalid token', async () => {
    mockValidateToken.mockResolvedValue({
      valid: false,
      error: 'Invalid token',
    });

    const formData = new FormData();
    formData.append('file', new File(['test'], 'test.jpg', { type: 'image/jpeg' }));
    formData.append('violation_item_id', 'item-123');
    formData.append('photo_type', 'BEFORE');

    const request = new NextRequest('http://localhost:3000/api/contractor/invalid/photos', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request, { params: Promise.resolve({ token: 'invalid' }) });

    expect(response.status).toBe(401);
  });

  it('returns 400 for file size > 10MB', async () => {
    mockValidateToken.mockResolvedValue({
      valid: true,
      data: { work_order_id: 'wo-123', org_id: 'org-123' },
    });

    // Create a mock file with overridden size (FormData roundtrip loses size in jsdom)
    const largeFile = new File(['x'], 'large.jpg', { type: 'image/jpeg' });
    Object.defineProperty(largeFile, 'size', { value: 11 * 1024 * 1024 });

    // Mock the request's formData() to return our custom file directly
    const formData = new FormData();
    formData.append('file', largeFile);
    formData.append('violation_item_id', 'item-123');
    formData.append('photo_type', 'BEFORE');

    const request = new NextRequest('http://localhost:3000/api/contractor/abc-123/photos', {
      method: 'POST',
    });
    // Override formData to bypass serialization that loses custom size
    vi.spyOn(request, 'formData').mockResolvedValue(formData);

    const response = await POST(request, { params: Promise.resolve({ token: 'abc-123' }) });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('10MB');
  });

  it('returns 400 for non-image file', async () => {
    mockValidateToken.mockResolvedValue({
      valid: true,
      data: { work_order_id: 'wo-123', org_id: 'org-123' },
    });

    const formData = new FormData();
    const pdfFile = new File(['pdf content'], 'doc.pdf', { type: 'application/pdf' });
    formData.append('file', pdfFile);
    formData.append('violation_item_id', 'item-123');
    formData.append('photo_type', 'BEFORE');

    const request = new NextRequest('http://localhost:3000/api/contractor/abc-123/photos', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request, { params: Promise.resolve({ token: 'abc-123' }) });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('image');
  });

  it('returns 400 for invalid violation_item_id', async () => {
    mockValidateToken.mockResolvedValue({
      valid: true,
      data: { work_order_id: 'wo-123', org_id: 'org-123' },
    });

    // Work order fetch
    mockFrom.mockReturnValueOnce(chainMock({
      data: { id: 'wo-123', violation_id: 'v-123' },
      error: null,
    }));

    // Violation item not found
    mockFrom.mockReturnValueOnce(chainMock({
      data: null,
      error: { message: 'Not found' },
    }));

    const formData = new FormData();
    formData.append('file', new File(['test'], 'test.jpg', { type: 'image/jpeg' }));
    formData.append('violation_item_id', 'wrong-item-id');
    formData.append('photo_type', 'BEFORE');

    const request = new NextRequest('http://localhost:3000/api/contractor/abc-123/photos', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request, { params: Promise.resolve({ token: 'abc-123' }) });

    expect(response.status).toBe(400);
  });

  it('replaces existing photo when re-uploading', async () => {
    mockValidateToken.mockResolvedValue({
      valid: true,
      data: { work_order_id: 'wo-123', org_id: 'org-123' },
    });

    // 1. Work order fetch
    mockFrom.mockReturnValueOnce(chainMock({
      data: { id: 'wo-123', violation_id: 'v-123' },
      error: null,
    }));

    // 2. Violation item validation
    mockFrom.mockReturnValueOnce(chainMock({
      data: mockViolationItem(),
      error: null,
    }));

    // 3. Existing photo check (found!)
    mockFrom.mockReturnValueOnce(chainMock({
      data: mockPhoto({ id: 'existing-photo-id', storage_path: 'old/path.jpg' }),
      error: null,
    }));

    // 4. Storage upload
    mockStorageUpload.mockResolvedValue({
      data: { path: 'org-123/wo-123/item-123/BEFORE_456.jpg' },
      error: null,
    });

    // 5. Photo update (existing)
    mockFrom.mockReturnValueOnce(chainMock({
      data: mockPhoto({ id: 'existing-photo-id' }),
      error: null,
    }));

    // 6. Storage remove (old file - best effort)
    mockStorageRemove.mockResolvedValue({ data: null, error: null });

    // 7. Signed URL
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.com/new-photo.jpg' },
      error: null,
    });

    const formData = new FormData();
    formData.append('file', new File(['new image'], 'new.jpg', { type: 'image/jpeg' }));
    formData.append('violation_item_id', 'item-123');
    formData.append('photo_type', 'BEFORE');

    const request = new NextRequest('http://localhost:3000/api/contractor/abc-123/photos', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request, { params: Promise.resolve({ token: 'abc-123' }) });

    expect(response.status).toBe(201);
  });

  it('returns 400 for missing photo_type', async () => {
    mockValidateToken.mockResolvedValue({
      valid: true,
      data: { work_order_id: 'wo-123', org_id: 'org-123' },
    });

    const formData = new FormData();
    formData.append('file', new File(['test'], 'test.jpg', { type: 'image/jpeg' }));
    formData.append('violation_item_id', 'item-123');
    // photo_type missing

    const request = new NextRequest('http://localhost:3000/api/contractor/abc-123/photos', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request, { params: Promise.resolve({ token: 'abc-123' }) });

    expect(response.status).toBe(400);
  });
});
