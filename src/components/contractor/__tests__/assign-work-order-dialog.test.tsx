import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssignWorkOrderDialog } from '../assign-work-order-dialog';
import { mockViolation } from '@/test/helpers/mock-data';

// Mock toast
const mockToast = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: any[]) => mockToast('success', ...args),
    error: (...args: any[]) => mockToast('error', ...args),
  },
}));

// Mock clipboard globally
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
});

describe('AssignWorkOrderDialog', () => {
  const mockOnSuccess = vi.fn();
  const violation = mockViolation();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return empty contractors list, then handle subsequent calls
    global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
      if (urlStr.includes('/api/contractors')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ contractors: [] }),
        });
      }
      // Other fetch calls (e.g. POST /api/work-orders) should be mocked per test
      return Promise.resolve({ ok: false, json: async () => ({ error: 'Not mocked' }) });
    });
  });

  it('renders the dialog when open', async () => {
    render(
      <AssignWorkOrderDialog
        violation={violation}
        open={true}
        onOpenChange={() => {}}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Wait for contractors fetch to resolve (empty list = shows manual entry)
    await waitFor(() => {
      expect(screen.getByLabelText(/contractor name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });
  });

  it('validates required fields', async () => {
    const user = userEvent.setup();
    render(
      <AssignWorkOrderDialog
        violation={violation}
        open={true}
        onOpenChange={() => {}}
        onSuccess={mockOnSuccess}
      />
    );

    // Wait for contractors fetch to resolve so form fields appear
    await waitFor(() => {
      expect(screen.getByLabelText(/contractor name/i)).toBeInTheDocument();
    });

    const submitButton = screen.getByRole('button', { name: /assign contractor/i });
    await user.click(submitButton);

    // Should not submit to work-orders endpoint without required fields
    // (fetch was called for /api/contractors, but not for /api/work-orders)
    const fetchCalls = (global.fetch as any).mock.calls.map((c: any[]) => {
      const u = c[0];
      return typeof u === 'string' ? u : u instanceof URL ? u.toString() : u.url;
    });
    expect(fetchCalls).not.toContain('/api/work-orders');
  });

  it('submits the form successfully', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      work_order: { id: 'wo-123' },
      token: 'token-123',
      magic_link: 'http://localhost:3000/contractor/token-123',
    };

    global.fetch = vi.fn().mockImplementation((...args: any[]) => {
      const url = args[0];
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url?.url || '';
      if (urlStr.includes('/api/contractors')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ contractors: [] }),
        });
      }
      if (urlStr.includes('/api/work-orders')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockResponse,
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({ error: `Not mocked: ${urlStr}` }) });
    });

    render(
      <AssignWorkOrderDialog
        violation={violation}
        open={true}
        onOpenChange={() => {}}
        onSuccess={mockOnSuccess}
      />
    );

    // Wait for contractors fetch to complete (will show new entry mode since empty)
    await waitFor(() => {
      expect(screen.getByLabelText(/contractor name/i)).toBeInTheDocument();
    });

    // Fill in the form
    await user.type(screen.getByLabelText(/contractor name/i), 'Alex Johnson');
    await user.type(screen.getByLabelText(/email/i), 'alex@example.com');
    await user.type(screen.getByLabelText(/phone/i), '555-1234');

    const submitButton = screen.getByRole('button', { name: /assign contractor/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/work-orders',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('success', expect.stringContaining('Contractor assigned'), expect.anything());
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('handles API errors gracefully', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
      if (urlStr.includes('/api/contractors')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ contractors: [] }),
        });
      }
      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Failed to create work order' }),
      });
    });

    render(
      <AssignWorkOrderDialog
        violation={violation}
        open={true}
        onOpenChange={() => {}}
        onSuccess={mockOnSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/contractor name/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/contractor name/i), 'Alex Johnson');
    await user.type(screen.getByLabelText(/email/i), 'alex@example.com');

    const submitButton = screen.getByRole('button', { name: /assign contractor/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('error', expect.any(String));
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
  });

  it('pre-fills due date from violation deadline', () => {
    const violationWithDeadline = mockViolation({
      abatement_deadline: '2026-03-15',
    });

    render(
      <AssignWorkOrderDialog
        violation={violationWithDeadline}
        open={true}
        onOpenChange={() => {}}
        onSuccess={mockOnSuccess}
      />
    );

    const dueDateInput = screen.getByLabelText(/due date/i) as HTMLInputElement;
    expect(dueDateInput.value).toBe('2026-03-15');
  });
});
