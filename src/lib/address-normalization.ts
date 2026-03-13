/**
 * Address normalization for matching parsed NOI addresses to existing properties/units.
 *
 * BR-004: Normalized address matching
 * - Lowercase
 * - Strip "Unit:", "Apt:", "Suite:", "#" prefixes
 * - Expand abbreviations (ST→STREET, AVE→AVENUE, etc.)
 * - Collapse whitespace
 * - Strip trailing punctuation
 */

const ABBREVIATIONS: Record<string, string> = {
  'st': 'street',
  'ave': 'avenue',
  'blvd': 'boulevard',
  'dr': 'drive',
  'ln': 'lane',
  'rd': 'road',
  'ct': 'court',
  'pl': 'place',
  'cir': 'circle',
  'ter': 'terrace',
  'pkwy': 'parkway',
  'hwy': 'highway',
  'sq': 'square',
  'ne': 'ne',
  'nw': 'nw',
  'se': 'se',
  'sw': 'sw',
  'n': 'n',
  's': 's',
  'e': 'e',
  'w': 'w',
  'apt': 'apartment',
  'ste': 'suite',
  'fl': 'floor',
};

/**
 * Normalize an address string for exact matching after normalization.
 * Returns { street, unit } where unit may be null.
 */
export function normalizeAddress(raw: string): { street: string; unit: string | null } {
  if (!raw) return { street: '', unit: null };

  let address = raw.trim().toLowerCase();

  // Extract unit from common patterns: "Unit:103", "Apt 2B", "Suite 100", "#3"
  let unit: string | null = null;
  const unitPatterns = [
    /,?\s*unit[:\s]+(\S+)/i,
    /,?\s*apt[.:\s]+(\S+)/i,
    /,?\s*apartment[:\s]+(\S+)/i,
    /,?\s*suite[:\s]+(\S+)/i,
    /,?\s*ste[.:\s]+(\S+)/i,
    /,?\s*#(\S+)/,
  ];

  for (const pattern of unitPatterns) {
    const match = address.match(pattern);
    if (match) {
      unit = match[1].replace(/[.,;]+$/, ''); // strip trailing punctuation
      address = address.replace(pattern, '');
      break;
    }
  }

  // Expand abbreviations (word boundary matching)
  const words = address.split(/\s+/);
  const expanded = words.map((word) => {
    const clean = word.replace(/[.,;]+$/, '');
    const replacement = ABBREVIATIONS[clean];
    if (replacement) {
      return replacement + word.slice(clean.length); // preserve trailing punctuation if any
    }
    return word;
  });

  // Collapse whitespace, strip trailing punctuation, trim
  const street = expanded
    .join(' ')
    .replace(/[.,;]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { street, unit };
}

/**
 * Check if two addresses match after normalization.
 */
export function addressesMatch(a: string, b: string): boolean {
  const normA = normalizeAddress(a);
  const normB = normalizeAddress(b);
  return normA.street === normB.street;
}

/**
 * Find matching property from a list based on normalized address.
 * Returns the property ID if found, null otherwise.
 */
export function findMatchingProperty(
  noAddress: string,
  properties: Array<{ id: string; address: string }>
): string | null {
  const norm = normalizeAddress(noAddress);

  for (const prop of properties) {
    const propNorm = normalizeAddress(prop.address);
    if (norm.street === propNorm.street) {
      return prop.id;
    }
  }

  return null;
}

/**
 * Extract unit number from an infraction address string.
 * Common formats: "557 LEBAUM ST SE, Unit:103", "123 Main St NW Apt 2B"
 */
export function extractUnitFromAddress(address: string): string | null {
  const { unit } = normalizeAddress(address);
  return unit;
}
