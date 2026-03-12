import { describe, it, expect } from 'vitest';
import {
  canTransition,
  getNextStatuses,
  STATUS_LABELS,
  STATUS_COLORS,
  getPriorityColor,
  getPriorityLabel,
  getUrgencyColor,
  getDaysRemaining,
} from '../status-transitions';
import type { ViolationStatus } from '../types';

const ALL_STATUSES: ViolationStatus[] = [
  'NEW', 'PARSING', 'PARSED', 'ASSIGNED', 'IN_PROGRESS',
  'AWAITING_PHOTOS', 'PHOTOS_UPLOADED', 'READY_FOR_SUBMISSION',
  'SUBMITTED', 'APPROVED', 'REJECTED', 'ADDITIONAL_INFO_REQUESTED', 'CLOSED',
];

describe('canTransition', () => {
  // Happy path: every valid forward transition
  const validTransitions: [ViolationStatus, ViolationStatus][] = [
    ['NEW', 'PARSING'],
    ['NEW', 'ASSIGNED'],
    ['NEW', 'CLOSED'],
    ['PARSING', 'PARSED'],
    ['PARSING', 'NEW'],
    ['PARSED', 'ASSIGNED'],
    ['PARSED', 'CLOSED'],
    ['ASSIGNED', 'IN_PROGRESS'],
    ['ASSIGNED', 'CLOSED'],
    ['IN_PROGRESS', 'AWAITING_PHOTOS'],
    ['IN_PROGRESS', 'CLOSED'],
    ['AWAITING_PHOTOS', 'PHOTOS_UPLOADED'],
    ['AWAITING_PHOTOS', 'IN_PROGRESS'],
    ['PHOTOS_UPLOADED', 'READY_FOR_SUBMISSION'],
    ['PHOTOS_UPLOADED', 'AWAITING_PHOTOS'],
    ['READY_FOR_SUBMISSION', 'SUBMITTED'],
    ['READY_FOR_SUBMISSION', 'AWAITING_PHOTOS'],
    ['SUBMITTED', 'APPROVED'],
    ['SUBMITTED', 'REJECTED'],
    ['SUBMITTED', 'ADDITIONAL_INFO_REQUESTED'],
    ['APPROVED', 'CLOSED'],
    ['REJECTED', 'IN_PROGRESS'],
    ['ADDITIONAL_INFO_REQUESTED', 'AWAITING_PHOTOS'],
    ['ADDITIONAL_INFO_REQUESTED', 'IN_PROGRESS'],
  ];

  it.each(validTransitions)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  // Invalid transitions
  const invalidTransitions: [ViolationStatus, ViolationStatus][] = [
    ['CLOSED', 'NEW'],
    ['CLOSED', 'ASSIGNED'],
    ['PARSED', 'IN_PROGRESS'],
    ['NEW', 'SUBMITTED'],
    ['APPROVED', 'REJECTED'],
    ['SUBMITTED', 'NEW'],
    ['IN_PROGRESS', 'SUBMITTED'],
    ['PHOTOS_UPLOADED', 'CLOSED'],
  ];

  it.each(invalidTransitions)('blocks %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('self-transitions are not allowed', () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('CLOSED is a terminal state (no transitions out)', () => {
    for (const status of ALL_STATUSES) {
      if (status !== 'CLOSED') {
        expect(canTransition('CLOSED', status)).toBe(false);
      }
    }
  });
});

describe('getNextStatuses', () => {
  it('returns correct next statuses for NEW', () => {
    expect(getNextStatuses('NEW')).toEqual(['PARSING', 'ASSIGNED', 'CLOSED']);
  });

  it('returns correct next statuses for SUBMITTED', () => {
    expect(getNextStatuses('SUBMITTED')).toEqual(['APPROVED', 'REJECTED', 'ADDITIONAL_INFO_REQUESTED']);
  });

  it('returns empty array for CLOSED', () => {
    expect(getNextStatuses('CLOSED')).toEqual([]);
  });

  it('every status has a defined set of next statuses', () => {
    for (const status of ALL_STATUSES) {
      const next = getNextStatuses(status);
      expect(Array.isArray(next)).toBe(true);
    }
  });
});

describe('STATUS_LABELS', () => {
  it('has a label for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_LABELS[status]).toBeDefined();
      expect(typeof STATUS_LABELS[status]).toBe('string');
      expect(STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it('specific labels match expected values', () => {
    expect(STATUS_LABELS.NEW).toBe('New');
    expect(STATUS_LABELS.IN_PROGRESS).toBe('In Progress');
    expect(STATUS_LABELS.ADDITIONAL_INFO_REQUESTED).toBe('More Info Requested');
    expect(STATUS_LABELS.CLOSED).toBe('Closed');
  });
});

describe('STATUS_COLORS', () => {
  it('has a color class for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_COLORS[status]).toBeDefined();
      expect(STATUS_COLORS[status]).toContain('bg-');
      expect(STATUS_COLORS[status]).toContain('text-');
    }
  });
});

describe('getPriorityColor', () => {
  it('returns red for P1', () => {
    expect(getPriorityColor(1)).toContain('red');
  });

  it('returns orange for P2', () => {
    expect(getPriorityColor(2)).toContain('orange');
  });

  it('returns gray for P3 and higher', () => {
    expect(getPriorityColor(3)).toContain('gray');
    expect(getPriorityColor(99)).toContain('gray');
  });
});

describe('getPriorityLabel', () => {
  it('returns correct labels', () => {
    expect(getPriorityLabel(1)).toBe('P1 - Critical');
    expect(getPriorityLabel(2)).toBe('P2 - High');
    expect(getPriorityLabel(3)).toBe('P3 - Normal');
  });
});

describe('getUrgencyColor', () => {
  it('returns gray for null deadline', () => {
    expect(getUrgencyColor(null, 'NEW')).toBe('text-gray-400');
  });

  it('returns gray for APPROVED status regardless of deadline', () => {
    const deadline = new Date(Date.now() - 86400000).toISOString(); // yesterday
    expect(getUrgencyColor(deadline, 'APPROVED')).toBe('text-gray-400');
  });

  it('returns gray for CLOSED status regardless of deadline', () => {
    const deadline = new Date(Date.now() - 86400000).toISOString();
    expect(getUrgencyColor(deadline, 'CLOSED')).toBe('text-gray-400');
  });

  it('returns red bold for overdue deadlines', () => {
    const pastDeadline = new Date(Date.now() - 2 * 86400000).toISOString();
    expect(getUrgencyColor(pastDeadline, 'IN_PROGRESS')).toBe('text-red-600 font-bold');
  });

  it('returns orange for deadlines within 10 days', () => {
    const soon = new Date(Date.now() + 5 * 86400000).toISOString();
    expect(getUrgencyColor(soon, 'IN_PROGRESS')).toContain('orange');
  });

  it('returns yellow for deadlines within 30 days', () => {
    const upcoming = new Date(Date.now() + 20 * 86400000).toISOString();
    expect(getUrgencyColor(upcoming, 'IN_PROGRESS')).toContain('yellow');
  });

  it('returns green for deadlines beyond 30 days', () => {
    const farOut = new Date(Date.now() + 60 * 86400000).toISOString();
    expect(getUrgencyColor(farOut, 'IN_PROGRESS')).toContain('green');
  });
});

describe('getDaysRemaining', () => {
  it('returns null for null deadline', () => {
    expect(getDaysRemaining(null)).toBeNull();
  });

  it('returns negative number for past deadlines', () => {
    const past = new Date(Date.now() - 5 * 86400000).toISOString();
    const days = getDaysRemaining(past);
    expect(days).not.toBeNull();
    expect(days!).toBeLessThan(0);
  });

  it('returns positive number for future deadlines', () => {
    const future = new Date(Date.now() + 10 * 86400000).toISOString();
    const days = getDaysRemaining(future);
    expect(days).not.toBeNull();
    expect(days!).toBeGreaterThan(0);
  });
});
