// The conductance form of the head switch and proprioception (PLAN §4.3, §7.3; DECISIONS.md, 2026-09-29): push-pull
// conductances towards the model's reversal potentials, bounded by the 1 mV rule, beside the current form the
// refit runs.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPostures } from '../scripts/harness/pinned.ts';
import { validateWormlightData } from '../src/data/schema.ts';
import { BOUND_RULE_CURVATURE, BOUND_RULE_MV, PARAMS, type Param } from '../src/science/params.ts';
import { Brain, passiveLoads } from '../src/sim/brain/brain.ts';
import { chemicalRows, gapRows, type Network } from '../src/sim/brain/network.ts';
import { NEURAL_STEP } from '../src/sim/numerics.ts';
import { CALIBRATED, loopParams, provisionalParams, World, type LoopParams } from '../src/sim/world.ts';
import { bounds, fromUnit, provisionalValues, toUnit } from '../src/validation/calibration.ts';
import { runTrial } from '../src/validation/trial.ts';
import { ROOT } from '../scripts/data/sources.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const at = (name: string): number => data.neurons.findIndex((n) => n.name === name);
const [E_EXC, E_INH] = [PARAMS.reversalExcitatory.value, PARAMS.reversalInhibitory.value];

// Trial values in the conductance form: the switch on at rest, as loop.test.ts's are.
const TRIAL: LoopParams = {
  oscillatorGain: 1,
  recoveryTime: 1,
  driveThreshold: -8,
  switchGain: 2,
  proprioceptiveGain: 0.05,
  neuromuscularGain: 1,
  neuromuscularThreshold: 5,
  noise: 0,
  form: 'conductance',
};

// A lone neuron in production units (nF, nS, mV, s), resting at its leak potential.
const lone: Network = {
  names: ['N'],
  capacitance: 0.001,
  leak: 0.01,
  leakPotential: -35,
  rise: 1,
  decay: 5,
  slope: 0.125,
  gap: gapRows(1, []),
  chemical: chemicalRows(1, []),
};

describe("a conductance from outside the brain, on the solve's diagonal", () => {
  it('settles a lone neuron where its leak and the conductance balance, and barely takes it past E', () => {
    for (const [g, E] of [
      [0.09, E_EXC],
      [0.09, E_INH],
      [1000, E_EXC],
    ]) {
      const brain = new Brain(lone, Float64Array.of(-35));
      brain.conductance[0] = g;
      brain.conductanceCurrent[0] = g * E;
      let furthest = -Infinity;
      for (let k = 0; k < Math.round(1 / NEURAL_STEP); k++) {
        brain.step(NEURAL_STEP);
        furthest = Math.max(furthest, (brain.voltage[0] - -35) / (E - -35));
      }
      // Within the solve's tolerance.
      expect(brain.voltage[0]).toBeCloseTo((lone.leak * lone.leakPotential + g * E) / (lone.leak + g), 3);
      // Never more than a hair past E, even at a conductance far above C/dt, where BDF2's history overshoots it by
      // micro-volts.
      expect(furthest).toBeLessThanOrEqual(1.001);
    }
  });

  it('gives each neuron its passive load: leak, gap junctions, and synapses at the midpoint activation', () => {
    const pair: Network = {
      ...lone,
      names: ['A', 'B'],
      gap: gapRows(2, [[0, 1, 0.2]]),
      chemical: chemicalRows(2, [[1, 0, 0.3, 0]]),
    };
    const rest = lone.rise / (lone.rise + 2 * lone.decay);
    expect(Array.from(passiveLoads(pair))).toEqual([0.01 + 0.2, 0.01 + 0.2 + 0.3 * rest]);
  });
});

describe('the world in the conductance form', () => {
  it('opens the whole g_sw on each SMD: towards E_exc on the side h names, towards E_inh on the other', () => {
    // Seeds whose switch starts on each side.
    const seeds = [0, 1, 2, 3, 4, 5].map((seed) => new World(data, TRIAL, { seed }));
    for (const h of [0, 1]) {
      const world = seeds.find((w) => w.headSwitch.h === h);
      if (!world) throw new Error(`no seed starts at h = ${h}`);
      world.step();
      expect(world.headSwitch.h).toBe(h);
      const [driven, other] =
        h === 1
          ? [
              ['SMDDL', 'SMDDR'],
              ['SMDVL', 'SMDVR'],
            ]
          : [
              ['SMDVL', 'SMDVR'],
              ['SMDDL', 'SMDDR'],
            ];
      for (const name of [...driven, ...other]) {
        expect(world.brain.conductance[at(name)]).toBe(TRIAL.switchGain);
        expect(world.brain.input[at(name)]).toBe(0);
      }
      for (const name of driven) expect(world.brain.conductanceCurrent[at(name)]).toBe(TRIAL.switchGain * E_EXC);
      for (const name of other) expect(world.brain.conductanceCurrent[at(name)]).toBe(TRIAL.switchGain * E_INH);
      // The record the GPU compares: the conductance, signed by the side, dorsal positive.
      expect(world.switchCurrent).toBe(h === 1 ? TRIAL.switchGain : -TRIAL.switchGain);
    }
    // With its gate shut, no conductance.
    const off = new World(data, { ...TRIAL, driveThreshold: 5 });
    off.step();
    expect(off.brain.conductance[at('SMDDL')]).toBe(0);
    expect(off.switchCurrent).toBe(0);
  });

  it('opens g_p·|K_f| towards E_exc on the side the body bends to, and towards E_inh on the other', () => {
    const world = new World(data, TRIAL);
    // Bend the body dorsally all along, as loop.test.ts does: K = L/r = 2 wherever a field lies.
    const { body } = world;
    const radius = 0.5e-3;
    for (let i = 0; i < body.rods; i++) {
      const angle = (i * body.params.segmentLength) / radius;
      body.x[i] = radius * Math.sin(angle);
      body.y[i] = radius * (1 - Math.cos(angle));
      body.theta[i] = angle + Math.PI / 2;
    }
    world.step();
    const g = 2 * TRIAL.proprioceptiveGain;
    for (const name of ['DB3', 'DA3']) {
      expect(world.brain.conductance[at(name)]).toBeCloseTo(g, 3);
      expect(world.brain.conductanceCurrent[at(name)]).toBeCloseTo(g * E_EXC, 3);
    }
    expect(world.brain.conductance[at('VB3')]).toBeCloseTo(g, 3);
    expect(world.brain.conductanceCurrent[at('VB3')]).toBeCloseTo(g * E_INH, 2);
    for (const name of ['DB3', 'VB3', 'DA3']) expect(world.brain.input[at(name)]).toBe(0);
    expect(world.brain.conductance[at('AVBL')]).toBe(0);
  });

  it('holds the SMDs within the reversal range, even at the upper corner of the box', () => {
    // Track R's model, whose muscles move the body enough for the head to flip at a low P_th.
    const corner: LoopParams = {
      ...TRIAL,
      oscillatorGainB: 1,
      gapGainB: 0.5,
      smdGain: 0.5,
      relativeDrive: true,
      neuromuscularGain: 10,
      neuromuscularThreshold: -0.2,
      switchGain: 50,
      proprioceptiveGain: 8,
      driveThreshold: -3,
    };
    const world = new World(data, corner, { switchThreshold: 0.05 });
    const smd = [...world.dorsalSwitch, ...world.ventralSwitch];
    let [low, high, flips, h] = [Infinity, -Infinity, 0, world.headSwitch.h];
    for (let k = 0; k < Math.round(3 / NEURAL_STEP); k++) {
      world.step();
      if (world.headSwitch.h !== h) [flips, h] = [flips + 1, world.headSwitch.h];
      for (const i of smd)
        [low, high] = [Math.min(low, world.brain.voltage[i]), Math.max(high, world.brain.voltage[i])];
    }
    expect(flips).toBeGreaterThan(0);
    expect(low).toBeGreaterThan(E_INH - 0.5);
    expect(high).toBeLessThan(E_EXC + 0.5);
  });

  it('runs the current form when none is named, bit for bit', () => {
    const current = { ...TRIAL, switchGain: 100, proprioceptiveGain: 10 };
    delete current.form;
    const [a, b] = [new World(data, current), new World(data, { ...current, form: 'current' })];
    for (let k = 0; k < 200; k++) {
      a.step();
      b.step();
    }
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(Array.from(a.brain.conductance).every((g) => g === 0)).toBe(true);
  });

  it('reports the shunt of each layer at every measured sample, and none in the current form', () => {
    const postures = [Array.from({ length: 100 }, (_, k) => 0.6 * Math.sin(2 * Math.PI * ((k + 0.5) / 65)))];
    const r = runTrial(data, { seed: 1, seconds: 11, params: TRIAL, postures });
    expect(r.shunt?.switch).toHaveLength(r.velocity.length);
    expect(r.shunt?.proprioception).toHaveLength(r.velocity.length);
    // The switch's conductance over the SMDs' loads, which lie between 0.86 and 1.15 nS.
    for (const x of r.shunt?.switch ?? []) {
      expect(x === 0 || (x > TRIAL.switchGain / 1.2 && x < TRIAL.switchGain / 0.8)).toBe(true);
    }
    const current = runTrial(data, { seed: 1, seconds: 11, params: { ...TRIAL, form: 'current' }, postures });
    expect(current.shunt).toBeUndefined();
  });
});

describe("the registry and the calibration's search in the conductance form", () => {
  it("gives g_sw and g_p a conductance entry beside the current form's, counted once", () => {
    for (const id of ['headSwitchGain', 'proprioceptiveGain'] as const) {
      const conductance = (PARAMS[id] as Param).conductance;
      if (!conductance) throw new Error(`${id} has no conductance form`);
      expect(conductance.value).toBeNull();
      const [lo, hi] = conductance.bounds;
      expect(lo).toBeGreaterThan(0);
      // Its start is the bounds' log midpoint, to the figures the rules give.
      expect(conductance.provisional).toBeCloseTo(Math.sqrt(lo * hi), 2);
    }
    expect(bounds('headSwitchGain', 'conductance')).toEqual([0.02, 50]);
    expect(bounds('proprioceptiveGain', 'conductance')).toEqual([0.0001, 8]);
    expect(bounds('headSwitchGain')).toEqual(PARAMS.headSwitchGain.bounds);
  });

  it('starts from the log midpoints for the two gains and the provisional values for the rest', () => {
    const values = provisionalValues('conductance');
    expect(values).toEqual({ ...provisionalValues(), headSwitchGain: 1, proprioceptiveGain: 0.028 });
    expect(provisionalParams('conductance')).toEqual({
      ...provisionalParams(),
      switchGain: 1,
      proprioceptiveGain: 0.028,
      form: 'conductance',
    });
    expect(loopParams(provisionalValues())).not.toHaveProperty('form');
    // The search maps the conductance form's bounds, both logarithmically.
    const u = toUnit(values, CALIBRATED, 'conductance');
    expect(u[CALIBRATED.indexOf('headSwitchGain')]).toBeCloseTo(0.5, 10);
    const back = fromUnit(u, CALIBRATED, undefined, 'conductance');
    for (const id of CALIBRATED) expect(back[id]).toBeCloseTo(values[id], 10);
  });
});

// Rounded outward to one significant figure.
const down = (x: number): number => {
  const p = 10 ** Math.floor(Math.log10(x));
  return Math.floor(x / p) * p;
};
const up = (x: number): number => {
  const p = 10 ** Math.floor(Math.log10(x));
  return Math.ceil(x / p) * p;
};

describe("the conductance form's bounds, by PLAN §7.3's 1 mV rule", () => {
  // Over κ_gap,B's bounds, each target's lower bound G / (|E − V_th| − 1) and upper G·(|E − V_th| − 1), E each
  // reversal potential in turn.
  function rule(targets: (world: World) => readonly number[]): [number, number] {
    let [lo, hi] = [Infinity, 0];
    for (const gapGainB of PARAMS.gapGainB.bounds) {
      const world = new World(data, loopParams({ ...provisionalValues(), gapGainB }));
      const loads = passiveLoads(world.brain.network);
      for (const i of targets(world)) {
        for (const E of [E_EXC, E_INH]) {
          const room = Math.abs(E - world.brain.threshold[i]) - BOUND_RULE_MV;
          lo = Math.min(lo, loads[i] / room);
          hi = Math.max(hi, loads[i] * room);
        }
      }
    }
    return [lo, hi];
  }

  it('gives the bounds the registry holds, from the runtime data', () => {
    const [swLo, swHi] = rule((w) => [...w.dorsalSwitch, ...w.ventralSwitch]);
    expect(swLo).toBeCloseTo(0.0215, 4);
    expect(swHi).toBeCloseTo(47.9, 1);
    const [pLo, pHi] = rule((w) => w.fields.map((f) => f.neuron)).map((g) => g / BOUND_RULE_CURVATURE);
    expect(pLo).toBeCloseTo(0.000168, 6);
    expect(pHi).toBeCloseTo(7.83, 2);
    const registered = (id: 'headSwitchGain' | 'proprioceptiveGain'): readonly number[] =>
      (PARAMS[id] as Param).conductance?.bounds ?? [];
    expect([down(swLo), up(swHi)].map((x) => +x.toPrecision(6))).toEqual(registered('headSwitchGain'));
    expect([down(pLo), up(pHi)].map((x) => +x.toPrecision(6))).toEqual(registered('proprioceptiveGain'));
  });

  // The pinned postures are fetched by the data build, not the unit tests; with them cached, the curvature the rule
  // takes is checked too.
  const postures = join(ROOT, 'data/cache/410abb65af193b86d273bdbba670406c088032b9774e5808b02bb138950fb4b1');
  it.skipIf(!existsSync(postures))(
    "takes proprioception's curvature at the 95th percentile of real worms' over the model's fields",
    async () => {
      const angles = await readPostures();
      const n = angles[0].length;
      // Angle k lies at the middle of segment k of n; a field's mean κL is its angle's change over the field.
      const along = (p: number[], s: number): number => {
        const x = s * n - 0.5;
        const k = Math.min(n - 2, Math.max(0, Math.floor(x)));
        return p[k] + (p[k + 1] - p[k]) * (x - k);
      };
      const { fields } = new World(data, provisionalParams());
      const k = angles.flatMap((p) =>
        fields.map((f) => Math.abs((along(p, f.to) - along(p, f.from)) / (f.to - f.from))),
      );
      k.sort((a, b) => a - b);
      expect(k[Math.floor(0.95 * (k.length - 1))]).toBeCloseTo(BOUND_RULE_CURVATURE, 1);
    },
  );
});
