// Statistics for the checks: Student's t distribution and Welch's two one-sided tests of equivalence.

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
