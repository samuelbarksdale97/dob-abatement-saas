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
  NEW: 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-600/20 font-medium',
  PARSING: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20 font-medium',
  PARSED: 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20 font-medium',
  ASSIGNED: 'bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/20 font-medium',
  IN_PROGRESS: 'bg-yellow-50 text-yellow-800 ring-1 ring-inset ring-yellow-600/20 font-medium',
  AWAITING_PHOTOS: 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20 font-medium',
  PHOTOS_UPLOADED: 'bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-600/20 font-medium',
  READY_FOR_SUBMISSION: 'bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-600/20 font-medium',
  SUBMITTED: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20 font-medium',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 font-medium',
  REJECTED: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20 font-medium',
  ADDITIONAL_INFO_REQUESTED: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 font-medium',
  CLOSED: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/20 font-medium',
};

// Priority display helpers
export function getPriorityColor(priority: number): string {
  switch (priority) {
    case 1: return 'text-red-700 bg-red-50 ring-1 ring-inset ring-red-600/20';
    case 2: return 'text-orange-700 bg-orange-50 ring-1 ring-inset ring-orange-600/20';
    default: return 'text-slate-600 bg-slate-50 ring-1 ring-inset ring-slate-500/20';
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
    return 'text-slate-400';
  }
  const daysRemaining = Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (daysRemaining < 0) return 'text-red-600 font-bold';
  if (daysRemaining <= 10) return 'text-orange-600 font-semibold';
  if (daysRemaining <= 30) return 'text-amber-600 font-medium';
  return 'text-emerald-600 font-medium';
}

export function getDaysRemaining(deadline: string | null): number | null {
  if (!deadline) return null;
  return Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
}
