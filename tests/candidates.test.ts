// The second numerics study's candidates in the world (DECISIONS.md, 2026-09-28): neural sub-steps and the
// noise's grid and colour, each an option whose default leaves the world as it was.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { checkGpuWorld, packLoop } from '../src/gpu/loopLayout.ts';
import type { BrainState } from '../src/sim/brain/brain.ts';
import { NEURAL_STEP } from '../src/sim/numerics.ts';
import { currentParams, World } from '../src/sim/world.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const run = (world: World, steps: number): World => {
  for (let k = 0; k < steps; k++) world.step();
  return world;
};

describe("the study's candidates", () => {
  it('leave the world as it was by default, and at one sub-step on a grid of the step', () => {
    const plain = run(new World(data, currentParams(), { seed: 3 }), 200);
    const options = run(new World(data, currentParams(), { seed: 3, neuralSubsteps: 1 }), 200);
    expect(Array.from(options.brain.voltage)).toEqual(Array.from(plain.brain.voltage));
    // A grid of the step draws the same numbers, to rounding.
    const gridded = run(new World(data, currentParams(), { seed: 3, noiseGrid: NEURAL_STEP }), 200);
    for (let i = 0; i < plain.brain.n; i++) expect(gridded.brain.voltage[i]).toBeCloseTo(plain.brain.voltage[i], 6);
  });

  it('step the brain k times a loop step, keeping the world clock in loop steps', () => {
    const world = run(new World(data, currentParams(), { seed: 3, neuralSubsteps: 4 }), 10);
    expect(world.brain.steps).toBe(40);
    expect(world.time).toBeCloseTo(10 * NEURAL_STEP, 12);
    expect(() => new World(data, currentParams(), { neuralSubsteps: 1.5 })).toThrow(/whole number/);
  });

  it('colour the noise when given a correlation time, and move the brain differently', () => {
    const white = run(new World(data, { ...currentParams(), noiseCorrelation: 0 }, { seed: 3 }), 400);
    const coloured = run(new World(data, { ...currentParams(), noiseCorrelation: 0.2 }, { seed: 3 }), 400);
    expect(coloured.brain.noiseCorrelation).toBe(0.2);
    expect(Array.from(coloured.brain.voltage)).not.toEqual(Array.from(white.brain.voltage));
  });

  it('carry the coloured current in a snapshot, so a restored world goes on as the unbroken one', () => {
    const params = { ...currentParams(), noiseCorrelation: 0.05 };
    const unbroken = run(new World(data, params, { seed: 3 }), 600);
    const halfway = run(new World(data, params, { seed: 3 }), 300);
    const restored = new World(data, params, { seed: 3 });
    restored.restore(halfway.snapshot());
    run(restored, 300);
    expect(Array.from(restored.brain.voltage)).toEqual(Array.from(unbroken.brain.voltage));
    expect(halfway.snapshot().brain.noise.some((x) => x !== 0)).toBe(true);
  });

  it("refuse a state whose noise current doesn't fit, or that has none", () => {
    const world = run(new World(data, { ...currentParams(), noiseCorrelation: 0.05 }, { seed: 3 }), 10);
    const state = world.snapshot();
    const brain = (noise: Float64Array | undefined) => ({ ...state, brain: { ...state.brain, noise } as BrainState });
    expect(() => world.restore(brain(new Float64Array(3)))).toThrow(/number of neurons/);
    expect(() => world.restore(brain(undefined))).toThrow(/predates the coloured noise/);
  });

  it('refuse a negative correlation time', () => {
    expect(() => new World(data, { ...currentParams(), noiseCorrelation: -0.1 })).toThrow(/negative/);
  });

  it('are refused by the GPU, sub-steps and noise grids alike, however a world reaches it; coloured and white noise it runs', () => {
    // GpuWorld.create packs a world and GpuWorld.load takes one in; both check it first.
    expect(() => checkGpuWorld(new World(data, currentParams(), { neuralSubsteps: 2 }))).toThrow(/GPU/);
    expect(() => checkGpuWorld(new World(data, currentParams()))).not.toThrow();
    expect(() => checkGpuWorld(new World(data, { ...currentParams(), noiseCorrelation: 0 }))).not.toThrow();
    expect(() => packLoop(new World(data, currentParams(), { neuralSubsteps: 2 }))).toThrow(/GPU/);
    expect(() => packLoop(new World(data, currentParams(), { noiseGrid: NEURAL_STEP / 2 }))).toThrow(/GPU/);
  });
});
