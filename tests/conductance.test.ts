// The conductance form of the head switch and proprioception (PLAN §4.3, §7.3; DECISIONS.md, 2026-09-29): push-pull
// conductances towards the model's reversal potentials, bounded by the 1 mV rule, beside the current form the
// refit runs.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { BOUND_RULE_CURVATURE, BOUND_RULE_MV, PARAMS, type Param } from '../src/science/params.ts';
import { Brain, passiveLoads } from '../src/sim/brain/brain.ts';
import { chemicalRows, gapRows, type Network } from '../src/sim/brain/network.ts';
import { NEURAL_STEP } from '../src/sim/numerics.ts';
import {
  CALIBRATED,
  calibratedParams,
  loopParams,
  provisionalParams,
  World,
  type LoopParams,
  type RValues,
  type WorldOptions,
} from '../src/sim/world.ts';
import {
  bounds,
  calibrate,
  fromUnit,
  provisionalValues,
  toUnit,
  type Scorer,
  type Values,
} from '../src/validation/calibration.ts';
import { spanCurvature } from '../src/validation/posture.ts';
import { MEASURE_FROM, MOTION_SAMPLE } from '../src/validation/motion.ts';
import { runTrial, startingWorld } from '../src/validation/trial.ts';
import { ROOT } from '../scripts/data/sources.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const at = (name: string): number => data.neurons.findIndex((n) => n.name === name);
// R's refit, in the current form, from its record: the registry held it until track S's fit replaced it.
const REFIT = loopParams(readJson<{ final: { values: RValues } }>('data/calibration/r2.json').final.values, 'current');
const [E_EXC, E_INH] = [PARAMS.reversalExcitatory.value, PARAMS.reversalInhibitory.value];

// Sums of a world's state after 400 steps in the current form: the voltages and their squares, the activations, the
// rods' x, y and θ, the muscles, h and the switch's current. First made on main at 6c9a857, before the conductance form
// was built, every figure agreeing bit for bit with that branch's; taken again when track S's signs moved into the
// runtime data (DECISIONS.md, 2026-10-02), the refit's recorded values standing in for the registry's, which became S's
// fit's in the conductance form. They guard the current form's path, which no chosen fit now runs.
const BEFORE = {
  registry: [
    -4146.495245456935, 205359.45360806258, 21.119692541757406, 0.023724308370214223, -2.9783901388158354e-5,
    79.30405689251575, 53.57031596845261, 0, -155.87220112175532,
  ],
  provisional: [
    -3630.6410251733923, 242868.62482203104, 23.64340649318537, 0.024430381746192213, 8.066307441535408e-7,
    76.4315000764936, 8.789197648899632, 1, 185.5,
  ],
  trial: [
    -3647.9846044109354, 73398.3125608048, 23.097400435550522, 0.024520962020401337, -1.5252632638457982e-7,
    77.18433490476912, 14.497305168104994, 1, 50,
  ],
  lesioned: [
    -3962.131180144935, 180923.02843635756, 21.48539966571137, 0.023711607095071897, -2.9299212499947897e-5,
    79.29509238116975, 56.581944892230275, 0, -155.87220112175532,
  ],
  silenced: [
    -10349.12032384238, 380175.27068850136, 4.667406508113458, 0.024515272618996022, 2.9675474662526386e-8,
    76.6767316503822, 26.034462365159047, 0, 0,
  ],
};

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
  it('settles a lone neuron where its leak and the conductance balance, past it by at most 3% of the step', () => {
    // Across the box's range and beyond: BDF2's first step after the implicit-Euler start overshoots the steady state
    // by (0.5 − 2/(1 + x))/(1.5 + x) of the step, x = G·dt/C, which peaks at 2.9% near x ≈ 7, about 3 nS here, and
    // falls away on either side: L-stable, not monotone.
    for (const E of [E_EXC, E_INH]) {
      for (const g of [0.02, 0.4, 3, 50, 1000]) {
        const brain = new Brain(lone, Float64Array.of(-35));
        brain.conductance[0] = g;
        brain.conductanceCurrent[0] = g * E;
        const steady = (lone.leak * lone.leakPotential + g * E) / (lone.leak + g);
        let furthest = -Infinity;
        for (let k = 0; k < Math.round(1 / NEURAL_STEP); k++) {
          brain.step(NEURAL_STEP);
          furthest = Math.max(furthest, (brain.voltage[0] - -35) / (steady - -35));
        }
        // Within the solve's relative tolerance.
        expect(brain.voltage[0]).toBeCloseTo(steady, 2);
        expect(furthest, `${g} nS towards ${E} mV`).toBeLessThanOrEqual(1.03);
      }
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

  it('runs the current form as main did before the conductance form, on the registry, lesioned and silenced', () => {
    const trial: LoopParams = {
      ...TRIAL,
      oscillatorGain: 2,
      driveThreshold: -16,
      switchGain: 100,
      proprioceptiveGain: 10,
      noise: 0.01,
    };
    delete trial.form;
    const setups: [keyof typeof BEFORE, LoopParams, WorldOptions][] = [
      ['registry', REFIT, { seed: 1 }],
      ['provisional', provisionalParams('current'), { seed: 2 }],
      ['trial', trial, { seed: 3, switchThreshold: 0.5 }],
      ['lesioned', REFIT, { seed: 4, lesions: ['AVAL', 'AVAR', 'SMDDL'] }],
      ['silenced', REFIT, { seed: 5, silenced: true }],
    ];
    const sum = (a: ArrayLike<number>, f = (x: number): number => x): number =>
      Array.from(a).reduce((t, x) => t + f(x), 0);
    for (const [name, params, options] of setups) {
      const world = new World(data, params, options);
      for (let k = 0; k < 400; k++) world.step();
      const s = world.snapshot();
      const sums = [
        sum(s.brain.voltage),
        sum(s.brain.voltage, (x) => x * x),
        sum(s.brain.activation),
        sum(s.x),
        sum(s.y),
        sum(s.theta),
        sum(s.muscles),
        s.h,
        s.switchCurrent,
      ];
      sums.forEach((x, k) =>
        expect(Math.abs(x - BEFORE[name][k]), `${name} ${k}`).toBeLessThanOrEqual(
          1e-9 * Math.max(1, Math.abs(BEFORE[name][k])),
        ),
      );
      expect(Array.from(world.brain.conductance).every((g) => g === 0)).toBe(true);
    }
  });

  // An 11 s trial and a world stepped through it again: about 5 s on CI's runners, past vitest's default limit.
  it(
    'sums the shunt of each layer over the measured samples, counts the gate, and gives none in the current form',
    {
      timeout: 30000,
    },
    () => {
      const postures = [Array.from({ length: 100 }, (_, k) => 0.6 * Math.sin(2 * Math.PI * ((k + 0.5) / 65)))];
      const options = { seed: 1, seconds: 11, postures };
      const r = runTrial(data, { ...options, params: TRIAL });
      const c = r.conductance;
      if (!c) throw new Error('no shunt in the conductance form');
      expect(c.samples).toBe(r.velocity.length);
      // With the gate open throughout, each sample's switch shunt is the mean of g_sw over each SMD's passive load.
      const world = new World(data, TRIAL);
      const loads = passiveLoads(world.brain.network);
      const smd = [...world.dorsalSwitch, ...world.ventralSwitch];
      const open = smd.reduce((sum, i) => sum + TRIAL.switchGain / loads[i], 0) / smd.length;
      expect(c.gateToggles).toBe(0);
      expect(c.switchShunt).toBeCloseTo(open * c.samples, 10);
      // What paces the crawl, over the same steps (PLAN §7.4, added before round 3 ran): the margin each measured step's
      // gate read, as a world stepped here reads it before each step, and the gate open wherever it is above 0.
      const gate = r.gate;
      if (!gate) throw new Error('no gate record');
      const every = Math.round(MOTION_SAMPLE / NEURAL_STEP);
      const [from, to] = [MEASURE_FROM / MOTION_SAMPLE, MEASURE_FROM / MOTION_SAMPLE + r.velocity.length].map((k) =>
        Math.round(k * every),
      );
      const { world: again } = startingWorld(data, { ...options, params: TRIAL });
      const expected = { steps: 0, open: 0, margin: 0, marginSquares: 0 };
      for (let s = 1; s <= to; s++) {
        const m = again.headDrive() - TRIAL.driveThreshold;
        again.step();
        if (s <= from) continue;
        expected.steps++;
        if (m > 0) expected.open++;
        expected.margin += m;
        expected.marginSquares += m * m;
      }
      // The counts exactly; the sums to rounding, since the trial adds them 0.1 s at a time.
      expect([gate.steps, gate.open]).toEqual([expected.steps, expected.open]);
      expect(gate.margin).toBeCloseTo(expected.margin, 9);
      expect(gate.marginSquares).toBeCloseTo(expected.marginSquares, 9);
      expect(gate.steps).toBe(r.velocity.length * every);
      expect(gate.open).toBe(gate.steps);
      // With the switch off, the gate still reads open: it is the drive's, not the switch's current.
      const off = runTrial(data, { ...options, params: { ...TRIAL, switchGain: 0 } });
      expect(off.gate?.open).toBeGreaterThan(0);
      expect(off.conductance?.switchShunt).toBe(0);
      // The curved start bends the body, so proprioception opens conductances too.
      expect(c.proprioShunt).toBeGreaterThan(0);
      // With the SMDs lesioned, the switch has no targets.
      const without = runTrial(data, { ...options, params: TRIAL, lesions: ['SMDDL', 'SMDDR', 'SMDVL', 'SMDVR'] });
      expect(without.conductance?.switchShunt).toBeNull();
      const current = runTrial(data, { ...options, params: { ...TRIAL, form: 'current' } });
      expect(current.conductance).toBeUndefined();
      expect(current.gate?.steps).toBe(gate.steps);
    },
  );
});

describe("the registry and the calibration's search in the conductance form", () => {
  it("gives g_sw and g_p a conductance entry beside the current form's, counted once", () => {
    for (const id of ['headSwitchGain', 'proprioceptiveGain'] as const) {
      const conductance = (PARAMS[id] as Param).conductance;
      if (!conductance) throw new Error(`${id} has no conductance form`);
      // Track S's fit's, which runs in this form, and the current form's left without a value (DECISIONS.md, 2026-10-02).
      expect(conductance.value).not.toBeNull();
      expect((PARAMS[id] as Param).value).toBeNull();
      const [lo, hi] = conductance.bounds;
      expect(lo).toBeGreaterThan(0);
      // Its start is the bounds' log midpoint, to the figures the rules give.
      expect(conductance.provisional).toBeCloseTo(Math.sqrt(lo * hi), 2);
    }
    expect(bounds('headSwitchGain', 'conductance')).toEqual([0.02, 50]);
    expect(bounds('proprioceptiveGain', 'conductance')).toEqual([0.0001, 8]);
    expect(bounds('headSwitchGain', 'current')).toEqual(PARAMS.headSwitchGain.bounds);
    // Track S's model takes its own bound on g_p in the conductance form, kept beside the registry's, and every other
    // the form's (DECISIONS.md, 2026-10-02).
    expect(bounds('proprioceptiveGain', 'conductance', 'track S')).toEqual([0.0001, 7]);
    expect(bounds('headSwitchGain', 'conductance', 'track S')).toEqual([0.02, 50]);
    expect(bounds('proprioceptiveGain', 'current', 'track S')).toEqual(PARAMS.proprioceptiveGain.bounds);
    for (const id of CALIBRATED.filter((k) => k !== 'proprioceptiveGain')) {
      expect(bounds(id, 'conductance', 'track S'), id).toEqual(bounds(id, 'conductance'));
    }
  });

  it('starts from the log midpoints for the two gains and the provisional values for the rest', () => {
    const values = provisionalValues('conductance');
    expect(values).toEqual({ ...provisionalValues('current'), headSwitchGain: 1, proprioceptiveGain: 0.028 });
    expect(provisionalParams('conductance')).toEqual({
      ...provisionalParams('current'),
      switchGain: 1,
      proprioceptiveGain: 0.028,
      form: 'conductance',
    });
    expect(loopParams(provisionalValues('current'), 'current')).not.toHaveProperty('form');
    // The search maps the conductance form's bounds, both logarithmically.
    const u = toUnit(values, 'conductance', CALIBRATED);
    expect(u[CALIBRATED.indexOf('headSwitchGain')]).toBeCloseTo(0.5, 10);
    const back = fromUnit(u, 'conductance', CALIBRATED);
    for (const id of CALIBRATED) expect(back[id]).toBeCloseTo(values[id], 10);
  });
});

describe("the calibration's search in a form", () => {
  it("maps track S's box onto its own bound, so a point of the survey's hypercube lies where it did in the box", async () => {
    const top = new Array<number>(CALIBRATED.length).fill(1);
    const at = CALIBRATED.indexOf('proprioceptiveGain');
    expect(fromUnit(top, 'conductance', CALIBRATED, undefined, 'track S').proprioceptiveGain).toBe(7);
    expect(fromUnit(top, 'conductance').proprioceptiveGain).toBe(8);
    const values = fromUnit(
      top.map(() => 0.5),
      'conductance',
      CALIBRATED,
      undefined,
      'track S',
    );
    expect(values.proprioceptiveGain).toBeCloseTo(Math.sqrt(0.0001 * 7), 12);
    expect(toUnit(values, 'conductance', CALIBRATED, 'track S')[at]).toBeCloseTo(0.5, 12);
    // A search on track S's model stays within its bound.
    const seen: Values[] = [];
    const scorer: Scorer = (v) => {
      seen.push(v);
      return Promise.resolve({
        value: v.proprioceptiveGain > 6 ? 0 : 1,
        errors: { frequency: 0, wavelength: 0, speed: 0, reversalRate: 0 },
        measures: { finite: true, bouts: 1, frequency: 0.3, wavelength: 0.65, speed: 0.22, reversalRate: 1.8 },
        unconverged: 0,
      });
    };
    await calibrate(scorer, { form: 'conductance', model: 'track S', budget: 60, start: top.map(() => 0.95) });
    expect(Math.max(...seen.map((v) => v.proprioceptiveGain))).toBeLessThanOrEqual(7);
    expect(Math.max(...seen.map((v) => v.proprioceptiveGain))).toBeGreaterThan(6);
  });

  it('searches the conductance form within its bounds, from its start, and refuses a registry that lacks it', async () => {
    const seen: Values[] = [];
    const scorer: Scorer = (values) => {
      seen.push(values);
      return Promise.resolve({
        value: 0,
        errors: { frequency: 0, wavelength: 0, speed: 0, reversalRate: 0 },
        measures: { finite: true, bouts: 1, frequency: 0.3, wavelength: 0.65, speed: 0.22, reversalRate: 1.8 },
        unconverged: 0,
      });
    };
    const fit = await calibrate(scorer, { form: 'conductance', budget: 30 });
    expect(fit.generations[0].mean).toEqual(toUnit(provisionalValues('conductance'), 'conductance'));
    for (const values of seen) {
      expect(values.headSwitchGain).toBeGreaterThanOrEqual(0.02);
      expect(values.headSwitchGain).toBeLessThanOrEqual(50);
      expect(values.proprioceptiveGain).toBeGreaterThanOrEqual(0.0001);
      expect(values.proprioceptiveGain).toBeLessThanOrEqual(8);
    }
    // A stand-in registry without the conductance entries is refused in that form, not read as the current form's.
    const bare = Object.fromEntries(
      Object.entries(PARAMS).map(([id, p]) => [id, { ...(p as Param), conductance: undefined, value: 1 }]),
    );
    expect(() => calibratedParams('conductance', bare)).toThrow(/headSwitchGain has no conductance form/);
    expect(calibratedParams('current', bare).switchGain).toBe(1);
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
      const world = new World(data, loopParams({ ...provisionalValues('current'), gapGainB }, 'current'));
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

  // On the runtime data with track S's signs, which moved into it when S's fit was chosen (DECISIONS.md, 2026-10-02):
  // the rule gave 0.0215–47.9 nS and 0.000168–7.83 on the data before, and every bound rounds as it did.
  it('gives the bounds the registry holds, from the runtime data', () => {
    const [swLo, swHi] = rule((w) => [...w.dorsalSwitch, ...w.ventralSwitch]);
    expect(swLo).toBeCloseTo(0.0217, 4);
    expect(swHi).toBeCloseTo(47.5, 1);
    const [pLo, pHi] = rule((w) => w.fields.map((f) => f.neuron)).map((g) => g / BOUND_RULE_CURVATURE);
    expect(pLo).toBeCloseTo(0.000171, 6);
    expect(pHi).toBeCloseTo(7.7, 2);
    const registered = (id: 'headSwitchGain' | 'proprioceptiveGain'): readonly number[] =>
      (PARAMS[id] as Param).conductance?.bounds ?? [];
    expect([down(swLo), up(swHi)].map((x) => +x.toPrecision(6))).toEqual(registered('headSwitchGain'));
    expect([down(pLo), up(pHi)].map((x) => +x.toPrecision(6))).toEqual(registered('proprioceptiveGain'));
  });

  // The data build, which reads the pinned postures, reports the percentile over the model's fields, and `data:check`
  // keeps that report current.
  it("takes proprioception's curvature at the 95th percentile the data build reports, to one decimal place", () => {
    const report = readFileSync(join(ROOT, 'data/reports/data-build.md'), 'utf8');
    const found =
      /proprioceptive fields, the magnitude of the postures' mean scaled curvature κL has a median of ([0-9]+\.[0-9]+) and a 95th percentile of ([0-9]+\.[0-9]+)/.exec(
        report,
      );
    if (!found) throw new Error("the data build's report gives no curvature over the fields");
    expect(Math.round(Number(found[2]) * 10) / 10).toBe(BOUND_RULE_CURVATURE);
  });

  it("measures a span of a posture by its angle's change over the span", () => {
    // Constant curvature c: the angle grows by c over the body, so every span measures c.
    const c = 6;
    const angles = Array.from({ length: 100 }, (_, k) => c * ((k + 0.5) / 100));
    for (const [from, to] of [
      [0, 0.2],
      [0.4, 0.6],
      [0.8, 1],
    ]) {
      expect(spanCurvature(angles, from, to)).toBeCloseTo(c, 10);
    }
  });
});
