// AWC-ON's sense of butanone (PLAN §4.1). Levy & Bargmann 2020's adaptive threshold T follows the odour's
// history, dT/dt = (K(1 − e^(−C/K)) − T)/τ, and AWC-ON takes the bounded current g_AWC·(T − C)/(T + C), whose
// form is ours: it depolarises the cell when the odour falls below the threshold, hyperpolarises it when the
// odour rises above, and never passes g_AWC either way.

import type { WormlightData } from '../data/schema.ts';
import { PARAMS } from '../science/params.ts';
import { Brain, equilibrium, midpointActivation } from './brain/brain.ts';
import { cookNetwork } from './brain/network.ts';

// Anything that gives a concentration (µM) at a point (m), such as an OdourField.
export interface Odour {
  sample(x: number, y: number): number;
}

// g_AWC (pA) for each AWC as AWC-ON, by the rule fixed in advance (PLAN §4.1, DECISIONS.md 2026-09-27): the
// current that raises that AWC 16 mV on the connectome alone. awcGain finds them, and a test holds these to it.
export const AWC_GAIN = { AWCL: 3.73338, AWCR: 5.51839 } as const;
export type AwcSide = keyof typeof AWC_GAIN;

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

  // g_AWC·(T − C)/(T + C), and none with neither odour nor threshold.
  current(c: number): number {
    const sum = this.threshold + c;
    return sum > 0 ? (this.gain * (this.threshold - c)) / sum : 0;
  }
}

// The current, found by bisection, that raises the named neuron AWC_RISE mV at steady state on the connectome
// alone: Cook's network at its rest thresholds, with no oscillators, no noise and nothing outside the brain.
// With the current bounded, removing odour gives exactly g_AWC whatever T was adapted to, so this is the gain.
export function awcGain(data: WormlightData, name: string, seconds = 30, dt = 0.01): number {
  const network = cookNetwork(data);
  const thresholds = equilibrium(network, midpointActivation(network));
  const neuron = network.names.indexOf(name);
  if (neuron < 0) throw new Error(`there is no neuron ${name}`);
  const rise = (current: number): number => {
    const brain = new Brain(network, thresholds);
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
