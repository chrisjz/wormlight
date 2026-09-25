import { describe, expect, it } from 'vitest';
import { applyTarget, readParams } from './params';

describe('readParams', () => {
  it('reads nothing from an empty query', () => {
    expect(readParams('')).toEqual({
      neuron: null,
      yaw: null,
      pitch: null,
      distance: null,
      target: {},
      noRender: false,
    });
  });

  it('reads a neuron, the camera in degrees, its target and norender', () => {
    const p = readParams('?neuron=AVAL&yaw=90&pitch=-45&dist=7.5&tx=-3.3&tz=0&norender=1');
    expect(p.neuron).toBe('AVAL');
    expect(p.yaw).toBeCloseTo(Math.PI / 2, 12);
    expect(p.pitch).toBeCloseTo(-Math.PI / 4, 12);
    expect(p.distance).toBe(7.5);
    expect(p.target).toEqual({ 0: -3.3, 2: 0 });
    expect(p.noRender).toBe(true);
  });

  it('ignores values that are not numbers, and distances that are not positive', () => {
    const p = readParams('?yaw=left&pitch=&dist=-2&tx=NaN');
    expect([p.yaw, p.pitch, p.distance]).toEqual([null, null, null]);
    expect(p.target).toEqual({});
  });
});

describe('applyTarget', () => {
  it('replaces only the axes given', () => {
    expect(applyTarget([1, 2, 3], { 1: 9 })).toEqual([1, 9, 3]);
    expect(applyTarget([1, 2, 3], {})).toEqual([1, 2, 3]);
  });
});
