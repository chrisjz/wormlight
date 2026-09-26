import { describe, expect, it } from 'vitest';
import { toHalf } from './half.ts';

// The half's value, decoded.
function fromHalf(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const m = h & 0x3ff;
  if (e === 0) return sign * m * 2 ** -24;
  if (e === 0x1f) return m ? NaN : sign * Infinity;
  return sign * (1 + m / 1024) * 2 ** (e - 15);
}

describe('toHalf', () => {
  it('encodes exact values exactly', () => {
    expect(toHalf(0)).toBe(0);
    expect(toHalf(-0)).toBe(0x8000);
    expect(toHalf(1)).toBe(0x3c00);
    expect(toHalf(-2)).toBe(0xc000);
    expect(toHalf(65504)).toBe(0x7bff);
    expect(toHalf(2 ** -24)).toBe(1);
  });

  it('rounds to the nearest half, ties to even', () => {
    for (const v of [0.1, -3.14159, 1234.5678, 1e-5, -30, 5.5]) {
      const h = fromHalf(toHalf(v));
      expect(Math.abs(h - v)).toBeLessThanOrEqual(Math.abs(v) * 2 ** -11 + 2 ** -25);
    }
    // 1 + 2⁻¹¹ is halfway between 1 and 1 + 2⁻¹⁰: it goes to 1, whose last bit is even.
    expect(toHalf(1 + 2 ** -11)).toBe(0x3c00);
    expect(toHalf(1 + 3 * 2 ** -11)).toBe(0x3c02);
  });

  it('saturates to Infinity, and keeps NaN', () => {
    expect(toHalf(1e6)).toBe(0x7c00);
    expect(toHalf(-1e6)).toBe(0xfc00);
    expect(Number.isNaN(fromHalf(toHalf(NaN)))).toBe(true);
  });
});
