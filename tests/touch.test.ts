// Touch on the real data (PLAN §4.2): the receptors, the currents of each set a tap can reach, and the world's
// pulses.

import { describe, expect, it, vi } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { PARAMS } from '../src/science/params.ts';
import { Brain, equilibrium, inputConductance, midpointActivation } from '../src/sim/brain/brain.ts';
import { cookNetwork } from '../src/sim/brain/network.ts';
import { BACK, covered, FRONT, tap, TOUCH_STEPS, touchData } from '../src/sim/touch.ts';
import { World, type LoopParams } from '../src/sim/world.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const at = (name: string): number => data.neurons.findIndex((n) => n.name === name);
const touch = touchData(data);
const names = (s: number): string[] =>
  touch.receptors.filter((r) => covered(touch.receptors, s) & (1 << r.index)).map((r) => r.name);

// Trial values for exercising the loop, as tests/loop.test.ts uses; with the switch's gain at 0 its current
// never jumps, so every restart is touch's.
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
const QUIET = { ...TRIAL, switchGain: 0 };

// The steps, counted by the brain, at which a world's integrator restarts.
function restarts(world: World): number[] {
  const at: number[] = [];
  vi.spyOn(world.brain, 'restart').mockImplementation(() => {
    at.push(world.brain.steps);
    Brain.prototype.restart.call(world.brain);
  });
  return at;
}

describe('the touch receptors', () => {
  it("are the six neurons that sense along their processes, with the morphologies' fields", () => {
    expect(touch.receptors.map((r) => r.name)).toEqual(['ALML', 'ALMR', 'AVM', 'PLML', 'PLMR', 'PVM']);
    touch.receptors.forEach((r, k) => {
      expect(r.index).toBe(k);
      const sensing = data.neurons[r.neuron].sensing;
      expect(sensing.kind === 'field' && [sensing.s0, sensing.s1]).toEqual([r.from, r.to]);
    });
  });

  it('are reached by a tap where their fields cover it, the buttons tapping front and back clear of PVM', () => {
    expect(names(FRONT)).toEqual(['ALML', 'ALMR', 'AVM']);
    expect(names(BACK)).toEqual(['PLML', 'PLMR']);
    expect(names(0.3)).toEqual(['ALML', 'ALMR', 'AVM', 'PVM']);
    expect(names(0.45)).toEqual(['PVM']);
    expect(names(0.02)).toEqual([]);
    expect(tap(touch, 0.02).currents.every((c) => c === 0)).toBe(true);
  });

  it('last 500 ms, 200 steps', () => {
    expect(TOUCH_STEPS).toBe(200);
  });
});

describe('the currents of a tap', () => {
  const network = cookNetwork(data);
  const rest = midpointActivation(network);
  const thresholds = equilibrium(network, rest);

  it('are computed for the seven sets a tap on the body can reach', () => {
    expect(touch.sets.size).toBe(7);
    for (let s = 0; s <= 1; s += 0.001) {
      const mask = covered(touch.receptors, s);
      if (mask !== 0) expect(touch.sets.has(mask), `s = ${s}`).toBe(true);
    }
  });

  it('hold every receptor a tap reaches 10 mV above rest together, on the connectome alone', () => {
    for (const [mask, currents] of touch.sets) {
      const members = touch.receptors.filter((r) => mask & (1 << r.index));
      const brain = new Brain(network, thresholds);
      const before = Float64Array.from(brain.voltage);
      for (let k = 0; k < TOUCH_STEPS; k++) {
        brain.input.fill(0);
        for (const r of members) brain.input[r.neuron] = currents[r.index];
        brain.step(0.0025);
      }
      for (const r of members) {
        expect(currents[r.index], r.name).toBeGreaterThan(0);
        // Within 2% by the pulse's end, the rest of the way the network's own nonlinearity.
        expect(Math.abs(brain.voltage[r.neuron] - before[r.neuron] - 10), `${r.name} in ${mask}`).toBeLessThan(0.2);
      }
      for (const r of touch.receptors) if (!(mask & (1 << r.index))) expect(currents[r.index]).toBe(0);
    }
  });

  it('are, for a receptor reached alone, 10 mV times its input conductance; together, less', () => {
    const avm = touch.receptors[2];
    expect(tap(touch, 0.045).currents[avm.index]).toBeCloseTo(
      PARAMS.touchAmplitude.value * inputConductance(network, rest, avm.neuron),
      9,
    );
    const front = tap(touch, FRONT).currents;
    for (const r of touch.receptors.slice(0, 3)) {
      expect(front[r.index]).toBeLessThan(PARAMS.touchAmplitude.value * inputConductance(network, rest, r.neuron));
    }
  });
});

describe('the world touched', () => {
  it('drives each receptor it reaches with its set current for exactly 200 steps, restarting on and off', () => {
    const world = new World(data, QUIET, { seed: 2 });
    for (let k = 0; k < 40; k++) world.step();
    const restartedAt = restarts(world);
    expect(world.touch(FRONT).map((r) => r.name)).toEqual(['ALML', 'ALMR', 'AVM']);
    const alml = tap(touch, FRONT).currents[0];
    const on: number[] = [];
    for (let k = 1; k <= TOUCH_STEPS + 3; k++) {
      world.step();
      if (world.brain.input[at('ALML')] !== 0) on.push(k);
      if (k <= TOUCH_STEPS) expect(world.brain.input[at('ALML')]).toBe(alml);
    }
    expect(on).toEqual(Array.from({ length: TOUCH_STEPS }, (_, k) => k + 1));
    expect(world.brain.input[at('PLML')]).toBe(0);
    // Restarted before the pulse's first step and before the first step after it.
    expect(restartedAt).toEqual([40, 40 + TOUCH_STEPS]);
  });

  it('restarts a pulse already on, without a jump when the current is the same', () => {
    const world = new World(data, QUIET, { seed: 3 });
    const restartedAt = restarts(world);
    world.touch(BACK);
    const onSteps: number[] = [];
    for (let k = 1; k <= 400; k++) {
      if (k === 151) world.touch(BACK);
      world.step();
      if (world.brain.input[at('PLML')] !== 0) onSteps.push(k);
    }
    // On from step 1 through 150 + 200 = 350, one pulse, restarted only on and off.
    expect(onSteps).toEqual(Array.from({ length: 350 }, (_, k) => k + 1));
    expect(restartedAt).toEqual([0, 350]);
  });

  it("takes a new tap's current while on, restarting at the change", () => {
    const world = new World(data, QUIET, { seed: 3 });
    const restartedAt = restarts(world);
    world.touch(FRONT);
    for (let k = 0; k < 50; k++) world.step();
    // At 0.3, PVM joins ALM and AVM, and all three of theirs change.
    world.touch(0.3);
    world.step();
    const wider = tap(touch, 0.3).currents;
    expect(world.brain.input[at('ALML')]).toBe(wider[0]);
    expect(world.brain.input[at('PVM')]).toBe(wider[5]);
    expect(wider[0]).not.toBe(tap(touch, FRONT).currents[0]);
    for (let k = 0; k < 300; k++) world.step();
    expect(restartedAt).toEqual([0, 50, 50 + TOUCH_STEPS]);
  });

  it("leaves a lesioned receptor out, the others keeping their set's currents; the same for every brain", () => {
    const lesioned = new World(data, TRIAL, { lesions: ['ALML'] });
    expect(lesioned.receptors.map((r) => r.name)).not.toContain('ALML');
    expect(lesioned.touch(FRONT).map((r) => r.name)).toEqual(['ALMR', 'AVM']);
    lesioned.step();
    expect(lesioned.brain.input[at('ALML')]).toBe(0);
    expect(lesioned.brain.input[at('ALMR')]).toBe(tap(touch, FRONT).currents[1]);
    const silenced = new World(data, TRIAL, { silenced: true });
    expect(silenced.receptors).toEqual(touch.receptors);
    expect(silenced.touchSets).toBe(touch);
  });

  it('continues exactly from a snapshot taken mid-pulse, and refuses a state of other receptors', () => {
    const make = (): World => new World(data, { ...TRIAL, noise: 0.05 }, { seed: 7 });
    const original = make();
    for (let k = 0; k < 100; k++) original.step();
    original.touch(0.3);
    for (let k = 0; k < 120; k++) original.step();
    const state = original.snapshot();
    expect(Array.from(state.touchLeft).filter((l) => l > 0)).toEqual([80, 80, 80, 80]);
    const copy = make();
    copy.restore(state);
    expect(copy.snapshot()).toEqual(state);
    for (let k = 0; k < 200; k++) {
      original.step();
      copy.step();
    }
    expect(copy.snapshot()).toEqual(original.snapshot());
    expect(Array.from(copy.touchLeft).every((l) => l === 0)).toBe(true);
    const lesioned = new World(data, TRIAL, { lesions: ['ALML'] });
    const before = lesioned.snapshot();
    expect(() => lesioned.restore(state)).toThrow(/other touch receptors/);
    expect(lesioned.snapshot()).toEqual(before);
  });
});
