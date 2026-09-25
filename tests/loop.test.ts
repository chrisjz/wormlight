// The layers outside the brain (PLAN §4.3, §4.4) on the real data, and the world that steps them.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { PARAMS } from '../src/science/params.ts';
import { Body, boyleBody } from '../src/sim/body/body.ts';
import { Brain, equilibrium, midpointActivation } from '../src/sim/brain/brain.ts';
import { cookNetwork, lesion } from '../src/sim/brain/network.ts';
import { hash } from '../src/sim/brain/rng.ts';
import { Muscles } from '../src/sim/muscles.ts';
import { NEURAL_STEP } from '../src/sim/numerics.ts';
import { curvature, HeadSwitch, proprioceptiveFields, regionMean } from '../src/sim/proprio.ts';
import { calibratedParams, loopParams, World, type LoopParams } from '../src/sim/world.ts';
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

describe('the neuromuscular layer without some neurons', () => {
  it('leaves out the junctions of excluded neurons', () => {
    const params = { gain: 1, threshold: 0, timeConstant: 0.1 };
    const muscles = new Muscles(data, params, 48, new Set(['DB3']));
    const activation = new Float64Array(data.neurons.length).fill(0.1);
    muscles.settle(activation);
    const before = Float64Array.from(muscles.drive);
    activation[at('DB3')] = 0.9;
    muscles.settle(activation);
    expect(muscles.drive).toEqual(before);
    expect(data.neuromuscular.some((j) => j.pre === 'DB3' && j.sign !== 0)).toBe(true);
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

  it('span the same number of rods for every neuron not cut short by the head', () => {
    // Muscle edges are snapped to the 24-slot grid, so rounding in the data file can't change a field.
    const rods = (from: number, to: number): number => {
      let count = 0;
      for (let i = 1; i < 48; i++) if (i / 48 >= from - 1e-9 && i / 48 <= to + 1e-9) count++;
      return count;
    };
    const full = fields.filter((f) => f.to - f.from > 0.2 - 1e-9);
    expect(full.length).toBe(34);
    for (const f of full) expect(rods(f.from, f.to)).toBe(10);
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

  it("matches its layers composed by hand in the plan's order, restarts included", () => {
    const seed = 5;
    const world = new World(data, TRIAL, { seed });
    // The same layers, built and stepped here.
    const intact = cookNetwork(data);
    const thresholds = equilibrium(intact, midpointActivation(intact));
    const brain = new Brain(intact, thresholds);
    brain.seed = seed;
    const oscillating = data.neurons.flatMap((n, i) => (n.oscillator === 'A' || n.oscillator === 'B' ? [i] : []));
    brain.setOscillators({
      neurons: Int32Array.from(oscillating),
      shift: Float64Array.from(oscillating, (i) => (data.neurons[i].oscillator === 'B' ? TRIAL.driveThreshold : 0)),
      gain: TRIAL.oscillatorGain,
      recovery: TRIAL.recoveryTime,
    });
    const body = new Body(boyleBody());
    body.straighten(0, 0, Math.PI);
    const muscles = new Muscles(
      data,
      { gain: TRIAL.neuromuscularGain, threshold: TRIAL.neuromuscularThreshold, timeConstant: 0.1 },
      48,
    );
    muscles.settle(brain.activation);
    const fields = proprioceptiveFields(data, 0.2);
    const sw = new HeadSwitch(0.046, 2.33, hash(seed, 0, 0xffffffff) & 1);
    const smdD = ['SMDDL', 'SMDDR'].map(at);
    const smdV = ['SMDVL', 'SMDVR'].map(at);
    const smd = new Set([...smdD, ...smdV]);
    const drive = (): number => {
      let sum = 0;
      for (const i of smd) {
        let g = intact.leak;
        let current = intact.leak * intact.leakPotential;
        for (let k = intact.gap.start[i]; k < intact.gap.start[i + 1]; k++) {
          const j = intact.gap.index[k];
          g += intact.gap.weight[k];
          current += intact.gap.weight[k] * (smd.has(j) ? thresholds[j] : brain.voltage[j]);
        }
        for (let k = intact.chemical.start[i]; k < intact.chemical.start[i + 1]; k++) {
          const j = intact.chemical.index[k];
          const c = intact.chemical.weight[k] * (smd.has(j) ? 1 / 11 : brain.activation[j]);
          g += c;
          current += c * intact.chemical.reversal[k];
        }
        sum += current / g - thresholds[i];
      }
      return sum / smd.size;
    };
    // Both start with the head bent dorsally, which flips the switch and exercises the restarts.
    for (const b of [world.body, body]) {
      const radius = 0.4e-3;
      for (let i = 0; i < b.rods; i++) {
        const angle = (i * b.params.segmentLength) / radius;
        b.x[i] = radius * Math.sin(angle);
        b.y[i] = radius * (1 - Math.cos(angle));
        b.theta[i] = angle + Math.PI / 2;
      }
    }
    const k = new Float64Array(body.rods);
    let current = 0;
    let restarts = 0;
    let changes = 0;
    const restart = world.brain.restart.bind(world.brain);
    world.brain.restart = () => {
      restarts++;
      restart();
    };
    for (let n = 0; n < 600; n++) {
      const before = world.switchCurrent;
      world.step();
      if (world.switchCurrent !== before) changes++;
      curvature(body, k);
      brain.input.fill(0);
      for (const f of fields) brain.input[f.neuron] += TRIAL.proprioceptiveGain * f.side * regionMean(k, f.from, f.to);
      const gated = drive() > TRIAL.driveThreshold;
      sw.update(regionMean(k, 0.1, 0.3), NEURAL_STEP, gated);
      const next = gated ? TRIAL.switchGain * (sw.h - 0.5) : 0;
      if (next !== current) brain.restart();
      current = next;
      for (const i of smdD) brain.input[i] += current;
      for (const i of smdV) brain.input[i] -= current;
      brain.step(NEURAL_STEP);
      muscles.step(NEURAL_STEP, brain.activation);
      muscles.segments(body.dorsal, body.ventral);
      body.step(NEURAL_STEP);
    }
    expect(world.brain.voltage).toEqual(brain.voltage);
    expect(world.body.midline()).toEqual(body.midline());
    expect(changes).toBeGreaterThan(0);
    expect(restarts).toBe(changes);
    expect(world.brain.unconverged).toBe(0);
  });

  it('flips the switch from the curvature of the head, not the tail', () => {
    // Bend only one stretch of the body, dorsally, at K = 2.5.
    const bent = (from: number, to: number): World => {
      const world = new World(data, TRIAL);
      world.headSwitch.h = 1;
      const b = world.body;
      const radius = 0.4e-3;
      let angle = 0;
      for (let i = 1; i < b.rods; i++) {
        const s = i / 48;
        if (s > from && s <= to + 1e-9) angle += b.params.segmentLength / radius;
        b.x[i] = b.x[i - 1] + b.params.segmentLength * Math.cos(angle);
        b.y[i] = b.y[i - 1] + b.params.segmentLength * Math.sin(angle);
      }
      world.step();
      return world;
    };
    const head = bent(0, 0.4);
    expect(head.headSwitch.h).toBe(0);
    expect(head.brain.input[at('SMDDL')]).toBe(-TRIAL.switchGain / 2);
    expect(head.brain.input[at('SMDVL')]).toBe(TRIAL.switchGain / 2);
    expect(bent(0.6, 1).headSwitch.h).toBe(1);
  });

  it("gates the switch on the network's drive on the SMDs, not on their own voltages", () => {
    const world = new World(data, TRIAL);
    // At rest the network holds every SMD exactly at its threshold.
    expect(Math.abs(world.headDrive())).toBeLessThan(1e-9);
    // Their own voltages, which the switch's current moves, don't enter.
    for (const name of ['SMDDL', 'SMDDR', 'SMDVL', 'SMDVR']) world.brain.voltage[at(name)] += 50;
    expect(Math.abs(world.headDrive())).toBeLessThan(1e-9);
    // In the silenced network only the leak holds them, at E_c, far below their intact thresholds.
    const intact = cookNetwork(data);
    const thresholds = equilibrium(intact, midpointActivation(intact));
    const quiet = new World(data, TRIAL, { silenced: true });
    expect(quiet.brain.threshold).toEqual(thresholds);
    const expected =
      ['SMDDL', 'SMDDR', 'SMDVL', 'SMDVR'].reduce((sum, name) => sum + intact.leakPotential - thresholds[at(name)], 0) /
      4;
    expect(expected).toBeLessThan(-20);
    expect(quiet.headDrive()).toBeCloseTo(expected, 9);
    // It keeps its muscles and oscillators.
    expect(quiet.brain.oscillators?.neurons.length).toBe(39);
    expect(quiet.muscles.drive.some((u) => u !== 0)).toBe(true);
  });

  it('removes a lesioned neuron from every layer and keeps the intact thresholds', () => {
    const intact = cookNetwork(data);
    const thresholds = equilibrium(intact, midpointActivation(intact));
    const cut = ['DB3', 'VB4', 'SMDDL'];
    const world = new World(data, TRIAL, { lesions: cut });
    expect(world.brain.threshold).toEqual(thresholds);
    const osc = world.brain.oscillators;
    if (!osc) throw new Error('no oscillators');
    for (const name of cut) {
      const i = at(name);
      expect(Array.from(osc.neurons)).not.toContain(i);
      expect(world.fields.some((f) => f.neuron === i)).toBe(false);
      const { gap, chemical } = world.brain.network;
      expect(gap.start[i + 1] - gap.start[i]).toBe(0);
      expect(chemical.start[i + 1] - chemical.start[i]).toBe(0);
    }
    // Their muscles no longer feel them.
    world.muscles.settle(world.brain.activation);
    const before = Float64Array.from(world.muscles.drive);
    world.muscles.settle(
      Float64Array.from(world.brain.activation, (s, i) => (cut.includes(data.neurons[i].name) ? 1 : s)),
    );
    expect(world.muscles.drive).toEqual(before);
    world.step();
    expect(world.brain.input[at('SMDDL')]).toBe(0);
  });

  it('gives a rewired brain its own thresholds', () => {
    const other = lesion(cookNetwork(data), ['AVBL']);
    const world = new World(data, TRIAL, { network: other });
    expect(world.brain.threshold).toEqual(equilibrium(other, midpointActivation(other)));
  });

  it("maps the registry's units onto the loop's", () => {
    expect(
      loopParams({
        oscillatorExcitability: 1500,
        oscillatorRecoveryTime: 2,
        oscillatorDriveThreshold: -6,
        headSwitchGain: 40,
        proprioceptiveGain: 7,
        neuromuscularGain: 0.3,
        neuromuscularThreshold: 4,
        noiseIntensity: 0.01,
      }),
    ).toEqual({
      oscillatorGain: 1.5,
      recoveryTime: 2,
      driveThreshold: -6,
      switchGain: 40,
      proprioceptiveGain: 7,
      neuromuscularGain: 0.3,
      neuromuscularThreshold: 4,
      noise: 0.01,
    });
    // The registry's units are the ones loopParams assumes.
    expect([PARAMS.oscillatorExcitability.unit, PARAMS.headSwitchGain.unit, PARAMS.proprioceptiveGain.unit]).toEqual([
      'pS',
      'pA',
      'pA',
    ]);
  });

  it('switches only while gated on, compares the drive with θ_osc itself, and times dK/dt by the step', () => {
    // A dorsal head bend past P_th, with the gate shut by a drive threshold above the rest drive of 0: no
    // flip, and no current.
    const shut = new World(data, { ...TRIAL, driveThreshold: 5 });
    shut.headSwitch.h = 1;
    const b = shut.body;
    for (let i = 0; i < b.rods; i++) {
      const angle = (i * b.params.segmentLength) / 0.4e-3;
      b.x[i] = 0.4e-3 * Math.sin(angle);
      b.y[i] = 0.4e-3 * (1 - Math.cos(angle));
    }
    shut.step();
    expect(shut.headSwitch.h).toBe(1);
    expect(shut.switchCurrent).toBe(0);
    // The silenced network's drive, about −28 mV, opens a gate at −40 mV and not one at −20.
    expect(new World(data, { ...TRIAL, driveThreshold: -40 }, { silenced: true }).headDrive()).toBeGreaterThan(-40);
    const open = new World(data, { ...TRIAL, driveThreshold: -40 }, { silenced: true });
    open.step();
    expect(open.switchCurrent).not.toBe(0);
    const closed = new World(data, { ...TRIAL, driveThreshold: -20 }, { silenced: true });
    closed.step();
    expect(closed.switchCurrent).toBe(0);
    // A head bend of K = 2 short of P_th, reached in one step from 1.5, flips on the derivative (P ≈ 11).
    const rising = new World(data, TRIAL);
    rising.headSwitch.h = 1;
    const lay = (k: number): void => {
      const body = rising.body;
      const radius = 1e-3 / k;
      for (let i = 0; i < body.rods; i++) {
        const angle = (i * body.params.segmentLength) / radius;
        body.x[i] = radius * Math.sin(angle);
        body.y[i] = radius * (1 - Math.cos(angle));
        body.theta[i] = angle + Math.PI / 2;
      }
    };
    lay(1.5);
    rising.step();
    expect(rising.headSwitch.h).toBe(1);
    lay(2);
    rising.step();
    expect(rising.headSwitch.h).toBe(0);
  });

  it('lays the body out towards its heading, and wires the noise', () => {
    const world = new World(data, TRIAL, { heading: 0 });
    const m = world.body.midline();
    expect([m[0], m[1]]).toEqual([0, 0]);
    expect(m[96]).toBeCloseTo(-1e-3, 12);
    expect(new World(data, { ...TRIAL, noise: 0.3 }).brain.noise).toBe(0.3);
    expect(new World(data, TRIAL, { seed: 7 }).brain.seed).toBe(7);
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
