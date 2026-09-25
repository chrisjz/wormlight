import { describe, expect, it } from 'vitest';
import { pick, type Projected } from './picking';

const at = (index: number, x: number, y: number, w: number, radius: number): Projected => ({ index, x, y, w, radius });

describe('pick', () => {
  it('takes the neuron whose disc covers the point over a nearer one merely within reach', () => {
    // A small near neuron 5 px away, and a farther one drawn right under the pointer.
    const neurons = [at(0, 105, 100, 2, 3), at(1, 100, 100, 9, 4)];
    expect(pick(neurons, 100, 100, 8)).toBe(1);
  });

  it('takes the nearest to the camera when several discs cover the point', () => {
    const neurons = [at(0, 100, 100, 9, 6), at(1, 102, 100, 4, 6), at(2, 99, 101, 12, 6)];
    expect(pick(neurons, 100, 100, 8)).toBe(1);
  });

  it('falls back to the disc that comes closest, relative to its reach', () => {
    const neurons = [at(0, 110, 100, 5, 2), at(1, 100, 106, 5, 2)];
    expect(pick(neurons, 100, 100, 12)).toBe(1);
    expect(pick(neurons, 100, 100, 4)).toBeNull();
  });

  it('picks nothing on empty ground', () => {
    expect(pick([at(0, 300, 300, 5, 5)], 100, 100, 18)).toBeNull();
    expect(pick([], 0, 0, 18)).toBeNull();
  });
});
