import { describe, expect, it } from 'vitest';
import { gapRows } from './network.ts';
import { ConjugateGradient, apply } from './solver.ts';

// A ring of four neurons with unequal junctions: (diag(d) − G) x = b.
const gap = gapRows(4, [
  [0, 1, 2],
  [1, 2, 0.5],
  [2, 3, 3],
  [3, 0, 1],
]);
const d = Float64Array.from([3.1, 2.6, 3.6, 4.1]);
const expected = Float64Array.from([1, -2, 0.5, 3]);
const b = new Float64Array(4);
apply(d, gap, expected, b);

describe('ConjugateGradient', () => {
  it('solves a small SPD system to its tolerance', () => {
    const x = new Float64Array(4);
    const solve = new ConjugateGradient(4).solve(d, gap, b, x, 1e-12, 64);
    expect(solve.converged).toBe(true);
    // Exact arithmetic would take at most four iterations.
    expect(solve.iterations).toBeLessThanOrEqual(5);
    x.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 10));
  });

  it('takes no iterations from the answer, and returns zero for zero input', () => {
    const x = Float64Array.from(expected);
    expect(new ConjugateGradient(4).solve(d, gap, b, x, 1e-12, 64).iterations).toBe(0);
    const zero = new Float64Array(4);
    expect(new ConjugateGradient(4).solve(d, gap, new Float64Array(4), zero, 1e-12, 64)).toEqual({
      iterations: 0,
      converged: true,
    });
  });

  it('reports a system holding a NaN as unconverged, at once rather than at the cap', () => {
    const x = new Float64Array(4);
    const poisoned = Float64Array.from(b);
    poisoned[2] = NaN;
    expect(new ConjugateGradient(4).solve(d, gap, poisoned, x, 1e-12, 64)).toEqual({ iterations: 0, converged: false });
  });

  it('stops at the cap and says so', () => {
    const x = new Float64Array(4);
    expect(new ConjugateGradient(4).solve(d, gap, b, x, 1e-12, 1)).toEqual({ iterations: 1, converged: false });
  });
});
