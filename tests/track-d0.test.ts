// Track D0 (DECISIONS.md, 2026-10-03): the general eigensolver and the linear response, the twelve classes and their
// 118 pairs, the gains, the box, the hypercube, and the Jacobian held to the CPU reference's own step.

import { describe, expect, it } from 'vitest';
import { readings } from '../scripts/experiments/d0/run.ts';
import { registryValues } from '../scripts/harness/wiring.ts';
import { validateWormlightData } from '../src/data/schema.ts';
import { cookNetwork } from '../src/sim/brain/network.ts';
import { partsOf } from '../src/sim/trackS.ts';
import { loopParams, World } from '../src/sim/world.ts';
import { eigenvalues, eigenvector, linearResponse, luFactor, luSolve } from '../src/validation/linear.ts';
import {
  analyse,
  classOf,
  classPairs,
  fromUnit,
  gainedNetwork,
  hypercubePoint,
  hypercubeRanks,
  linearise,
  PARAMETERS,
  readModes,
  sampleWorld,
  type Sample,
} from '../src/validation/trackD0.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const pairs = classPairs(data);
const fit = { ...registryValues(), headSwitchGain: 0 };
const ones = new Float64Array(pairs.length).fill(1);

describe('the general eigensolver and the linear response', () => {
  it("finds a rotation with decay and a companion matrix's roots", () => {
    const e = eigenvalues(Float64Array.of(-1, 2, 0, -2, -1, 0, 0, 0, -3), 3);
    const pairsOf = [...e.re]
      .map((r, k) => [+r.toFixed(9), +Math.abs(e.im[k]).toFixed(9)])
      .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    expect(pairsOf).toEqual([
      [-3, 0],
      [-1, 2],
      [-1, 2],
    ]);
    // (x − 1)(x − 2)…(x − 6) as a companion matrix.
    let c = [1];
    for (const r of [1, 2, 3, 4, 5, 6]) {
      const next = new Array<number>(c.length + 1).fill(0);
      c.forEach((v, i) => {
        next[i] += v;
        next[i + 1] -= r * v;
      });
      c = next;
    }
    const n = 6;
    const m = new Float64Array(n * n);
    for (let j = 0; j < n; j++) m[j] = -c[j + 1];
    for (let i = 1; i < n; i++) m[i * n + i - 1] = 1;
    const roots = eigenvalues(m, n);
    expect([...roots.re].map((x) => +x.toFixed(8)).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps a random matrix's trace, and gives an eigenvector that satisfies A v = λ v", () => {
    let seed = 7;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647 - 0.5;
    };
    const n = 80;
    const a = Float64Array.from({ length: n * n }, random);
    const { re, im } = eigenvalues(a, n);
    let trace = 0;
    for (let i = 0; i < n; i++) trace += a[i * n + i];
    expect(re.reduce((s, x) => s + x, 0)).toBeCloseTo(trace, 9);
    const k = [...im].findIndex((x) => x > 0.2);
    const lambda = { re: re[k], im: im[k] };
    const v = eigenvector(a, n, lambda);
    for (let i = 0; i < n; i++) {
      let sr = 0;
      let si = 0;
      for (let j = 0; j < n; j++) {
        sr += a[i * n + j] * v.re[j];
        si += a[i * n + j] * v.im[j];
      }
      expect(sr).toBeCloseTo(lambda.re * v.re[i] - lambda.im * v.im[i], 10);
      expect(si).toBeCloseTo(lambda.re * v.im[i] + lambda.im * v.re[i], 10);
    }
  });

  it('solves a system that needs pivoting', () => {
    let seed = 3;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647 - 0.5;
    };
    const n = 40;
    const a = Float64Array.from({ length: n * n }, random);
    const x = Float64Array.from({ length: n }, random);
    const b = Float64Array.from({ length: n }, (_, i) => {
      let sum = 0;
      for (let j = 0; j < n; j++) sum += a[i * n + j] * x[j];
      return sum;
    });
    const lu = Float64Array.from(a);
    const piv = luFactor(lu, n);
    expect([...piv].some((p, k) => p !== k)).toBe(true);
    luSolve(lu, piv, n, b);
    b.forEach((v, i) => expect(v).toBeCloseTo(x[i], 10));
  });

  it("gives ẋ = −2x + 1's x(0.5), (1 − e⁻¹)/2", () => {
    expect(linearResponse(Float64Array.of(-2), 1, Float64Array.of(1), 0.5, 0.0005)[0]).toBeCloseTo(
      (1 - Math.exp(-1)) / 2,
      7,
    );
  });
});

describe("D0's classes, pairs, gains and box", () => {
  it("has twelve classes, the touch receptors among them, and 118 pairs, 21 of them the touch classes'", () => {
    expect(data.neurons.filter((n) => classOf(n.name)).length).toBe(84);
    expect([
      classOf('ALML'),
      classOf('AVM'),
      classOf('PVM'),
      classOf('DB3'),
      classOf('SMDVL'),
      classOf('ASHL'),
    ]).toEqual(['front', 'front', 'back', 'B', 'SMD', null]);
    expect(pairs.filter((p) => p.kind === 'chemical')).toHaveLength(77);
    expect(pairs.filter((p) => p.kind === 'gap')).toHaveLength(41);
    expect(pairs.filter((p) => /front|back/.test(p.key))).toHaveLength(21);
    expect(pairs.find((p) => p.key === 'front→PVC')?.sections).toBe(52);
  });

  it('multiplies only its pair, and changes nothing at every gain 1', () => {
    const network = cookNetwork(data);
    expect(gainedNetwork(network, pairs, ones)).toEqual(network);
    const k = pairs.findIndex((p) => p.key === 'B→D');
    const gains = Float64Array.from(ones);
    gains[k] = 2;
    const gained = gainedNetwork(network, pairs, gains);
    const names = network.names;
    for (let i = 0; i < names.length; i++) {
      for (let e = network.chemical.start[i]; e < network.chemical.start[i + 1]; e++) {
        const bToD = classOf(names[network.chemical.index[e]]) === 'B' && classOf(names[i]) === 'D';
        expect(gained.chemical.weight[e]).toBe(network.chemical.weight[e] * (bToD ? 2 : 1));
      }
    }
    expect(gained.gap.weight).toEqual(network.gap.weight);
  });

  it("maps the box's centre to every gain 1, S's box for the four, and the head switch off", () => {
    const { values, gains } = fromUnit(Array(PARAMETERS.length + pairs.length).fill(0.5) as number[], fit);
    expect([...gains].every((g) => Math.abs(g - 1) < 1e-12)).toBe(true);
    expect(values.headSwitchGain).toBe(0);
    expect(values.oscillatorExcitabilityB).toBe(2500);
    const low = fromUnit(Array(PARAMETERS.length + pairs.length).fill(0) as number[], fit);
    expect(low.gains[0]).toBeCloseTo(0.1, 12);
  });

  it('draws a Latin hypercube: each coordinate puts one point in each stratum', () => {
    const count = 40;
    const ranks = hypercubeRanks(count, 5);
    const points = Array.from({ length: count }, (_, j) => hypercubePoint(j, count, ranks));
    for (let k = 0; k < 5; k++) {
      const strata = points.map((p) => Math.floor(p[k] * count)).sort((a, b) => a - b);
      expect(strata).toEqual(Array.from({ length: count }, (_, i) => i));
    }
  });
});

describe("D0's linearisation, held to the CPU reference", () => {
  // The rate the reference's own step gives from a state, by one implicit Euler step of 10⁻⁷ s.
  function rate(world: World, V: Float64Array, s: Float64Array, w?: Float64Array) {
    const brain = world.brain;
    brain.noise = 0;
    brain.setState(V, s, 0, w);
    const dt = 1e-7;
    brain.step(dt);
    return {
      dV: Float64Array.from(brain.voltage, (v, i) => (v - V[i]) / dt),
      ds: Float64Array.from(brain.activation, (a, i) => (a - s[i]) / dt),
    };
  }

  // The reference's world, its solver held tight enough to resolve a step of 10⁻⁷ s.
  const tight = (): World =>
    new World(
      data,
      { ...loopParams(fit, 'conductance'), ...partsOf('track S') },
      { network: gainedNetwork(cookNetwork(data), pairs, ones), solver: { tolerance: 1e-14 } },
    );

  it('matches the reference step to first order with the oscillators off, about the rest', { timeout: 60000 }, () => {
    const world = tight();
    world.brain.setOscillators(null);
    const lin = linearise(world, false);
    if (!lin) throw new Error('no linearisation');
    const { n, size, J } = lin;
    const V0 = Float64Array.from(lin.voltage);
    const s0 = Float64Array.from(world.brain.restActivations());
    const delta = Float64Array.from({ length: n }, (_, i) => 1e-4 * Math.sin(i + 1));
    const at0 = rate(world, V0, s0);
    const at1 = rate(
      world,
      Float64Array.from(V0, (v, i) => v + delta[i]),
      s0,
    );
    for (const i of [0, 40, 77, 150, 290]) {
      let predicted = 0;
      for (let j = 0; j < n; j++) predicted += J[i * size + j] * delta[j];
      expect(at1.dV[i] - at0.dV[i]).toBeCloseTo(predicted, 4);
      const ds = J[(n + i) * size + i] * delta[i];
      expect(at1.ds[i] - at0.ds[i]).toBeCloseTo(ds, 6);
    }
    // And the synapses' terms: the activations perturbed, the voltages at rest.
    const sigma = Float64Array.from({ length: n }, (_, i) => 1e-5 * Math.cos(i + 1));
    const at2 = rate(
      world,
      V0,
      Float64Array.from(s0, (v, i) => v + sigma[i]),
    );
    for (const i of [0, 40, 77, 150, 290]) {
      let predicted = 0;
      for (let j = 0; j < n; j++) predicted += J[i * size + n + j] * sigma[j];
      expect(at2.dV[i] - at0.dV[i]).toBeCloseTo(predicted, 3);
    }
  });

  it('finds a fixed point the reference stays at with the oscillators on', { timeout: 60000 }, () => {
    const world = tight();
    const lin = linearise(world, true);
    if (!lin) throw new Error('no fixed point');
    const brain = world.brain;
    const osc = brain.oscillators;
    if (!osc) throw new Error('no oscillators');
    const v0 = 1 / (2 * brain.network.slope);
    const s = Float64Array.from(lin.voltage, (v, i) => {
      const f = 1 / (1 + Math.exp(-brain.network.slope * (v - brain.threshold[i])));
      return (brain.network.rise * f) / (brain.network.rise * f + brain.network.decay);
    });
    const w = Float64Array.from(
      osc.neurons,
      (i, k) => ((lin.voltage[i] - brain.threshold[i] - osc.shift[k]) / v0 + 0.7) / 0.8,
    );
    const { dV, ds } = rate(world, lin.voltage, s, w);
    expect(Math.max(...dV.map(Math.abs))).toBeLessThan(1e-3);
    expect(Math.max(...ds.map(Math.abs))).toBeLessThan(1e-6);
  });

  it(
    "matches the reference step at the fixed point with the oscillators on, their terms and the rectifier's included",
    { timeout: 60000 },
    () => {
      const world = tight();
      const lin = linearise(world, true);
      if (!lin) throw new Error('no fixed point');
      const { n, size, J } = lin;
      const brain = world.brain;
      const osc = brain.oscillators;
      if (!osc) throw new Error('no oscillators');
      const v0 = 1 / (2 * brain.network.slope);
      const s0 = Float64Array.from(lin.voltage, (v, i) => {
        const f = 1 / (1 + Math.exp(-brain.network.slope * (v - brain.threshold[i])));
        return (brain.network.rise * f) / (brain.network.rise * f + brain.network.decay);
      });
      const w0 = Float64Array.from(
        osc.neurons,
        (i, k) => ((lin.voltage[i] - brain.threshold[i] - osc.shift[k]) / v0 + 0.7) / 0.8,
      );
      const delta = Float64Array.from({ length: n }, (_, i) => 1e-4 * Math.sin(3 * i + 1));
      const omega = Float64Array.from(w0, (_, k) => 1e-5 * Math.cos(k + 1));
      const step = (V: Float64Array, w: Float64Array) => {
        brain.noise = 0;
        brain.setState(V, s0, 0, w);
        const dt = 1e-7;
        brain.step(dt);
        return {
          dV: Float64Array.from(brain.voltage, (v, i) => (v - V[i]) / dt),
          dw: Float64Array.from(brain.recovery, (r, k) => (r - w[k]) / dt),
        };
      };
      const at0 = step(Float64Array.from(lin.voltage), Float64Array.from(w0));
      const at1 = step(
        Float64Array.from(lin.voltage, (v, i) => v + delta[i]),
        Float64Array.from(w0, (v, k) => v + omega[k]),
      );
      const names = brain.network.names;
      // The A-types, AVA, and an A-type's oscillator.
      for (const name of ['DA3', 'VA5', 'AVAL', 'AVAR']) {
        const i = names.indexOf(name);
        let predicted = 0;
        for (let j = 0; j < n; j++) predicted += J[i * size + j] * delta[j];
        for (let k = 0; k < osc.neurons.length; k++) predicted += J[i * size + 2 * n + k] * omega[k];
        expect(at1.dV[i] - at0.dV[i]).toBeCloseTo(predicted, 3);
      }
      for (const k of [0, 5, 12]) {
        const i = osc.neurons[k];
        const predicted = J[(2 * n + k) * size + i] * delta[i] + J[(2 * n + k) * size + 2 * n + k] * omega[k];
        expect(at1.dw[k] - at0.dw[k]).toBeCloseTo(predicted, 6);
      }
    },
  );

  it(
    "reads S's fit as stable, with no live mode in the band, and a touch reaching AVA by under 0.4 mV",
    { timeout: 60000 },
    () => {
      const reference = sampleWorld(data, fit, ones, pairs);
      const s = analyse(data, fit, ones, pairs, reference);
      expect(s.failed).toBeUndefined();
      expect(s.off?.stable).toBe(true);
      expect(s.off?.live).toEqual([]);
      expect(s.on?.live).toEqual([]);
      expect(s.touch?.front.receptors.ALML).toBeCloseTo(10.45, 1);
      expect(s.touch?.front.command.AVAL).toBeGreaterThan(0.3);
      expect(s.touch?.front.command.AVAL).toBeLessThan(0.4);
      expect(readModes(reference, linearise(reference, false)!, data).objective).toBeLessThan(0);
    },
  );
});

describe("D0's readings", () => {
  const sample = (front: number, body: boolean): Sample => ({
    off: {
      stable: true,
      maxGrowth: -1,
      band: [],
      live: body ? [{ frequency: 0.3, margin: 0.1, growth: -0.1, body: true, participation: 9 }] : [],
      inPassBand: 0,
      objective: body ? 0.1 : -2,
    },
    touch: {
      front: {
        command: { AVAL: front, AVAR: front, AVDL: 0, AVDR: 0, AVBL: 0, AVBR: 0, PVCL: 0, PVCR: 0 },
        receptors: {},
      },
      back: { command: { AVAL: 0, AVAR: 0, AVDL: 0, AVDR: 0, AVBL: 1, AVBR: 1, PVCL: 0, PVCR: 0 }, receptors: {} },
    },
  });

  it('read as the rules declared: a body mode with the oscillators off, and 10 mV in AVA', () => {
    const none = readings([{ key: 'lhs-0', sample: sample(0.4, false) }]);
    expect(none.oscillation).toMatch(/^no linear oscillation/);
    expect(none.touch).toMatch(/can't reach/);
    const both = readings([
      { key: 'lhs-0', sample: sample(0.4, false) },
      { key: 'lhs-1', sample: sample(12, true) },
    ]);
    expect(both.oscillation).toMatch(/^a live mode of the network/);
    expect(both.touch).toMatch(/can reach/);
    expect(both.frontAVA).toEqual({ key: 'lhs-1', value: 12, stable: true });
    expect(both.bodyModesOff).toHaveLength(1);
    expect(both.posterior).toMatch(/can't depolarise AVB/);
    // A sample that couldn't be read is read no further.
    const failed = readings([{ key: 'lhs-2', sample: { ...sample(12, true), failed: 'x', failure: 'fixed point' } }]);
    expect(failed.oscillation).toMatch(/^no linear oscillation/);
    expect(failed.frontAVA).toBeNull();
  });
});
