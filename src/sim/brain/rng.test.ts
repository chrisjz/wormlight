import { describe, expect, it } from 'vitest';
import { gaussian, hash, pcg, uniform } from './rng.ts';

// Vectors computed independently with Python's arbitrary-precision integers, reduced mod 2³².
describe('pcg', () => {
  it('matches fixed vectors, the edge inputs included', () => {
    expect([0, 1, 2 ** 31, 2 ** 32 - 1].map(pcg)).toEqual([129708002, 2831084092, 566699590, 3861530882]);
  });

  it('nests into a hash of (seed, step, index)', () => {
    expect(hash(0, 0, 0)).toBe(2145236065);
    expect(hash(1, 0, 0)).toBe(594548367);
    expect(hash(0, 1, 0)).toBe(3414907750);
    expect(hash(0, 0, 1)).toBe(3375797271);
    expect(hash(12345, 678, 90)).toBe(853306941);
  });
});

describe('uniform', () => {
  it('stays strictly inside (0, 1) at the edge hashes, on values f32 holds exactly', () => {
    expect(uniform(0)).toBe(2 ** -24);
    expect(uniform(2 ** 32 - 1)).toBe(1 - 2 ** -24);
    for (const h of [0, 1, 511, 512, 2 ** 31, 2 ** 32 - 1]) {
      expect(Math.fround(uniform(h))).toBe(uniform(h));
    }
  });
});

describe('gaussian', () => {
  it('matches fixed vectors', () => {
    expect(gaussian(0, 0, 0)).toBeCloseTo(0.26417941170589976, 14);
    expect(gaussian(7, 3, 5)).toBeCloseTo(-0.4798600311261727, 14);
  });

  it('has zero mean and unit variance', () => {
    let sum = 0;
    let squares = 0;
    const draws = 200_000;
    for (let k = 0; k < draws; k++) {
      const z = gaussian(3, k, k % 302);
      sum += z;
      squares += z * z;
    }
    // Five standard errors: 0.011 for the mean and 0.016 for the variance.
    expect(Math.abs(sum / draws)).toBeLessThan(0.011);
    expect(Math.abs(squares / draws - 1)).toBeLessThan(0.016);
  });
});
