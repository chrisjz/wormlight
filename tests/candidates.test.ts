// The second numerics study's candidates in the world (DECISIONS.md, 2026-09-28): neural sub-steps and the
// noise's grid and colour, each an option whose default leaves the world as it was.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { packLoop } from '../src/gpu/loopLayout.ts';
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
    const white = run(new World(data, currentParams(), { seed: 3 }), 400);
    const coloured = run(new World(data, { ...currentParams(), noiseCorrelation: 0.2 }, { seed: 3 }), 400);
    expect(coloured.brain.noiseCorrelation).toBe(0.2);
    expect(Array.from(coloured.brain.voltage)).not.toEqual(Array.from(white.brain.voltage));
  });

  it('are refused by the GPU, which runs neither', () => {
    expect(() => packLoop(new World(data, currentParams(), { neuralSubsteps: 2 }))).toThrow(/GPU/);
    expect(() => packLoop(new World(data, { ...currentParams(), noiseCorrelation: 0.2 }))).toThrow(/GPU/);
    expect(() => packLoop(new World(data, currentParams(), { noiseGrid: NEURAL_STEP / 2 }))).toThrow(/GPU/);
  });
});
