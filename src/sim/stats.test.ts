import { describe, expect, it } from 'vitest';
import { equivalence, incompleteBeta, studentCdf } from './stats.ts';

describe("Student's t", () => {
  it('matches the tables', () => {
    // Two-sided 5% critical values: 2.086 at 20 degrees of freedom, 2.228 at 10, 1.960 in the limit.
    expect(studentCdf(2.086, 20)).toBeCloseTo(0.975, 4);
    expect(studentCdf(2.228, 10)).toBeCloseTo(0.975, 4);
    expect(studentCdf(1.96, 1e7)).toBeCloseTo(0.975, 4);
    expect(studentCdf(-2.086, 20)).toBeCloseTo(0.025, 4);
    expect(studentCdf(0, 5)).toBe(0.5);
  });

  it('rests on an incomplete beta function with known values', () => {
    expect(incompleteBeta(0.3, 1, 1)).toBeCloseTo(0.3, 12);
    expect(incompleteBeta(0.5, 4, 4)).toBeCloseTo(0.5, 12);
    // I_x(a, 1) = xᵃ.
    expect(incompleteBeta(0.7, 3, 1)).toBeCloseTo(0.343, 12);
  });
});

describe("Welch's two one-sided tests", () => {
  const around = (m: number, spread: number): number[] =>
    Array.from({ length: 20 }, (_, i) => m + spread * Math.sin(i));

  it('finds two tight samples with the same mean equivalent', () => {
    expect(equivalence(around(1, 0.01), around(1, 0.01), 0.05).equivalent).toBe(true);
  });

  it('refuses a difference past the margin, or too much spread to tell', () => {
    expect(equivalence(around(1, 0.01), around(1.1, 0.01), 0.05).equivalent).toBe(false);
    expect(equivalence(around(1, 0.5), around(1, 0.5), 0.05).equivalent).toBe(false);
  });
});
