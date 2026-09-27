// Track R's model (PLAN §9) on the real data: the B-types' gap-junction gain, the split oscillator gain, the SMDs'
// junction gain past the head, and neuromuscular drive relative to each muscle's range.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { PARAMS } from '../src/science/params.ts';
import { PLANNED } from '../src/science/planned.ts';
import { equilibrium, midpointActivation } from '../src/sim/brain/brain.ts';
import { cookNetwork, scaleGap } from '../src/sim/brain/network.ts';
import { Muscles, SMD_REACH } from '../src/sim/muscles.ts';
import { World, type LoopParams } from '../src/sim/world.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const bTypes = new Set(data.neurons.flatMap((n, i) => (n.oscillator === 'B' ? [i] : [])));

// Trial values in R's units, as tests/loop.test.ts uses its own.
const R: LoopParams = {
  oscillatorGain: 1,
  oscillatorGainB: 0.4,
  recoveryTime: 1,
  driveThreshold: -8,
  switchGain: 100,
  proprioceptiveGain: 10,
  neuromuscularGain: 10,
  neuromuscularThreshold: 0.2,
  noise: 0,
  gapGainB: 0.3,
  smdGain: 0.2,
  relativeDrive: true,
};

describe("the B-types' gap-junction gain", () => {
  it('scales every junction with a B-type on either side, both ways, and nothing else', () => {
    const whole = cookNetwork(data);
    const scaled = scaleGap(whole, bTypes, 0.3);
    const { start, index, weight } = whole.gap;
    let touched = 0;
    for (let row = 0; row + 1 < start.length; row++) {
      for (let e = start[row]; e < start[row + 1]; e++) {
        const b = bTypes.has(row) || bTypes.has(index[e]);
        if (b) touched++;
        expect(scaled.gap.weight[e]).toBe(b ? weight[e] * 0.3 : weight[e]);
      }
    }
    // Both directions of the 92 junctions that have a B-type on either side.
    expect(touched).toBe(2 * 92);
    expect(scaleGap(whole, bTypes, 1)).toBe(whole);
  });

  it('makes a rewired brain, with its own thresholds', () => {
    const world = new World(data, R);
    const scaled = scaleGap(cookNetwork(data), bTypes, 0.3);
    expect(world.brain.threshold).toEqual(equilibrium(scaled, midpointActivation(scaled)));
    const intact = cookNetwork(data);
    expect(world.brain.threshold).not.toEqual(equilibrium(intact, midpointActivation(intact)));
  });
});

describe('the split oscillator gain', () => {
  it('gives the A-types g_osc and the B-types g_osc,B, and at 0 the B-types no oscillator', () => {
    const osc = new World(data, R).brain.oscillators;
    if (!osc) throw new Error('no oscillators');
    Array.from(osc.neurons).forEach((i, k) => {
      expect(osc.gain[k]).toBe(data.neurons[i].oscillator === 'B' ? 0.4 : 1);
    });
    const none = new World(data, { ...R, oscillatorGainB: 0 }).brain.oscillators;
    const types = Array.from(none?.neurons ?? [], (i) => data.neurons[i].oscillator);
    // VA1–12 and DA1–9 alone.
    expect(types).toHaveLength(21);
    expect(types.every((t) => t === 'A')).toBe(true);
  });

  it('refuses an oscillator with no gain, which the GPU would take for none', () => {
    const world = new World(data, R);
    const osc = world.brain.oscillators;
    if (!osc) throw new Error('no oscillators');
    const gain = Float64Array.from(osc.gain);
    gain[0] = 0;
    expect(() => world.brain.setOscillators({ ...osc, gain })).toThrow(/above 0/);
    expect(() => world.brain.setOscillators({ ...osc, gain: gain.subarray(1) })).toThrow(/one shift and one gain/);
  });
});

describe('relative drive', () => {
  const rise = PARAMS.synapticRise.value;
  const decay = PARAMS.synapticDecay.value;
  const activation = (value: (sign: number) => number): Float64Array => {
    // Each neuron's activation by the sign of its junctions onto muscle: every junction of one cell shares it.
    const sign = new Map(data.neuromuscular.filter((j) => j.sign !== 0).map((j) => [j.pre, j.sign]));
    return Float64Array.from(data.neurons, (n) => value(sign.get(n.name) ?? 0));
  };

  it('is 0 with every activation at the midpoint, and 1 with every excitatory one at its most and inhibition off', () => {
    // With κ_SMD too, since the range is taken with it applied.
    for (const smdGain of [1, 0.3]) {
      const muscles = new Muscles(data, { gain: 1, threshold: 0, timeConstant: 0.1, relative: true, smdGain }, 48);
      muscles.settle(activation(() => rise / (rise + 2 * decay)));
      for (let m = 0; m < muscles.names.length; m++) expect(muscles.drive[m] - muscles.offset[m]).toBeCloseTo(0, 12);
      muscles.settle(activation((sign) => (sign > 0 ? rise / (rise + decay) : 0)));
      for (let m = 0; m < muscles.names.length; m++) expect(muscles.drive[m] - muscles.offset[m]).toBeCloseTo(1, 12);
    }
  });

  it('refuses a muscle with no range of drive', () => {
    const [first] = data.muscles;
    const cut = { ...data, neuromuscular: data.neuromuscular.filter((j) => j.muscle !== first.name) };
    expect(() => new Muscles(cut, { gain: 1, threshold: 0, timeConstant: 0.1, relative: true }, 48)).toThrow(
      `${first.name} has no range of drive`,
    );
  });

  it("keeps each muscle's range through a lesion, so the lesion's lost drive shows", () => {
    const intact = new Muscles(data, { gain: 1, threshold: 0, timeConstant: 0.1, relative: true }, 48);
    const lesioned = new Muscles(
      data,
      { gain: 1, threshold: 0, timeConstant: 0.1, relative: true },
      48,
      new Set(['DB1', 'VB2']),
    );
    expect(lesioned.offset).toEqual(intact.offset);
    // Its surviving junctions keep their weights, divided by the intact range.
    const kept = new Map<string, number>();
    for (let m = 0; m < intact.names.length; m++) {
      for (let k = intact.start[m]; k < intact.start[m + 1]; k++) kept.set(`${m} ${intact.pre[k]}`, intact.weight[k]);
    }
    let survivors = 0;
    for (let m = 0; m < lesioned.names.length; m++) {
      for (let k = lesioned.start[m]; k < lesioned.start[m + 1]; k++) {
        expect(lesioned.weight[k]).toBe(kept.get(`${m} ${lesioned.pre[k]}`));
        survivors++;
      }
    }
    expect(survivors).toBeLessThan(kept.size);
  });

  it("gives R's provisional gain and threshold as the planned fit's, mapped through the median muscle", () => {
    // Each muscle's rest and range in raw drive, and their medians over the 95 muscles.
    const raw = new Muscles(data, { gain: 1, threshold: 0, timeConstant: 0.1 }, 48);
    raw.settle(activation(() => rise / (rise + 2 * decay)));
    const rest = Array.from(raw.drive);
    raw.settle(activation((sign) => (sign > 0 ? rise / (rise + decay) : 0)));
    const span = Array.from(raw.drive, (max, m) => max - rest[m]);
    const median = (xs: number[]): number => {
      const s = [...xs].sort((a, b) => a - b);
      return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    };
    const three = (x: number): number => Number(x.toPrecision(3));
    const { neuromuscularGain: g, neuromuscularThreshold: theta } = PLANNED.calibrated;
    expect(PARAMS.neuromuscularGain.provisional).toBe(three(g * median(span)));
    expect(PARAMS.neuromuscularThreshold.provisional).toBe(three((theta - median(rest)) / median(span)));
  });

  it("leaves the planned model's raw drive as it was", () => {
    const raw = new Muscles(data, { gain: 1, threshold: 0, timeConstant: 0.1 }, 48);
    expect(raw.offset.every((o) => o === 0)).toBe(true);
    const sections = data.neuromuscular.filter((j) => j.sign !== 0).reduce((n, j) => n + j.sections, 0);
    expect(raw.weight.reduce((n, w) => n + Math.abs(w), 0)).toBe(sections);
  });
});

describe("the SMDs' gain past the head", () => {
  it('scales only their junctions onto muscles starting 0.3 body lengths along or beyond', () => {
    const plain = new Muscles(data, { gain: 1, threshold: 0, timeConstant: 0.1 }, 48);
    const scaled = new Muscles(data, { gain: 1, threshold: 0, timeConstant: 0.1, smdGain: 0.2 }, 48);
    let far = 0;
    for (let m = 0; m < plain.names.length; m++) {
      for (let k = plain.start[m]; k < plain.start[m + 1]; k++) {
        const smd = data.neurons[plain.pre[k]].name.startsWith('SMD');
        const beyond = data.muscles[m].s0 >= SMD_REACH;
        if (smd && beyond) far++;
        expect(scaled.weight[k]).toBeCloseTo(smd && beyond ? plain.weight[k] * 0.2 : plain.weight[k], 12);
      }
    }
    // 32 junctions, 312 of the SMDs' 582 sections.
    expect(far).toBe(32);
  });
});

describe("R's provisional values", () => {
  it("carry the planned model's fit over to three figures, with R's own gains where they change nothing", () => {
    const three = (x: number): number => Number(x.toPrecision(3));
    const shared = [
      'oscillatorExcitability',
      'oscillatorRecoveryTime',
      'oscillatorDriveThreshold',
      'headSwitchGain',
      'proprioceptiveGain',
      'noiseIntensity',
    ] as const;
    for (const id of shared) expect(PARAMS[id].provisional).toBe(three(PLANNED.calibrated[id]));
    expect(PARAMS.oscillatorExcitabilityB.provisional).toBe(PARAMS.oscillatorExcitability.provisional);
    expect([PARAMS.gapGainB.provisional, PARAMS.smdGain.provisional]).toEqual([1, 1]);
  });
});
