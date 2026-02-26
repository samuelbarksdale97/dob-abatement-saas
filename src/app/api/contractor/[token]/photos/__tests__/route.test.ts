import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';
import { NextRequest } from 'next/server';
import { mockPhoto, mockViolationItem } from '@/test/helpers/mock-data';

const mockValidateToken = vi.fn();
vi.mock('@/lib/contractor-auth', () => ({
  validateContractorToken: (...args: any[]) => mockValidateToken(...args),
}));

const mockFrom = vi.fn();
const mockStorageUpload = vi.fn();
const mockCreateSignedUrl = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: mockFrom,
    storage: {
      from: vi.fn(() => ({
        upload: mockStorageUpload,
        createSignedUrl: mockCreateSignedUrl,
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

    // Mock work order fetch with violation
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'wo-123', violation_id: 'v-123' },
        error: null,
      }),
    });

    // Mock violation item validation
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: mockViolationItem(),
        error: null,
      }),
    });

    // Mock storage upload
    mockStorageUpload.mockResolvedValue({
      data: { path: 'org-123/wo-123/item-123/BEFORE_123.jpg' },
      error: null,
    });

    // Mock photo insert
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: mockPhoto({ photo_type: 'BEFORE' }),
        error: null,
      }),
    });

    // Mock signed URL generation
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.com/photo.jpg' },
      error: null,
    });

    // Create a FormData with a mock file
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

    // Create a mock file > 10MB
    const largeFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('file', largeFile);
    formData.append('violation_item_id', 'item-123');
    formData.append('photo_type', 'BEFORE');

    const request = new NextRequest('http://localhost:3000/api/contractor/abc-123/photos', {
      method: 'POST',
      body: formData,
    });

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

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'wo-123', violation_id: 'v-123' },
        error: null,
      }),
    });

    // Mock violation item not found (belongs to different violation)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      }),
    });

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

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'wo-123', violation_id: 'v-123' },
        error: null,
      }),
    });

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: mockViolationItem(),
        error: null,
      }),
    });

    // Mock existing photo check
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: mockPhoto({ id: 'existing-photo-id' }),
        error: null,
      }),
    });

    // Mock storage delete (for old photo)
    const mockStorageDelete = vi.fn().mockResolvedValue({ data: null, error: null });

    mockStorageUpload.mockResolvedValue({
      data: { path: 'org-123/wo-123/item-123/BEFORE_456.jpg' },
      error: null,
    });

    // Mock photo update (not insert)
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: mockPhoto(),
        error: null,
      }),
    });

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
