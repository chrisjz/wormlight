import { describe, expect, it } from 'vitest';
import { PITCH_LIMIT } from '../render/camera';
import { applyTarget, readParams, readPlateParams } from './params';

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

  it("keeps pitch within the camera's limit, and draws unless norender is 1", () => {
    expect(readParams('?pitch=90').pitch).toBeCloseTo(PITCH_LIMIT, 12);
    expect(readParams('?pitch=-120').pitch).toBeCloseTo(-PITCH_LIMIT, 12);
    expect(readParams('?norender=0').noRender).toBe(false);
    expect(readParams('?norender').noRender).toBe(false);
    expect(readParams('?neuron=%20').neuron).toBeNull();
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

describe('readPlateParams', () => {
  it('starts split, running, with a random seed and the default field of view', () => {
    expect(readPlateParams('')).toEqual({
      layout: 'split',
      seed: null,
      time: 0,
      paused: false,
      speed: 1,
      span: null,
      centre: null,
      stats: false,
    });
  });

  it('reads a layout, a seed, a start time, a pause, a field of view in millimetres and the stats', () => {
    expect(readPlateParams('?view=plate&seed=42&t=12.5&paused=1&speed=10&span=110&cx=45&cy=-2&stats=1')).toEqual({
      layout: 'plate',
      seed: 42,
      time: 12.5,
      paused: true,
      speed: 10,
      span: 0.11,
      centre: [0.045, -0.002],
      stats: true,
    });
    expect(readPlateParams('?cx=45').centre).toEqual([0.045, 0]);
    expect(readPlateParams('?view=graph').layout).toBe('graph');
  });

  it('ignores what it cannot use', () => {
    expect(readPlateParams('?view=both&seed=-3&t=abc&speed=0&span=0')).toEqual({
      layout: 'split',
      seed: null,
      time: 0,
      paused: false,
      speed: 1,
      span: null,
      centre: null,
      stats: false,
    });
    expect(readPlateParams('?seed=4294967296').seed).toBeNull();
    expect(readPlateParams('?seed=1e3').seed).toBeNull();
    expect(readPlateParams('?t=100000').time).toBe(600);
    for (const t of ['0x10', '1e2', '-5', ' ']) expect(readPlateParams(`?t=${t}`).time).toBe(0);
    expect(readPlateParams('?speed=1000').speed).toBe(100);
  });
});
