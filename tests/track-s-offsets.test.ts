// Track S's class offsets (PLAN §3.3; DECISIONS.md, 2026-10-02): the D-types rest 7.4 mV above their thresholds, the
// A-types at theirs, the rest one solve with each activation held at its value, the oscillators kept in place
// relative to rest, relative drive's baseline at that rest, and the rules set at rest, AWC's gain, touch's currents
// and the calibration's bounds, rerun on the model.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { BOUND_RULE_CURVATURE, BOUND_RULE_MV, PARAMS, type Param } from '../src/science/params.ts';
import {
  Brain,
  inputConductance,
  midpointActivation,
  passiveLoads,
  restActivation,
  restOf,
} from '../src/sim/brain/brain.ts';
import { cookNetwork } from '../src/sim/brain/network.ts';
import { AWC_GAINS, awcGain } from '../src/sim/sensing.ts';
import { touchData } from '../src/sim/touch.ts';
import { AVA_REST_OFFSET, REST_OFFSET, restOffsets, trackSKey, withMeasuredSigns } from '../src/sim/trackS.ts';
import { currentParams, loopParams, World, type LoopParams } from '../src/sim/world.ts';
import { provisionalValues } from '../src/validation/calibration.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const signed = withMeasuredSigns(data);
const trackS: Partial<LoopParams> = { measuredSigns: true, restOffsets: 'measured' };
const at = (name: string): number => data.neurons.findIndex((n) => n.name === name);

describe("track S's class offsets", () => {
  it("give each class's activation at rest from its offset, and the midpoint at none", () => {
    const network = cookNetwork(data);
    expect(restActivation(network, 18.5)).toBeCloseTo(0.0177, 4);
    expect(restActivation(network, REST_OFFSET.D)).toBeCloseTo(0.1253, 4);
    expect(restActivation(network, 0)).toBe(midpointActivation(network));
  });

  it('name the D-types, dorsal and ventral, leave the A-types at their midpoint, and AVA but for its setting', () => {
    const offset = restOffsets(data, 'measured');
    expect([offset[at('VD5')], offset[at('DD1')], offset[at('VA5')], offset[at('DA4')]]).toEqual([-7.4, -7.4, 0, 0]);
    expect([offset[at('VB6')], offset[at('AS1')], offset[at('AVAL')], offset[at('SMDDL')]]).toEqual([0, 0, 0, 0]);
    expect(offset.filter((o) => o !== 0)).toHaveLength(19);
    const withAva = restOffsets(data, 'measured with AVA');
    expect([withAva[at('AVAL')], withAva[at('AVAR')]]).toEqual([AVA_REST_OFFSET.AVAL, AVA_REST_OFFSET.AVAR]);
  });

  it('set each threshold its offset above a rest the network holds still', () => {
    const network = cookNetwork(signed);
    const offset = restOffsets(signed, 'measured');
    const rest = restOf(network, offset);
    rest.threshold.forEach((v, i) => expect(v - rest.voltage[i]).toBeCloseTo(offset[i], 9));
    const brain = new Brain(network, rest.threshold, {}, offset);
    for (let k = 0; k < 400; k++) brain.step(0.0025);
    let worst = 0;
    for (let i = 0; i < brain.n; i++) worst = Math.max(worst, Math.abs(brain.voltage[i] - rest.voltage[i]));
    expect(worst).toBeLessThan(1e-6);
  });
});

describe("track S's world", () => {
  const world = new World(data, { ...currentParams(), ...trackS });
  const refit = new World(data, currentParams());

  it('rests each neuron its offset below its threshold, and the refit at its threshold', () => {
    const { voltage, threshold } = world.brain;
    expect(threshold[at('VD5')] - voltage[at('VD5')]).toBeCloseTo(-7.4, 9);
    expect(threshold[at('VA5')] - voltage[at('VA5')]).toBeCloseTo(0, 9);
    expect(threshold[at('VB6')] - voltage[at('VB6')]).toBeCloseTo(0, 9);
    expect(refit.brain.voltage).toEqual(refit.brain.threshold);
  });

  it("keeps each oscillator in its place relative to its neuron's rest, θ − Δ, which leaves the A- and B-types at θ", () => {
    const osc = world.brain.oscillators;
    if (!osc) throw new Error('no oscillators');
    const shift = (name: string): number => osc.shift[osc.neurons.indexOf(at(name))];
    expect(shift('VA5')).toBe(0);
    expect(shift('VB6')).toBe(currentParams().driveThreshold);
  });

  it("keeps every threshold within the reversal potentials, where the A-types' measured offset would not", () => {
    const { threshold } = world.brain;
    for (let i = 0; i < threshold.length; i++) {
      expect(threshold[i], data.neurons[i].name).toBeLessThan(PARAMS.reversalExcitatory.value);
      expect(threshold[i], data.neurons[i].name).toBeGreaterThan(PARAMS.reversalInhibitory.value);
    }
  });

  it("starts every muscle at relative drive's baseline, so that at rest it is driven as the refit's are", () => {
    for (const w of [world, refit]) {
      for (let m = 0; m < w.muscles.drive.length; m++) {
        expect(w.muscles.drive[m] - w.muscles.offset[m], w.muscles.names[m]).toBeCloseTo(0, 12);
      }
    }
  });

  it("sizes touch's currents at its own rest, and keeps the refit's", () => {
    expect(world.touchSets).toBe(touchData(signed, { offset: world.brain.offset }));
    expect(refit.touchSets).toBe(touchData(data));
    expect(world.touchSets).not.toBe(touchData(signed));
    const tapped = (t: typeof world.touchSets): number[] => Array.from(t.sets.values()).flatMap((c) => Array.from(c));
    expect(tapped(world.touchSets)).not.toEqual(tapped(touchData(signed)));
  });

  it('refuses a model whose AWC gain is not set', () => {
    expect(() => new World(data, { ...currentParams(), restOffsets: 'measured' })).toThrow(/no AWC gain/);
  });
});

describe("the rules set at rest, on track S's model", () => {
  // Track S's whole model, its rectifier included (DECISIONS.md, 2026-10-02), on which its fit is calibrated.
  const whole: Partial<LoopParams> = { ...trackS, rectified: true };
  it.each(
    (
      [
        { measuredSigns: true },
        trackS,
        { measuredSigns: true, restOffsets: 'measured with AVA' },
        { measuredSigns: true, rectified: true },
        whole,
        { measuredSigns: true, restOffsets: 'measured with AVA', rectified: true },
      ] as Partial<LoopParams>[]
    ).map((v) => [trackSKey(v), v] as const),
  )("give AWC-ON the gains the table holds for track S's model with %s", { timeout: 60000 }, (_, v) => {
    const offset = v.restOffsets ? restOffsets(signed, v.restOffsets) : undefined;
    const gains = AWC_GAINS[trackSKey(v)];
    for (const side of ['AWCL', 'AWCR'] as const) {
      const gain = awcGain(signed, side, { offset, rectified: v.rectified });
      expect(gain / gains[side], `${trackSKey(v)} ${side}`).toBeCloseTo(1, 5);
    }
  });

  // The registry's bounds, by their rules, rounded as each rounds (PLAN §7.3): S's model needs bounds of its own only
  // where its rules' values round to others, as its rectifier makes g_p's upper bound 7 nS where the registry's is 8.
  it("put the conductance form's bounds, θ_osc's floor and σ_n's bound where the registry has them", () => {
    const worlds = PARAMS.gapGainB.bounds.map(
      (gapGainB) =>
        new World(data, { ...loopParams({ ...provisionalValues('current'), gapGainB }, 'current'), ...whole }),
    );
    const rule = (targets: (w: World) => readonly number[]): [number, number] => {
      let [lo, hi] = [Infinity, 0];
      for (const w of worlds) {
        const loads = passiveLoads(w.brain.restNetwork(), w.brain.restActivations());
        for (const i of targets(w)) {
          const rest = w.brain.threshold[i] - w.brain.offset[i];
          for (const e of [PARAMS.reversalExcitatory.value, PARAMS.reversalInhibitory.value]) {
            const room = Math.abs(e - rest) - BOUND_RULE_MV;
            lo = Math.min(lo, loads[i] / room);
            hi = Math.max(hi, loads[i] * room);
          }
        }
      }
      return [lo, hi];
    };
    const outward = ([lo, hi]: [number, number]): number[] => {
      const p = (x: number): number => 10 ** Math.floor(Math.log10(x));
      return [+(Math.floor(lo / p(lo)) * p(lo)).toPrecision(6), +(Math.ceil(hi / p(hi)) * p(hi)).toPrecision(6)];
    };
    // S's own where the registry keeps them beside its own, which its rectifier makes g_p's.
    const registered = (id: 'headSwitchGain' | 'proprioceptiveGain'): readonly number[] => {
      const c = (PARAMS[id] as Param).conductance;
      return c?.trackS?.bounds ?? c?.bounds ?? [];
    };
    expect(outward(rule((w) => [...w.dorsalSwitch, ...w.ventralSwitch]))).toEqual(registered('headSwitchGain'));
    const p = rule((w) => w.fields.map((f) => f.neuron)).map((g) => g / BOUND_RULE_CURVATURE) as [number, number];
    expect(outward(p)).toEqual(registered('proprioceptiveGain'));
    // θ_osc's floor, the first whole mV above the silenced head switch's drive, keeps a silenced gate shut.
    const silenced = PARAMS.gapGainB.bounds.map((gapGainB) =>
      new World(
        data,
        { ...loopParams({ ...provisionalValues('current'), gapGainB }, 'current'), ...whole },
        { silenced: true },
      ).headDrive(),
    );
    expect(Math.floor(Math.max(...silenced)) + 1).toBe(PARAMS.oscillatorDriveThreshold.bounds?.[0]);
    // σ_n's bound gives the most-spread neuron at rest 20 mV under white noise: σ / √(2 C G_in).
    const [w] = worlds.slice(-1);
    const [held, activation] = [w.brain.restNetwork(), w.brain.restActivations()];
    let least = Infinity;
    for (let i = 0; i < w.brain.n; i++) least = Math.min(least, inputConductance(held, activation, i));
    const sigma = 0.02 * Math.sqrt(2 * w.brain.network.capacitance * 1e-9 * least * 1e-9) * 1e12;
    expect(+sigma.toPrecision(3)).toBe(PARAMS.noiseIntensity.bounds?.[1]);
  });
});

describe('an offset on an oscillating neuron, and the AVA setting', () => {
  it("puts an oscillator's recovery where its neuron's rest leaves it: x = −θ/v₀ whatever the offset", () => {
    const network = cookNetwork(data);
    const offset = new Float64Array(network.names.length);
    const neuron = at('VA5');
    offset[neuron] = 12;
    const rest = restOf(network, offset);
    const brain = new Brain(network, rest.threshold, {}, offset);
    const theta = 3;
    brain.setOscillators({
      neurons: Int32Array.of(neuron),
      shift: Float64Array.of(theta - offset[neuron]),
      gain: Float64Array.of(1),
      recovery: 1,
    });
    const v0 = 1 / (2 * network.slope);
    expect(brain.voltage[neuron]).toBeCloseTo(rest.threshold[neuron] - 12, 12);
    expect(brain.recovery[0]).toBeCloseTo((-theta / v0 + 0.7) / 0.8, 12);
  });

  it("rests AVA above its threshold, every threshold within the reversal potentials, and the head's drive at 0", () => {
    const ava = new World(data, { ...currentParams(), measuredSigns: true, restOffsets: 'measured with AVA' });
    const { voltage, threshold } = ava.brain;
    expect(threshold[at('AVAL')] - voltage[at('AVAL')]).toBeCloseTo(-29, 9);
    expect(threshold[at('AVAR')] - voltage[at('AVAR')]).toBeCloseTo(-16, 9);
    for (let i = 0; i < threshold.length; i++) {
      expect(threshold[i], data.neurons[i].name).toBeLessThan(PARAMS.reversalExcitatory.value);
      expect(threshold[i], data.neurons[i].name).toBeGreaterThan(PARAMS.reversalInhibitory.value);
    }
    expect(Math.abs(ava.headDrive())).toBeLessThan(1e-9);
  });

  it("finds σ_n's bound where the registry has it on the runtime model too: IL2DL at 20 mV", () => {
    const network = cookNetwork(data);
    let least = Infinity;
    for (let i = 0; i < network.names.length; i++) {
      least = Math.min(least, inputConductance(network, midpointActivation(network), i));
    }
    const sigma = 0.02 * Math.sqrt(2 * network.capacitance * 1e-9 * least * 1e-9) * 1e12;
    expect(+sigma.toPrecision(3)).toBe(PARAMS.noiseIntensity.bounds?.[1]);
  });
});
