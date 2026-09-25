// The layers outside the brain (PLAN §4.3, §4.4) on the real data, and the world that steps them.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { Muscles } from '../src/sim/muscles.ts';
import { proprioceptiveFields } from '../src/sim/proprio.ts';
import { calibratedParams, World, type LoopParams } from '../src/sim/world.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const at = (name: string): number => data.neurons.findIndex((n) => n.name === name);

// Trial values for exercising the loop; calibration (PLAN §7.3) sets the real ones.
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

describe('the neuromuscular layer', () => {
  const params = { gain: 0.7, threshold: 3, timeConstant: 0.1 };
  const activation = Float64Array.from({ length: data.neurons.length }, (_, i) => 0.05 + ((i * 37) % 11) / 20);

  it("drives each muscle with its inputs' signed section counts times their activation", () => {
    const muscles = new Muscles(data, params, 48);
    muscles.settle(activation);
    data.muscles.forEach((muscle, m) => {
      const expected = data.neuromuscular
        .filter((j) => j.muscle === muscle.name)
        .reduce((sum, j) => sum + j.sections * j.sign * activation[at(j.pre)], 0);
      expect(muscles.drive[m], muscle.name).toBeCloseTo(expected, 12);
      expect(muscles.activation[m]).toBeCloseTo(1 / (1 + Math.exp(-0.7 * (expected - 3))), 12);
    });
    // Cells with no fast effect on muscle drive nothing, however active.
    const silent = data.neuromuscular.filter((j) => j.sign === 0);
    expect(silent.length).toBeGreaterThan(0);
  });

  it('follows its drive with the muscle time constant', () => {
    const muscles = new Muscles(data, params, 48);
    muscles.settle(new Float64Array(data.neurons.length));
    const start = Float64Array.from(muscles.activation);
    muscles.step(0.05, activation);
    const target = new Muscles(data, params, 48);
    target.settle(activation);
    muscles.activation.forEach((a, m) => {
      expect(a).toBeCloseTo(target.activation[m] + (start[m] - target.activation[m]) * Math.exp(-0.5), 12);
    });
  });

  it('gives each body segment the mean of the left and right muscles covering its middle', () => {
    const muscles = new Muscles(data, params, 48);
    muscles.settle(activation);
    const dorsal = new Float64Array(48);
    const ventral = new Float64Array(48);
    muscles.segments(dorsal, ventral);
    const covering = (quadrant: string, m: number): number =>
      data.muscles.findIndex((x) => x.quadrant === quadrant && x.s0 <= (m + 0.5) / 48 && (m + 0.5) / 48 < x.s1);
    for (let m = 0; m < 48; m++) {
      const a = muscles.activation;
      expect(dorsal[m]).toBeCloseTo((a[covering('DL', m)] + a[covering('DR', m)]) / 2, 15);
      expect(ventral[m]).toBeCloseTo((a[covering('VL', m)] + a[covering('VR', m)]) / 2, 15);
    }
    // Two segments per muscle, and the ventral-left quadrant's 23rd cell covers the last four.
    expect(data.muscles[covering('DL', 0)].name).toBe('dBWML1');
    expect(data.muscles[covering('DL', 1)].name).toBe('dBWML1');
    expect([44, 45, 46, 47].map((m) => data.muscles[covering('VL', m)].name)).toEqual(Array(4).fill('vBWML23'));
  });
});

describe('proprioceptive fields', () => {
  const fields = proprioceptiveFields(data, 0.2);
  const field = (name: string) => fields.find((f) => f.neuron === at(name));

  it('lie 0.2 body lengths in front of each B-type neuron and behind each A-type, signed by side', () => {
    // VB1's muscles span 0.25–0.375 of the body; it senses 0.05–0.25, as a ventral neuron.
    expect(field('VB1')).toMatchObject({ side: -1 });
    expect(field('VB1')?.from).toBeCloseTo(0.05, 12);
    expect(field('VB1')?.to).toBeCloseTo(0.25, 12);
    expect(field('DB1')?.side).toBe(1);
    // VA1's muscles span 0.25–0.333; it senses 0.333–0.533 behind them.
    expect(field('VA1')?.from).toBeCloseTo(1 / 3, 3);
    expect(field('VA1')?.to).toBeCloseTo(1 / 3 + 0.2, 3);
    // A-types whose muscles reach the tail have nothing behind to sense.
    expect(field('DA9')).toBeUndefined();
    expect(field('VA12')).toBeUndefined();
    for (const f of fields) expect(f.from >= 0 && f.to <= 1 && f.to > f.from).toBe(true);
  });
});

describe('the world', () => {
  it('needs calibrated parameters to use the registry', () => {
    expect(() => calibratedParams()).toThrow(/not calibrated/);
  });

  it('feeds curvature to the motor neurons with the sign of their side', () => {
    const world = new World(data, TRIAL);
    // Bend the body dorsally all along, then take one step.
    const { body } = world;
    const radius = 0.5e-3;
    for (let i = 0; i < body.rods; i++) {
      const angle = (i * body.params.segmentLength) / radius;
      body.x[i] = radius * Math.sin(angle);
      body.y[i] = radius * (1 - Math.cos(angle));
      body.theta[i] = angle + Math.PI / 2;
    }
    world.step();
    const input = (name: string): number => world.brain.input[at(name)];
    // K = L/r = 2 wherever the field lies; DB neurons are excited, VB neurons inhibited.
    expect(input('DB3')).toBeCloseTo(2 * TRIAL.proprioceptiveGain, 1);
    expect(input('VB3')).toBeCloseTo(-2 * TRIAL.proprioceptiveGain, 1);
    expect(input('DA3')).toBeCloseTo(2 * TRIAL.proprioceptiveGain, 1);
    expect(input('AVBL')).toBe(0);
  });

  it('drives the dorsal and ventral SMDs in antiphase while the network holds them above the threshold', () => {
    const world = new World(data, TRIAL);
    world.step();
    // At rest the SMDs sit at their thresholds, above a drive threshold of −8 mV: the switch is on, driving
    // the dorsal side.
    expect(world.headSwitch.h).toBe(1);
    for (const name of ['SMDDL', 'SMDDR']) expect(world.brain.input[at(name)]).toBe(TRIAL.switchGain / 2);
    for (const name of ['SMDVL', 'SMDVR']) expect(world.brain.input[at(name)]).toBe(-TRIAL.switchGain / 2);
    // With the drive threshold above them, it is off.
    const off = new World(data, { ...TRIAL, driveThreshold: 5 });
    off.step();
    expect(off.brain.input[at('SMDDL')]).toBe(0);
    expect(off.switchCurrent).toBe(0);
  });

  it('puts an oscillator on every A- and B-type neuron, shifted by the drive threshold on the B-types', () => {
    const world = new World(data, TRIAL);
    const osc = world.brain.oscillators;
    if (!osc) throw new Error('no oscillators');
    const shifts = new Map(Array.from(osc.neurons, (i, k) => [data.neurons[i].name, osc.shift[k]]));
    const types = (t: string): string[] => data.neurons.filter((n) => n.oscillator === t).map((n) => n.name);
    expect([...shifts.keys()].sort()).toEqual([...types('A'), ...types('B')].sort());
    for (const name of types('A')) expect(shifts.get(name)).toBe(0);
    for (const name of types('B')) expect(shifts.get(name)).toBe(TRIAL.driveThreshold);
    expect([osc.gain, osc.recovery]).toEqual([TRIAL.oscillatorGain, TRIAL.recoveryTime]);
  });

  it('is fixed by its seed', () => {
    const run = (seed: number): number[] => {
      const world = new World(data, { ...TRIAL, noise: 0.5 }, { seed });
      for (let k = 0; k < 400; k++) world.step();
      return [world.body.x[0], world.brain.voltage[at('AVAL')]];
    };
    expect(run(3)).toEqual(run(3));
    expect(run(3)).not.toEqual(run(4));
  });
});
