import { describe, expect, it } from 'vitest';
import { Cmaes, defaultLambda, symmetricEigen } from './cmaes.ts';

// Run to a target or a budget of evaluations; return the evaluations used and the best value.
function minimise(f: (x: number[]) => number, n: number, target: number, budget: number, seed = 1) {
  const es = new Cmaes({ mean: new Array<number>(n).fill(0.5), sigma: 0.3, seed });
  let evaluations = 0;
  let best = Infinity;
  while (evaluations < budget && best > target) {
    const values = es.ask().map(f);
    evaluations += values.length;
    best = Math.min(best, ...values);
    es.tell(values);
  }
  return { evaluations, best };
}

describe('CMA-ES', () => {
  it("takes the default population and weights of Hansen's tutorial", () => {
    expect(defaultLambda(8)).toBe(10);
    expect(defaultLambda(11)).toBe(11);
    const es = new Cmaes({ mean: new Array<number>(8).fill(0), sigma: 0.3, seed: 1 });
    expect(es.mu).toBe(5);
    expect(es.weights.reduce((a, w) => a + w, 0)).toBeCloseTo(1, 14);
    expect([...es.weights].sort((a, b) => b - a)).toEqual(es.weights);
    expect(es.muEff).toBeGreaterThan(3);
    expect(es.muEff).toBeLessThan(5);
  });

  it('solves the sphere, and an ellipsoid of condition 10⁶, which needs the covariance to adapt', () => {
    const sphere = (x: number[]): number => x.reduce((s, v) => s + (v - 0.3) ** 2, 0);
    const ellipsoid = (x: number[]): number =>
      x.reduce((s, v, i) => s + 1e6 ** (i / (x.length - 1)) * (v - 0.3) ** 2, 0);
    for (const seed of [1, 2]) {
      expect(minimise(sphere, 8, 1e-10, 2000, seed).best).toBeLessThan(1e-10);
      expect(minimise(ellipsoid, 8, 1e-10, 6000, seed).best).toBeLessThan(1e-10);
    }
  });

  it("follows the curved valley of Rosenbrock's function to its minimum", () => {
    const rosenbrock = (x: number[]): number =>
      x.slice(0, -1).reduce((s, v, i) => s + 100 * (x[i + 1] - v * v) ** 2 + (1 - v) ** 2, 0);
    expect(minimise(rosenbrock, 8, 1e-10, 8000).best).toBeLessThan(1e-10);
  });

  it('replays exactly from its seed, and differs with another', () => {
    const run = (seed: number): number[][] => {
      const es = new Cmaes({ mean: [0.5, 0.5, 0.5], sigma: 0.3, seed });
      const first = es.ask();
      es.tell(first.map((x) => x[0] ** 2 + x[1] ** 2 + x[2] ** 2));
      return [...first, ...es.ask()];
    };
    expect(run(1)).toEqual(run(1));
    expect(run(1)).not.toEqual(run(2));
    expect(() => new Cmaes({ mean: [0, 0], sigma: 1, seed: 1 }).tell([1, 2])).toThrow(/needs/);
  });

  it('ranks an infinite value last', () => {
    const es = new Cmaes({ mean: [0, 0], sigma: 1, seed: 3 });
    const xs = es.ask();
    // Every candidate but the first is infinite: the mean moves towards the first alone.
    const before = [...es.mean];
    es.tell(xs.map((_, k) => (k === 0 ? 0 : Infinity)));
    const toFirst = xs[0].map((v, i) => v - before[i]);
    const moved = es.mean.map((v, i) => v - before[i]);
    expect(Math.sign(moved[0])).toBe(Math.sign(toFirst[0]));
    expect(Math.sign(moved[1])).toBe(Math.sign(toFirst[1]));
  });
});

describe('the symmetric eigendecomposition', () => {
  it('gives A·v = λ·v, with orthonormal vectors', () => {
    const a = [
      [4, 1, 0.5, 0],
      [1, 3, 0.2, 0.1],
      [0.5, 0.2, 2, 0.3],
      [0, 0.1, 0.3, 1],
    ];
    const { values, vectors } = symmetricEigen(a);
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < 4; i++) {
        const av = a[i].reduce((s, aij, j) => s + aij * vectors[j][k], 0);
        expect(av).toBeCloseTo(values[k] * vectors[i][k], 12);
      }
      for (let l = 0; l < 4; l++) {
        const dot = vectors.reduce((s, row) => s + row[k] * row[l], 0);
        expect(dot).toBeCloseTo(k === l ? 1 : 0, 12);
      }
    }
    expect(values.reduce((s, v) => s + v, 0)).toBeCloseTo(10, 12);
  });
});
