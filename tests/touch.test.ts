// Touch on the real data (PLAN §4.2): the receptors, their currents, and the world's pulses.

import { describe, expect, it, vi } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { PARAMS } from '../src/science/params.ts';
import { Brain, equilibrium, inputConductance, midpointActivation } from '../src/sim/brain/brain.ts';
import { cookNetwork } from '../src/sim/brain/network.ts';
import { BACK, FRONT, TOUCH_STEPS, touchReceptors } from '../src/sim/touch.ts';
import { World, type LoopParams } from '../src/sim/world.ts';
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

const names = (world: World, s: number): string[] => {
  const probe = new World(data, TRIAL, { seed: world.brain.seed });
  probe.touch(s);
  return probe.receptors.filter((_, k) => probe.touchLeft[k] > 0).map((r) => r.name);
};

describe('the touch receptors', () => {
  it("are the six neurons that sense along their processes, with the morphologies' fields", () => {
    const receptors = touchReceptors(data);
    expect(receptors.map((r) => r.name)).toEqual(['ALML', 'ALMR', 'AVM', 'PLML', 'PLMR', 'PVM']);
    for (const r of receptors) {
      const sensing = data.neurons[r.neuron].sensing;
      expect(sensing.kind).toBe('field');
      if (sensing.kind === 'field') expect([r.from, r.to]).toEqual([sensing.s0, sensing.s1]);
    }
  });

  it('each take 10 mV times their input conductance in the intact wiring, which holds them 10 mV up', () => {
    const network = cookNetwork(data);
    const rest = midpointActivation(network);
    const thresholds = equilibrium(network, rest);
    for (const r of touchReceptors(data)) {
      expect(r.current).toBeCloseTo(PARAMS.touchAmplitude.value * inputConductance(network, rest, r.neuron), 12);
      // On the connectome alone, the linear estimate holds within 2% by the pulse's end.
      const brain = new Brain(network, thresholds);
      const before = brain.voltage[r.neuron];
      for (let k = 0; k < 50; k++) {
        brain.input.fill(0);
        brain.input[r.neuron] = r.current;
        brain.step(0.01);
      }
      expect(Math.abs(brain.voltage[r.neuron] - before - 10), r.name).toBeLessThan(0.2);
    }
  });

  it('last 500 ms, 200 steps', () => {
    expect(TOUCH_STEPS).toBe(200);
  });
});

describe('the world touched', () => {
  it('stimulates the receptors whose fields cover the tap, and the buttons tap front and back', () => {
    const world = new World(data, TRIAL);
    expect(names(world, FRONT)).toEqual(['ALML', 'ALMR', 'AVM']);
    expect(names(world, BACK)).toEqual(['PLML', 'PLMR']);
    expect(names(world, 0.3)).toEqual(['ALML', 'ALMR', 'AVM', 'PVM']);
    expect(names(world, 0.45)).toEqual(['PVM']);
    expect(names(world, 0.02)).toEqual([]);
    expect(world.touch(FRONT)).toBe(3);
  });

  it('drives each touched receptor with its current for exactly 200 steps, restarting BDF2 on and off', () => {
    // With the switch's gain at 0 its current never jumps, so every restart is touch's.
    const world = new World(data, { ...TRIAL, switchGain: 0 }, { seed: 2 });
    for (let k = 0; k < 40; k++) world.step();
    const restartedAt: number[] = [];
    vi.spyOn(world.brain, 'restart').mockImplementation(function (this: Brain) {
      restartedAt.push(world.brain.steps);
      Brain.prototype.restart.call(world.brain);
    });
    const alm = world.receptors.find((r) => r.name === 'ALML');
    world.touch(FRONT);
    const on: number[] = [];
    for (let k = 1; k <= TOUCH_STEPS + 3; k++) {
      world.step();
      if (world.brain.input[at('ALML')] !== 0) on.push(k);
      if (k <= TOUCH_STEPS) expect(world.brain.input[at('ALML')]).toBe(alm?.current);
    }
    expect(on).toEqual(Array.from({ length: TOUCH_STEPS }, (_, k) => k + 1));
    // The posterior receptors were never touched.
    expect(world.brain.input[at('PLML')]).toBe(0);
    // Restarted before the pulse's first step and before the first step after it.
    expect(restartedAt).toEqual([40, 40 + TOUCH_STEPS]);
  });

  it('restarts a pulse already on, without a jump in between', () => {
    const world = new World(data, { ...TRIAL, switchGain: 0 }, { seed: 3 });
    const restart = vi.spyOn(world.brain, 'restart');
    world.touch(BACK);
    const onSteps: number[] = [];
    for (let k = 1; k <= 400; k++) {
      if (k === 151) world.touch(BACK);
      world.step();
      if (world.brain.input[at('PLML')] !== 0) onSteps.push(k);
    }
    // On from step 1 through 150 + 200 = 350, one pulse.
    expect(onSteps).toEqual(Array.from({ length: 350 }, (_, k) => k + 1));
    // With the switch's current held at 0, the only restarts are the pulse's switching on and off.
    expect(restart).toHaveBeenCalledTimes(2);
  });

  it('leaves a lesioned receptor out, and gives every brain the same currents', () => {
    const lesioned = new World(data, TRIAL, { lesions: ['ALML'] });
    expect(lesioned.receptors.map((r) => r.name)).not.toContain('ALML');
    lesioned.touch(FRONT);
    lesioned.step();
    expect(lesioned.brain.input[at('ALML')]).toBe(0);
    expect(lesioned.brain.input[at('ALMR')]).toBe(touchReceptors(data).find((r) => r.name === 'ALMR')?.current);
    const silenced = new World(data, TRIAL, { silenced: true });
    expect(silenced.receptors).toEqual(touchReceptors(data));
  });

  it('continues exactly from a snapshot taken mid-pulse', () => {
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
  });
});
