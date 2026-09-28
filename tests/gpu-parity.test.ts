// The CPU side of GPU parity (PLAN §7.2): the Gaussian's and the coloured current's error bounds, and the states both
// brains start from.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { gaussianFrom, hash, uniform } from '../src/sim/brain/rng.ts';
import { NEURAL_STEP } from '../src/sim/numerics.ts';
import { MAX_NEURONS } from '../src/gpu/brainShader.ts';
import {
  againstWall,
  assayField,
  colouredBounds,
  COPIES,
  cpuWorld,
  endVelocities,
  gaussianBound,
  LOOP_SETUPS,
  longWorld,
  loopCases,
  noiseAllowance,
  movedAndTurned,
  OTHER_SEED,
  paritySetup,
  ENDING_COPIES,
  ending,
  TAP_COPIES,
  tapped,
  WALL_COPIES,
  seededWorld,
  variantSetup,
  VARIANT_LESIONS,
} from '../src/gpu/parityCases.ts';
import { NO_NEURON, OUTSIDE, ROD_CONSTANTS } from '../src/gpu/brainShader.ts';
import { awcLayout, checkOdour, checkRing, packLoop, packOdour } from '../src/gpu/loopLayout.ts';
import { currentParams, World } from '../src/sim/world.ts';
import { boyleBody } from '../src/sim/body/body.ts';
import { TOUCH_STEPS } from '../src/sim/touch.ts';
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

describe("the bound on the shader's coloured current", () => {
  const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
  // A state with a current in every neuron, on the registry's values.
  const world = new World(data, currentParams(), { seed: 1 });
  for (let k = 0; k < 400; k++) world.step();
  const before = world.snapshot().brain;
  const setup = (tau: number) => ({ noise: 0.148, seed: 1, network: world.brain.network, noiseCorrelation: tau });

  // The shader's update as f32 arithmetic with correctly rounded exp, sqrt and division, from the state's current
  // rounded to f32, as GpuBrain.restore rounds it.
  function etaF32(eta: number, tau: number, h1: number, h2: number): number {
    const f = Math.fround;
    const decay = f(Math.exp(f(-f(NEURAL_STEP) / f(tau))));
    const spread = f(f(f(0.148) / f(Math.sqrt(f(2 * f(tau))))) * f(Math.sqrt(f(1 - f(decay * decay)))));
    return f(f(f(eta) * decay) + f(spread * gaussianF32(h1, h2)));
  }

  it('covers f32 arithmetic across τ_n', () => {
    expect(before.noise.some((eta) => eta !== 0)).toBe(true);
    for (const tau of [0.02, 0.0632, 0.2]) {
      const decay = Math.exp(-NEURAL_STEP / tau);
      const spread = (0.148 / Math.sqrt(2 * tau)) * Math.sqrt(1 - decay * decay);
      const bounds = colouredBounds(setup(tau), before.steps, before.noise);
      before.noise.forEach((eta, i) => {
        const h1 = hash(1, before.steps, 2 * i);
        const h2 = hash(1, before.steps, 2 * i + 1);
        const error = Math.abs(etaF32(eta, tau, h1, h2) - (eta * decay + spread * gaussianFrom(h1, h2)));
        expect(error).toBeLessThanOrEqual(bounds[i]);
      });
    }
  });

  it("allows the voltage far less than white noise's draw, and nothing to white noise's current", () => {
    const white = { ...setup(0.0632), noiseCorrelation: 0 };
    const coloured = noiseAllowance(setup(0.0632), before.steps, before.noise);
    expect(coloured).toBeGreaterThan(0);
    expect(coloured).toBeLessThan(noiseAllowance(white, before.steps, before.noise) / 10);
    expect(colouredBounds(white, before.steps, before.noise).every((b) => b === 0)).toBe(true);
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

  it('includes variants whose head switch flips and gates, the second with AWCR ON and moved', () => {
    const [, flipping, gating] = LOOP_SETUPS;
    expect(flipping.switchThreshold).toBe(0.5);
    expect(gating.params.driveThreshold).toBe(-1);
    expect(gating.moved).toBe(true);
    expect(loopCases(data, flipping)).toHaveLength(flipping.states + 1);
  });

  it("includes track R's model, whose muscles move and whose B-types oscillate apart from the A-types", () => {
    const r = LOOP_SETUPS[3];
    expect(r.params).toMatchObject({ relativeDrive: true, oscillatorGainB: 1, gapGainB: 0.5, smdGain: 0.5 });
    const cases = loopCases(data, r);
    expect(cases).toHaveLength(r.states + 1);
    const world = cpuWorld(data, cases[1].state, undefined, r);
    expect(Array.from(world.muscles.offset).some((o) => o !== 0)).toBe(true);
    expect(new Set(world.brain.oscillators?.gain).size).toBe(2);
    // The GPU gets each muscle's offset, and the weights its range folds into, as the CPU uses them.
    const packed = packLoop(world);
    expect(packed.nmOffset).toEqual(Float32Array.from(world.muscles.offset));
    expect(packed.nmWeight).toEqual(Float32Array.from(world.muscles.weight));
    expect(packed.nmOffset).toHaveLength(world.muscles.names.length);
    // The muscles aren't pinned off or on in relative units: their activations spread.
    const a = cases[cases.length - 1].state.muscles;
    expect(Math.max(...a) - Math.min(...a)).toBeGreaterThan(0.05);
  });

  it("includes the values the app runs, the registry's, whatever a fit sets", () => {
    const registry = LOOP_SETUPS.find((s) => s.name === 'registry');
    if (!registry) throw new Error('no registry setup');
    expect(registry.params).toEqual(currentParams());
    // Its oscillators are the fit's: a class at gain 0 has none.
    const world = cpuWorld(data, loopCases(data, registry)[1].state, undefined, registry);
    const withB = (currentParams().oscillatorGainB ?? 1) > 0;
    const expected = data.neurons.filter((n) => n.oscillator === 'A' || (withB && n.oscillator === 'B'));
    expect(world.brain.oscillators?.neurons).toHaveLength(expected.length);
  });

  it("runs its long runs on the registry's values, the coloured noise's among them", () => {
    const world = longWorld(data, 2);
    expect(world.brain.noise).toBe(currentParams().noise);
    expect(world.brain.noiseCorrelation).toBe(currentParams().noiseCorrelation);
    expect(world.brain.noiseCorrelation).toBeGreaterThan(0);
  });

  // Builds every setup's states: about 1.3 s here, and past 5 s on a slow CI runner.
  it(
    "puts every world in the assay's odour field, with each AWC ON in some, and T above and below the odour",
    { timeout: 30000 },
    () => {
      const sides = new Set<string>();
      for (const setup of LOOP_SETUPS) {
        const c = loopCases(data, setup)[1];
        const world = cpuWorld(data, c.state, undefined, setup);
        sides.add(world.awcSide);
        expect(world.odour).toBe(assayField());
        expect(world.smell()).toBeGreaterThan(0.5);
      }
      expect([...sides].sort()).toEqual(['AWCL', 'AWCR']);
      // Moved away from the spot, the odour falls below the threshold adapted at the centre; pressed against the
      // wall beside the spot, it rises far above.
      const { radii, wall } = boyleBody();
      const state = loopCases(data)[5].state;
      const moved = cpuWorld(data, movedAndTurned(state, COPIES[0].dx, COPIES[0].dy, 0));
      expect(moved.smell()).toBeLessThan(moved.awc.threshold);
      const pressed = cpuWorld(data, againstWall(state, radii, wall, WALL_COPIES[0]));
      expect(pressed.smell()).toBeGreaterThan(4 * pressed.awc.threshold);
    },
  );

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

  it('packs AWC-ON, where it senses and the odour for the kernel', () => {
    const world = cpuWorld(data, loopCases(data)[0].state);
    const layout = packLoop(world);
    expect(layout.awcOn).toBe(world.awcOn);
    // The nose lies between rods 0 and 1, s·M of the way.
    expect(layout.awcRod).toBe(0);
    expect(layout.scalars.awc_along).toBeCloseTo(world.nose * world.body.params.segments, 15);
    expect([layout.scalars.awc_gain, layout.scalars.awc_scale, layout.scalars.awc_time]).toEqual([
      world.awc.gain,
      world.awc.scale,
      world.awc.time,
    ]);
    const field = assayField();
    const { cells, cell } = field.geometry;
    expect([layout.odour.cells, layout.odour.cell, layout.scalars.odour_cell]).toEqual([cells, cell, cell]);
    layout.odour.values.forEach((v, k) => {
      if (field.inside[k]) expect(v).toBe(Math.fround(field.concentration[k]));
      else expect(v).toBe(OUTSIDE);
    });
    // With no odour, a grid all outside; a lesioned AWC-ON, no neuron.
    const bare = new World(data, LOOP_SETUPS[0].params, { seed: world.brain.seed, lesions: [world.awcSide] });
    const blank = packLoop(bare);
    expect(blank.awcOn).toBe(NO_NEURON);
    expect(Array.from(blank.odour.values)).toEqual([OUTSIDE, OUTSIDE, OUTSIDE, OUTSIDE]);
    expect(() => packOdour({ sample: () => 1 })).toThrow(/OdourField/);
  });

  it("differs from seed to seed only in AWC-ON, which GpuWorld.load takes with the seed's world", () => {
    const a = seededWorld(data, 1);
    const b = seededWorld(data, OTHER_SEED);
    expect(a.awcSide).not.toBe(b.awcSide);
    const [la, lb] = [packLoop(a), packLoop(b)];
    const awc = awcLayout(b);
    expect([lb.awcOn, lb.awcRod]).toEqual([awc.awcOn, awc.awcRod]);
    expect(lb.scalars).toMatchObject(awc.scalars);
    expect(la.scalars.awc_gain).not.toBe(lb.scalars.awc_gain);
    // With AWC-ON's fields taken from the other seed, the layouts are the same.
    expect({ ...la, awcOn: awc.awcOn, awcRod: awc.awcRod, scalars: { ...la.scalars, ...awc.scalars } }).toEqual(lb);
  });

  it('packs the touch receptors and their sets, and taps copies as World.touch does', () => {
    const world = cpuWorld(data, loopCases(data)[0].state);
    const layout = packLoop(world);
    expect(layout.touch).toEqual(world.receptors);
    expect(layout.touchSets).toBe(world.touchSets);
    const state = loopCases(data)[4].state;
    for (const copy of TAP_COPIES) {
      const tappedState = tapped(state, world.receptors, world.touchSets, copy.s);
      const byHand = cpuWorld(data, state);
      byHand.touch(copy.s);
      expect(tappedState).toEqual(byHand.snapshot());
      expect(Array.from(tappedState.touchLeft).some((left) => left > 0)).toBe(true);
    }
  });

  it("ends copies' pulses at their first step, as a world tapped 200 steps before", () => {
    const state = loopCases(data)[4].state;
    for (const copy of ENDING_COPIES) {
      const world = cpuWorld(data, state);
      const ended = ending(state, world.receptors, world.touchSets, copy.s);
      world.touch(copy.s);
      for (let k = 0; k < TOUCH_STEPS; k++) world.step();
      // The same pulses as a world whose tap has just run its course, though the rest has moved on.
      const after = world.snapshot();
      expect([ended.touchLeft, ended.touchCurrent, ended.touchApplied]).toEqual([
        after.touchLeft,
        after.touchCurrent,
        after.touchApplied,
      ]);
      expect(Array.from(ended.touchApplied).some((c) => c > 0)).toBe(true);
    }
  });

  it("refuses a grid for stepping whose outermost ring isn't wholly outside the dish", () => {
    const grid = packOdour(assayField());
    expect(() => checkRing(grid)).not.toThrow();
    const leaky = { ...grid, values: Float32Array.from(grid.values) };
    leaky.values[grid.cells * 7] = 0;
    expect(() => checkRing(leaky)).toThrow(/outermost ring/);
  });

  it('refuses odour grids the kernel could not read', () => {
    const grid = packOdour(null);
    expect(() => checkOdour(grid)).not.toThrow();
    expect(() => checkOdour({ ...grid, cells: 1, values: new Float32Array(1) })).toThrow(/2 to/);
    expect(() => checkOdour({ ...grid, values: new Float32Array(3) })).toThrow(/4 values, not 3/);
    expect(() => checkOdour({ ...grid, cell: 0 })).toThrow(/cells are not/);
    expect(() => checkOdour(packOdour(assayField()), 128)).toThrow(/2 to 128/);
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
