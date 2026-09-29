// Checkpoints 0 and 1 graded as PLAN fixes them (§7.2's checkpoint 0 row, with §7.4's touch and chemotaxis
// clauses for it; §7.4's checkpoint 1), from the trials' and the assay runs' records.

import { PARAMS } from '../science/params.ts';
import { fisherGreater, signedRankGreater, type SignedRank } from '../sim/stats.ts';
import { BACK, FRONT } from '../sim/touch.ts';
import type { ChemotaxisRecord } from './chemotaxis.ts';
import {
  FRONT_ROD,
  MEASURE_FROM,
  MOTION_SAMPLE,
  REAR_ROD,
  REVERSAL_MIN,
  VELOCITY_WINDOW,
  bouts,
  kinematics,
  reversals,
  runs,
  seconds,
  type Kinematics,
} from './motion.ts';
import { covariance, poolSums, varianceCaptured } from './posture.ts';
import type { TrialRecord, TrialTouch } from './trial.ts';

export type Grade = 'pass' | 'partial' | 'fail';

export const TRIALS = 20;
export const TRIAL_SECONDS = 120;
// Trials use seeds 1 to 20, both checkpoints alike.
export const SEEDS: readonly number[] = Array.from({ length: TRIALS }, (_, i) => i + 1);

interface Range {
  pass: readonly [number, number];
  partial: readonly [number, number];
}

// §7.4's bands for checkpoint 1.
export const CHECKPOINT_1 = {
  frequency: { pass: [0.2, 0.45], partial: [0.1, 0.6] }, // Hz
  wavelength: { pass: [0.5, 0.8], partial: [0.4, 1.0] }, // body lengths
  speed: { pass: [0.12, 0.3], partial: [0.06, 0.5] }, // body lengths per second
  eigenworms: { pass: 0.85, partial: 0.7 }, // share of posture variance, at least
  bout: { seconds: 20, pass: 0.8, partial: 0.5 }, // a forward bout this long in at least this share of trials
} as const;

const inRange = (x: number, [lo, hi]: readonly [number, number]): boolean => x >= lo && x <= hi;

export function gradeRange(x: number | null, range: Range): Grade {
  if (x === null || !Number.isFinite(x)) return 'fail';
  return inRange(x, range.pass) ? 'pass' : inRange(x, range.partial) ? 'partial' : 'fail';
}

export function gradeAtLeast(x: number | null, { pass, partial }: { pass: number; partial: number }): Grade {
  if (x === null || !Number.isFinite(x)) return 'fail';
  return x >= pass ? 'pass' : x >= partial ? 'partial' : 'fail';
}

// Pass if every clause passes, partial if every clause is at least partial, fail otherwise.
export function overall(grades: readonly Grade[]): Grade {
  if (grades.every((g) => g === 'pass')) return 'pass';
  return grades.every((g) => g !== 'fail') ? 'partial' : 'fail';
}

// What every trial reports, whichever checkpoint it serves.
export interface TrialSummary {
  seed: number;
  posture: number;
  finite: boolean;
  // Seconds of the measured window, and the share of it forward, paused and backward.
  measured: number;
  forward: number;
  paused: number;
  backward: number;
  longestBout: number;
  reversals: number;
  // The mean forward velocity over the whole measured window (body lengths per second).
  meanVelocity: number;
  selfIntersecting: number;
  unconverged: number;
}

export function summariseTrial(r: TrialRecord): TrialSummary {
  const n = r.velocity.length;
  const forward = runs(r.velocity, 1).reduce((a, b) => a + b.length, 0);
  const backward = runs(r.velocity, -1).reduce((a, b) => a + b.length, 0);
  return {
    seed: r.seed,
    posture: r.posture,
    finite: r.finite,
    measured: seconds({ start: 0, length: n }),
    forward: n > 0 ? forward / n : 0,
    paused: n > 0 ? (n - forward - backward) / n : 0,
    backward: n > 0 ? backward / n : 0,
    longestBout: Math.max(0, ...runs(r.velocity, 1).map(seconds)),
    reversals: reversals(r.velocity).length,
    meanVelocity: n > 0 ? r.velocity.reduce((a, b) => a + b, 0) / n : 0,
    selfIntersecting: r.selfIntersecting,
    unconverged: r.unconverged,
  };
}

export interface Clause {
  name: string;
  value: number | null;
  grade: Grade;
  // Why the value wasn't measured, if it wasn't.
  reason: string | null;
}

export interface Checkpoint1 {
  grade: Grade;
  clauses: Clause[];
  kinematics: Kinematics;
  postures: number;
  trials: TrialSummary[];
  diagnostics: Diagnostics;
}

// Checkpoint 1's diagnostics, reported and not graded (PLAN §7.4, set 2026-09-27 before track R's fit).
export interface Diagnostics {
  // The mid-body curvature's spectral peak above 0.02 Hz, and the share of its power between 0.2 and 0.45 Hz,
  // from the periodogram of each trial's κL, less its mean, summed over the trials; null with no samples.
  peak: number | null;
  share: number | null;
  // Reversals, and those whose first backward sample lies within 3 s after a flip of the head switch.
  reversals: number;
  afterFlip: number;
  // The mean change in AVA's activation from 1 s before each reversal to its end, and the activation's standard
  // deviation over the measured windows; null with no reversals, or no samples.
  avaChange: number | null;
  avaSpread: number | null;
  // Added after results (2026-09-29): how many neurons sit outside the model's reversal range at a sample, and
  // how many more than FAR_OUTSIDE past it, each on average and at most, and the lowest and highest voltages at
  // any step (mV); null when no record carries them. The far count and every step came after review.
  outside: {
    mean: number;
    max: number;
    far: { mean: number; max: number };
    lowest: number;
    highest: number;
  } | null;
  // Added 2026-09-29, before any of it was built: in the conductance form, over every measured sample of every trial,
  // the head switch's and proprioception's shunt, each the mean of per-target ratios of conductance to passive load
  // (null for a layer with no targets); and how many times a second the head switch's gate turned on or off. Null in
  // the current form.
  shunt: { switch: number | null; proprioception: number | null; gateToggles: number } | null;
  // Added 2026-09-29, before round 3 ran (PLAN §7.4): what paces the crawl. Over every measured step of every trial,
  // in either form, the share whose step ran with the head switch's gate open, and the head-switch drive less θ_osc,
  // its mean and standard deviation (mV); and the switch's cycle rate, half its flips a second over the measured
  // windows (Hz), beside the spectral peak. Null when no record carries them.
  pacing: { open: number; margin: { mean: number; sd: number }; cycleRate: number } | null;
}

export const SPECTRUM = { from: 0.02, band: [0.2, 0.45] } as const; // Hz
const FLIP_WINDOW = 3; // s

// The periodogram of samples 0.1 s apart, less their mean: power at k / (n · 0.1) Hz for k = 0 … ⌊n/2⌋.
export function periodogram(x: ArrayLike<number>): number[] {
  const n = x.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  return Array.from({ length: Math.floor(n / 2) + 1 }, (_, k) => {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const phase = (2 * Math.PI * k * i) / n;
      re += (x[i] - mean) * Math.cos(phase);
      im -= (x[i] - mean) * Math.sin(phase);
    }
    return re * re + im * im;
  });
}

// The mid-body curvature's spectral peak above SPECTRUM.from, and the share of its power in SPECTRUM.band, from the
// periodograms of the trials that stayed finite, summed on the shortest trial's grid; nulls with no such trial.
export function spectralPeak(records: readonly { finite: boolean; mid: ArrayLike<number> }[]): {
  peak: number | null;
  share: number | null;
} {
  const finite = records.filter((r) => r.finite && r.mid.length > 1);
  // The trials share one frequency grid: the shortest's.
  const n = Math.min(...finite.map((r) => r.mid.length));
  let peak: number | null = null;
  let share: number | null = null;
  if (finite.length > 0) {
    const power = new Array<number>(Math.floor(n / 2) + 1).fill(0);
    for (const r of finite) {
      periodogram(Array.from({ length: n }, (_, i) => r.mid[i])).forEach((p, k) => (power[k] += p));
    }
    const freq = (k: number): number => k / (n * MOTION_SAMPLE);
    let best = -1;
    let total = 0;
    let inBand = 0;
    power.forEach((p, k) => {
      const f = freq(k);
      if (f > 0) total += p;
      if (f >= SPECTRUM.band[0] && f <= SPECTRUM.band[1]) inBand += p;
      if (f > SPECTRUM.from && (best < 0 || p > power[best])) best = k;
    });
    peak = best < 0 ? null : freq(best);
    share = total > 0 ? inBand / total : null;
  }
  return { peak, share };
}

// The voltage diagnostic over the trials that carry it, every sample weighted alike.
// Over every sample of every trial that carries the diagnostic, in one pass: a spread of 200 trials' samples
// would pass the engine's limit on arguments. Trials that left the finite numbers count too, since their
// voltages up to then are the model's.
export function outsideRange(records: readonly TrialRecord[]): Diagnostics['outside'] {
  let [samples, sum, max, farSum, farMax] = [0, 0, 0, 0, 0];
  let [lowest, highest] = [Infinity, -Infinity];
  for (const r of records) {
    if (!r.outside || !r.far || r.lowest === undefined || r.highest === undefined) continue;
    for (let k = 0; k < r.outside.length; k++) {
      samples++;
      sum += r.outside[k];
      max = Math.max(max, r.outside[k]);
      farSum += r.far[k];
      farMax = Math.max(farMax, r.far[k]);
    }
    lowest = Math.min(lowest, r.lowest);
    highest = Math.max(highest, r.highest);
  }
  if (samples === 0) return null;
  return { mean: sum / samples, max, far: { mean: farSum / samples, max: farMax }, lowest, highest };
}

// The shunt's means over every measured sample of every trial in the conductance form, and the gate's turns a second.
export function shuntShare(records: readonly TrialRecord[]): Diagnostics['shunt'] {
  let [samples, toggles, sw, swSamples, proprio, proprioSamples] = [0, 0, 0, 0, 0, 0];
  for (const r of records) {
    const c = r.conductance;
    if (!c) continue;
    samples += c.samples;
    toggles += c.gateToggles;
    if (c.switchShunt !== null) [sw, swSamples] = [sw + c.switchShunt, swSamples + c.samples];
    if (c.proprioShunt !== null) [proprio, proprioSamples] = [proprio + c.proprioShunt, proprioSamples + c.samples];
  }
  if (samples === 0) return null;
  return {
    switch: swSamples > 0 ? sw / swSamples : null,
    proprioception: proprioSamples > 0 ? proprio / proprioSamples : null,
    gateToggles: toggles / (samples * MOTION_SAMPLE),
  };
}

// What paces the crawl, over every measured step of every trial that carries it.
export function pacing(records: readonly TrialRecord[]): Diagnostics['pacing'] {
  let [steps, open, sum, squares, flips, windows] = [0, 0, 0, 0, 0, 0];
  for (const r of records) {
    if (!r.gate) continue;
    [steps, open] = [steps + r.gate.steps, open + r.gate.open];
    [sum, squares] = [sum + r.gate.margin, squares + r.gate.marginSquares];
    const window = r.velocity.length * MOTION_SAMPLE;
    flips += r.switchFlips.filter((t) => t >= MEASURE_FROM && t < MEASURE_FROM + window).length;
    windows += window;
  }
  if (steps === 0) return null;
  const mean = sum / steps;
  const variance = steps > 1 ? Math.max(0, (squares - steps * mean * mean) / (steps - 1)) : 0;
  return {
    open: open / steps,
    margin: { mean, sd: Math.sqrt(variance) },
    cycleRate: windows > 0 ? flips / 2 / windows : 0,
  };
}

export function diagnostics(records: readonly TrialRecord[]): Diagnostics {
  const { peak, share } = spectralPeak(records);
  let count = 0;
  let afterFlip = 0;
  const changes: number[] = [];
  const all: number[] = [];
  const before = Math.round(1 / MOTION_SAMPLE);
  for (const r of records) {
    all.push(...r.ava);
    for (const rev of reversals(r.velocity)) {
      count++;
      const t = MEASURE_FROM + rev.start * MOTION_SAMPLE;
      if (r.switchFlips.some((f) => f <= t && t <= f + FLIP_WINDOW)) afterFlip++;
      const end = rev.start + rev.length - 1;
      if (end < r.ava.length) changes.push(r.ava[end] - r.ava[Math.max(0, rev.start - before)]);
    }
  }
  const mean = (x: readonly number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
  const spread =
    all.length > 1 ? Math.sqrt(all.reduce((a, v) => a + (v - mean(all)) ** 2, 0) / (all.length - 1)) : null;
  return {
    peak,
    share,
    reversals: count,
    afterFlip,
    avaChange: changes.length > 0 ? mean(changes) : null,
    avaSpread: spread,
    outside: outsideRange(records),
    shunt: shuntShare(records),
    pacing: pacing(records),
  };
}

export function checkpoint1(records: readonly TrialRecord[], basis: readonly (readonly number[])[]): Checkpoint1 {
  const trials = records.map(summariseTrial);
  const separation = (REAR_ROD - FRONT_ROD) / PARAMS.bodyUnits.value;
  const k = kinematics(
    records.map((r) => ({ ...r, bouts: bouts(r.velocity) })),
    separation,
  );
  const pooled = poolSums(records.map((r) => r.postures));
  const captured = pooled.count > 1 ? varianceCaptured(covariance(pooled), basis) : null;
  const boutShare =
    records.length > 0
      ? records.filter((r) => r.finite && bouts(r.velocity, CHECKPOINT_1.bout.seconds).length > 0).length /
        records.length
      : null;
  // With no trials, or any that left the finite numbers, every clause fails.
  const sound = records.length > 0 && records.every((r) => r.finite);
  const clause = (name: string, value: number | null, grade: Grade, reason: string | null): Clause => ({
    name,
    value,
    grade: sound ? grade : 'fail',
    reason: value === null ? reason : null,
  });
  const clauses = [
    clause('frequency', k.frequency, gradeRange(k.frequency, CHECKPOINT_1.frequency), 'no bout of 10 s'),
    clause('wavelength', k.wavelength, gradeRange(k.wavelength, CHECKPOINT_1.wavelength), k.unmeasured),
    clause('speed', k.speed, gradeRange(k.speed, CHECKPOINT_1.speed), 'no bout of 10 s'),
    clause('eigenworms', captured, gradeAtLeast(captured, CHECKPOINT_1.eigenworms), 'too few postures'),
    clause('bout', boutShare, gradeAtLeast(boutShare, CHECKPOINT_1.bout), 'no trials'),
  ];
  return {
    grade: overall(clauses.map((c) => c.grade)),
    clauses,
    kinematics: k,
    postures: pooled.count,
    trials,
    diagnostics: diagnostics(records),
  };
}

// Every test at α = 0.05 (PLAN §7.1).
export const ALPHA = 0.05;

export interface Crawling {
  grade: Grade;
  // Forward bouts of 10 s or more, over all trials; the clause passes with none.
  bouts: number;
  trials: TrialSummary[];
}

// Checkpoint 0's crawling clause: no forward bout of 10 s or more in any trial. Backward activity is
// reported, not graded.
export function crawlingClause(records: readonly TrialRecord[]): Crawling {
  const trials = records.map(summariseTrial);
  const count = records.reduce((n, r) => n + bouts(r.velocity).length, 0);
  // With no trials, or any that left the finite numbers, the clause fails.
  const sound = records.length > 0 && records.every((r) => r.finite);
  return { grade: count === 0 && sound ? 'pass' : 'fail', bouts: count, trials };
}

// Checkpoint 0's touch clause (PLAN §7.4, set 2026-09-27): the trials run again with 5 touches each, 20 s apart
// from t = 20 s, alternating front and back, odd seeds starting at the front. A reflex counts as found if it
// reaches its checkpoint's partial level: for anterior touches, a reversal starting within 2 s after 40% or
// more of them and more often than in the untouched trials' matched windows (checkpoint 2); for posterior
// ones, a significant rise in forward speed from the 2 s before to the 2 s after (checkpoint 3).
export const CHECKPOINT_0_TOUCH = {
  touches: 5,
  first: 20, // s
  every: 20, // s
  front: FRONT,
  back: BACK,
  window: 2, // s
  anteriorPartial: 0.4, // share of anterior touches followed by a reversal
} as const;

export type Place = 'anterior' | 'posterior';

// What a touch needs of the trial after it: 2 s for a reversal to start and 1 s more for it to count, within the
// velocity samples, which end half a window before the trial does.
export const TOUCH_NEEDS = CHECKPOINT_0_TOUCH.window + REVERSAL_MIN + VELOCITY_WINDOW / 2; // s

// A trial's touches, with the place each is aimed at: those whose windows fit in a trial of this length, so a
// shortened run touches fewer times.
export function touchSchedule(seed: number, trialSeconds = TRIAL_SECONDS): (TrialTouch & { place: Place })[] {
  const { touches, first, every, front, back } = CHECKPOINT_0_TOUCH;
  const frontFirst = seed % 2 === 1;
  return Array.from({ length: touches }, (_, k) => {
    const place: Place = (k % 2 === 0) === frontFirst ? 'anterior' : 'posterior';
    return { time: first + k * every, s: place === 'anterior' ? front : back, place };
  }).filter((t) => t.time + TOUCH_NEEDS <= trialSeconds + 1e-9);
}

// The velocity sample at time t: samples start at the first measured second, 0.1 s apart.
const sampleAt = (t: number): number => Math.round((t - MEASURE_FROM) / MOTION_SAMPLE);

// Whether a reversal's first backward sample lies from t to t + 2 s.
export function reversalFrom(velocity: ArrayLike<number>, t: number): boolean {
  const [a, b] = [sampleAt(t), sampleAt(t + CHECKPOINT_0_TOUCH.window)];
  return reversals(velocity).some((r) => r.start >= a && r.start <= b);
}

// The mean of the velocity samples whose centred windows lie within [from, to] (s).
export function meanVelocity(velocity: ArrayLike<number>, from: number, to: number): number {
  const [a, b] = [sampleAt(from + VELOCITY_WINDOW / 2), sampleAt(to - VELOCITY_WINDOW / 2)];
  if (a < 0 || b >= velocity.length || b < a) throw new Error(`no velocity samples span ${from}–${to} s`);
  let sum = 0;
  for (let k = a; k <= b; k++) sum += velocity[k];
  return sum / (b - a + 1);
}

// One touch as graded: whether a reversal followed it, and one started in its matched window, and the mean
// forward velocity (body lengths per second) over the 2 s before and after it, in the touched trial and, for
// context, in its untouched twin.
export interface TouchOutcome {
  seed: number;
  time: number;
  place: Place;
  reached: string[];
  reversal: boolean;
  matched: boolean;
  before: number;
  after: number;
  twinBefore: number;
  twinAfter: number;
}

// Each reflex's grade is a pass if it was measured, on sound trials, and not found; the clause passes if both
// reflexes' grades do.
export interface TouchClause {
  grade: Grade;
  anterior: {
    grade: Grade;
    measured: boolean;
    touches: number;
    followed: number;
    matched: number;
    share: number;
    p: number;
    reflex: boolean;
  };
  posterior: {
    grade: Grade;
    measured: boolean;
    touches: number;
    before: number;
    after: number;
    pairs: number;
    positive: number;
    p: number;
    reflex: boolean;
    // Reported, not graded: the same test over the same windows in the untouched twins.
    twin: SignedRank;
  };
  // Reported, not graded: the largest difference between any velocity sample of a touched trial and its twin's.
  largestChange: number;
  // Whether there were touched trials, and they and their twins all stayed finite.
  finite: boolean;
  touches: TouchOutcome[];
  trials: TrialSummary[];
}

export function touchClause(touched: readonly TrialRecord[], untouched: readonly TrialRecord[]): TouchClause {
  const { window } = CHECKPOINT_0_TOUCH;
  const matching = new Map(untouched.map((r) => [r.seed, r]));
  const touches: TouchOutcome[] = [];
  let largestChange = 0;
  for (const r of touched) {
    const twin = matching.get(r.seed);
    if (!twin) throw new Error(`no untouched trial for seed ${r.seed}`);
    if (!r.finite || !twin.finite) continue;
    const schedule = touchSchedule(r.seed, r.seconds);
    if (
      JSON.stringify(schedule.map(({ time, s }) => [time, s])) !==
      JSON.stringify(r.touches.map(({ time, s }) => [time, s]))
    ) {
      throw new Error(`seed ${r.seed} wasn't touched as the protocol says`);
    }
    schedule.forEach((t, k) => {
      touches.push({
        seed: r.seed,
        time: t.time,
        place: t.place,
        reached: r.touches[k].reached,
        reversal: reversalFrom(r.velocity, t.time),
        matched: reversalFrom(twin.velocity, t.time),
        before: meanVelocity(r.velocity, t.time - window, t.time),
        after: meanVelocity(r.velocity, t.time, t.time + window),
        twinBefore: meanVelocity(twin.velocity, t.time - window, t.time),
        twinAfter: meanVelocity(twin.velocity, t.time, t.time + window),
      });
    });
    for (let k = 0; k < Math.min(r.velocity.length, twin.velocity.length); k++) {
      largestChange = Math.max(largestChange, Math.abs(r.velocity[k] - twin.velocity[k]));
    }
  }
  const front = touches.filter((t) => t.place === 'anterior');
  const back = touches.filter((t) => t.place === 'posterior');
  const followed = front.filter((t) => t.reversal).length;
  const matched = front.filter((t) => t.matched).length;
  const share = front.length > 0 ? followed / front.length : 0;
  const pFront = front.length > 0 ? fisherGreater(followed, front.length, matched, front.length) : 1;
  const rise = signedRankGreater(back.map((t) => t.after - t.before));
  const mean = (x: number[]): number => (x.length > 0 ? x.reduce((a, b) => a + b, 0) / x.length : 0);
  // A reflex is measured if it had touches, every one reaching a receptor, on trials that all stayed finite; one
  // that wasn't fails.
  const finite = touched.length > 0 && [...touched, ...untouched].every((r) => r.finite);
  const measured = (list: readonly TouchOutcome[]): boolean =>
    finite && list.length > 0 && list.every((t) => t.reached.length > 0);
  const found = share >= CHECKPOINT_0_TOUCH.anteriorPartial && pFront < ALPHA;
  const anterior = {
    grade: measured(front) && !found ? ('pass' as const) : ('fail' as const),
    measured: measured(front),
    touches: front.length,
    followed,
    matched,
    share,
    p: pFront,
    reflex: found,
  };
  const posterior = {
    grade: measured(back) && rise.p >= ALPHA ? ('pass' as const) : ('fail' as const),
    measured: measured(back),
    touches: back.length,
    before: mean(back.map((t) => t.before)),
    after: mean(back.map((t) => t.after)),
    pairs: rise.n,
    positive: rise.positive,
    p: rise.p,
    reflex: rise.p < ALPHA,
    twin: signedRankGreater(back.map((t) => t.twinAfter - t.twinBefore)),
  };
  return {
    grade: overall([anterior.grade, posterior.grade]),
    anterior,
    posterior,
    largestChange,
    finite,
    touches,
    trials: touched.map(summariseTrial),
  };
}

// Checkpoint 0's chemotaxis clause (PLAN §7.4, set 2026-09-27): 30 worms of 60 min in checkpoint 4's assay,
// every worm counted, so no arrivals give 0; it passes with the index within ±0.1 of zero.
export const CHECKPOINT_0_CHEMOTAXIS = { worms: 30, seconds: 3600, within: 0.1 } as const;

export interface ChemotaxisClause {
  grade: Grade;
  worms: number;
  odour: number;
  control: number;
  index: number;
  runs: ChemotaxisRecord[];
}

// CI = (at odour − at control) / total, the total every worm run (PLAN §7.4).
export function chemotaxisIndex(runs: readonly ChemotaxisRecord[]): { odour: number; control: number; index: number } {
  const odour = runs.filter((r) => r.reached === 'odour').length;
  const control = runs.filter((r) => r.reached === 'control').length;
  return { odour, control, index: runs.length > 0 ? (odour - control) / runs.length : 0 };
}

export function chemotaxisClause(runs: readonly ChemotaxisRecord[]): ChemotaxisClause {
  const { odour, control, index } = chemotaxisIndex(runs);
  // With no worms, or any that left the finite numbers, the clause fails.
  const sound = runs.length > 0 && runs.every((r) => r.finite);
  return {
    grade: sound && Math.abs(index) <= CHECKPOINT_0_CHEMOTAXIS.within ? 'pass' : 'fail',
    worms: runs.length,
    odour,
    control,
    index,
    runs: [...runs],
  };
}

export interface Checkpoint0 {
  // Pass if every clause passes; the clauses have no partial.
  grade: Grade;
  crawling: Crawling;
  touch: TouchClause;
  chemotaxis: ChemotaxisClause;
}

export function checkpoint0(
  trials: readonly TrialRecord[],
  touched: readonly TrialRecord[],
  worms: readonly ChemotaxisRecord[],
): Checkpoint0 {
  const crawling = crawlingClause(trials);
  const touch = touchClause(touched, trials);
  const chemotaxis = chemotaxisClause(worms);
  return { grade: overall([crawling.grade, touch.grade, chemotaxis.grade]), crawling, touch, chemotaxis };
}
