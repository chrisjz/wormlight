import { describe, expect, it } from 'vitest';
import {
  binomialTwoSided,
  equivalence,
  fisherGreater,
  fisherTwoSided,
  incompleteBeta,
  mannWhitneyTwoSided,
  mcnemarGreater,
  normalUpper,
  signedRankGreater,
  spreadRatio,
  studentCdf,
} from './stats.ts';

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

describe('the F test of two spreads', () => {
  it('finds equal spreads unremarkable and a doubled one remarkable', () => {
    const wave = (scale: number): number[] => Array.from({ length: 60 }, (_, i) => scale * Math.sin(i * 1.7));
    const same = spreadRatio(wave(1), wave(1));
    expect(same.ratio).toBeCloseTo(1, 12);
    expect(same.p).toBeCloseTo(1, 6);
    const doubled = spreadRatio(wave(1), wave(Math.SQRT2));
    expect(doubled.ratio).toBeCloseTo(2, 12);
    // F(59, 59) at 2: a two-sided p near 0.009.
    expect(doubled.p).toBeGreaterThan(0.005);
    expect(doubled.p).toBeLessThan(0.02);
  });

  it('refuses samples too small to have a spread', () => {
    expect(() => spreadRatio([1], [1, 2])).toThrow(/two values/);
    expect(() => equivalence([1, 2], [3], 0.05)).toThrow(/two values/);
  });
});

// Reference p-values from SciPy 1.18.1: stats.fisher_exact([[a, n − a], [b, m − b]], alternative='greater') and
// stats.wilcoxon(x, alternative='greater', method='exact').
describe("Fisher's exact test, one-sided", () => {
  it("matches SciPy's", () => {
    expect(fisherGreater(12, 50, 3, 50)).toBeCloseTo(0.011302193440961757, 12);
    expect(fisherGreater(20, 50, 20, 50)).toBeCloseTo(0.5807916780398517, 12);
    expect(fisherGreater(5, 10, 0, 10)).toBeCloseTo(0.016253869969040248, 12);
    expect(fisherGreater(3, 7, 9, 12)).toBeCloseTo(0.9708065412399778, 12);
  });

  it('finds nothing in no successes, and refuses counts outside their samples', () => {
    expect(fisherGreater(0, 50, 0, 50)).toBe(1);
    expect(() => fisherGreater(51, 50, 0, 50)).toThrow(/whole counts/);
    expect(() => fisherGreater(1.5, 50, 0, 50)).toThrow(/whole counts/);
  });
});

describe('the Wilcoxon signed-rank test, one-sided', () => {
  it("matches SciPy's exact p-values", () => {
    const x = Array.from({ length: 30 }, (_, i) => 0.8 * Math.sin(1.3 * i) + 0.25);
    const y = Array.from({ length: 50 }, (_, i) => Math.sin(2.1 * (i + 1)) * (1 + 0.01 * (i + 1)));
    const z = Array.from({ length: 40 }, (_, i) => 0.3 * Math.cos(0.7 * (i + 1)) + 0.12);
    for (const [d, positive, p] of [
      [x, 336, 0.016360449604690075],
      [y, 611, 0.6019345038182218],
      [z, 625, 0.0016006615369406063],
    ] as const) {
      const r = signedRankGreater(d);
      expect(r.n).toBe(d.length);
      expect(r.positive).toBe(positive);
      expect(r.p).toBeCloseTo(p, 12);
    }
  });

  it('drops zeros and ranks ties by their average, exactly as every sign flip counts them', () => {
    const d = [0, 0.5, -0.5, 0.5, 1.25, -2, 0, 3, 0.5, -1.25, 4];
    const r = signedRankGreater(d);
    const kept = d.filter((v) => v !== 0);
    const rank = (v: number): number => {
      const below = kept.filter((u) => Math.abs(u) < Math.abs(v)).length;
      const equal = kept.filter((u) => Math.abs(u) === Math.abs(v)).length;
      return below + (equal + 1) / 2;
    };
    const ranks = kept.map(rank);
    const sum = (signs: number): number => ranks.reduce((s, q, k) => (signs & (1 << k) ? s + q : s), 0);
    const observed = kept.reduce((s, v, k) => (v > 0 ? s + ranks[k] : s), 0);
    let atLeast = 0;
    for (let signs = 0; signs < 1 << kept.length; signs++) if (sum(signs) >= observed) atLeast++;
    expect(r.n).toBe(9);
    expect(r.positive).toBe(observed);
    expect(r.p).toBeCloseTo(atLeast / 2 ** kept.length, 14);
  });

  it('finds nothing in differences that are all zero', () => {
    expect(signedRankGreater([0, 0, 0])).toEqual({ n: 0, positive: 0, p: 1 });
    expect(() => signedRankGreater([1, Number.NaN])).toThrow(/finite/);
  });
});

// The exact binomial tails at one half, by hand: P(X ≥ k) for X ~ Binomial(n, ½) is the sum of C(n, x) / 2ⁿ over x ≥ k.
describe("McNemar's exact test, one-sided", () => {
  it('is the upper binomial tail of the discordant pairs at one half', () => {
    expect(mcnemarGreater(0, 0)).toBe(1);
    expect(mcnemarGreater(5, 0)).toBeCloseTo(1 / 32, 12);
    // P(X ≥ 3 | n = 6) = (20 + 15 + 6 + 1) / 64.
    expect(mcnemarGreater(3, 3)).toBeCloseTo(42 / 64, 12);
    expect(mcnemarGreater(0, 4)).toBe(1);
    expect(mcnemarGreater(50, 0)).toBeCloseTo(2 ** -50, 25);
    expect(() => mcnemarGreater(-1, 2)).toThrow(/whole counts/);
    expect(() => mcnemarGreater(1.5, 2)).toThrow(/whole counts/);
  });
});

describe('the exact binomial test at one half, two-sided', () => {
  it('doubles the larger count’s upper tail, capped at 1', () => {
    expect(binomialTwoSided(0, 0)).toBe(1);
    // Five arrivals can't fail at α = 0.05: all five at one spot gives 2 / 32.
    expect(binomialTwoSided(5, 5)).toBeCloseTo(0.0625, 12);
    expect(binomialTwoSided(0, 5)).toBeCloseTo(0.0625, 12);
    expect(binomialTwoSided(6, 6)).toBeCloseTo(2 / 64, 12);
    // P(X ≥ 9 | n = 10) = 11 / 1024, doubled.
    expect(binomialTwoSided(9, 10)).toBeCloseTo(22 / 1024, 12);
    expect(binomialTwoSided(3, 6)).toBe(1);
    expect(() => binomialTwoSided(4, 3)).toThrow(/within its trials/);
  });
});

describe("the normal tail, and Mann–Whitney's and Fisher's two-sided tests (checkpoint 5)", () => {
  it('gives the standard normal upper tail to about 10⁻⁷', () => {
    expect(normalUpper(0)).toBeCloseTo(0.5, 7);
    expect(normalUpper(1.959963985)).toBeCloseTo(0.025, 7);
    expect(normalUpper(-1)).toBeCloseTo(0.8413447461, 7);
    expect(normalUpper(3)).toBeCloseTo(0.001349898, 8);
  });

  it("gives Mann–Whitney's U and its tie-corrected normal p, two-sided, without continuity correction", () => {
    // Fully separated samples of five: U = 0, against a mean of 12.5 and a variance of 25 · 11 / 12, so z = −2.6112 and
    // p = 0.009023.
    const separate = mannWhitneyTwoSided([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
    expect(separate.u).toBe(0);
    expect(separate.p).toBeCloseTo(0.0090234, 6);
    expect(separate.z).toBeLessThan(0);
    // Ties share their mean rank: [0, 0, 0, 1] against [0, 1, 1, 1], four zeros at rank 2.5 and four ones at 6.5, so
    // U = 4 against a mean of 8; the two ties of four cut the variance to (16 / 12)(9 − 120 / 56) = 9.1429, so
    // z = −1.3229 and p = 0.18588.
    const tied = mannWhitneyTwoSided([0, 0, 0, 1], [0, 1, 1, 1]);
    expect(tied.u).toBe(4);
    expect(tied.z).toBeCloseTo(-4 / Math.sqrt((16 / 12) * (9 - 120 / 56)), 12);
    expect(tied.p).toBeCloseTo(0.18588, 5);
    // Every value tied: nothing to rank apart.
    expect(mannWhitneyTwoSided([0, 0, 0], [0, 0])).toEqual({ u: 3, z: 0, p: 1 });
    expect(() => mannWhitneyTwoSided([], [1])).toThrow(/values in both/);
  });

  it("gives Fisher's two-sided p, summing every table no more probable than the observed one", () => {
    // 3 of 10 against 7 of 10: twice the one-sided tail, 0.178895, since the margins are symmetric.
    expect(fisherTwoSided(3, 10, 7, 10)).toBeCloseTo(2 * fisherGreater(7, 10, 3, 10), 12);
    expect(fisherTwoSided(3, 10, 7, 10)).toBeCloseTo(0.178895, 6);
    expect(fisherTwoSided(7, 10, 3, 10)).toBeCloseTo(0.178895, 6);
    // 0 of 50 against 10 of 50: the two extreme tables, each C(90, 50) / C(100, 50) = Π (50 − i) / (100 − i) over
    // i < 10, 0.00059342, every other table more probable.
    const extreme = Array.from({ length: 10 }, (_, i) => (50 - i) / (100 - i)).reduce((a, b) => a * b, 1);
    expect(fisherTwoSided(0, 50, 10, 50)).toBeCloseTo(2 * extreme, 12);
    expect(fisherTwoSided(5, 50, 5, 50)).toBeCloseTo(1, 12);
    expect(fisherTwoSided(0, 50, 0, 50)).toBe(1);
    expect(() => fisherTwoSided(6, 5, 0, 5)).toThrow(/whole counts/);
  });
});
