import { describe, expect, it } from 'vitest';
import { PARAMS } from '../science/params.ts';
import { OdourField } from '../sim/env/odour.ts';
import { FAR, RINGS, levels } from './scene.ts';

const K = PARAMS.awcAdaptationScale.value;

describe("the plate's odour texture", () => {
  // A source off the axes, up and to the left, so neither a flip nor a transpose would go unnoticed.
  const field = new OdourField();
  field.addSource({ x: -0.02, y: 0.03, rate: 1e-4 });
  field.steady();
  const level = levels(field);
  const { cells, cell } = field.geometry;
  const index = (x: number, y: number): number =>
    Math.round(y / cell + cells / 2 - 0.5) * cells + Math.round(x / cell + cells / 2 - 0.5);
  const at = (x: number, y: number): number => level[index(x, y)];

  it('holds log₂(C/K) in rows that run up the dish, as the shader reads them', () => {
    expect(at(-0.02, 0.03)).toBeCloseTo(Math.log2(field.concentration[index(-0.02, 0.03)] / K), 5);
    expect(at(-0.02, 0.03)).toBeGreaterThan(at(-0.02, -0.03));
    expect(at(-0.02, 0.03)).toBeGreaterThan(at(0.02, 0.03));
    expect(at(0.03, -0.02)).toBeLessThan(at(-0.02, 0.03));
  });

  it('carries the field a few rings past the wall, and nothing beyond', () => {
    for (let k = 0; k < level.length; k++) {
      expect(Number.isFinite(level[k])).toBe(true);
      if (field.inside[k]) expect(level[k]).toBeGreaterThan(FAR);
    }
    // Just outside the wall, a cell takes its inside neighbours' values; far outside, it holds FAR. Along the
    // diagonal, where the grid reaches farthest past the wall.
    const beyond = (r: number): number => at(r / Math.SQRT2, r / Math.SQRT2);
    expect(beyond(field.geometry.dish + cell)).toBeCloseTo(beyond(field.geometry.dish - cell), 1);
    expect(beyond(field.geometry.dish + (RINGS + 2) * cell)).toBe(FAR);
  });
});
