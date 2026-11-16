import { describe, expect, it } from 'vitest';
import { formatPrice } from './format';

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
