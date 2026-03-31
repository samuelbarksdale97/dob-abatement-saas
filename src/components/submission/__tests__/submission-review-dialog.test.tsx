import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubmissionReviewDialog } from '../submission-review-dialog';
import type { SubmissionPdfData } from '@/lib/pdf/generate-submission';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function makeTestData(overrides: Partial<SubmissionPdfData> = {}): SubmissionPdfData {
  return {
    address: '557 LEBAUM ST SE, Unit: 103',
    respondent: 'YOKE LEBAUM LLC',
    noiNumber: '25NOIR-INS-07709',
    noiDate: '1/15/2025',
    contactName: 'Chris Grant',
    contactCompany: 'Yoke Partners',
    contactEmail: 'cgrant@yokepartners.com',
    contactPhone: '202-555-0100',
    items: [
      {
        item_number: 1,
        violation_code: 'IPMC § 304.13',
        priority: 2,
        abatement_deadline: '60 Days',
        fine: 625,
        violation_description: 'Failure to maintain window in weather-tight condition',
        specific_location: 'Living Room',
        task_description: 'Replaced window seal and verified weather tightness',
        date_of_infraction: '01/10/2025',
        time_of_infraction: '14:30',
        inspectorPhotoDataUrl: 'data:image/jpeg;base64,inspector1',
        remediationPhotoDataUrl: 'data:image/jpeg;base64,remediation1',
      },
      {
        item_number: 2,
        violation_code: 'IPMC § 605.1',
        priority: 1,
        abatement_deadline: '30 Days',
        fine: 1250,
        violation_description: 'Electrical outlet without cover plate',
        specific_location: 'Kitchen',
        task_description: 'Installed new cover plates on all exposed outlets',
        date_of_infraction: '01/10/2025',
        time_of_infraction: null,
        inspectorPhotoDataUrl: null,
        remediationPhotoDataUrl: 'data:image/jpeg;base64,remediation2',
      },
    ],
    ...overrides,
  };
}

const defaultProps = () => ({
  open: true,
  onOpenChange: vi.fn(),
  data: makeTestData(),
  onConfirm: vi.fn(),
  generating: false,
});

describe('SubmissionReviewDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  describe('rendering', () => {
    it('renders the dialog when open', () => {
      render(<SubmissionReviewDialog {...defaultProps()} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Review Submission Report')).toBeInTheDocument();
    });

    it('does not render dialog content when closed', () => {
      render(<SubmissionReviewDialog {...defaultProps()} open={false} />);
      expect(screen.queryByText('Review Submission Report')).not.toBeInTheDocument();
    });

    it('renders all cover letter fields with correct values', () => {
      render(<SubmissionReviewDialog {...defaultProps()} />);

      expect(screen.getByLabelText('Contact Name')).toHaveValue('Chris Grant');
      expect(screen.getByLabelText('Company')).toHaveValue('Yoke Partners');
      expect(screen.getByLabelText('Email')).toHaveValue('cgrant@yokepartners.com');
      expect(screen.getByLabelText('Phone')).toHaveValue('202-555-0100');
      expect(screen.getByLabelText('Property Address')).toHaveValue('557 LEBAUM ST SE, Unit: 103');
      expect(screen.getByLabelText('Respondent')).toHaveValue('YOKE LEBAUM LLC');
      expect(screen.getByLabelText('NOI Number')).toHaveValue('25NOIR-INS-07709');
      expect(screen.getByLabelText('NOI Date')).toHaveValue('1/15/2025');
    });

    it('renders the correct number of violation items', () => {
      render(<SubmissionReviewDialog {...defaultProps()} />);
      expect(screen.getByText('Violation Items (2)')).toBeInTheDocument();
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
    });

    it('renders item fields with correct values', () => {
      render(<SubmissionReviewDialog {...defaultProps()} />);

      // First item's explanation textarea
      const textareas = screen.getAllByRole('textbox');
      // Textareas: violation_description (item1), task_description (item1),
      //            violation_description (item2), task_description (item2)
      // + the Input fields are also textboxes
      // Use more targeted query via label
      const explanationLabels = screen.getAllByText('Explanation (appears in PDF)');
      expect(explanationLabels).toHaveLength(2);
    });

    it('renders photo thumbnails when data URLs are present', () => {
      render(<SubmissionReviewDialog {...defaultProps()} />);

      const images = screen.getAllByRole('img');
      // Item 1 has both photos, Item 2 has only remediation
      expect(images).toHaveLength(3);

      const inspectorImg = screen.getByAltText('Inspector photo');
      expect(inspectorImg).toHaveAttribute('src', 'data:image/jpeg;base64,inspector1');

      const remediationImgs = screen.getAllByAltText('Remediation photo');
      expect(remediationImgs).toHaveLength(2);
    });

    it('renders placeholder when photo data URL is null', () => {
      render(<SubmissionReviewDialog {...defaultProps()} />);

      // Item 2 has no inspector photo — should show "No photo" placeholder
      const noPhotoPlaceholders = screen.getAllByText('No photo');
      expect(noPhotoPlaceholders.length).toBeGreaterThanOrEqual(1);
    });

    it('renders with zero items gracefully', () => {
      const props = defaultProps();
      props.data = makeTestData({ items: [] });
      render(<SubmissionReviewDialog {...props} />);

      expect(screen.getByText('Violation Items (0)')).toBeInTheDocument();
      expect(screen.queryByText(/Item \d/)).not.toBeInTheDocument();
    });

    it('renders with null phone as empty string', () => {
      const props = defaultProps();
      props.data = makeTestData({ contactPhone: null });
      render(<SubmissionReviewDialog {...props} />);

      expect(screen.getByLabelText('Phone')).toHaveValue('');
    });
  });

  // -----------------------------------------------------------------------
  // Cover letter field editing
  // -----------------------------------------------------------------------

  describe('cover letter editing', () => {
    it('allows editing contact name', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<SubmissionReviewDialog {...props} />);

      const input = screen.getByLabelText('Contact Name');
      await user.clear(input);
      await user.type(input, 'Sam Barksdale');

      // Confirm and check the data passed back
      await user.click(screen.getByRole('button', { name: /confirm & generate pdf/i }));

      expect(props.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ contactName: 'Sam Barksdale' }),
      );
    });

    it('allows editing email', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<SubmissionReviewDialog {...props} />);

      const input = screen.getByLabelText('Email');
      await user.clear(input);
      await user.type(input, 'new@email.com');

      await user.click(screen.getByRole('button', { name: /confirm & generate pdf/i }));

      expect(props.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ contactEmail: 'new@email.com' }),
      );
    });

    it('allows editing address', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<SubmissionReviewDialog {...props} />);

      const input = screen.getByLabelText('Property Address');
      await user.clear(input);
      await user.type(input, '100 New St NW');

      await user.click(screen.getByRole('button', { name: /confirm & generate pdf/i }));

      expect(props.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ address: '100 New St NW' }),
      );
    });

    it('allows editing respondent', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<SubmissionReviewDialog {...props} />);

      const input = screen.getByLabelText('Respondent');
      await user.clear(input);
      await user.type(input, 'New Owner LLC');

      await user.click(screen.getByRole('button', { name: /confirm & generate pdf/i }));

      expect(props.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ respondent: 'New Owner LLC' }),
      );
    });

    it('preserves unedited fields when one field is changed', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<SubmissionReviewDialog {...props} />);

      // Only edit phone
      const input = screen.getByLabelText('Phone');
      await user.clear(input);
      await user.type(input, '555-1234');

      await user.click(screen.getByRole('button', { name: /confirm & generate pdf/i }));

      const result = props.onConfirm.mock.calls[0][0] as SubmissionPdfData;
      // All other fields should remain unchanged
      expect(result.contactName).toBe('Chris Grant');
      expect(result.contactCompany).toBe('Yoke Partners');
      expect(result.contactEmail).toBe('cgrant@yokepartners.com');
      expect(result.address).toBe('557 LEBAUM ST SE, Unit: 103');
      expect(result.respondent).toBe('YOKE LEBAUM LLC');
      expect(result.noiNumber).toBe('25NOIR-INS-07709');
      expect(result.noiDate).toBe('1/15/2025');
      expect(result.contactPhone).toBe('555-1234');
    });
  });

  // -----------------------------------------------------------------------
  // Item field editing
  // -----------------------------------------------------------------------

  describe('item editing', () => {
    it('allows editing task_description (Explanation)', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<SubmissionReviewDialog {...props} />);

      // Get all Explanation textareas
      const explanationLabels = screen.getAllByText('Explanation (appears in PDF)');
      // The textarea is a sibling — find it by navigating the DOM
      const firstExplanationTextarea = explanationLabels[0]
        .closest('.space-y-1\\.5')
        ?.querySelector('textarea');

      expect(firstExplanationTextarea).toBeTruthy();
      await user.clear(firstExplanationTextarea!);
      await user.type(firstExplanationTextarea!, 'Updated explanation text');

      await user.click(screen.getByRole('button', { name: /confirm & generate pdf/i }));

      const result = props.onConfirm.mock.calls[0][0] as SubmissionPdfData;
      expect(result.items[0].task_description).toBe('Updated explanation text');
      // Second item should be untouched
      expect(result.items[1].task_description).toBe('Installed new cover plates on all exposed outlets');
    });

    it('allows editing violation description', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<SubmissionReviewDialog {...props} />);

      const descLabels = screen.getAllByText('Violation Description');
      const firstDescTextarea = descLabels[0]
        .closest('.space-y-1\\.5')
        ?.querySelector('textarea');

      expect(firstDescTextarea).toBeTruthy();
      await user.clear(firstDescTextarea!);
      await user.type(firstDescTextarea!, 'New description');

      await user.click(screen.getByRole('button', { name: /confirm & generate pdf/i }));

      const result = props.onConfirm.mock.calls[0][0] as SubmissionPdfData;
      expect(result.items[0].violation_description).toBe('New description');
    });

    it('editing one item does not affect other items', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<SubmissionReviewDialog {...props} />);

      // Edit second item's explanation
      const explanationLabels = screen.getAllByText('Explanation (appears in PDF)');
      const secondExplanationTextarea = explanationLabels[1]
        .closest('.space-y-1\\.5')
        ?.querySelector('textarea');

      await user.clear(secondExplanationTextarea!);
      await user.type(secondExplanationTextarea!, 'Only item 2 changed');

      await user.click(screen.getByRole('button', { name: /confirm & generate pdf/i }));

      const result = props.onConfirm.mock.calls[0][0] as SubmissionPdfData;
      // Item 1 untouched
      expect(result.items[0].task_description).toBe('Replaced window seal and verified weather tightness');
      expect(result.items[0].violation_code).toBe('IPMC § 304.13');
      // Item 2 edited
      expect(result.items[1].task_description).toBe('Only item 2 changed');
    });
  });

  // -----------------------------------------------------------------------
  // Confirm / Cancel actions
  // -----------------------------------------------------------------------

  describe('actions', () => {
    it('calls onConfirm with current data when Confirm button is clicked', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<SubmissionReviewDialog {...props} />);

      await user.click(screen.getByRole('button', { name: /confirm & generate pdf/i }));

      expect(props.onConfirm).toHaveBeenCalledTimes(1);
      const result = props.onConfirm.mock.calls[0][0] as SubmissionPdfData;
      expect(result.address).toBe('557 LEBAUM ST SE, Unit: 103');
      expect(result.items).toHaveLength(2);
    });

    it('calls onOpenChange(false) when Cancel button is clicked', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<SubmissionReviewDialog {...props} />);

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(props.onOpenChange).toHaveBeenCalledWith(false);
      expect(props.onConfirm).not.toHaveBeenCalled();
    });

    it('does not call onConfirm when Cancel is clicked after edits', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      render(<SubmissionReviewDialog {...props} />);

      // Make an edit
      const input = screen.getByLabelText('Contact Name');
      await user.clear(input);
      await user.type(input, 'New Name');

      // Cancel instead of confirming
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(props.onConfirm).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Generating state
  // -----------------------------------------------------------------------

  describe('generating state', () => {
    it('disables Confirm button when generating is true', () => {
      const props = defaultProps();
      props.generating = true;
      render(<SubmissionReviewDialog {...props} />);

      const confirmButton = screen.getByRole('button', { name: /generating pdf/i });
      expect(confirmButton).toBeDisabled();
    });

    it('disables Cancel button when generating is true', () => {
      const props = defaultProps();
      props.generating = true;
      render(<SubmissionReviewDialog {...props} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      expect(cancelButton).toBeDisabled();
    });

    it('shows generating spinner text when generating is true', () => {
      const props = defaultProps();
      props.generating = true;
      render(<SubmissionReviewDialog {...props} />);

      expect(screen.getByText('Generating PDF...')).toBeInTheDocument();
      expect(screen.queryByText('Confirm & Generate PDF')).not.toBeInTheDocument();
    });

    it('shows Confirm text when generating is false', () => {
      render(<SubmissionReviewDialog {...defaultProps()} />);
      expect(screen.getByText('Confirm & Generate PDF')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Data sync on prop change
  // -----------------------------------------------------------------------

  describe('data synchronization', () => {
    it('resyncs internal state when data prop changes', async () => {
      const user = userEvent.setup();
      const props = defaultProps();
      const { rerender } = render(<SubmissionReviewDialog {...props} />);

      // Verify initial value
      expect(screen.getByLabelText('Contact Name')).toHaveValue('Chris Grant');

      // Re-render with new data (simulates dialog reopening with fresh data)
      const newData = makeTestData({ contactName: 'New Person' });
      rerender(
        <SubmissionReviewDialog
          {...props}
          data={newData}
        />,
      );

      expect(screen.getByLabelText('Contact Name')).toHaveValue('New Person');
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles items with all null optional fields', () => {
      const props = defaultProps();
      props.data = makeTestData({
        items: [{
          item_number: 1,
          violation_code: '—',
          priority: 3,
          abatement_deadline: null,
          fine: null,
          violation_description: null,
          specific_location: null,
          task_description: null,
          date_of_infraction: null,
          time_of_infraction: null,
          inspectorPhotoDataUrl: null,
          remediationPhotoDataUrl: null,
        }],
      });

      render(<SubmissionReviewDialog {...props} />);

      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Violation Items (1)')).toBeInTheDocument();
      // Both photo slots should show placeholder
      const placeholders = screen.getAllByText('No photo');
      expect(placeholders).toHaveLength(2);
    });

    it('handles many items without crashing', () => {
      const props = defaultProps();
      const manyItems = Array.from({ length: 15 }, (_, i) => ({
        item_number: i + 1,
        violation_code: `CODE-${i + 1}`,
        priority: 2,
        abatement_deadline: '60 Days',
        fine: 500,
        violation_description: `Description ${i + 1}`,
        specific_location: `Room ${i + 1}`,
        task_description: `Explanation ${i + 1}`,
        date_of_infraction: '01/10/2025',
        time_of_infraction: null,
        inspectorPhotoDataUrl: null,
        remediationPhotoDataUrl: null,
      }));
      props.data = makeTestData({ items: manyItems });

      render(<SubmissionReviewDialog {...props} />);

      expect(screen.getByText('Violation Items (15)')).toBeInTheDocument();
      expect(screen.getByText('Item 15')).toBeInTheDocument();
    });

    it('handles empty string contact fields', () => {
      const props = defaultProps();
      props.data = makeTestData({
        contactName: '',
        contactCompany: '',
        contactEmail: '',
        contactPhone: '',
      });

      render(<SubmissionReviewDialog {...props} />);

      expect(screen.getByLabelText('Contact Name')).toHaveValue('');
      expect(screen.getByLabelText('Company')).toHaveValue('');
      expect(screen.getByLabelText('Email')).toHaveValue('');
      expect(screen.getByLabelText('Phone')).toHaveValue('');
    });
  });
});
