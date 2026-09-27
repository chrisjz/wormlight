// AWC-ON on the real data (PLAN §4.1): its gain by the rule fixed in advance, and the world that feeds it the
// odour at the nose.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { hash } from '../src/sim/brain/rng.ts';
import { SPOT, steadyField } from '../src/sim/env/dish.ts';
import { AWC_GAIN, AWC_RISE, awcGain, type Odour } from '../src/sim/sensing.ts';
import { World, type LoopParams } from '../src/sim/world.ts';
import { appWorld } from '../src/ui/start.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const at = (name: string): number => data.neurons.findIndex((n) => n.name === name);

// Trial values for exercising the loop, as tests/loop.test.ts uses.
const TRIAL: LoopParams = {
  oscillatorGain: 1,
  recoveryTime: 1,
  driveThreshold: -8,
  switchGain: 100,
  proprioceptiveGain: 10,
  neuromuscularGain: 1,
  neuromuscularThreshold: 5,
  noise: 0,
};

// An odour that is the same everywhere and can be changed, and that remembers where it was last read.
class Uniform implements Odour {
  level: number;
  last: [number, number] = [NaN, NaN];
  constructor(level: number) {
    this.level = level;
  }
  sample(x: number, y: number): number {
    this.last = [x, y];
    return this.level;
  }
}

describe("AWC's gain", () => {
  it('is the current that raises each AWC 16 mV on the connectome alone, as pinned', { timeout: 30000 }, () => {
    expect(AWC_RISE).toBe(16);
    for (const side of ['AWCL', 'AWCR'] as const) {
      expect(awcGain(data, side) / AWC_GAIN[side], side).toBeCloseTo(1, 5);
    }
  });
});

describe('the world with odour', () => {
  it('draws AWC-ON from the seed, on a lane of its own, each side about half the time', () => {
    const sides = Array.from({ length: 400 }, (_, seed) => hash(seed, 0, 0xfffffffb) & 1);
    const right = sides.reduce((a: number, b) => a + b, 0);
    expect(right).toBeGreaterThan(160);
    expect(right).toBeLessThan(240);
    // Not the head switch's draw.
    const agree = sides.filter((s, seed) => s === (hash(seed, 0, 0xffffffff) & 1)).length;
    expect(agree).toBeGreaterThan(160);
    expect(agree).toBeLessThan(240);
    for (const seed of [0, 1, 2, 3]) {
      const world = new World(data, TRIAL, { seed });
      expect(world.awcSide).toBe(sides[seed] ? 'AWCR' : 'AWCL');
      expect(world.awcOn).toBe(at(world.awcSide));
      expect(world.awc.gain).toBe(AWC_GAIN[world.awcSide]);
    }
  });

  it('reads the odour at the nose tip, between the first two rods', () => {
    const odour = new Uniform(1);
    const world = new World(data, TRIAL, { odour, heading: 0.7 });
    for (let k = 0; k < 40; k++) world.step();
    // The step reads the odour where the body is before it moves.
    const x = Float64Array.from(world.body.x);
    const y = Float64Array.from(world.body.y);
    world.step();
    expect(world.body.x[0]).not.toBe(x[0]);
    const f = 0.0001 * world.body.params.segments;
    expect(odour.last[0]).toBeCloseTo(x[0] + f * (x[1] - x[0]), 15);
    expect(odour.last[1]).toBeCloseTo(y[0] + f * (y[1] - y[0]), 15);
  });

  it('starts adapted to the odour at the nose, and feeds AWC-ON alone', () => {
    const field = steadyField('assay');
    const world = new World(data, TRIAL, { odour: field, seed: 2, heading: 0 });
    const [nx, ny] = world.body.at(world.nose);
    const c = field.sample(nx, ny);
    expect(c).toBeGreaterThan(0.5);
    expect(world.awc.threshold).toBe(world.awc.settled(c));
    const off = at(world.awcSide === 'AWCL' ? 'AWCR' : 'AWCL');
    for (let k = 0; k < 40; k++) {
      world.step();
      expect(world.brain.input[world.awcOn]).toBe(world.awcCurrent);
      expect(world.brain.input[off]).toBe(0);
    }
    // Adapted, the threshold sits below the concentration, so AWC-ON is held down.
    expect(world.awcCurrent).toBeLessThan(0);
  });

  it('drives AWC-ON with exactly g_AWC when the odour is taken away', () => {
    const odour = new Uniform(3);
    const world = new World(data, TRIAL, { odour, seed: 1 });
    world.step();
    odour.level = 0;
    world.step();
    expect(world.awcCurrent).toBe(world.awc.gain);
    expect(world.brain.input[world.awcOn]).toBe(world.awc.gain);
  });

  it('smells nothing without odour, so AWC-ON takes no current', () => {
    const world = new World(data, TRIAL, { seed: 4 });
    for (let k = 0; k < 40; k++) {
      world.step();
      expect(world.awcCurrent).toBe(0);
      expect(world.brain.input[world.awcOn]).toBe(0);
    }
    expect(world.awc.threshold).toBe(0);
  });

  it('gives a lesioned AWC-ON no current', () => {
    const probe = new World(data, TRIAL, { seed: 3 });
    const world = new World(data, TRIAL, { seed: 3, lesions: [probe.awcSide], odour: new Uniform(2) });
    expect(world.awcOn).toBe(-1);
    for (let k = 0; k < 10; k++) {
      world.step();
      expect(world.brain.input[at(probe.awcSide)]).toBe(0);
    }
  });

  it('continues exactly from a snapshot, the threshold included', () => {
    const field = steadyField('assay');
    const make = (): World => new World(data, { ...TRIAL, noise: 0.05 }, { seed: 5, odour: field, heading: 0 });
    const original = make();
    // Nearer the spot, so the threshold moves.
    for (let i = 0; i < original.body.rods; i++) original.body.x[i] += SPOT[0] - 0.012;
    for (let k = 0; k < 400; k++) original.step();
    const state = original.snapshot();
    expect(state.awcThreshold).toBe(original.awc.threshold);
    const copy = make();
    copy.restore(state);
    expect(copy.snapshot()).toEqual(state);
    for (let k = 0; k < 200; k++) {
      original.step();
      copy.step();
    }
    expect(copy.snapshot()).toEqual(original.snapshot());
  });
});

describe("the app's world", () => {
  it('adapts to the odour where it lies after moving to the centre', () => {
    const field = steadyField('lawn');
    const world = appWorld(data, 9, field);
    const [nx, ny] = world.body.at(world.nose);
    expect(Math.hypot(nx, ny)).toBeLessThan(1e-3);
    expect(world.awc.threshold).toBe(world.awc.settled(field.sample(nx, ny)));
  });
});
