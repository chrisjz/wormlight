// Conjugate gradients for the voltage solve (PLAN §3.4). Every system the neural model solves has the form
// (diag(d) − G) x = b, where G holds the gap-junction conductances and d each neuron's total conductance
// (its gap junctions included), so it is symmetric and, with d above G's row sums, positive definite.

import type { Rows } from './network.ts';

export interface Solve {
  iterations: number;
  // False when the solve stopped at the iteration cap, or met a residual that isn't finite.
  converged: boolean;
}

export class ConjugateGradient {
  readonly n: number;
  private readonly r: Float64Array;
  private readonly z: Float64Array;
  private readonly p: Float64Array;
  private readonly q: Float64Array;

  constructor(n: number) {
    this.n = n;
    this.r = new Float64Array(n);
    this.z = new Float64Array(n);
    this.p = new Float64Array(n);
    this.q = new Float64Array(n);
  }

  // Solve in place, starting from x, with a Jacobi preconditioner. It stops when the recursive residual
  // falls below tolerance·‖b‖, after maxIterations, or as soon as the residual isn't finite, so a NaN or
  // infinity anywhere in the system is reported rather than passed off as converged.
  solve(d: Float64Array, gap: Rows, b: Float64Array, x: Float64Array, tolerance: number, maxIterations: number): Solve {
    const { n, r, z, p, q } = this;
    apply(d, gap, x, q);
    let bb = 0;
    let rr = 0;
    let rz = 0;
    for (let i = 0; i < n; i++) {
      r[i] = b[i] - q[i];
      z[i] = r[i] / d[i];
      p[i] = z[i];
      bb += b[i] * b[i];
      rr += r[i] * r[i];
      rz += r[i] * z[i];
    }
    const target = tolerance * tolerance * bb;
    let iterations = 0;
    while (!(rr <= target)) {
      if (iterations === maxIterations || !Number.isFinite(rr)) return { iterations, converged: false };
      apply(d, gap, p, q);
      let pq = 0;
      for (let i = 0; i < n; i++) pq += p[i] * q[i];
      const alpha = rz / pq;
      rr = 0;
      let next = 0;
      for (let i = 0; i < n; i++) {
        x[i] += alpha * p[i];
        r[i] -= alpha * q[i];
        z[i] = r[i] / d[i];
        rr += r[i] * r[i];
        next += r[i] * z[i];
      }
      const beta = next / rz;
      rz = next;
      for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
      iterations++;
    }
    return { iterations, converged: true };
  }
}

// y = (diag(d) − G) x.
export function apply(d: Float64Array, gap: Rows, x: Float64Array, y: Float64Array): void {
  const { start, index, weight } = gap;
  for (let i = 0; i < d.length; i++) {
    let sum = d[i] * x[i];
    for (let k = start[i]; k < start[i + 1]; k++) sum -= weight[k] * x[index[k]];
    y[i] = sum;
  }
}
