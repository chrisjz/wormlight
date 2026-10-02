// GPU parity's long runs measure each run's crawl as checkpoint 1 measures a trial's (PLAN §7.2, defined 2026-09-29
// before any long run on a partial fit): the same samples, taken at the same times, and the same kinematics.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { NEURAL_STEP } from '../src/sim/numerics.ts';
import { currentParams } from '../src/sim/world.ts';
import { checkpoint1 } from '../src/validation/checkpoints.ts';
import { MOTION_SAMPLE, measuredRun, noMotion, runKinematics, takeMotion } from '../src/validation/motion.ts';
import { runTrial, startingWorld } from '../src/validation/trial.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const params = currentParams();
const postures = [Array.from({ length: 100 }, () => 0)];
const seconds = 25;
const seed = 2;
const record = runTrial(data, { seed, seconds, params, postures });

// A run sampled as runLongParity samples each side: once at the start, then after every 0.1 s of steps.
function sampled() {
  const { world } = startingWorld(data, { seed, params, postures });
  const length = world.body.params.segmentLength * world.body.params.segments;
  const k = new Float64Array(world.body.rods);
  const taken = noMotion();
  takeMotion(taken, world.body.x, world.body.y, length, k);
  const every = Math.round(MOTION_SAMPLE / NEURAL_STEP);
  for (let sample = 1; sample <= Math.round(seconds / MOTION_SAMPLE); sample++) {
    for (let step = 0; step < every; step++) world.step();
    takeMotion(taken, world.body.x, world.body.y, length, k);
  }
  return measuredRun(taken, length);
}

describe("the long runs' measure", () => {
  it('samples a run as a trial is sampled, bit for bit', () => {
    const run = sampled();
    expect(Array.from(run.velocity)).toEqual(record.velocity);
    expect(run.mid).toEqual(record.mid);
    expect(run.front).toEqual(record.front);
    expect(run.rear).toEqual(record.rear);
  });

  it("measures a run's crawl as checkpoint 1 measures a trial's", () => {
    const ours = runKinematics(sampled());
    // The eigenworm basis doesn't reach the kinematics, so an identity basis stands in for it.
    const identity = Array.from({ length: 100 }, (_, i) => Array.from({ length: 100 }, (_, j) => (i === j ? 1 : 0)));
    expect(ours).toEqual(checkpoint1([record], identity).kinematics);
    // The run crawls, so the comparison means something: a bout, a speed and a frequency.
    expect(ours.bouts).toBeGreaterThan(0);
    expect(ours.speed).toBeGreaterThan(0.06);
    expect(ours.frequency).toBeGreaterThan(0.1);
  });
});
