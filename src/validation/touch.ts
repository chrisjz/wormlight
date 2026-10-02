// Checkpoints 2 and 3's touches on the CPU reference (PLAN §7.4, "Checkpoints 2 and 3's touches"; DECISIONS.md,
// 2026-10-02): one touch a worm, during forward crawling. Each seed's trial runs from its real posture, as checkpoint
// 1's do, until the first 0.1 s sample from an earliest time its seed draws at which every velocity sample whose
// window lies within the 2 s before was forward. There the world forks three ways: a copy touched at the front, for
// checkpoint 2, one at the back, for checkpoint 3, and a sham twin, which restarts the integrator where the touched
// copies' currents switch, with no current of its own. Each runs 3.5 s on. A trial with no such moment by 116.5 s
// gives no touch.

import type { WormlightData } from '../data/schema.ts';
import { hash, uniform } from '../sim/brain/rng.ts';
import { NEURAL_STEP } from '../sim/numerics.ts';
import { mcnemarGreater, signedRankGreater, type SignedRank } from '../sim/stats.ts';
import { BACK, FRONT } from '../sim/touch.ts';
import { World } from '../sim/world.ts';
import { CHECKPOINT_0_TOUCH, meanVelocity, reversalFrom, TOUCH_NEEDS } from './checkpoints.ts';
import {
  MEASURE_FROM,
  MOTION_FLOOR,
  MOTION_SAMPLE,
  VELOCITY_WINDOW,
  forwardVelocity,
  noMotion,
  reversals,
  takeMotion,
} from './motion.ts';
import { startingWorld, type StartOptions } from './trial.ts';

// The span the earliest touch is drawn from (s), and the hash lane it is drawn on, which no other draw uses
// (DECISIONS.md, 2026-10-02).
export const EARLIEST = [20, 100] as const;
export const TOUCH_LANE = 0xfffffffa;
// The 2 s before a touch that must be forward, and the run each copy makes after it: a reversal's 2 s to start and
// 1 s to count, and half a velocity window, 3.5 s.
const BEFORE = CHECKPOINT_0_TOUCH.window;
export const COPY_SECONDS = TOUCH_NEEDS;

// The earliest a seed's worm may be touched (s).
export const earliestTouch = (seed: number): number =>
  EARLIEST[0] + (EARLIEST[1] - EARLIEST[0]) * uniform(hash(seed, 0, TOUCH_LANE));

// One copy's run after the touch: the receptors its touch reached, none for a sham; whether its body stayed finite and
// its solves that didn't converge; whether a reversal started within 2 s, and when its first backward sample was (s
// after the touch); and its mean velocity over the 2 s after.
export interface CopyOutcome {
  reached: string[];
  finite: boolean;
  unconverged: number;
  reversal: boolean;
  latency: number | null;
  // Null if its body left the finite numbers.
  after: number | null;
}

export interface TouchTrialRecord {
  seed: number;
  posture: number;
  turn: number;
  earliest: number;
  // The touch's time (s), on a 0.1 s sample, or null if the trial found no moment; then no copy ran.
  time: number | null;
  // Whether the trial's body stayed finite until the touch, or its end.
  finite: boolean;
  unconverged: number;
  // The mean velocity over the 2 s before the touch, which the copies share.
  before: number | null;
  front: CopyOutcome | null;
  back: CopyOutcome | null;
  // The sham twin of each touched copy: one sham for both when both touches restart the integrator, as an intact
  // worm's do, and one each otherwise, a touch that reaches no receptor being paired with a sham that doesn't restart.
  frontSham: CopyOutcome | null;
  backSham: CopyOutcome | null;
  // Whether the two touched copies share one sham twin; records lose that identity on their way between processes.
  sharedSham: boolean;
}

export interface TouchTrialOptions extends StartOptions {
  // The trial's length (s): 120, as checkpoint 1's.
  seconds: number;
}

// A world in the state `from` is in, its own copy, drawing the same noise.
function copyOf(data: WormlightData, options: TouchTrialOptions, posture: readonly number[], from: World): World {
  const copy = new World(data, options.params, {
    seed: options.seed,
    silenced: options.silenced,
    lesions: options.lesions,
    network: options.network,
    neuralSubsteps: options.neuralSubsteps,
    noiseGrid: options.noiseGrid,
    posture,
    odour: options.odour,
  });
  copy.restore(from.snapshot());
  return copy;
}

export function runTouchTrial(data: WormlightData, options: TouchTrialOptions): TouchTrialRecord {
  const { seed, seconds } = options;
  const { world, start, posture } = startingWorld(data, options);
  const { body } = world;
  const length = body.params.segmentLength * body.params.segments;
  const every = Math.round(MOTION_SAMPLE / NEURAL_STEP);
  const k = new Float64Array(body.rods);
  const taken = noMotion();
  takeMotion(taken, body.x, body.y, length, k);
  const earliest = earliestTouch(seed);
  const latest = seconds - COPY_SECONDS;
  const record: TouchTrialRecord = {
    seed,
    posture: start.index,
    turn: start.turn,
    earliest,
    time: null,
    finite: true,
    unconverged: 0,
    before: null,
    front: null,
    back: null,
    frontSham: null,
    backSham: null,
    sharedSham: false,
  };
  const finite = (w: World): boolean => w.body.x.every(Number.isFinite) && w.body.y.every(Number.isFinite);
  const steps = Math.round(latest / NEURAL_STEP);
  for (let s = 1; s <= steps; s++) {
    world.step();
    if (!finite(world)) {
      record.finite = false;
      break;
    }
    if (s % every !== 0) continue;
    takeMotion(taken, body.x, body.y, length, k);
    const t = s * NEURAL_STEP;
    if (t < earliest - 1e-9) continue;
    // Every velocity sample whose window lies within the 2 s before t, all forward.
    const velocity = forwardVelocity(taken.centroid, taken.head, length);
    if (!forwardBefore(velocity, t)) continue;
    record.time = Number(t.toFixed(1));
    record.before = meanVelocity(velocity, t - BEFORE, t);
    // A copy run 3.5 s on, sampled as the trial is, its samples after the trial's own up to the touch.
    const run = (copy: World, reached: string[]): CopyOutcome => {
      const unconverged = copy.brain.unconverged;
      const c = [...taken.centroid];
      const h = [...taken.head];
      let ok = true;
      for (let j = 1; j <= Math.round(COPY_SECONDS / NEURAL_STEP); j++) {
        copy.step();
        if (!finite(copy)) {
          ok = false;
          break;
        }
        if (j % every === 0) {
          let [x, y] = [0, 0];
          for (let i = 0; i < copy.body.rods; i++) [x, y] = [x + copy.body.x[i], y + copy.body.y[i]];
          c.push(x / copy.body.rods, y / copy.body.rods);
          h.push(copy.body.x[0], copy.body.y[0]);
        }
      }
      const v = forwardVelocity(c, h, length);
      const reversal = ok && reversalFrom(v, t);
      return {
        reached,
        finite: ok,
        unconverged: copy.brain.unconverged - unconverged,
        reversal,
        latency: reversal ? firstBackward(v, t) : null,
        after: ok ? meanVelocity(v, t, t + BEFORE) : null,
      };
    };
    const touched = (at: number): CopyOutcome => {
      const copy = copyOf(data, options, posture, world);
      return run(
        copy,
        copy.touch(at).map((r) => r.name),
      );
    };
    const sham = (at: number): CopyOutcome => {
      const copy = copyOf(data, options, posture, world);
      copy.sham(at);
      return run(copy, []);
    };
    record.front = touched(FRONT);
    record.back = touched(BACK);
    // Each touched copy's sham twin restarts the integrator where its touch switches its currents: an intact worm's
    // touches both do, at the same steps, so one sham serves both; a touch that reaches no receptor given a current
    // doesn't, and is paired with a sham that doesn't either.
    const [frontRestarts, backRestarts] = [world.touchRestarts(FRONT), world.touchRestarts(BACK)];
    record.frontSham = sham(FRONT);
    record.sharedSham = frontRestarts === backRestarts;
    record.backSham = record.sharedSham ? record.frontSham : sham(BACK);
    break;
  }
  record.unconverged = world.brain.unconverged;
  return record;
}

// Whether every velocity sample whose centred window lies within the 2 s before t was forward.
export function forwardBefore(velocity: ArrayLike<number>, t: number): boolean {
  const index = (time: number): number => Math.round((time - MEASURE_FROM) / MOTION_SAMPLE);
  const [a, b] = [index(t - BEFORE + VELOCITY_WINDOW / 2), index(t - VELOCITY_WINDOW / 2)];
  if (a < 0 || b >= velocity.length || b < a) return false;
  for (let i = a; i <= b; i++) if (!(velocity[i] > MOTION_FLOOR)) return false;
  return true;
}

// The time after t (s) of the first backward sample of the first reversal that starts within 2 s of it.
function firstBackward(velocity: ArrayLike<number>, t: number): number | null {
  const index = (time: number): number => Math.round((time - MEASURE_FROM) / MOTION_SAMPLE);
  const [a, b] = [index(t), index(t + BEFORE)];
  const r = reversals(velocity).find((run) => run.start >= a && run.start <= b);
  return r ? (r.start - a) * MOTION_SAMPLE : null;
}

// Checkpoints 2 and 3's levels (PLAN §7.4): 50 touches from up to 100 seeds; checkpoint 2 passes with a reversal after
// 70% of the touches, more often than after their sham twins by McNemar's test and at least three times as often, and
// is partial from 40% with the test (DECISIONS.md, 2026-10-02, as checkpoint 0 read it); checkpoint 3 passes with the
// touched copies' mean speed over the 2 s after at least 10% above their twins', by the signed-rank test, and is
// partial when it is significantly above them by 1% to 10%.
export const TOUCHES = 50;
export const TOUCH_SEEDS = 100;
export const CHECKPOINT_2 = { pass: 0.7, partial: 0.4, ratio: 3 } as const;
export const CHECKPOINT_3 = { pass: 0.1, partial: 0.01 } as const;
const ALPHA = 0.05;

export type TouchGrade = 'pass' | 'partial' | 'fail';

// One touch as graded, from one trial: the touched copy's outcome and its sham twin's.
export interface TouchPair {
  seed: number;
  time: number;
  posture: number;
  reached: string[];
  touched: boolean;
  sham: boolean;
  latency: number | null;
  after: number;
  shamAfter: number;
  before: number;
}

export interface TouchRun {
  // The touches taken, the first 50 by seed, and the seeds they came from; null reasons when the run was sound.
  touches: number;
  seeds: number;
  unmeasured: string | null;
  // Solves that didn't converge over the trials taken, and their touched copies and sham twins.
  unconverged: number;
}

export interface Checkpoint2 extends TouchRun {
  grade: TouchGrade;
  followed: number;
  shams: number;
  // The pairs in which only the touched copy reversed, and only the twin, which McNemar's test weighs.
  touchedOnly: number;
  shamOnly: number;
  share: number;
  shamShare: number;
  // The touched copies' share of reversals less the twins': the response checkpoint 5's touch rows read.
  response: number;
  p: number;
  // Reported, not graded: the mean and median time from the touch to the first backward sample (s).
  latency: { mean: number; median: number } | null;
  pairs: TouchPair[];
}

export interface Checkpoint3 extends TouchRun {
  grade: TouchGrade;
  // The touched copies' and the twins' mean speed over the 2 s after (body lengths/s), and the response, the first
  // over the second less one, null when the twins' mean speed isn't forward.
  after: number;
  shamAfter: number;
  response: number | null;
  test: SignedRank;
  // Reported, not graded: the mean speed over the 2 s before, and the before-and-after test the cited papers use.
  before: number;
  rise: SignedRank;
  pairs: TouchPair[];
}

// The touches the protocol takes: from seed 1 upwards, the first 50, from up to 100 seeds. A trial, a touched copy or
// a sham twin among them that left the finite numbers fails both checkpoints, whichever copy it was (DECISIONS.md,
// 2026-10-02); and the solves that didn't converge are counted over all of them, each sham once.
function taken(
  records: readonly TouchTrialRecord[],
  copy: 'front' | 'back',
): { pairs: TouchPair[]; seeds: number; unmeasured: string | null; unconverged: number } {
  const bySeed = [...records].sort((a, b) => a.seed - b.seed);
  const pairs: TouchPair[] = [];
  let seeds = 0;
  let unconverged = 0;
  let unmeasured: string | null = null;
  for (const r of bySeed) {
    if (pairs.length >= TOUCHES || r.seed > TOUCH_SEEDS) break;
    seeds++;
    unconverged += r.unconverged;
    if (!r.finite) {
      unmeasured ??= `seed ${r.seed}'s trial left the finite numbers`;
      continue;
    }
    if (r.time === null) continue;
    const { front, back, frontSham, backSham } = r;
    if (!front || !back || !frontSham || !backSham || r.before === null) {
      throw new Error(`seed ${r.seed}'s touch has no copies`);
    }
    const copies = r.sharedSham ? [front, back, frontSham] : [front, back, frontSham, backSham];
    unconverged += copies.reduce((n, c) => n + c.unconverged, 0);
    if (copies.some((c) => !c.finite || c.after === null)) {
      unmeasured ??= `a copy of seed ${r.seed}'s touch left the finite numbers`;
      continue;
    }
    const touched = copy === 'front' ? front : back;
    const sham = copy === 'front' ? frontSham : backSham;
    pairs.push({
      seed: r.seed,
      time: r.time,
      posture: r.posture,
      reached: touched.reached,
      touched: touched.reversal,
      sham: sham.reversal,
      latency: touched.latency,
      after: touched.after as number,
      shamAfter: sham.after as number,
      before: r.before,
    });
  }
  if (unmeasured === null && pairs.length < TOUCHES) {
    unmeasured = `${pairs.length} touches in ${seeds} seeds, fewer than ${TOUCHES}`;
  }
  return { pairs, seeds, unmeasured, unconverged };
}

const mean = (x: readonly number[]): number => (x.length > 0 ? x.reduce((a, b) => a + b, 0) / x.length : 0);

export function checkpoint2(records: readonly TouchTrialRecord[]): Checkpoint2 {
  const { pairs, seeds, unmeasured, unconverged } = taken(records, 'front');
  const n = pairs.length;
  const followed = pairs.filter((t) => t.touched).length;
  const shams = pairs.filter((t) => t.sham).length;
  const touchedOnly = pairs.filter((t) => t.touched && !t.sham).length;
  const shamOnly = pairs.filter((t) => !t.touched && t.sham).length;
  const share = n > 0 ? followed / n : 0;
  const shamShare = n > 0 ? shams / n : 0;
  const p = mcnemarGreater(touchedOnly, shamOnly);
  const latencies = pairs.flatMap((t) => (t.touched && t.latency !== null ? [t.latency] : []));
  const sorted = [...latencies].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const significant = p < ALPHA;
  const grade: TouchGrade =
    unmeasured !== null
      ? 'fail'
      : share >= CHECKPOINT_2.pass && significant && share >= CHECKPOINT_2.ratio * shamShare
        ? 'pass'
        : share >= CHECKPOINT_2.partial && significant
          ? 'partial'
          : 'fail';
  return {
    grade,
    touches: n,
    seeds,
    unmeasured,
    unconverged,
    followed,
    shams,
    touchedOnly,
    shamOnly,
    share,
    shamShare,
    response: share - shamShare,
    p,
    latency: latencies.length > 0 ? { mean: mean(latencies), median } : null,
    pairs,
  };
}

export function checkpoint3(records: readonly TouchTrialRecord[]): Checkpoint3 {
  const { pairs, seeds, unmeasured: lacking, unconverged } = taken(records, 'back');
  const after = mean(pairs.map((t) => t.after));
  const shamAfter = mean(pairs.map((t) => t.shamAfter));
  const before = mean(pairs.map((t) => t.before));
  // The response is measured when the twins move forward, above the motion floor, on average.
  const forward = shamAfter > MOTION_FLOOR;
  const unmeasured =
    lacking ?? (forward ? null : `the sham twins' mean speed, ${shamAfter.toFixed(4)} body lengths/s, isn't forward`);
  const response = forward ? after / shamAfter - 1 : null;
  const test = signedRankGreater(pairs.map((t) => t.after - t.shamAfter));
  const significant = test.p < ALPHA;
  const grade: TouchGrade =
    unmeasured !== null || response === null
      ? 'fail'
      : response >= CHECKPOINT_3.pass && significant
        ? 'pass'
        : response >= CHECKPOINT_3.partial && significant
          ? 'partial'
          : 'fail';
  return {
    grade,
    touches: pairs.length,
    seeds,
    unmeasured,
    unconverged,
    after,
    shamAfter,
    response,
    test,
    before,
    rise: signedRankGreater(pairs.map((t) => t.after - t.before)),
    pairs,
  };
}
