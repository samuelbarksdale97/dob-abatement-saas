import { describe, it, expect } from 'vitest';
import {
  normalizeAddress,
  addressesMatch,
  findMatchingProperty,
  extractUnitFromAddress,
} from '../address-normalization';

describe('normalizeAddress', () => {
  it('lowercases and trims', () => {
    const result = normalizeAddress('  123 MAIN ST NW  ');
    expect(result.street).toBe('123 main street nw');
  });

  it('expands common abbreviations', () => {
    expect(normalizeAddress('557 LEBAUM ST SE').street).toBe('557 lebaum street se');
    expect(normalizeAddress('100 PENN AVE NW').street).toBe('100 penn avenue nw');
    expect(normalizeAddress('42 OAK BLVD').street).toBe('42 oak boulevard');
  });

  it('extracts unit from "Unit:103" format', () => {
    const result = normalizeAddress('557 LEBAUM ST SE, Unit:103');
    expect(result.street).toBe('557 lebaum street se');
    expect(result.unit).toBe('103');
  });

  it('extracts unit from "Apt 2B" format', () => {
    const result = normalizeAddress('123 Main St NW Apt 2B');
    expect(result.street).toBe('123 main street nw');
    expect(result.unit).toBe('2b');
  });

  it('extracts unit from "#3" format', () => {
    const result = normalizeAddress('456 Oak Ave #3');
    expect(result.street).toBe('456 oak avenue');
    expect(result.unit).toBe('3');
  });

  it('extracts unit from "Suite 100" format', () => {
    const result = normalizeAddress('789 Penn Blvd Suite 100');
    expect(result.street).toBe('789 penn boulevard');
    expect(result.unit).toBe('100');
  });

  it('returns null unit when no unit present', () => {
    const result = normalizeAddress('123 Main St NW');
    expect(result.unit).toBeNull();
  });

  it('handles empty string', () => {
    const result = normalizeAddress('');
    expect(result.street).toBe('');
    expect(result.unit).toBeNull();
  });

  it('collapses multiple spaces', () => {
    const result = normalizeAddress('123  Main   St   NW');
    expect(result.street).toBe('123 main street nw');
  });

  it('strips trailing punctuation from unit', () => {
    const result = normalizeAddress('123 Main St, Unit:5,');
    expect(result.unit).toBe('5');
  });
});

describe('addressesMatch', () => {
  it('matches identical addresses', () => {
    expect(addressesMatch('123 Main St NW', '123 Main St NW')).toBe(true);
  });

  it('matches with case differences', () => {
    expect(addressesMatch('123 MAIN ST NW', '123 main st nw')).toBe(true);
  });

  it('matches abbreviated vs expanded', () => {
    expect(addressesMatch('557 Lebaum St SE', '557 Lebaum Street SE')).toBe(true);
  });

  it('matches ignoring unit suffix', () => {
    expect(addressesMatch('557 Lebaum St SE, Unit:103', '557 Lebaum St SE')).toBe(true);
  });

  it('does not match different addresses', () => {
    expect(addressesMatch('123 Main St NW', '456 Oak Ave SE')).toBe(false);
  });

  it('does not match different house numbers', () => {
    expect(addressesMatch('123 Main St NW', '124 Main St NW')).toBe(false);
  });
});

describe('findMatchingProperty', () => {
  const properties = [
    { id: 'prop-1', address: '557 Lebaum Street SE' },
    { id: 'prop-2', address: '123 Main St NW' },
    { id: 'prop-3', address: '456 Oak Ave' },
  ];

  it('finds matching property by normalized address', () => {
    expect(findMatchingProperty('557 LEBAUM ST SE', properties)).toBe('prop-1');
  });

  it('finds match with unit suffix stripped', () => {
    expect(findMatchingProperty('557 LEBAUM ST SE, Unit:103', properties)).toBe('prop-1');
  });

  it('returns null when no match', () => {
    expect(findMatchingProperty('999 Unknown Rd', properties)).toBeNull();
  });

  it('matches case-insensitively', () => {
    expect(findMatchingProperty('123 main street nw', properties)).toBe('prop-2');
  });
});

describe('extractUnitFromAddress', () => {
  it('extracts unit number', () => {
    expect(extractUnitFromAddress('557 LEBAUM ST SE, Unit:103')).toBe('103');
  });

  it('returns null when no unit', () => {
    expect(extractUnitFromAddress('123 Main St NW')).toBeNull();
  });

  it('extracts from # format', () => {
    expect(extractUnitFromAddress('456 Oak Ave #3A')).toBe('3a');
  });
});
