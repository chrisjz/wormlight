import { describe, expect, it } from 'vitest';
import { drawNoise, type NoiseSettings } from './noise.ts';
import { gaussian } from './rng.ts';

const n = 50;
const settings = (correlation: number, grid: number): NoiseSettings => ({
  seed: 7,
  intensity: 0.13,
  correlation,
  grid,
});

describe('the noise drawn from a grid', () => {
  it('is the white noise the Brain draws itself when the grid is the step', () => {
    const dt = 0.0025;
    const out = new Float64Array(n);
    drawNoise(out, new Float64Array(n), settings(0, dt), 12, dt);
    for (let i = 0; i < n; i++) expect(out[i]).toBeCloseTo((0.13 / Math.sqrt(dt)) * gaussian(7, 12, i), 12);
  });

  it('gives a step the mean of its two half steps, for white noise, so runs at dt and dt/2 share it', () => {
    const dt = 0.0025;
    const whole = new Float64Array(n);
    const first = new Float64Array(n);
    const second = new Float64Array(n);
    drawNoise(whole, new Float64Array(n), settings(0, dt / 2), 5, dt);
    drawNoise(first, new Float64Array(n), settings(0, dt / 2), 10, dt / 2);
    drawNoise(second, new Float64Array(n), settings(0, dt / 2), 11, dt / 2);
    for (let i = 0; i < n; i++) expect(whole[i]).toBeCloseTo((first[i] + second[i]) / 2, 10);
  });

  it('reaches the same coloured current at a step as two half steps do, exactly', () => {
    const dt = 0.0025;
    const [a, b] = [new Float64Array(n), new Float64Array(n)];
    const out = new Float64Array(n);
    for (let s = 0; s < 40; s++) drawNoise(out, a, settings(0.2, dt / 2), s, dt);
    for (let s = 0; s < 80; s++) drawNoise(out, b, settings(0.2, dt / 2), s, dt / 2);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("settles the coloured current to σ_n²/2τ_n's variance, tending to white noise as τ_n shrinks", () => {
    const dt = 0.0025;
    const tau = 0.2;
    const coloured = new Float64Array(n);
    const out = new Float64Array(n);
    let sum = 0;
    let squares = 0;
    let count = 0;
    for (let s = 0; s < 20000; s++) {
      drawNoise(out, coloured, settings(tau, 0), s, dt);
      if (s < 2000) continue;
      for (const x of out) {
        sum += x;
        squares += x * x;
        count++;
      }
    }
    const variance = squares / count - (sum / count) ** 2;
    expect(variance / (0.13 ** 2 / (2 * tau))).toBeGreaterThan(0.95);
    expect(variance / (0.13 ** 2 / (2 * tau))).toBeLessThan(1.05);
  });

  it('refuses a grid that does not divide the step', () => {
    expect(() => drawNoise(new Float64Array(n), new Float64Array(n), settings(0, 0.001), 0, 0.0025)).toThrow(/divide/);
  });
});
