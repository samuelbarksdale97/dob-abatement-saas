import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoUploadSlot } from '../photo-upload-slot';

// Mock toast
const mockToast = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: any[]) => mockToast('success', ...args),
    error: (...args: any[]) => mockToast('error', ...args),
  },
}));

describe('PhotoUploadSlot', () => {
  const mockOnUploadComplete = vi.fn();
  const defaultProps = {
    token: 'test-token',
    violationItemId: 'item-123',
    photoType: 'BEFORE' as const,
    onUploadComplete: mockOnUploadComplete,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders upload button when no photo exists', () => {
    render(<PhotoUploadSlot {...defaultProps} />);

    expect(screen.getByText(/upload before photo/i)).toBeInTheDocument();
  });

  it('shows thumbnail when existing photo is provided', () => {
    const existingPhoto = {
      id: 'photo-123',
      signed_url: 'https://example.com/photo.jpg',
    };

    render(<PhotoUploadSlot {...defaultProps} existingPhoto={existingPhoto} />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', existingPhoto.signed_url);
  });

  it('uploads file successfully', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      photo: { id: 'photo-123' },
      signed_url: 'https://example.com/uploaded.jpg',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    render(<PhotoUploadSlot {...defaultProps} />);

    const file = new File(['photo'], 'test.jpg', { type: 'image/jpeg' });
    const input = screen.getByTestId('photo-input');

    await user.upload(input, file);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/contractor/${defaultProps.token}/photos`,
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('success', expect.any(String));
      expect(mockOnUploadComplete).toHaveBeenCalled();
    });
  });

  it('validates file size (max 10MB)', async () => {
    const user = userEvent.setup();
    render(<PhotoUploadSlot {...defaultProps} />);

    // Create a file larger than 10MB
    const largeFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'large.jpg', {
      type: 'image/jpeg',
    });
    const input = screen.getByTestId('photo-input');

    await user.upload(input, largeFile);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('error', expect.stringContaining('10MB'));
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  it('validates file type (images only)', async () => {
    render(<PhotoUploadSlot {...defaultProps} />);

    const pdfFile = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' });
    const input = screen.getByTestId('photo-input');

    // Use fireEvent directly to bypass the HTML accept attribute filtering
    // (userEvent.upload respects accept="image/*" and silently drops non-matching files)
    fireEvent.change(input, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('error', expect.stringContaining('image'));
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  it('shows upload progress during upload', async () => {
    const user = userEvent.setup();

    // Mock a slow response
    (global.fetch as any).mockImplementationOnce(() =>
      new Promise(resolve => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: async () => ({ photo: { id: 'photo-123' }, signed_url: 'https://example.com/photo.jpg' }),
          });
        }, 100);
      })
    );

    render(<PhotoUploadSlot {...defaultProps} />);

    const file = new File(['photo'], 'test.jpg', { type: 'image/jpeg' });
    const input = screen.getByTestId('photo-input');

    await user.upload(input, file);

    // Should show uploading state
    expect(screen.getByText(/uploading/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(mockOnUploadComplete).toHaveBeenCalled();
    });
  });

  it('handles upload errors gracefully', async () => {
    const user = userEvent.setup();
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Upload failed' }),
    });

    render(<PhotoUploadSlot {...defaultProps} />);

    const file = new File(['photo'], 'test.jpg', { type: 'image/jpeg' });
    const input = screen.getByTestId('photo-input');

    await user.upload(input, file);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('error', expect.any(String));
      expect(mockOnUploadComplete).not.toHaveBeenCalled();
    });
  });
});
