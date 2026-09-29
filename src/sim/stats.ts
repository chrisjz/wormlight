// Statistics for the checks: Student's t distribution and Welch's two one-sided tests of equivalence, and for the
// harness, Fisher's exact test, the Wilcoxon signed-rank test and McNemar's exact test, each one-sided, and the exact
// binomial test, two-sided (PLAN §7.1). Checkpoint 0's first run graded by Fisher's test; PLAN §7.1 keeps it for the
// checkpoints' proportions.

// ln Γ(x), by Lanczos's approximation (g = 7, nine coefficients), good to about 15 digits for x > 0.
function logGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let a = c[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

// The regularised incomplete beta function I_x(a, b), by its continued fraction (Lentz's method).
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x > (a + 1) / (a + b + 2)) return 1 - incompleteBeta(1 - x, b, a);
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)) / a;
  const tiny = 1e-300;
  let f = 1;
  let c = 1;
  let d = 0;
  for (let i = 0; i <= 400; i++) {
    const m = Math.floor(i / 2);
    let numerator: number;
    if (i === 0) numerator = 1;
    else if (i % 2 === 0) numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    d = 1 / (Math.abs(d) < tiny ? tiny : d);
    c = 1 + numerator / c;
    if (Math.abs(c) < tiny) c = tiny;
    const cd = c * d;
    f *= cd;
    if (Math.abs(1 - cd) < 1e-15) return front * (f - 1);
  }
  throw new Error('the incomplete beta function did not converge');
}

// P(T ≤ t) for Student's t with ν degrees of freedom.
export function studentCdf(t: number, nu: number): number {
  const tail = 0.5 * incompleteBeta(nu / (nu + t * t), nu / 2, 0.5);
  return t > 0 ? 1 - tail : tail;
}

export interface Equivalence {
  // The difference of means (second minus first), the margin, and the larger of the two one-sided p-values.
  difference: number;
  margin: number;
  p: number;
  equivalent: boolean;
}

const mean = (x: readonly number[]): number => x.reduce((s, v) => s + v, 0) / x.length;
const variance = (x: readonly number[], m: number): number => x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1);
const enough = (...samples: (readonly number[])[]): void => {
  if (samples.some((x) => x.length < 2)) throw new Error('each sample needs at least two values');
};

// Welch's two one-sided tests: are the means of `b` and `a` within ±share × mean(a) of each other, at level α?
export function equivalence(a: readonly number[], b: readonly number[], share: number, alpha = 0.05): Equivalence {
  enough(a, b);
  const ma = mean(a);
  const mb = mean(b);
  const va = variance(a, ma) / a.length;
  const vb = variance(b, mb) / b.length;
  const se = Math.sqrt(va + vb);
  const nu = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  const difference = mb - ma;
  const margin = share * Math.abs(ma);
  // H₀: difference ≤ −margin, and H₀: difference ≥ margin. With no spread, the difference itself decides.
  const p =
    se === 0
      ? Math.abs(difference) < margin
        ? 0
        : 1
      : Math.max(1 - studentCdf((difference + margin) / se, nu), studentCdf((difference - margin) / se, nu));
  return { difference, margin, p, equivalent: p < alpha };
}

export interface SpreadRatio {
  // The variance of `b` over that of `a`, and the two-sided p-value of the F test that they are equal.
  ratio: number;
  p: number;
}

// The F test of two samples' variances.
export function spreadRatio(a: readonly number[], b: readonly number[]): SpreadRatio {
  enough(a, b);
  const ratio = variance(b, mean(b)) / variance(a, mean(a));
  const d1 = b.length - 1;
  const d2 = a.length - 1;
  const below = incompleteBeta((d1 * ratio) / (d1 * ratio + d2), d1 / 2, d2 / 2);
  return { ratio, p: Math.min(1, 2 * Math.min(below, 1 - below)) };
}

// ln k! for k = 0 … n.
function logFactorials(n: number): Float64Array {
  const out = new Float64Array(n + 1);
  for (let k = 2; k <= n; k++) out[k] = out[k - 1] + Math.log(k);
  return out;
}

// Fisher's exact test, one-sided: is the share of successes in the first sample, a of n, greater than in the
// second, b of m? The p-value is the chance, with the margins fixed, of a or more successes in the first.
export function fisherGreater(a: number, n: number, b: number, m: number): number {
  if (![a, n, b, m].every(Number.isInteger) || a < 0 || b < 0 || a > n || b > m) {
    throw new Error(`Fisher's test needs whole counts within their samples, not ${a}/${n} and ${b}/${m}`);
  }
  const total = n + m;
  const successes = a + b;
  const lf = logFactorials(total);
  const choose = (x: number, y: number): number => lf[x] - lf[y] - lf[x - y];
  let p = 0;
  for (let x = a; x <= Math.min(successes, n); x++) {
    p += Math.exp(choose(successes, x) + choose(total - successes, n - x) - choose(total, n));
  }
  return Math.min(1, p);
}

export interface SignedRank {
  // The pairs whose difference isn't zero, the sum of the ranks of the positive differences, and the p-value.
  n: number;
  positive: number;
  p: number;
}

// The Wilcoxon signed-rank test, one-sided: do the differences lean positive? Zero differences are dropped,
// tied magnitudes share their average rank, and the p-value is exact: the chance, with each difference's sign
// equally likely either way, of a positive rank sum at least as large.
export function signedRankGreater(differences: readonly number[]): SignedRank {
  if (!differences.every(Number.isFinite)) throw new Error('the signed-rank test needs finite differences');
  const d = differences.filter((x) => x !== 0).sort((x, y) => Math.abs(x) - Math.abs(y));
  const n = d.length;
  if (n === 0) return { n, positive: 0, p: 1 };
  // Twice each rank, so tied ranks' averages stay whole.
  const twice = new Array<number>(n);
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && Math.abs(d[j + 1]) === Math.abs(d[i])) j++;
    for (let k = i; k <= j; k++) twice[k] = i + j + 2;
    i = j + 1;
  }
  const observed = d.reduce((sum, x, k) => (x > 0 ? sum + twice[k] : sum), 0);
  // The distribution of twice the positive rank sum, built one difference at a time.
  const top = twice.reduce((a, b) => a + b, 0);
  let chance = new Float64Array(top + 1);
  chance[0] = 1;
  for (const r of twice) {
    const next = new Float64Array(top + 1);
    for (let w = 0; w <= top - r; w++) {
      if (chance[w] === 0) continue;
      next[w] += chance[w] / 2;
      next[w + r] += chance[w] / 2;
    }
    chance = next;
  }
  let p = 0;
  for (let w = observed; w <= top; w++) p += chance[w];
  return { n, positive: observed / 2, p: Math.min(1, p) };
}

// McNemar's exact test, one-sided (PLAN §7.1): of the pairs whose two outcomes differ, `b` with the first's alone
// and `c` with the second's alone, is the first's outcome the more common? The p-value is the chance of b or more
// of b + c fair coin tosses; with no such pairs it is 1.
export function mcnemarGreater(b: number, c: number): number {
  if (![b, c].every((x) => Number.isInteger(x) && x >= 0))
    throw new Error(`McNemar's test needs whole counts, not ${b} and ${c}`);
  return binomialUpper(b, b + c);
}

// The exact binomial test at a chance of one half, two-sided: is k of n further from half than chance allows? The
// p-value doubles the upper tail of the larger count, capped at 1; with n = 0 it is 1.
export function binomialTwoSided(k: number, n: number): number {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || k > n) {
    throw new Error(`the binomial test needs a whole count within its trials, not ${k} of ${n}`);
  }
  return n === 0 ? 1 : Math.min(1, 2 * binomialUpper(Math.max(k, n - k), n));
}

// The chance of k or more successes in n fair trials.
function binomialUpper(k: number, n: number): number {
  if (k <= 0) return 1;
  const lf = logFactorials(n);
  let p = 0;
  for (let x = k; x <= n; x++) p += Math.exp(lf[n] - lf[x] - lf[n - x] - n * Math.LN2);
  return Math.min(1, p);
}
