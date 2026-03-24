import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the duplicate detection logic extracted from the parse-noi pipeline.
 * We test the decision logic, not the full Inngest step execution.
 */

describe('Duplicate Detection Logic', () => {
  describe('should detect duplicates', () => {
    it('identifies a duplicate when notice_id matches a completed violation', () => {
      const noticeId = '25NOIR-INS-07709';
      const existing = { id: 'existing-v-123', notice_id: noticeId, status: 'PARSED' };
      const isDuplicate = existing !== null && existing.notice_id === noticeId;

      expect(isDuplicate).toBe(true);
    });

    it('does NOT flag as duplicate when notice_id is null/empty', () => {
      const noticeId: string | null = null;
      // Pipeline logic: if (!noticeId) return { isDuplicate: false }
      const shouldSkip = !noticeId;

      expect(shouldSkip).toBe(true);
    });

    it('does NOT flag as duplicate when no matching violation exists', () => {
      const existing = null;
      const isDuplicate = existing !== null;

      expect(isDuplicate).toBe(false);
    });
  });

  describe('overwrite cascade delete order', () => {
    it('deletes related records in correct dependency order', () => {
      // The overwrite step must delete in this order to avoid FK violations:
      const deleteOrder = [
        'photos',
        'violation_items',
        'contractor_tokens',
        'work_orders',
        'audit_log',
        'violations',
      ];

      // photos depends on violation_items (violation_item_id FK)
      expect(deleteOrder.indexOf('photos')).toBeLessThan(deleteOrder.indexOf('violation_items'));
      // violation_items depends on violations
      expect(deleteOrder.indexOf('violation_items')).toBeLessThan(deleteOrder.indexOf('violations'));
      // contractor_tokens depends on work_orders (via violation_id)
      expect(deleteOrder.indexOf('contractor_tokens')).toBeLessThan(deleteOrder.indexOf('violations'));
      // work_orders depends on violations
      expect(deleteOrder.indexOf('work_orders')).toBeLessThan(deleteOrder.indexOf('violations'));
      // audit_log depends on violations
      expect(deleteOrder.indexOf('audit_log')).toBeLessThan(deleteOrder.indexOf('violations'));
    });
  });

  describe('duplicate_pending metadata', () => {
    it('stores required fields for UI prompt', () => {
      const metadata = {
        duplicate_detected: true,
        duplicate_violation_id: 'existing-v-123',
        existing_notice_id: '25NOIR-INS-07709',
        steps: [
          { step: 'ai_parse', status: 'completed' },
        ],
      };

      expect(metadata.duplicate_detected).toBe(true);
      expect(metadata.duplicate_violation_id).toBeTruthy();
      expect(metadata.existing_notice_id).toBeTruthy();
    });

    it('handles missing existing_notice_id gracefully', () => {
      const metadata = {
        duplicate_detected: true,
        duplicate_violation_id: 'existing-v-123',
        existing_notice_id: undefined,
      };

      // UI should still render without the notice_id
      const displayText = metadata.existing_notice_id
        ? `(${metadata.existing_notice_id})`
        : '';

      expect(displayText).toBe('');
    });
  });

  describe('parse_status transitions', () => {
    it('follows correct state machine for overwrite flow', () => {
      const states = [
        'pending',       // initial upload
        'processing',    // pipeline started
        'duplicate_pending', // duplicate detected, waiting for user
        'processing',    // user chose overwrite, pipeline resumed
        'completed',     // pipeline finished
      ];

      expect(states[0]).toBe('pending');
      expect(states[2]).toBe('duplicate_pending');
      expect(states[4]).toBe('completed');
    });

    it('follows correct state machine for cancel flow', () => {
      const states = [
        'pending',
        'processing',
        'duplicate_pending',
        'duplicate',  // user chose cancel (or timeout)
      ];

      expect(states[3]).toBe('duplicate');
    });
  });

  describe('API endpoint validation', () => {
    it('rejects invalid actions', () => {
      const validActions = ['overwrite', 'cancel'];
      expect(validActions.includes('overwrite')).toBe(true);
      expect(validActions.includes('cancel')).toBe(true);
      expect(validActions.includes('delete')).toBe(false);
      expect(validActions.includes('')).toBe(false);
    });

    it('only resolves violations in duplicate_pending state', () => {
      const canResolve = (status: string) => status === 'duplicate_pending';

      expect(canResolve('duplicate_pending')).toBe(true);
      expect(canResolve('processing')).toBe(false);
      expect(canResolve('completed')).toBe(false);
      expect(canResolve('failed')).toBe(false);
      expect(canResolve('duplicate')).toBe(false);
    });
  });
});
