import { describe, expect, it } from 'vitest';
import { failures, score } from './checks.ts';

const reference = [Float32Array.of(0, 0), Float32Array.of(2, 0.5)];

describe('score', () => {
  it("divides each neuron's RMS error by its range, or by 1 mV when the range is smaller", () => {
    const scores = score(['A', 'B'], reference, [Float64Array.of(0.01, 0), Float64Array.of(2.01, 0.53)]);
    expect(scores.map((s) => s.neuron)).toEqual(['B', 'A']);
    expect(scores[0].ratio).toBeCloseTo(Math.sqrt(0.03 ** 2 / 2), 12);
    expect(scores[1].ratio).toBeCloseTo(0.01 / 2, 12);
    expect(failures(scores).map((s) => s.neuron)).toEqual(['B']);
  });

  it('fails a neuron whose trajectory is not finite, and ranks it first', () => {
    const scores = score(['A', 'B'], reference, [Float64Array.of(0, NaN), Float64Array.of(2, NaN)]);
    expect(scores[0].neuron).toBe('B');
    expect(failures(scores).map((s) => s.neuron)).toEqual(['B']);
  });
});
