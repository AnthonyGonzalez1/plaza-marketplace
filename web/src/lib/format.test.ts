import { describe, expect, it } from 'vitest';
import { formatDateTime, formatPrice } from './format';

// Intl separates the symbol and the number with a non-breaking space (U+00A0).
// Replace it with a normal space so the expected values are easy to read.
function formatted(amount: number): string {
  return formatPrice(amount).replaceAll(String.fromCharCode(0xa0), ' ');
}

describe('formatPrice', () => {
  it('formats Colombian pesos with a dot as thousands separator and no decimals', () => {
    expect(formatted(45900)).toBe('$ 45.900');
    expect(formatted(1250000)).toBe('$ 1.250.000');
  });

  it('rounds amounts that have cents', () => {
    expect(formatted(1999.5)).toBe('$ 2.000');
  });

  it('formats zero', () => {
    expect(formatted(0)).toBe('$ 0');
  });
});

describe('formatDateTime', () => {
  // Intl also uses special spaces here (before "p. m."): turn every kind of space into a
  // normal one. The time zone is fixed so the test does not depend on the machine.
  function formattedDate(isoDate: string): string {
    return formatDateTime(isoDate, 'America/Bogota').replace(/\s/g, ' ');
  }

  it('formats a UTC date as a long Spanish date in the given time zone', () => {
    expect(formattedDate('2026-11-16T20:15:00Z')).toBe('16 de noviembre de 2026 a las 3:15 p. m.');
  });

  it('moves to the previous day when the time zone is behind UTC', () => {
    expect(formattedDate('2026-11-17T03:05:00Z')).toBe('16 de noviembre de 2026 a las 10:05 p. m.');
  });
});
