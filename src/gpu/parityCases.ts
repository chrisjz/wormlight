// The CPU side of GPU parity (PLAN §7.2): the states both brains start from, the thresholds they are held
// to, and the allowance for the noise's rounding. It needs no GPU, so the tests check it directly; parity.ts
// runs the GPU against it.

import type { WormlightData } from '../data/schema.ts';
import { Brain, type BrainState, type Oscillators } from '../sim/brain/brain.ts';
import type { Network } from '../sim/brain/network.ts';
import { hash, uniform } from '../sim/brain/rng.ts';
import { NEURAL_STEP } from '../sim/numerics.ts';
import { World, type LoopParams } from '../sim/world.ts';

// Trial values for the loop that supplies the states; calibration (PLAN §7.3) sets the real ones. The
// B-types' drive threshold is in the range where they cycle (DECISIONS.md, 2026-09-26), and the noise, about
// 2 mV of wander on a lone neuron, keeps every voltage moving.
export const PARITY_LOOP: LoopParams = {
  oscillatorGain: 2,
  recoveryTime: 1,
  driveThreshold: -16,
  switchGain: 100,
  proprioceptiveGain: 10,
  neuromuscularGain: 1,
  neuromuscularThreshold: 5,
  noise: 0.01,
};
export const SEED = 1;
const WARMUP = 2; // s before the first state
const INTERVAL = 0.5; // s between states
const STATES = 20;
export const SECOND = Math.round(1 / NEURAL_STEP);
export const SAMPLES = 10; // over the second

// PLAN §7.2's thresholds.
export const ONE_STEP = { voltage: 1e-4, activation: 1e-4 };
export const ONE_SECOND = { rms: 1e-2 };
// The check fails if more than a quarter of the states are ill posed: it would no longer test much.
export const MOST_ILL_POSED = 0.25;
export const FLOOR = 1; // mV for voltage; activation's is 1, so its errors are absolute

export interface ParityCase {
  label: string;
  state: BrainState;
  input: Float64Array;
}

// What both brains are built from.
export interface ParitySetup {
  network: Network;
  threshold: Float64Array;
  oscillators: Oscillators | null;
  noise: number;
  seed: number;
  cases: ParityCase[];
}

export function paritySetup(data: WormlightData): ParitySetup {
  const world = new World(data, PARITY_LOOP, { seed: SEED });
  const { brain } = world;
  const cases: ParityCase[] = [];
  const rest = new Brain(brain.network, brain.threshold);
  rest.setOscillators(brain.oscillators);
  cases.push({ label: 'rest', state: rest.snapshot(), input: new Float64Array(brain.n) });
  const every = Math.round(INTERVAL / NEURAL_STEP);
  const first = Math.round(WARMUP / NEURAL_STEP);
  for (let k = 1; cases.length <= STATES; k++) {
    world.step();
    if (k >= first && (k - first) % every === 0) {
      // The input the brain just stepped with, held for the steps to come.
      cases.push({
        label: `t = ${world.time.toFixed(1)} s`,
        state: brain.snapshot(),
        input: Float64Array.from(brain.input),
      });
    }
  }
  return {
    network: brain.network,
    threshold: brain.threshold,
    oscillators: brain.oscillators,
    noise: brain.noise,
    seed: brain.seed,
    cases,
  };
}

export function cpuBrain(setup: ParitySetup, c: ParityCase, tolerance?: number): Brain {
  const brain = new Brain(setup.network, setup.threshold, { tolerance });
  brain.setOscillators(setup.oscillators);
  brain.noise = setup.noise;
  brain.seed = setup.seed;
  brain.restore(c.state);
  brain.input.set(c.input);
  return brain;
}

// WGSL's accuracy for f32 (WGSL §14.6), bounding how far the shader's gaussian_from(h1, h2) may be from the
// exact value.
const ulp = (x: number): number => (x === 0 ? 0 : 2 ** (Math.floor(Math.log2(Math.abs(x))) - 23));
export function gaussianBound(h1: number, h2: number): number {
  const log = Math.log(uniform(h1));
  // log: an absolute 2⁻²¹ on [0.5, 2] and 3 ULP elsewhere; the product with −2 is exact.
  const dL = 2 * (uniform(h1) >= 0.5 ? 2 ** -21 : 3 * ulp(log));
  const L = -2 * log;
  // sqrt, inherited from 1/inverseSqrt: 2 ULP, then 2.5 for the division, on top of L's error carried through.
  const R = Math.sqrt(L);
  const carried = Math.max(Math.sqrt(L + dL) - R, R - Math.sqrt(Math.max(L - dL, 0)));
  const dR = carried + 4.5 * ulp(R + carried);
  // cos: an absolute 2⁻¹¹ on [−π, π], and its argument's error from f32's π and one rounding, 2 ULP of π.
  const dCos = 2 ** -11 + 2 * ulp(Math.PI);
  const cos = Math.cos(2 * Math.PI * uniform(h2));
  const bound = Math.abs(cos) * dR + (R + dR) * dCos;
  // The final product's rounding.
  return bound + ulp(Math.abs(R * cos) + bound) / 2;
}

// The most the noise's rounding can move any voltage in one step: the implicit system's inverse is bounded by
// dt/C in the ∞-norm, since each row's diagonal exceeds its off-diagonal sum by at least C/dt.
export function noiseAllowance(setup: ParitySetup, steps: number): number {
  if (setup.noise === 0) return 0;
  let worst = 0;
  for (let i = 0; i < setup.network.names.length; i++) {
    const h1 = hash(setup.seed, steps, 2 * i);
    const h2 = hash(setup.seed, steps, 2 * i + 1);
    worst = Math.max(worst, gaussianBound(h1, h2));
  }
  return (setup.noise * Math.sqrt(NEURAL_STEP) * worst) / setup.network.capacitance;
}

export const worst = (
  a: Float64Array,
  b: Float64Array,
  scale: (i: number) => number,
): { share: number; error: number } => {
  let share = 0;
  let error = 0;
  for (let i = 0; i < a.length; i++) {
    const e = Math.abs(a[i] - b[i]);
    error = Math.max(error, e);
    share = Math.max(share, e / scale(i));
  }
  return { share, error };
};

export const rms = (a: Float64Array, b: Float64Array, floor: number): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += ((a[i] - b[i]) / Math.max(Math.abs(a[i]), floor)) ** 2;
  return Math.sqrt(sum / a.length);
};
