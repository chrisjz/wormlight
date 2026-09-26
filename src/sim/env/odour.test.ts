import { describe, expect, it } from 'vitest';
import { PARAMS } from '../../science/params.ts';
import {
  CAPTURE_RADIUS,
  DISH_RADIUS,
  LAWN_RADIUS,
  RELEASE_RATE,
  SPOT,
  releaseRate,
  sources,
  steadyField,
} from './dish.ts';
import { DIFFUSION, LOSS, OdourField } from './odour.ts';

// Simpson's rule on [a, b].
function simpson(f: (t: number) => number, a: number, b: number, n = 4000): number {
  let sum = f(a) + f(b);
  for (let k = 1; k < n; k++) sum += (k % 2 === 1 ? 4 : 2) * f(a + ((b - a) * k) / n);
  return (sum * (b - a)) / (3 * n);
}
// The modified Bessel functions, from their integral forms.
const top = (x: number): number => Math.acosh(60 / x + 1);
const besselK0 = (x: number): number => simpson((t) => Math.exp(-x * Math.cosh(t)), 0, top(x));
const besselK1 = (x: number): number => simpson((t) => Math.exp(-x * Math.cosh(t)) * Math.cosh(t), 0, top(x));
const besselI0 = (x: number): number => simpson((t) => Math.exp(x * Math.cos(t)), 0, Math.PI) / Math.PI;
const besselI1 = (x: number): number => simpson((t) => Math.exp(x * Math.cos(t)) * Math.cos(t), 0, Math.PI) / Math.PI;

describe('the odour field', () => {
  it('takes its loss from the decay length and D from Lugg', () => {
    expect(DIFFUSION).toBeCloseTo(9.1e-6, 15);
    expect(Math.sqrt(DIFFUSION / LOSS)).toBeCloseTo(0.03, 12);
  });

  it(
    "spreads a point release as the analytic 2D Gaussian, nematode's Fick kernel, with the loss",
    { timeout: 30000 },
    () => {
      // Far from any wall: a dish wider than the grid, so only the grid's edge, 5 cm away, bounds it.
      const field = new OdourField({ cells: 256, cell: 4e-4, dish: 1 });
      const mass = 1; // µM·m²
      const gaussian = (x: number, y: number, t: number): number =>
        (mass / (4 * Math.PI * DIFFUSION * t)) * Math.exp(-(x * x + y * y) / (4 * DIFFUSION * t)) * Math.exp(-LOSS * t);
      // Start from the Gaussian at 5 s, 1 cm wide, and step to 10 s.
      for (let j = 0; j < 256; j++) {
        for (let i = 0; i < 256; i++) {
          const [x, y] = field.centre(i, j);
          if (field.inside[j * 256 + i]) field.concentration[j * 256 + i] = gaussian(x, y, 5);
        }
      }
      field.step(5);
      for (const r of [0, 0.004, 0.01, 0.02]) {
        expect(field.sample(r, 0) / gaussian(r, 0, 10)).toBeCloseTo(1, 2);
      }
    },
  );

  it('settles to the exact steady state of a point source at the centre of a dish whose wall reflects', () => {
    // Q/(2πD)·[K₀(r/λ) + (K₁(R/λ)/I₁(R/λ))·I₀(r/λ)]: the free-space solution and the wall's reflection, for a
    // circle of radius R. The grid's stepped circle matches it within 0.06% from 3 mm to the wall (0.053% at worst).
    const field = new OdourField();
    field.addSource({ x: 0, y: 0, rate: 1 });
    const { residual } = field.steady();
    expect(residual).toBeLessThan(1e-9);
    const lambda = Math.sqrt(DIFFUSION / LOSS);
    const reflected = besselK1(DISH_RADIUS / lambda) / besselI1(DISH_RADIUS / lambda);
    for (const r of [0.003, 0.005, 0.01, 0.02, 0.03, 0.04, 0.048]) {
      const exact = (besselK0(r / lambda) + reflected * besselI0(r / lambda)) / (2 * Math.PI * DIFFUSION);
      for (const [x, y] of [
        [r, 0],
        [0, -r],
        [r / Math.SQRT2, r / Math.SQRT2],
      ]) {
        expect(Math.abs(field.sample(x, y) / exact - 1), `${r} m`).toBeLessThan(1e-3);
      }
    }
  });

  it('loses nothing at the wall: odour changes only by what the sources release and the loss takes', () => {
    const field = new OdourField();
    field.addSource({ x: SPOT[0], y: SPOT[1], rate: 2e-4, radius: LAWN_RADIUS });
    field.step(20);
    const before = field.total();
    const dt = 0.004;
    field.step(dt);
    // One explicit step: d(total)/dt = Q − k·total, with no flux through the wall.
    expect((field.total() - before) / dt).toBeCloseTo(2e-4 - LOSS * before, 12);
  });

  it('holds its steady state when stepped', { timeout: 30000 }, () => {
    const field = steadyField('lawn');
    const at = field.sample(0, 0);
    field.step(1);
    expect(field.sample(0, 0) / at).toBeCloseTo(1, 7);
  });
});

describe("the dish's layout", () => {
  it('puts the spot 0.5 cm from the edge and the control opposite, as Bargmann et al. did', () => {
    expect(DISH_RADIUS).toBeCloseTo(0.05, 12);
    expect(SPOT[0]).toBeCloseTo(0.045, 12);
    expect(LAWN_RADIUS).toBeCloseTo(PARAMS.lawnDiameter.value * 5e-3, 12);
  });

  it(
    'sets the release rate so the concentration where a worm reaches the capture circle is K',
    { timeout: 30000 },
    () => {
      const rate = releaseRate();
      // The app takes it as a constant.
      expect(RELEASE_RATE / rate).toBeCloseTo(1, 5);
      const field = steadyField('assay', rate);
      expect(field.sample(SPOT[0] - CAPTURE_RADIUS, 0)).toBeCloseTo(PARAMS.awcAdaptationScale.value, 9);
      // The wall reflects odour, so the rate is below the free-space one, 2πDK/K₀(r/λ).
      const free = (2 * Math.PI * DIFFUSION * PARAMS.awcAdaptationScale.value) / besselK0(CAPTURE_RADIUS / 0.03);
      expect(rate).toBeLessThan(free);
      // In the registry's units, µM·cm²/s.
      expect(rate * 1e4).toBeCloseTo(0.953, 2);
    },
  );

  it('spreads the lawn over a 1 cm disc at the spot, at the same total rate', () => {
    const [lawn] = sources('lawn', 1);
    expect(lawn).toEqual({ x: SPOT[0], y: SPOT[1], rate: 1, radius: LAWN_RADIUS });
    const field = new OdourField();
    field.addSource(lawn);
    let total = 0;
    for (const s of field.source) total += s;
    expect(total * 4e-4 * 4e-4).toBeCloseTo(1, 12);
  });
});
