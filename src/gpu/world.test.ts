import { describe, expect, it } from 'vitest';
import { regionMean } from '../sim/proprio.ts';
import { rodRange } from './world.ts';

describe("the GPU loop's rod ranges", () => {
  it('pick the rods regionMean averages, or the nearest one', () => {
    const segments = 48;
    const kappa = Float64Array.from({ length: segments + 1 }, (_, i) => (i === 0 || i === segments ? 0 : Math.sin(i)));
    for (const [from, to] of [
      [0.1, 0.3],
      [0, 0.2],
      [0.8, 1],
      [0.5, 0.5],
      [0.501, 0.505],
      [0.0, 0.01],
    ]) {
      const [first, last] = rodRange(segments, from, to);
      let sum = 0;
      for (let i = first; i <= last; i++) sum += kappa[i];
      expect(sum / (last - first + 1)).toBeCloseTo(regionMean(kappa, from, to), 12);
    }
  });
});
