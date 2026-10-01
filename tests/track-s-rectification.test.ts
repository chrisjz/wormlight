// Track S's rectifier (PLAN §3.4; DECISIONS.md, 2026-10-01 and 2026-10-02): the AVA–A-type gap junctions pass current
// only from the A-type into AVA, g·max(V_A − V_AVA, 0), each gate taken at the step's start with both voltages
// implicit; the rest a fixed point of the gates; and the rules set at rest read the network as the rest gates it.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { PARAMS } from '../src/science/params.ts';
import { Brain, equilibrium, inputConductance, midpointActivation, restOf } from '../src/sim/brain/brain.ts';
import {
  chemicalRows,
  conducts,
  cookNetwork,
  gapGates,
  gapRows,
  gatedAt,
  lesion,
  openRectified,
  type Network,
} from '../src/sim/brain/network.ts';
import { NEURAL_STEP } from '../src/sim/numerics.ts';
import { tap, touchData } from '../src/sim/touch.ts';
import { rectify, restOffsets, trackSKey, withMeasuredSigns } from '../src/sim/trackS.ts';
import { currentParams, loopParams, World, type LoopParams } from '../src/sim/world.ts';
import { provisionalValues } from '../src/validation/calibration.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const signed = withMeasuredSigns(data);
const whole: Partial<LoopParams> = { measuredSigns: true, restOffsets: 'measured', rectified: true };
const A_TYPE = /^(DA|VA)\d+$/;

describe("track S's rectified junctions", () => {
  const network = rectify(cookNetwork(signed));
  const { names } = network;

  it("are AVA's 37 gap junctions with the A-types, 194 sections, each from the A-type into AVA", () => {
    const pairs = network.rectified ?? [];
    expect(pairs).toHaveLength(37);
    for (const [from, to] of pairs) {
      expect(names[from]).toMatch(A_TYPE);
      expect(['AVAL', 'AVAR']).toContain(names[to]);
    }
    expect(pairs.filter(([, to]) => names[to] === 'AVAL')).toHaveLength(19);
    const named = new Set(pairs.map(([from, to]) => `${names[from]} ${names[to]}`));
    const sections = signed.gap
      .filter((g) => named.has(`${g.a} ${g.b}`) || named.has(`${g.b} ${g.a}`))
      .reduce((sum, g) => sum + g.sections, 0);
    expect(sections).toBe(194);
    // The A-types the data marks for their oscillators.
    const marked = signed.neurons.flatMap((n) => (n.oscillator === 'A' ? [n.name] : []));
    expect(names.filter((n) => A_TYPE.test(n))).toEqual(expect.arrayContaining(marked));
    expect(marked).toHaveLength(names.filter((n) => A_TYPE.test(n)).length);
  });

  it('flag both entries of each junction to read the same comparison, so the system stays symmetric', () => {
    const gates = gapGates(network);
    if (!gates) throw new Error('no gates');
    const { start, index } = network.gap;
    let flagged = 0;
    for (let i = 0; i < names.length; i++) {
      for (let e = start[i]; e < start[i + 1]; e++) {
        const j = index[e];
        let back = -1;
        for (let f = start[j]; f < start[j + 1]; f++) if (index[f] === i) back = f;
        expect(gates[back] + gates[e]).toBe(0);
        if (gates[e] !== 0) flagged++;
        // Each entry conducts at the same voltages as its pair.
        for (const [vi, vj] of [
          [-5, -7],
          [-7, -5],
          [-6, -6],
        ]) {
          expect(conducts(gates[e], vi, vj)).toBe(conducts(gates[back], vj, vi));
        }
      }
    }
    expect(flagged).toBe(74);
  });

  it('keep only the junctions a lesioned brain has, and none listed both ways', () => {
    const gates = gapGates(lesion(network, ['AVAL']));
    expect(gates?.filter((g) => g !== 0)).toHaveLength(36);
    expect(gapGates(lesion(network, ['AVAL', 'AVAR']))).toBeNull();
    const [from, to] = (network.rectified ?? [])[0];
    expect(() => gapGates({ ...network, rectified: [...(network.rectified ?? []), [to, from]] })).toThrow(/one way/);
  });
});

describe('a rectified junction', () => {
  // Two neurons, an A-type and AVA, joined by one junction and nothing else.
  const pair = (rectified: boolean): Network => {
    const network: Network = {
      names: ['VA1', 'AVAL'],
      capacitance: 0.001,
      leak: 0.01,
      leakPotential: -35,
      rise: 1,
      decay: 5,
      slope: 0.125,
      gap: gapRows(2, [[0, 1, 0.1]]),
      chemical: {
        start: new Int32Array(3),
        index: new Int32Array(0),
        weight: new Float64Array(0),
        reversal: new Float64Array(0),
      },
    };
    return rectified ? rectify(network) : network;
  };
  const run = (network: Network, into: number): Float64Array => {
    const rest = restOf(network, [0, 0]);
    const brain = new Brain(network, rest.threshold);
    for (let k = 0; k < 400; k++) {
      brain.input.fill(0);
      brain.input[into] = 1;
      brain.step(NEURAL_STEP);
    }
    return Float64Array.from(brain.voltage, (v, i) => v - rest.voltage[i]);
  };

  it('passes current from the A-type into AVA, and none back', () => {
    const [aAlone, avaFromA] = run(pair(true), 0);
    expect(avaFromA).toBeGreaterThan(0.1 * aAlone);
    const [aFromAva, avaAlone] = run(pair(true), 1);
    expect(avaAlone).toBeGreaterThan(10);
    expect(aFromAva).toBeCloseTo(0, 9);
    // Both ways, AVA's current reaches the A-type.
    expect(run(pair(false), 1)[0]).toBeGreaterThan(0.1 * avaAlone);
    // From the A-type, both ways and rectified agree once the gate is open: it closes only on the first step, at rest.
    expect(avaFromA / run(pair(false), 0)[1]).toBeCloseTo(1, 2);
  });
});

describe("track S's rest under its rectifier", () => {
  const network = rectify(cookNetwork(signed));
  const offset = restOffsets(signed, 'measured');
  const rest = restOf(network, offset);

  it('is a fixed point of the gates: the solve with each gate as it sets them gives it back', () => {
    const again = equilibrium(gatedAt(network, rest.voltage), rest.activation);
    let worst = 0;
    for (let i = 0; i < again.length; i++) worst = Math.max(worst, Math.abs(again[i] - rest.voltage[i]));
    expect(worst).toBeLessThan(1e-9);
    expect(rest.network.gap.weight).toEqual(gatedAt(network, rest.voltage).gap.weight);
    expect(openRectified(network, rest.voltage)).toEqual({ open: 10, of: 37 });
  });

  it('differs from the rest with every junction open, by more than 2 mV in the A-types', () => {
    const open = restOf({ ...network, rectified: [] }, offset);
    let worst = 0;
    for (let i = 0; i < open.voltage.length; i++) {
      if (A_TYPE.test(network.names[i])) worst = Math.max(worst, Math.abs(open.voltage[i] - rest.voltage[i]));
    }
    expect(worst).toBeGreaterThan(2);
    expect(openRectified(network, open.voltage).open).toBe(13);
  });

  it('is held still by a brain, its gates read at each step', () => {
    const brain = new Brain(network, rest.threshold, {}, offset);
    for (let k = 0; k < 400; k++) brain.step(NEURAL_STEP);
    let worst = 0;
    for (let i = 0; i < brain.n; i++) worst = Math.max(worst, Math.abs(brain.voltage[i] - rest.voltage[i]));
    expect(worst).toBeLessThan(1e-6);
  });

  it('takes each step with its gates as the voltages at its start set them, on the diagonal and the solve alike', () => {
    const brain = new Brain(network, rest.threshold, {}, offset);
    const aval = network.names.indexOf('AVAL');
    const pattern = (v: ArrayLike<number>): string =>
      Array.from(gatedAt(network, v).gap.weight, (w) => (w === 0 ? 0 : 1)).join('');
    let [changes, last] = [0, pattern(brain.voltage)];
    for (let k = 0; k < 50; k++) {
      // A current into AVAL that swings both ways, so the gates turn away from rest.
      const current = 20 * Math.sin(k / 4);
      const state = brain.snapshot();
      const frozen = new Brain(gatedAt(network, state.voltage), rest.threshold, {}, offset);
      frozen.restore(state);
      for (const b of [brain, frozen]) {
        b.input.fill(0);
        b.input[aval] = current;
        b.step(NEURAL_STEP);
      }
      expect(brain.voltage).toEqual(frozen.voltage);
      expect(brain.activation).toEqual(frozen.activation);
      const now = pattern(brain.voltage);
      if (now !== last) [changes, last] = [changes + 1, now];
    }
    expect(changes).toBeGreaterThan(5);
  });

  it("opens 4 of the 37 gates in the runtime model rectified, the count the rules' review found", () => {
    const runtime = rectify(cookNetwork(data));
    const at = restOf(runtime, new Float64Array(runtime.names.length));
    expect(openRectified(runtime, at.voltage)).toEqual({ open: 4, of: 37 });
  });
});

describe("track S's whole world", () => {
  const world = new World(data, { ...currentParams(), ...whole });

  it('rests where the rest under its rectifier puts it, with its D-types above their thresholds', () => {
    const rest = restOf(rectify(cookNetwork(signed)), restOffsets(signed, 'measured'));
    rest.voltage.forEach((v, i) => expect(world.brain.voltage[i]).toBeCloseTo(v, 9));
    expect(world.brain.restNetwork().gap.weight).toEqual(rest.network.gap.weight);
    const d = world.brain.network.names.indexOf('VD5');
    expect(world.brain.threshold[d] - world.brain.voltage[d]).toBeCloseTo(-7.4, 9);
  });

  it("sizes touch's currents at that rest, gated, unlike the unrectified model's", () => {
    expect(world.touchSets).toBe(touchData(signed, { offset: world.brain.offset, rectified: true }));
    const unrectified = touchData(signed, { offset: world.brain.offset });
    const tapped = (t: typeof unrectified): number[] => Array.from(t.sets.values()).flatMap((c) => Array.from(c));
    expect(tapped(world.touchSets)).not.toEqual(tapped(unrectified));
    // A tap AVM alone reaches takes the current that holds it 10 mV up in the network as the rest gates it.
    const rest = restOf(rectify(cookNetwork(signed)), restOffsets(signed, 'measured'));
    const avm = world.touchSets.receptors.find((r) => r.name === 'AVM');
    if (!avm) throw new Error('no AVM');
    const held = PARAMS.touchAmplitude.value * inputConductance(rest.network, rest.activation, avm.neuron);
    expect(tap(world.touchSets, 0.045).currents[avm.index] / held).toBeCloseTo(1, 9);
  });

  it('refuses a model whose AWC gain is not set', () => {
    expect(trackSKey({ rectified: true })).toBe('rectified');
    expect(() => new World(data, { ...currentParams(), rectified: true })).toThrow(/no AWC gain/);
  });

  // The gates' open share at the loop's step and at half of it (DECISIONS.md, 2026-10-01), over a minute of crawling at
  // the conductance form's provisional values, the two runs sharing one noise path: a step dependence in the gates
  // would show here first. Set after a look at five seeds, where the shares differed by 0.007 at most.
  it("opens its gates as often at half the step as at the step's own", { timeout: 60000 }, () => {
    const share = (substeps: number): number => {
      const w = new World(
        data,
        { ...loopParams(provisionalValues('conductance'), 'conductance'), ...whole },
        {
          seed: 1,
          neuralSubsteps: substeps,
          noiseGrid: NEURAL_STEP / 2,
        },
      );
      let open = 0;
      const steps = Math.round(60 / NEURAL_STEP);
      for (let k = 0; k < steps; k++) {
        w.step();
        open += openRectified(w.brain.network, w.brain.voltage).open;
      }
      return open / steps / 37;
    };
    const [full, half] = [share(1), share(2)];
    expect(full).toBeGreaterThan(0.05);
    expect(full).toBeLessThan(0.95);
    expect(Math.abs(full - half)).toBeLessThan(0.02);
  });
});

describe('the rest of a small rectified network', () => {
  // Seeded random networks of six neurons, some of whose junctions rectify: with activations held the gates' fixed
  // point exists and is unique, and the iteration must find it however many gated solves it takes.
  const random = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  };
  const small = (seed: number): Network => {
    const next = random(seed);
    const n = 6;
    const gap: [number, number, number][] = [];
    const rectified: [number, number][] = [];
    const chemical: [number, number, number, number][] = [];
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (a < b && next() < 0.6) {
          gap.push([a, b, 0.05 + 0.45 * next()]);
          if (next() < 0.6) rectified.push(next() < 0.5 ? [a, b] : [b, a]);
        }
        if (a !== b && next() < 0.3) chemical.push([a, b, 0.01 + 0.29 * next(), next() < 0.5 ? 0 : -48]);
      }
    }
    return {
      names: Array.from({ length: n }, (_, i) => `N${i}`),
      capacitance: 0.001,
      leak: 0.01,
      leakPotential: -35,
      rise: 1,
      decay: 5,
      slope: 0.125,
      gap: gapRows(n, gap),
      chemical: chemicalRows(n, chemical),
      rectified,
    };
  };

  it('is found, consistent with its gates, including where one gated solve is not enough', () => {
    let rounds = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const network = small(seed);
      const s = midpointActivation(network);
      const rest = restOf(network, new Float64Array(6));
      expect(rest.network.gap.weight).toEqual(gatedAt(network, rest.voltage).gap.weight);
      const again = equilibrium(rest.network, s);
      again.forEach((v, i) => expect(v).toBeCloseTo(rest.voltage[i], 9));
      // Whether the first gated solve, from every junction open, already set its own gates.
      const first = equilibrium(gatedAt(network, equilibrium({ ...network, rectified: [] }, s)), s);
      const gates = (v: ArrayLike<number>): string => Array.from(gatedAt(network, v).gap.weight).join(',');
      if (gates(first) !== gates(rest.voltage)) rounds++;
    }
    // 5 of the 100 need more than two gated solves, where every variant of S's model needs two.
    expect(rounds).toBeGreaterThan(0);
  });
});
