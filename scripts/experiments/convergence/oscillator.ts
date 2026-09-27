// The convergence study's oscillator alone (DECISIONS.md, 2026-09-28): a lone neuron with its leak and one
// oscillator, integrated by the CPU reference's Brain at each step and measured against an RK4 solution at 10 µs.
//
// Held by a constant current where it cycles, its period and its voltage's course over the first cycles; with the
// fitted noise and no current, the rate of the excursions noise excites from rest.

import { Brain } from '../../../src/sim/brain/brain.ts';
import { chemicalRows, gapRows, type Network } from '../../../src/sim/brain/network.ts';

// Production units (nF, nS, mV, s, pA), as the model's; the threshold sits at the leak potential, so the leak
// adds no bias.
const LONE: Network = {
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
const V0 = 1 / (2 * LONE.slope); // mV
const THRESHOLD = LONE.leakPotential;

export const STEPS = [0.0025, 0.00125, 0.000625, 0.0003125];
export const GAINS = [0.3, 1, 2.14, 5]; // nS
export const RECOVERIES = [1.36, 2.51]; // s: R's fit's τ_w and the planned fit's
// The drive, in units of the oscillator's own current g v₀, that holds it in the middle of the window where
// FitzHugh–Nagumo with a = 0.7 and b = 0.8 cycles (about 0.33 to 1.42).
const DRIVE = 0.8;
const NOISE = 0.1266; // pA·√s, R's fit's σ_n to three figures
const CYCLES = 3;

function lone(gain: number, recovery: number): Brain {
  const brain = new Brain(LONE, Float64Array.of(THRESHOLD));
  brain.setOscillators({ neurons: Int32Array.of(0), shift: Float64Array.of(0), gain: Float64Array.of(gain), recovery });
  return brain;
}

// x = (V − V_th)/v₀ over `seconds`, sampled every `sample` s, and the times x crosses 0 upwards.
interface Course {
  x: number[];
  up: number[];
}

function course(next: () => number, dt: number, seconds: number, sample: number): Course {
  const every = Math.round(sample / dt);
  const x: number[] = [];
  const up: number[] = [];
  let previous = next();
  for (let k = 1; k <= Math.round(seconds / dt); k++) {
    const now = next();
    if (previous < 0 && now >= 0) up.push(k * dt);
    if (k % every === 0) x.push(now);
    previous = now;
  }
  return { x, up };
}

// The same neuron as an ODE in x and w, by RK4: C v₀ dx/dt = −G_c v₀ x + I + g v₀ (x − x³/3 − w),
// τ_w dw/dt = x + 0.7 − 0.8 w, starting where the Brain starts, at rest with w on its nullcline.
function reference(gain: number, recovery: number, current: number, seconds: number, sample: number): Course {
  const dt = 1e-5;
  let x = 0;
  let w = 0.7 / 0.8;
  const f = (xx: number, ww: number): [number, number] => [
    (-LONE.leak * V0 * xx + current + gain * V0 * (xx - (xx * xx * xx) / 3 - ww)) / (LONE.capacitance * V0),
    (xx + 0.7 - 0.8 * ww) / recovery,
  ];
  return course(
    () => {
      const [k1x, k1w] = f(x, w);
      const [k2x, k2w] = f(x + (dt / 2) * k1x, w + (dt / 2) * k1w);
      const [k3x, k3w] = f(x + (dt / 2) * k2x, w + (dt / 2) * k2w);
      const [k4x, k4w] = f(x + dt * k3x, w + dt * k3w);
      x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
      w += (dt / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
      return x;
    },
    dt,
    seconds,
    sample,
  );
}

const period = (up: number[]): number => (up[up.length - 1] - up[1]) / (up.length - 2);

export interface Held {
  gain: number;
  recovery: number;
  step: number;
  period: number;
  referencePeriod: number;
  // The period's relative error, and the RMS error of x over the first CYCLES cycles as a share of x's range.
  periodError: number;
  courseError: number;
}

// Each step's run against one reference, held by a current in the middle of the cycling window.
export function held(gain: number, recovery: number): Held[] {
  const current = DRIVE * gain * V0; // pA
  // Sampled at the coarsest step, so every run lands on the same instants; long enough for ten cycles.
  const probe = reference(gain, recovery, current, 60, STEPS[0]);
  const cycle = period(probe.up);
  const seconds = Math.min(60, probe.up[1] + 10 * cycle);
  const ref = reference(gain, recovery, current, seconds, STEPS[0]);
  const referencePeriod = period(ref.up);
  // The first CYCLES cycles after the first upstroke.
  const n = Math.round((ref.up[1] + CYCLES * cycle) / STEPS[0]);
  const range = Math.max(...ref.x.slice(0, n)) - Math.min(...ref.x.slice(0, n));
  return STEPS.map((step) => {
    const brain = lone(gain, recovery);
    brain.input[0] = current;
    const run = course(
      () => {
        brain.step(step);
        return (brain.voltage[0] - THRESHOLD) / V0;
      },
      step,
      seconds,
      STEPS[0],
    );
    let sum = 0;
    for (let k = 0; k < n; k++) sum += (run.x[k] - ref.x[k]) ** 2;
    const p = period(run.up);
    return {
      gain,
      recovery,
      step,
      period: p,
      referencePeriod,
      periodError: Math.abs(p - referencePeriod) / referencePeriod,
      courseError: Math.sqrt(sum / n) / range,
    };
  });
}

export interface Excited {
  gain: number;
  recovery: number;
  step: number;
  // Upward crossings of x = 0 a minute, from rest with no current, driven by the noise alone.
  perMinute: number;
}

export function excited(gain: number, recovery: number, step: number, seconds = 600): Excited {
  const brain = lone(gain, recovery);
  brain.noise = NOISE;
  brain.seed = 1;
  // The neuron starts at its threshold; 10 s takes it to rest first.
  for (let k = 0; k < Math.round(10 / step); k++) brain.step(step);
  const run = course(
    () => {
      brain.step(step);
      return (brain.voltage[0] - THRESHOLD) / V0;
    },
    step,
    seconds,
    STEPS[0],
  );
  return { gain, recovery, step, perMinute: run.up.length / (seconds / 60) };
}
