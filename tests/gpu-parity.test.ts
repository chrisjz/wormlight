// The CPU side of GPU parity (PLAN §7.2): the Gaussian's error bound and the states both brains start from.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { hash, uniform } from '../src/sim/brain/rng.ts';
import { MAX_NEURONS } from '../src/gpu/brainShader.ts';
import {
  againstWall,
  cpuWorld,
  endVelocities,
  gaussianBound,
  LOOP_SETUPS,
  loopCases,
  movedAndTurned,
  paritySetup,
  WALL_COPIES,
  seededWorld,
  variantSetup,
  VARIANT_LESIONS,
} from '../src/gpu/parityCases.ts';
import { ROD_CONSTANTS } from '../src/gpu/brainShader.ts';
import { packLoop } from '../src/gpu/loopLayout.ts';
import { boyleBody } from '../src/sim/body/body.ts';
import { readJson } from './checks.ts';

// The shader's Box–Muller as f32 arithmetic with correctly rounded log, sqrt and cos: the best a GPU can do.
function gaussianF32(h1: number, h2: number): number {
  const f = Math.fround;
  const r = f(Math.sqrt(f(-2 * f(Math.log(uniform(h1))))));
  const angle = f(f(Math.PI) * f(2 * uniform(h2) - 1));
  return f(r * f(-f(Math.cos(angle))));
}

const exact = (h1: number, h2: number): number =>
  Math.sqrt(-2 * Math.log(uniform(h1))) * Math.cos(2 * Math.PI * uniform(h2));

describe("the bound on the shader's Gaussian", () => {
  const top = 2 ** 32 - 1;
  const pairs = [
    [0, 0],
    [0, top],
    [top, 0],
    [top, top],
    ...Array.from({ length: 2000 }, (_, k) => [hash(9, k, 0), hash(9, k, 1)]),
  ];

  it('covers f32 arithmetic, the edge hashes included', () => {
    for (const [h1, h2] of pairs) {
      expect(Math.abs(gaussianF32(h1, h2) - exact(h1, h2))).toBeLessThanOrEqual(gaussianBound(h1, h2));
    }
  });

  it('is dominated by the 2⁻¹¹ WGSL allows cos, so stays small', () => {
    for (const [h1, h2] of pairs) expect(gaussianBound(h1, h2)).toBeLessThan(6 * 2 ** -11);
  });
});

describe('the parity states', () => {
  const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
  const setup = paritySetup(data);

  it('are the rest state and twenty from a closed-loop run, each with its input and history', () => {
    expect(setup.cases).toHaveLength(21);
    expect(setup.cases[0].state.history).toBe(0);
    for (const c of setup.cases.slice(1)) {
      expect(c.state.history).toBeGreaterThan(0);
      expect(c.input.some((x) => x !== 0)).toBe(true);
    }
  });

  it('are active: every state moves voltages by millivolts from the last', () => {
    for (let k = 2; k < setup.cases.length; k++) {
      const a = setup.cases[k - 1].state.voltage;
      const b = setup.cases[k].state.voltage;
      expect(Math.max(...a.map((v, i) => Math.abs(v - b[i])))).toBeGreaterThan(1);
    }
  });

  it('include a lesioned case without oscillators or noise, on the intact thresholds', () => {
    const variant = variantSetup(setup);
    const count = (n: typeof setup.network): number => n.gap.index.length + n.chemical.index.length;
    expect(count(variant.network)).toBeLessThan(count(setup.network));
    for (const name of VARIANT_LESIONS) {
      const i = setup.network.names.indexOf(name);
      expect(variant.network.gap.start[i + 1] - variant.network.gap.start[i]).toBe(0);
      expect(variant.network.chemical.start[i + 1] - variant.network.chemical.start[i]).toBe(0);
    }
    expect(variant.threshold).toBe(setup.threshold);
    expect(variant.oscillators).toBeNull();
    expect(variant.noise).toBe(0);
    expect(variant.cases[0].state.recovery).toHaveLength(0);
  });
});

describe('the GPU brain', () => {
  it('holds the whole connectome in one workgroup', () => {
    const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
    expect(MAX_NEURONS).toBeGreaterThanOrEqual(data.neurons.length);
  });
});

describe("the loop's parity", () => {
  const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));

  it('takes whole worlds: the rest world and twenty from its closed loop', () => {
    const cases = loopCases(data);
    expect(cases).toHaveLength(21);
    expect(cases[0].state.previousCurvature).toBeNull();
    for (const c of cases.slice(1)) {
      expect(c.state.previousCurvature).not.toBeNull();
      expect(c.state.x).toHaveLength(49);
    }
    // They differ, body and muscles: each is a different moment of the loop.
    for (let k = 2; k < cases.length; k++) {
      expect(cases[k].state.x).not.toEqual(cases[k - 1].state.x);
      expect(cases[k].state.muscles).not.toEqual(cases[k - 1].state.muscles);
    }
  });

  it('includes variants whose head switch flips and gates', () => {
    const [, flipping, gating] = LOOP_SETUPS;
    expect(flipping.switchThreshold).toBe(0.5);
    expect(gating.params.driveThreshold).toBe(-1);
    expect(loopCases(data, flipping)).toHaveLength(flipping.states + 1);
  });

  it('moves and turns copies of a state without touching anything else', () => {
    const c = loopCases(data)[3];
    const copy = movedAndTurned(c.state, 0.03, -0.03, 50);
    expect(copy.x[7]).toBeCloseTo(c.state.x[7] + 0.03, 15);
    expect(copy.y[7]).toBeCloseTo(c.state.y[7] - 0.03, 15);
    expect(copy.theta[7]).toBeCloseTo(c.state.theta[7] + 100 * Math.PI, 12);
    expect(copy.brain).toBe(c.state.brain);
    expect(copy.muscles).toBe(c.state.muscles);
  });

  it("presses copies against the dish's wall, head on and lying along it, which the reference pushes back", () => {
    const { radii, wall } = boyleBody();
    const state = loopCases(data)[5].state;
    for (const copy of WALL_COPIES) {
      const pressed = againstWall(state, radii, wall, copy);
      const depths = Array.from(pressed.x, (x, i) => Math.hypot(x, pressed.y[i]) - (wall - radii[i]));
      expect(Math.max(...depths), copy.label).toBeCloseTo(copy.depth, 12);
      // Only its place and heading change, the body moved and turned as one: its shape is the same.
      const shape = (x: ArrayLike<number>, y: ArrayLike<number>): number[] =>
        Array.from({ length: x.length - 1 }, (_, i) => Math.hypot(x[i + 1] - x[i], y[i + 1] - y[i]));
      shape(pressed.x, pressed.y).forEach((d, i) => expect(d).toBeCloseTo(shape(state.x, state.y)[i], 12));
      expect(pressed.brain).toBe(state.brain);
      expect(pressed.muscles).toBe(state.muscles);
      // The reference pushes the deepest rod back out along the wall's normal.
      const world = cpuWorld(data, pressed);
      const deepest = depths.indexOf(Math.max(...depths));
      const v = world.body.rates();
      const rho = Math.hypot(pressed.x[deepest], pressed.y[deepest]);
      expect((v[3 * deepest] * pressed.x[deepest] + v[3 * deepest + 1] * pressed.y[deepest]) / rho).toBeLessThan(0);
    }
    // Lying along the wall, several rods meet it, where its normal isn't along an axis.
    const along = againstWall(state, radii, wall, WALL_COPIES[1]);
    const touching = Array.from(along.x, (x, i) => Math.hypot(x, along.y[i]) - (wall - radii[i])).filter(
      (d) => d > -1e-6,
    );
    expect(touching.length).toBeGreaterThan(3);
  });

  it("packs the dish's wall for the kernel, W² exact in its parts, and refuses a dish it can't hold", () => {
    const world = cpuWorld(data, loopCases(data)[0].state);
    const layout = packLoop(world);
    const { radii, wall } = world.body.params;
    expect(layout.scalars.wall).toBe(wall);
    for (let i = 0; i < radii.length; i++) {
      const [hi, lo, fraction] = [2, 3, 4].map((k) => layout.rodConstants[ROD_CONSTANTS * i + k]);
      expect(hi * 65536 + lo + fraction).toBeCloseTo((wall - radii[i]) ** 2 * 2 ** 40, 3);
      expect(layout.rodConstants[ROD_CONSTANTS * i]).toBe(Math.fround(radii[i]));
    }
    const params = world.body.params as { wall: number };
    for (const bad of [0.1, Infinity, 0]) {
      params.wall = bad;
      expect(() => packLoop(world)).toThrow(/dish of radius/);
    }
  });

  it("reports each rod's end points' velocities: how its dorsal and ventral points move", () => {
    // Against the points themselves, centre ± R (cos θ, sin θ), moved a little along the velocities.
    const world = seededWorld(data, 1);
    const rods = world.body.rods;
    const { radii } = world.body.params;
    const x = Float64Array.from({ length: rods }, (_, i) => i * 2e-5);
    const theta = Float64Array.from({ length: rods }, (_, i) => 0.3 + 0.01 * i);
    const v = Float64Array.from({ length: 3 * rods }, (_, k) => (k % 3 === 2 ? 0.4 : 1e-4) * Math.sin(k));
    const ends = endVelocities(world, theta, v);
    const h = 1e-6;
    for (const i of [0, 5, 48]) {
      for (const [side, sign] of [
        [0, 1],
        [1, -1],
      ]) {
        const point = (t: number): [number, number] => [
          x[i] + t * v[3 * i] + sign * radii[i] * Math.cos(theta[i] + t * v[3 * i + 2]),
          t * v[3 * i + 1] + sign * radii[i] * Math.sin(theta[i] + t * v[3 * i + 2]),
        ];
        const [ax, ay] = point(-h);
        const [bx, by] = point(h);
        expect(ends[4 * i + 2 * side]).toBeCloseTo((bx - ax) / (2 * h), 9);
        expect(ends[4 * i + 2 * side + 1]).toBeCloseTo((by - ay) / (2 * h), 9);
      }
    }
  });
});
