// The noise currents the second numerics study tests (DECISIONS.md, 2026-09-28), drawn from a path on a grid so
// that runs at different steps, each a multiple of the grid, share their noise. The model itself runs on the
// Brain's own white noise, drawn each step; the GPU has only that.

import { gaussian } from './rng.ts';

export interface NoiseSettings {
  seed: number;
  // σ_n, in current·√s.
  intensity: number;
  // τ_n in s: 0 for white noise, above 0 for an Ornstein–Uhlenbeck current, τ_n dη = −η dt + σ_n dW.
  correlation: number;
  // The grid's step in s, or 0 for a grid of the step itself.
  grid: number;
}

// Each neuron's noise current over a step of `dt`, the `steps`-th at that size since the state was set, into `out`:
// white noise's increment over the step, σ_n ΔW/dt with ΔW the sum of the grid's increments; or the coloured
// current at the step's end, its state in `coloured` updated exactly across the grid's steps.
export function drawNoise(
  out: Float64Array,
  coloured: Float64Array,
  settings: NoiseSettings,
  steps: number,
  dt: number,
): void {
  const { seed, intensity, correlation, grid } = settings;
  const h = grid > 0 ? grid : dt;
  const m = Math.round(dt / h);
  if (m < 1 || Math.abs(m * h - dt) > 1e-9 * dt) throw new Error('the noise grid must divide the step');
  // The grid's index at the step's start.
  const base = steps * m;
  const n = out.length;
  if (correlation === 0) {
    const scale = (intensity * Math.sqrt(h)) / dt;
    for (let i = 0; i < n; i++) {
      let w = 0;
      for (let j = 0; j < m; j++) w += gaussian(seed, base + j, i);
      out[i] = scale * w;
    }
    return;
  }
  const decay = Math.exp(-h / correlation);
  const spread = (intensity / Math.sqrt(2 * correlation)) * Math.sqrt(1 - decay * decay);
  for (let i = 0; i < n; i++) {
    let eta = coloured[i];
    for (let j = 0; j < m; j++) eta = eta * decay + spread * gaussian(seed, base + j, i);
    coloured[i] = eta;
    out[i] = eta;
  }
}
