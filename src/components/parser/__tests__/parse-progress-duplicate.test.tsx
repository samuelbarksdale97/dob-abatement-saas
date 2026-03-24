import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ParseProgress } from '../parse-progress';

// --- Mocks (vi.mock is hoisted, so use vi.hoisted for shared state) ---
const { mockToast, mockSelect, mockRemoveChannel } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  mockSelect: vi.fn(),
  mockRemoveChannel: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: mockSelect,
    }),
    channel: () => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    }),
    removeChannel: mockRemoveChannel,
  }),
}));

function setupMockQuery(parseStatus: string, parseMetadata: Record<string, any>) {
  mockSelect.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { parse_status: parseStatus, parse_metadata: parseMetadata },
      }),
    }),
  });
}

const baseDuplicateMetadata = {
  steps: [
    { step: 'ai_parse', status: 'completed', message: 'Extracted 6 items' },
    { step: 'insert_records', status: 'pending' },
    { step: 'analyze_pages', status: 'pending' },
    { step: 'match_photos', status: 'pending' },
    { step: 'complete', status: 'pending' },
  ],
  duplicate_detected: true,
  duplicate_violation_id: 'existing-v-123',
  existing_notice_id: '25NOIR-INS-07709',
};

describe('ParseProgress — Duplicate Detection UI', () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('shows duplicate prompt when parse_status is duplicate_pending', async () => {
    setupMockQuery('duplicate_pending', baseDuplicateMetadata);

    render(<ParseProgress violationId="v-456" onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText('Duplicate NOI Detected')).toBeInTheDocument();
    });

    expect(screen.getByText(/25NOIR-INS-07709/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Overwrite/i })).toBeInTheDocument();
  });

  it('shows duplicate prompt without notice_id when not available', async () => {
    const metadataWithoutNoticeId = {
      ...baseDuplicateMetadata,
      existing_notice_id: undefined,
    };
    setupMockQuery('duplicate_pending', metadataWithoutNoticeId);

    render(<ParseProgress violationId="v-456" onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText('Duplicate NOI Detected')).toBeInTheDocument();
    });

    expect(screen.getByText(/has already been uploaded/)).toBeInTheDocument();
  });

  it('sends overwrite request when Overwrite button is clicked', async () => {
    setupMockQuery('duplicate_pending', baseDuplicateMetadata);
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, action: 'overwrite' }),
    });

    const user = userEvent.setup();
    render(<ParseProgress violationId="v-456" onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Overwrite/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Overwrite/i }));

    expect(global.fetch).toHaveBeenCalledWith('/api/parse/duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ violationId: 'v-456', action: 'overwrite' }),
    });
  });

  it('sends cancel request and calls onComplete when Cancel is clicked', async () => {
    setupMockQuery('duplicate_pending', baseDuplicateMetadata);
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, action: 'cancel' }),
    });

    const user = userEvent.setup();
    render(<ParseProgress violationId="v-456" onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Cancel/i }));

    expect(global.fetch).toHaveBeenCalledWith('/api/parse/duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ violationId: 'v-456', action: 'cancel' }),
    });

    await waitFor(() => {
      expect(mockToast.info).toHaveBeenCalledWith('Upload cancelled');
    });
  });

  it('shows error toast when API call fails', async () => {
    setupMockQuery('duplicate_pending', baseDuplicateMetadata);
    (global.fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Server error' }),
    });

    const user = userEvent.setup();
    render(<ParseProgress violationId="v-456" onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Overwrite/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Overwrite/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Server error');
    });
  });

  it('does NOT show duplicate prompt for normal processing state', async () => {
    const normalMetadata = {
      steps: [
        { step: 'ai_parse', status: 'running' },
        { step: 'insert_records', status: 'pending' },
        { step: 'analyze_pages', status: 'pending' },
        { step: 'match_photos', status: 'pending' },
        { step: 'complete', status: 'pending' },
      ],
    };
    setupMockQuery('processing', normalMetadata);

    render(<ParseProgress violationId="v-456" onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText('AI Processing Your NOI...')).toBeInTheDocument();
    });

    expect(screen.queryByText('Duplicate NOI Detected')).not.toBeInTheDocument();
  });

  it('does NOT show duplicate prompt for completed state', async () => {
    const completedMetadata = {
      steps: [
        { step: 'ai_parse', status: 'completed' },
        { step: 'insert_records', status: 'completed' },
        { step: 'analyze_pages', status: 'completed' },
        { step: 'match_photos', status: 'completed' },
        { step: 'complete', status: 'completed' },
      ],
    };
    setupMockQuery('completed', completedMetadata);

    render(<ParseProgress violationId="v-456" onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText('Parse Complete!')).toBeInTheDocument();
    });

    expect(screen.queryByText('Duplicate NOI Detected')).not.toBeInTheDocument();
  });
});
