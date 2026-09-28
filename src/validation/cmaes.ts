// CMA-ES, the optimiser of PLAN §7.3's calibration: the (μ/μ_w, λ) evolution strategy with cumulative step-size
// adaptation and rank-one and rank-μ covariance updates, with positive weights only, as Hansen's tutorial
// ("The CMA Evolution Strategy: A Tutorial", arXiv:1604.00772) gives it, with its default settings. Its samples
// come from the counter-based hash the neural noise uses, so a run from a seed replays exactly.

import { gaussian } from '../sim/brain/rng.ts';

export interface CmaesOptions {
  // Where the search starts, and its initial step.
  mean: readonly number[];
  sigma: number;
  seed: number;
  // Candidates per generation; the default is 4 + ⌊3 ln n⌋.
  lambda?: number;
  // Generations drawn before this search began, so that a restart's samples continue the seed's stream rather
  // than repeat its start; 0 for a fresh search.
  drawn?: number;
}

export const defaultLambda = (n: number): number => 4 + Math.floor(3 * Math.log(n));

// The eigenvalues and eigenvectors (as columns) of a small symmetric matrix, by cyclic Jacobi rotations.
export function symmetricEigen(a: readonly (readonly number[])[]): { values: number[]; vectors: number[][] } {
  const n = a.length;
  const m = a.map((row) => [...row]);
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += m[p][q] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(m[p][q]) < 1e-300) continue;
        const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const [mkp, mkq] = [m[k][p], m[k][q]];
          m[k][p] = c * mkp - s * mkq;
          m[k][q] = s * mkp + c * mkq;
        }
        for (let k = 0; k < n; k++) {
          const [mpk, mqk] = [m[p][k], m[q][k]];
          m[p][k] = c * mpk - s * mqk;
          m[q][k] = s * mpk + c * mqk;
        }
        for (let k = 0; k < n; k++) {
          const [vkp, vkq] = [v[k][p], v[k][q]];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: m.map((row, i) => row[i]), vectors: v };
}

export class Cmaes {
  readonly n: number;
  readonly lambda: number;
  readonly mu: number;
  readonly weights: readonly number[];
  readonly muEff: number;
  mean: number[];
  sigma: number;
  generation = 0;
  private readonly seed: number;
  private readonly drawn: number;
  private readonly cs: number;
  private readonly ds: number;
  private readonly cc: number;
  private readonly c1: number;
  private readonly cmu: number;
  private readonly chiN: number;
  private readonly ps: number[];
  private readonly pc: number[];
  private c: number[][];
  // C = B·diag(D²)·Bᵀ, B's columns the eigenvectors.
  private b: number[][];
  private d: number[];
  // The last generation's steps, y = B·D·z, by candidate.
  private steps: number[][] = [];

  constructor(options: CmaesOptions) {
    const n = options.mean.length;
    this.n = n;
    this.lambda = options.lambda ?? defaultLambda(n);
    if (!(this.lambda >= 2)) throw new Error('CMA-ES needs at least 2 candidates a generation');
    this.mu = Math.floor(this.lambda / 2);
    const raw = Array.from({ length: this.mu }, (_, i) => Math.log(this.mu + 0.5) - Math.log(i + 1));
    const sum = raw.reduce((a, w) => a + w, 0);
    this.weights = raw.map((w) => w / sum);
    this.muEff = 1 / this.weights.reduce((a, w) => a + w * w, 0);
    this.mean = [...options.mean];
    this.sigma = options.sigma;
    this.seed = options.seed;
    this.drawn = options.drawn ?? 0;
    const mueff = this.muEff;
    this.cs = (mueff + 2) / (n + mueff + 5);
    this.ds = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + this.cs;
    this.cc = (4 + mueff / n) / (n + 4 + (2 * mueff) / n);
    this.c1 = 2 / ((n + 1.3) ** 2 + mueff);
    this.cmu = Math.min(1 - this.c1, (2 * (mueff - 2 + 1 / mueff)) / ((n + 2) ** 2 + mueff));
    this.chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
    this.ps = new Array<number>(n).fill(0);
    this.pc = new Array<number>(n).fill(0);
    this.c = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    this.b = this.c.map((row) => [...row]);
    this.d = new Array<number>(n).fill(1);
  }

  // This generation's candidates, x = m + σ·B·D·z, z drawn from the seed, the generation (counted from the stream's
  // start) and the candidate.
  ask(): number[][] {
    const { n, b, d } = this;
    this.steps = Array.from({ length: this.lambda }, (_, k) => {
      const z = Array.from({ length: n }, (_, i) => gaussian(this.seed, this.drawn + this.generation, k * n + i));
      return Array.from({ length: n }, (_, i) => {
        let y = 0;
        for (let j = 0; j < n; j++) y += b[i][j] * d[j] * z[j];
        return y;
      });
    });
    return this.steps.map((y) => y.map((yi, i) => this.mean[i] + this.sigma * yi));
  }

  // Update from this generation's objective values, lower being better, in the order ask gave the candidates.
  tell(values: readonly number[]): void {
    const { n, mu, weights, b, d } = this;
    if (values.length !== this.lambda) throw new Error(`tell needs ${this.lambda} values, not ${values.length}`);
    if (this.steps.length !== this.lambda) throw new Error('tell needs a generation from ask first');
    // Infinity ranks last; NaN would rank arbitrarily.
    if (values.some((v) => Number.isNaN(v))) throw new Error('tell needs values that are numbers, not NaN');
    const order = values.map((v, k) => [v, k] as const).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const best = order.slice(0, mu).map(([, k]) => this.steps[k]);
    const yw = Array.from({ length: n }, (_, i) => best.reduce((s, y, r) => s + weights[r] * y[i], 0));
    this.mean = this.mean.map((m, i) => m + this.sigma * yw[i]);
    // C^(−1/2)·y_w = B·D⁻¹·Bᵀ·y_w.
    const bty = Array.from({ length: n }, (_, j) => b.reduce((s, row, i) => s + row[j] * yw[i], 0));
    const invSqrt = Array.from({ length: n }, (_, i) => b[i].reduce((s, bij, j) => s + (bij * bty[j]) / d[j], 0));
    const kappa = Math.sqrt(this.cs * (2 - this.cs) * this.muEff);
    for (let i = 0; i < n; i++) this.ps[i] = (1 - this.cs) * this.ps[i] + kappa * invSqrt[i];
    const psNorm = Math.hypot(...this.ps);
    const hs =
      psNorm / Math.sqrt(1 - (1 - this.cs) ** (2 * (this.generation + 1))) < (1.4 + 2 / (n + 1)) * this.chiN ? 1 : 0;
    const kc = hs * Math.sqrt(this.cc * (2 - this.cc) * this.muEff);
    for (let i = 0; i < n; i++) this.pc[i] = (1 - this.cc) * this.pc[i] + kc * yw[i];
    const deltaH = (1 - hs) * this.cc * (2 - this.cc);
    const keep = 1 - this.c1 - this.cmu + deltaH * this.c1;
    this.c = this.c.map((row, i) =>
      row.map((cij, j) => {
        let rankMu = 0;
        for (let r = 0; r < mu; r++) rankMu += weights[r] * best[r][i] * best[r][j];
        return keep * cij + this.c1 * this.pc[i] * this.pc[j] + this.cmu * rankMu;
      }),
    );
    this.sigma *= Math.exp((this.cs / this.ds) * (psNorm / this.chiN - 1));
    // Enforce symmetry against rounding, then decompose.
    for (let i = 0; i < n; i++)
      for (let j = 0; j < i; j++) this.c[i][j] = this.c[j][i] = (this.c[i][j] + this.c[j][i]) / 2;
    // Every term of the update is positive semi-definite with a positive weight, so C's smallest eigenvalue
    // stays at least (1 − c_1 − c_μ)^g of its first; the absolute stop of the Jacobi sweeps and this check hold
    // over any budget the calibration uses (e.g. 2.8 × 10⁻⁵ after 200 generations in eight dimensions).
    const { values: eig, vectors } = symmetricEigen(this.c);
    const largest = Math.max(...eig);
    if (!(Math.min(...eig) > 1e-14 * largest)) throw new Error('the covariance has become degenerate');
    this.b = vectors;
    this.d = eig.map((e) => Math.sqrt(e));
    this.steps = [];
    this.generation++;
  }
}
