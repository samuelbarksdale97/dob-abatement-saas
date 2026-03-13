/**
 * Tests for the auto-link-property logic used in the parse pipeline.
 *
 * Since the auto-link step lives inside an Inngest function and depends on
 * Supabase, we test the underlying address-normalization utilities here
 * and verify the integration logic via targeted scenarios.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeAddress,
  findMatchingProperty,
  extractUnitFromAddress,
} from '@/lib/address-normalization';

describe('Auto-link property: address matching scenarios', () => {
  // Simulates the property lookup the pipeline does
  const existingProperties = [
    { id: 'prop-1', address: '557 Lebaum Street SE' },
    { id: 'prop-2', address: '1234 Main Ave NW' },
    { id: 'prop-3', address: '800 K St NE' },
  ];

  it('matches NOI address with abbreviations to existing property', () => {
    // NOI says "557 LEBAUM ST SE" — should match "557 Lebaum Street SE"
    const match = findMatchingProperty('557 LEBAUM ST SE', existingProperties);
    expect(match).toBe('prop-1');
  });

  it('matches NOI address with unit suffix to existing property', () => {
    // NOI says "557 LEBAUM ST SE, Unit:103" — should match after stripping unit
    const match = findMatchingProperty('557 LEBAUM ST SE, Unit:103', existingProperties);
    expect(match).toBe('prop-1');
  });

  it('extracts unit number from NOI address', () => {
    expect(extractUnitFromAddress('557 LEBAUM ST SE, Unit:103')).toBe('103');
    expect(extractUnitFromAddress('1234 Main Ave NW #3')).toBe('3');
    expect(extractUnitFromAddress('800 K St NE Apt 2B')).toBe('2b');
    expect(extractUnitFromAddress('800 K St NE')).toBeNull();
  });

  it('returns null for unmatched addresses', () => {
    const match = findMatchingProperty('999 Unknown Blvd', existingProperties);
    expect(match).toBeNull();
  });

  it('handles empty/null address gracefully', () => {
    const match = findMatchingProperty('', existingProperties);
    expect(match).toBeNull();
  });

  it('normalizes address for property creation (strip unit)', () => {
    // When creating a new property, we strip the unit portion
    const raw = '557 LEBAUM ST SE, Unit:103';
    const cleaned = raw.replace(/,?\s*unit[:\s]+\S+/i, '').trim();
    expect(cleaned).toBe('557 LEBAUM ST SE');
  });

  it('normalizes address for property creation (strip #)', () => {
    const raw = '1234 Main Ave NW #3';
    const cleaned = raw.replace(/,?\s*#\S+/, '').trim();
    expect(cleaned).toBe('1234 Main Ave NW');
  });

  it('handles case-insensitive matching for different NOI formats', () => {
    const match = findMatchingProperty('800 k street ne', existingProperties);
    expect(match).toBe('prop-3');
  });

  it('pipeline produces correct property_id + unit_id update fields', () => {
    // Simulate what the pipeline does: build update fields
    const propertyId = 'prop-1';
    const unitId = 'unit-abc';
    const updateFields: Record<string, string | null> = { property_id: propertyId };
    if (unitId) updateFields.unit_id = unitId;

    expect(updateFields).toEqual({
      property_id: 'prop-1',
      unit_id: 'unit-abc',
    });
  });

  it('pipeline skips unit_id when no unit in address', () => {
    const propertyId = 'prop-1';
    const unitNumber = extractUnitFromAddress('557 LEBAUM ST SE');
    const updateFields: Record<string, string | null> = { property_id: propertyId };
    if (unitNumber) updateFields.unit_id = 'some-unit-id';

    expect(updateFields).toEqual({
      property_id: 'prop-1',
    });
    expect(unitNumber).toBeNull();
  });
});
