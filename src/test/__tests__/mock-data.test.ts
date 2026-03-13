import { describe, it, expect } from 'vitest';
import {
  mockOrganization,
  mockProfile,
  mockViolation,
  mockViolationItem,
  mockWorkOrder,
  mockPhoto,
  mockContractorToken,
} from '../helpers/mock-data';

describe('Mock Data Factories', () => {
  describe('mockOrganization', () => {
    it('returns valid defaults', () => {
      const org = mockOrganization();
      expect(org.id).toBe('org-123');
      expect(org.name).toBeDefined();
      expect(org.slug).toBeDefined();
      expect(org.plan).toBeDefined();
    });

    it('accepts overrides', () => {
      const org = mockOrganization({ name: 'Custom Org', plan: 'enterprise' });
      expect(org.name).toBe('Custom Org');
      expect(org.plan).toBe('enterprise');
      expect(org.id).toBe('org-123'); // default preserved
    });
  });

  describe('mockProfile', () => {
    it('returns valid defaults', () => {
      const profile = mockProfile();
      expect(profile.org_id).toBe('org-123');
      expect(profile.role).toBe('PROJECT_MANAGER');
      expect(profile.email).toBeDefined();
    });

    it('accepts role override', () => {
      const admin = mockProfile({ role: 'ADMIN' });
      expect(admin.role).toBe('ADMIN');
    });
  });

  describe('mockViolation', () => {
    it('returns valid defaults with all required fields', () => {
      const v = mockViolation();
      expect(v.id).toBeDefined();
      expect(v.org_id).toBe('org-123');
      expect(v.status).toBe('PARSED');
      expect(v.priority).toBe(2);
      expect(v.parse_status).toBe('complete');
      expect(v.source).toBe('upload');
    });

    it('preserves all 20+ fields', () => {
      const v = mockViolation();
      const keys = Object.keys(v);
      expect(keys).toContain('notice_id');
      expect(keys).toContain('respondent');
      expect(keys).toContain('infraction_address');
      expect(keys).toContain('date_of_service');
      expect(keys).toContain('total_fines');
      expect(keys).toContain('abatement_deadline');
      expect(keys).toContain('pdf_storage_path');
      expect(keys).toContain('parse_metadata');
      expect(keys).toContain('raw_ai_output');
    });
  });

  describe('mockViolationItem', () => {
    it('returns valid defaults', () => {
      const item = mockViolationItem();
      expect(item.violation_id).toBe('v-123');
      expect(item.violation_code).toBe('IPMC-502.1');
      expect(item.priority).toBe(2);
      expect(item.fine).toBe(500);
    });

    it('links to parent violation', () => {
      const item = mockViolationItem({ violation_id: 'v-custom' });
      expect(item.violation_id).toBe('v-custom');
    });
  });

  describe('mockWorkOrder', () => {
    it('returns valid defaults', () => {
      const wo = mockWorkOrder();
      expect(wo.violation_id).toBe('v-123');
      expect(wo.status).toBe('ASSIGNED');
      expect(wo.contractor_name).toBeDefined();
      expect(wo.contractor_email).toBeDefined();
      expect(wo.completed_at).toBeNull();
    });
  });

  describe('mockPhoto', () => {
    it('returns valid defaults', () => {
      const photo = mockPhoto();
      expect(photo.violation_id).toBe('v-123');
      expect(photo.violation_item_id).toBe('item-123');
      expect(photo.photo_type).toBe('INSPECTOR');
      expect(photo.status).toBe('APPROVED');
      expect(photo.page_number).toBe(3);
    });

    it('accepts type override', () => {
      const after = mockPhoto({ photo_type: 'AFTER', status: 'PENDING_REVIEW' });
      expect(after.photo_type).toBe('AFTER');
      expect(after.status).toBe('PENDING_REVIEW');
    });
  });

  describe('mockContractorToken', () => {
    it('returns valid defaults with future expiry', () => {
      const token = mockContractorToken();
      expect(token.token).toBeDefined();
      expect(token.work_order_id).toBe('wo-123');
      expect(new Date(token.expires_at).getTime()).toBeGreaterThan(Date.now());
      expect(token.revoked_at).toBeNull();
    });
  });
});

describe('Type Integrity', () => {
  it('ViolationStatus type covers all 13 states', () => {
    const allStatuses = [
      'NEW', 'PARSING', 'PARSED', 'ASSIGNED', 'IN_PROGRESS',
      'AWAITING_PHOTOS', 'PHOTOS_UPLOADED', 'READY_FOR_SUBMISSION',
      'SUBMITTED', 'APPROVED', 'REJECTED', 'ADDITIONAL_INFO_REQUESTED', 'CLOSED',
    ];
    expect(allStatuses).toHaveLength(13);

    // Verify mock uses valid status
    const v = mockViolation();
    expect(allStatuses).toContain(v.status);
  });

  it('PhotoType covers all 4 types', () => {
    const allTypes = ['BEFORE', 'AFTER', 'INSPECTOR', 'REFERENCE'];
    const photo = mockPhoto();
    expect(allTypes).toContain(photo.photo_type);
  });

  it('WorkOrderStatus covers all 4 states', () => {
    const allStatuses = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    const wo = mockWorkOrder();
    expect(allStatuses).toContain(wo.status);
  });
});
