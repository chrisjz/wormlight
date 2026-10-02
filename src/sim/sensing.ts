// AWC-ON's sense of butanone (PLAN §4.1). Levy & Bargmann 2020's adaptive threshold T follows the odour's
// history, dT/dt = (K(1 − e^(−C/K)) − T)/τ, and AWC-ON takes the bounded current g_AWC·(T − C)/(T + C), whose
// form is ours: it depolarises the cell when the odour falls below the threshold, hyperpolarises it when the
// odour rises above, and never passes g_AWC either way.

import type { WormlightData } from '../data/schema.ts';
import { PARAMS } from '../science/params.ts';
import { Brain, equilibrium, midpointActivation, restOf } from './brain/brain.ts';
import { cookNetwork } from './brain/network.ts';
import { rectify, type RestModel } from './trackS.ts';

// Anything that gives a concentration (µM) at a point (m), such as an OdourField.
export interface Odour {
  sample(x: number, y: number): number;
}

// g_AWC (pA) for each AWC as AWC-ON, by the rule fixed in advance (PLAN §4.1, DECISIONS.md 2026-09-27): the
// current that raises that AWC 16 mV on the connectome alone, the runtime data's, with every neuron at its threshold
// and every junction conducting both ways. awcGain finds them, and a test holds these to it. Track S's signs moved into
// the runtime data when its fit was chosen, which moved them from 3.73338 and 5.51839 (DECISIONS.md, 2026-10-02).
export const AWC_GAIN = { AWCL: 3.73539, AWCR: 5.51805 } as const;
export type AwcSide = keyof typeof AWC_GAIN;
// AWC-ON's gain by the rule below for each model a World runs, keyed by trackSKey (DECISIONS.md, 2026-10-02): the
// runtime data's alone, then with the D-types' offset, and with AVA's offsets too, the last for a sensitivity setting;
// then each of those with track S's rectifier, the second of them track S's whole model, which the app runs, and the
// first its setting with the offsets off. A test recomputes each.
export const AWC_GAINS: Readonly<Record<string, Readonly<Record<AwcSide, number>>>> = {
  '': AWC_GAIN,
  measured: { AWCL: 3.73541, AWCR: 5.51798 },
  'measured with AVA': { AWCL: 3.73541, AWCR: 5.518 },
  rectified: { AWCL: 3.73539, AWCR: 5.51805 },
  'measured, rectified': { AWCL: 3.7354, AWCR: 5.51799 },
  'measured with AVA, rectified': { AWCL: 3.7354, AWCR: 5.518 },
};

// The rise that sets the gain: 2/β, the working width of the sigmoid (mV).
export const AWC_RISE = 16;

export class AwcSensor {
  // g_AWC (pA), K (µM) and τ (s).
  readonly gain: number;
  readonly scale: number;
  readonly time: number;
  // T (µM).
  threshold = 0;

  constructor(gain: number, scale = PARAMS.awcAdaptationScale.value, time = PARAMS.awcAdaptationTime.value) {
    this.gain = gain;
    this.scale = scale;
    this.time = time;
  }

  // The threshold a steady concentration C holds: K(1 − e^(−C/K)).
  settled(c: number): number {
    return -this.scale * Math.expm1(-Math.max(c, 0) / this.scale);
  }

  // Start adapted to C, as Levy & Bargmann's code starts.
  adapt(c: number): void {
    this.threshold = this.settled(c);
  }

  // The fraction of the way to its settled value T moves in dt (s) with C held, 1 − e^(−dt/τ).
  rate(dt: number): number {
    return -Math.expm1(-dt / this.time);
  }

  // Advance T by dt with C held, exactly, and return the current (pA) into AWC-ON. A concentration below
  // zero, which only rounding could give, counts as none.
  step(c: number, dt: number): number {
    const held = Math.max(c, 0);
    this.threshold += (this.settled(held) - this.threshold) * this.rate(dt);
    return this.current(held);
  }

  // g_AWC·(T − C)/(T + C), and none with neither odour nor threshold. The ratio is taken first, so it is exactly
  // 1 with no odour and never more than 1 in size: the current is then exactly g_AWC, and never passes it.
  current(c: number): number {
    const sum = this.threshold + c;
    return sum > 0 ? this.gain * ((this.threshold - c) / sum) : 0;
  }
}

// The current, found by bisection, that raises the named neuron AWC_RISE mV at steady state on the connectome
// alone: Cook's network at its rest thresholds, with no oscillators, no noise and nothing outside the brain. Under
// track S's model the rest is its own, at its offsets and with its rectifier (DECISIONS.md, 2026-10-02).
// Removing odour gives exactly g_AWC whatever T was adapted to, so this is the gain. The rise is measured from
// rest, the limit of weak odour, where the adapted current is zero; adapted to stronger odour, AWC-ON starts
// lower and rises further, 16.6 mV from the assay's start at the dish's centre.
export function awcGain(data: WormlightData, name: string, model: RestModel = {}, seconds = 30, dt = 0.01): number {
  const built = cookNetwork(data);
  const network = model.rectified ? rectify(built) : built;
  const { offset } = model;
  const thresholds =
    offset || model.rectified
      ? restOf(network, offset ?? new Float64Array(network.names.length)).threshold
      : equilibrium(network, midpointActivation(network));
  const neuron = network.names.indexOf(name);
  if (neuron < 0) throw new Error(`there is no neuron ${name}`);
  const rise = (current: number): number => {
    const brain = new Brain(network, thresholds, {}, offset);
    const rest = brain.voltage[neuron];
    for (let k = Math.round(seconds / dt); k > 0; k--) {
      brain.input.fill(0);
      brain.input[neuron] = current;
      brain.step(dt);
    }
    return brain.voltage[neuron] - rest;
  };
  let low = 0;
  let high = 1000;
  if (rise(high) < AWC_RISE) throw new Error(`${high} pA does not raise ${name} ${AWC_RISE} mV`);
  while (high - low > 1e-7 * high) {
    const middle = (low + high) / 2;
    if (rise(middle) < AWC_RISE) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}
