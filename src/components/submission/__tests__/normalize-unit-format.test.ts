import { describe, it, expect, vi } from 'vitest';

// Mock heavy dependencies that generate-pdf-button imports
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/pdf/prepare-images', () => ({
  renderPdfPageToImage: vi.fn(),
  fetchImageAsDataUrl: vi.fn(),
}));
vi.mock('@/lib/pdf/generate-submission', () => ({
  generateSubmissionPdf: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { normalizeUnitFormat } from '../generate-pdf-button';

describe('normalizeUnitFormat', () => {
  it('adds space after "Unit:" when missing', () => {
    expect(normalizeUnitFormat('557 LEBAUM ST SE, Unit:103')).toBe(
      '557 LEBAUM ST SE, Unit: 103',
    );
  });

  it('preserves already-correct "Unit: 103" format (no double space)', () => {
    expect(normalizeUnitFormat('557 LEBAUM ST SE, Unit: 103')).toBe(
      '557 LEBAUM ST SE, Unit: 103',
    );
  });

  it('handles lowercase "unit:" (normalizes to "Unit: ")', () => {
    expect(normalizeUnitFormat('123 Main St, unit:5')).toBe('123 Main St, Unit: 5');
  });

  it('handles uppercase "UNIT:" (normalizes to "Unit: ")', () => {
    expect(normalizeUnitFormat('100 First Ave, UNIT:200')).toBe('100 First Ave, Unit: 200');
  });

  it('handles mixed case "Unit:"', () => {
    expect(normalizeUnitFormat('500 Oak Dr, Unit:3B')).toBe('500 Oak Dr, Unit: 3B');
  });

  it('passes through address with no unit unchanged', () => {
    const address = '123 Main St NW, Washington, DC';
    expect(normalizeUnitFormat(address)).toBe(address);
  });

  it('handles empty string', () => {
    expect(normalizeUnitFormat('')).toBe('');
  });

  it('handles address with "Unit" not followed by colon', () => {
    const address = '100 Unit Ave NW';
    expect(normalizeUnitFormat(address)).toBe(address);
  });

  it('does not create triple spaces from "Unit:  103" (double space input)', () => {
    expect(normalizeUnitFormat('557 LEBAUM ST SE, Unit:  103')).toBe(
      '557 LEBAUM ST SE, Unit: 103',
    );
  });

  it('handles multiple "Unit:" occurrences in one string', () => {
    expect(normalizeUnitFormat('Unit:1 and Unit:2')).toBe('Unit: 1 and Unit: 2');
  });

  it('handles "Unit:" at the start of the string', () => {
    expect(normalizeUnitFormat('Unit:103, 557 LEBAUM ST SE')).toBe(
      'Unit: 103, 557 LEBAUM ST SE',
    );
  });

  it('handles "Unit:" at the end of the string', () => {
    expect(normalizeUnitFormat('557 LEBAUM ST SE Unit:103')).toBe(
      '557 LEBAUM ST SE Unit: 103',
    );
  });
});
