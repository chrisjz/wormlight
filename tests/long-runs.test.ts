// GPU parity's long runs measure each run's crawl as checkpoint 1 measures a trial's (PLAN §7.2, defined 2026-09-29
// before any long run on a partial fit): the long runs' own sampling, run here on the CPU alone, gives a trial's
// records, its measures are checkpoint 1's, and the two sides are compared as the rule sets.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { bodyWave } from '../src/sim/bodyWave.ts';
import { currentParams } from '../src/sim/world.ts';
import { checkpoint1 } from '../src/validation/checkpoints.ts';
import { compareLongRuns, measureLongRun, sampleRun, type LongMeasures } from '../src/validation/longRuns.ts';
import { measuredRun, noMotion, takeMotion } from '../src/validation/motion.ts';
import { runTrial, startingWorld } from '../src/validation/trial.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const params = currentParams();
const postures = [Array.from({ length: 100 }, () => 0)];
const seconds = 25;
const seed = 2;
const record = runTrial(data, { seed, seconds, params, postures });

// A run sampled by the long runs' own schedule, on the CPU alone, as runLongParity samples its CPU side.
async function sampled(): Promise<{ taken: ReturnType<typeof noMotion>; length: number }> {
  const { world } = startingWorld(data, { seed, params, postures });
  const length = world.body.params.segmentLength * world.body.params.segments;
  const k = new Float64Array(world.body.rods);
  const taken = noMotion();
  await sampleRun(
    seconds,
    (steps) => {
      for (let step = 0; step < steps; step++) world.step();
    },
    () => takeMotion(taken, world.body.x, world.body.y, length, k),
  );
  return { taken, length };
}

describe("the long runs' measure", () => {
  it('samples a run as a trial is sampled, bit for bit', async () => {
    const { taken, length } = await sampled();
    // Once at the start, then every 0.1 s.
    expect(taken.mid.length).toBe(Math.round(seconds / 0.1) + 1);
    const run = measuredRun(taken, length);
    expect(Array.from(run.velocity)).toEqual(record.velocity);
    expect(run.mid).toEqual(record.mid);
    expect(run.front).toEqual(record.front);
    expect(run.rear).toEqual(record.rear);
  });

  it("measures a run's crawl as checkpoint 1 measures a trial's, and its body wave after the warm-up", async () => {
    const { taken, length } = await sampled();
    const ours = measureLongRun(taken, length, seconds);
    // The eigenworm basis doesn't reach the kinematics, so an identity basis stands in for it.
    const identity = Array.from({ length: 100 }, (_, i) => Array.from({ length: 100 }, (_, j) => (i === j ? 1 : 0)));
    const theirs = checkpoint1([record], identity).kinematics;
    expect([ours.bouts, ours.speed, ours.frequency]).toEqual([theirs.bouts, theirs.speed, theirs.frequency]);
    // The run has a bout, so the comparison means something.
    expect(ours.bouts).toBeGreaterThan(0);
    expect(ours.finite).toBe(true);
    // The samples after the first 10 s, as the long runs took the body wave before.
    expect(ours.wave).toEqual(bodyWave(taken.mid.slice(101), seconds - 10));
  });
});

describe("the long runs' comparison", () => {
  // A side's runs, crawling at about the given speed and frequency, with a little spread.
  const side = (speed: number, frequency: number, n = 40): LongMeasures[] =>
    Array.from({ length: n }, (_, i) => ({
      finite: true,
      bouts: 1,
      speed: speed * (1 + 0.02 * Math.sin(i)),
      frequency: frequency * (1 + 0.02 * Math.cos(i)),
      wave: { sd: 1.9 * (1 + 0.01 * Math.sin(2 * i)), frequency: 0.24 * (1 + 0.01 * Math.cos(2 * i)) },
    }));
  const none = { cpu: 0, gpu: 0 };

  it('passes two sides within ±5% of the CPU, and fails one outside it', () => {
    expect(compareLongRuns(side(0.068, 0.214), side(0.0682, 0.2145), none).pass).toBe(true);
    const off = compareLongRuns(side(0.068, 0.214), side(0.074, 0.2145), none);
    expect([off.speed?.equivalent, off.frequency?.equivalent, off.pass]).toEqual([false, true, false]);
  });

  it('leaves out and counts the runs without a bout, and fails a side with fewer than two that have one', () => {
    const still = (m: LongMeasures): LongMeasures => ({ ...m, bouts: 0, speed: null, frequency: null });
    const gpu = side(0.068, 0.214).map((m, i) => (i < 5 ? still(m) : m));
    const left = compareLongRuns(side(0.068, 0.214), gpu, none);
    expect(left.boutless).toEqual({ cpu: 0, gpu: 5 });
    expect(left.pass).toBe(true);
    const barely = compareLongRuns(
      side(0.068, 0.214),
      side(0.068, 0.214).map((m, i) => (i < 39 ? still(m) : m)),
      none,
    );
    expect([barely.speed, barely.frequency, barely.spread.speed, barely.pass]).toEqual([null, null, null, false]);
  });

  it('fails a run whose body left the finite numbers, and a solve that failed to converge', () => {
    const broken = side(0.068, 0.214).map((m, i) => (i === 0 ? { ...m, finite: false } : m));
    const result = compareLongRuns(side(0.068, 0.214), broken, none);
    expect([result.broken, result.pass]).toEqual([{ cpu: 0, gpu: 1 }, false]);
    expect(compareLongRuns(side(0.068, 0.214), side(0.068, 0.214), { cpu: 0, gpu: 1 }).pass).toBe(false);
  });
});
