import { describe, it, expect } from 'vitest';
import type { WorkOrderStatus } from '../types';

// Mirror the work order state machine from src/app/api/contractor/[token]/status/route.ts
const VALID_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

function canTransitionWorkOrder(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// Mirror the violation status sync logic from the same route
function getViolationStatusForWorkOrder(woStatus: WorkOrderStatus): string {
  if (woStatus === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (woStatus === 'COMPLETED') return 'PHOTOS_UPLOADED';
  if (woStatus === 'CANCELLED') return 'PARSED';
  return 'ASSIGNED';
}

describe('Work Order Status Transitions', () => {
  it('ASSIGNED can go to IN_PROGRESS', () => {
    expect(canTransitionWorkOrder('ASSIGNED', 'IN_PROGRESS')).toBe(true);
  });

  it('ASSIGNED can go to CANCELLED', () => {
    expect(canTransitionWorkOrder('ASSIGNED', 'CANCELLED')).toBe(true);
  });

  it('ASSIGNED cannot go to COMPLETED', () => {
    expect(canTransitionWorkOrder('ASSIGNED', 'COMPLETED')).toBe(false);
  });

  it('IN_PROGRESS can go to COMPLETED', () => {
    expect(canTransitionWorkOrder('IN_PROGRESS', 'COMPLETED')).toBe(true);
  });

  it('IN_PROGRESS can go to CANCELLED', () => {
    expect(canTransitionWorkOrder('IN_PROGRESS', 'CANCELLED')).toBe(true);
  });

  it('COMPLETED is terminal', () => {
    expect(VALID_TRANSITIONS.COMPLETED).toEqual([]);
  });

  it('CANCELLED is terminal', () => {
    expect(VALID_TRANSITIONS.CANCELLED).toEqual([]);
  });
});

describe('Work Order → Violation Status Sync', () => {
  it('ASSIGNED work order maps to ASSIGNED violation', () => {
    expect(getViolationStatusForWorkOrder('ASSIGNED')).toBe('ASSIGNED');
  });

  it('IN_PROGRESS work order maps to IN_PROGRESS violation', () => {
    expect(getViolationStatusForWorkOrder('IN_PROGRESS')).toBe('IN_PROGRESS');
  });

  it('COMPLETED work order maps to PHOTOS_UPLOADED violation', () => {
    expect(getViolationStatusForWorkOrder('COMPLETED')).toBe('PHOTOS_UPLOADED');
  });

  it('CANCELLED work order reverts violation to PARSED', () => {
    expect(getViolationStatusForWorkOrder('CANCELLED')).toBe('PARSED');
  });
});
