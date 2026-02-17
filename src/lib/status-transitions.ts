import type { ViolationStatus } from './types';

// Valid status transitions for violations
const VALID_TRANSITIONS: Record<ViolationStatus, ViolationStatus[]> = {
  NEW: ['PARSING', 'ASSIGNED', 'CLOSED'],
  PARSING: ['PARSED', 'NEW'], // Can go back to NEW on parse failure
  PARSED: ['ASSIGNED', 'CLOSED'],
  ASSIGNED: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['AWAITING_PHOTOS', 'CLOSED'],
  AWAITING_PHOTOS: ['PHOTOS_UPLOADED', 'IN_PROGRESS'],
  PHOTOS_UPLOADED: ['READY_FOR_SUBMISSION', 'AWAITING_PHOTOS'],
  READY_FOR_SUBMISSION: ['SUBMITTED', 'AWAITING_PHOTOS'],
  SUBMITTED: ['APPROVED', 'REJECTED', 'ADDITIONAL_INFO_REQUESTED'],
  APPROVED: ['CLOSED'],
  REJECTED: ['IN_PROGRESS'],
  ADDITIONAL_INFO_REQUESTED: ['AWAITING_PHOTOS', 'IN_PROGRESS'],
  CLOSED: [],
};

export function canTransition(from: ViolationStatus, to: ViolationStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextStatuses(current: ViolationStatus): ViolationStatus[] {
  return VALID_TRANSITIONS[current] ?? [];
}

// Human-readable labels for statuses
export const STATUS_LABELS: Record<ViolationStatus, string> = {
  NEW: 'New',
  PARSING: 'Parsing',
  PARSED: 'Parsed',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  AWAITING_PHOTOS: 'Awaiting Photos',
  PHOTOS_UPLOADED: 'Photos Uploaded',
  READY_FOR_SUBMISSION: 'Ready for Submission',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  ADDITIONAL_INFO_REQUESTED: 'More Info Requested',
  CLOSED: 'Closed',
};

// Color classes for status badges
export const STATUS_COLORS: Record<ViolationStatus, string> = {
  NEW: 'bg-gray-100 text-gray-800',
  PARSING: 'bg-blue-100 text-blue-800',
  PARSED: 'bg-indigo-100 text-indigo-800',
  ASSIGNED: 'bg-purple-100 text-purple-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  AWAITING_PHOTOS: 'bg-orange-100 text-orange-800',
  PHOTOS_UPLOADED: 'bg-cyan-100 text-cyan-800',
  READY_FOR_SUBMISSION: 'bg-teal-100 text-teal-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  ADDITIONAL_INFO_REQUESTED: 'bg-amber-100 text-amber-800',
  CLOSED: 'bg-gray-200 text-gray-600',
};

// Priority display helpers
export function getPriorityColor(priority: number): string {
  switch (priority) {
    case 1: return 'text-red-600 bg-red-50';
    case 2: return 'text-orange-600 bg-orange-50';
    default: return 'text-gray-600 bg-gray-50';
  }
}

export function getPriorityLabel(priority: number): string {
  switch (priority) {
    case 1: return 'P1 - Critical';
    case 2: return 'P2 - High';
    default: return 'P3 - Normal';
  }
}

// Urgency calculation for dashboard color coding
export function getUrgencyColor(deadline: string | null, status: ViolationStatus): string {
  if (!deadline || ['APPROVED', 'CLOSED'].includes(status)) {
    return 'text-gray-400';
  }
  const daysRemaining = Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (daysRemaining < 0) return 'text-red-600 font-bold';
  if (daysRemaining <= 10) return 'text-orange-600 font-semibold';
  if (daysRemaining <= 30) return 'text-yellow-600';
  return 'text-green-600';
}

export function getDaysRemaining(deadline: string | null): number | null {
  if (!deadline) return null;
  return Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
}
