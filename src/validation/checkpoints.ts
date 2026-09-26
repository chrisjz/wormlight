// Checkpoints 0 and 1 graded as PLAN fixes them (§7.2's checkpoint 0 row, crawling clause; §7.4's
// checkpoint 1), from the trials' records.

import { PARAMS } from '../science/params.ts';
import { FRONT_ROD, REAR_ROD, bouts, kinematics, reversals, runs, seconds, type Kinematics } from './motion.ts';
import { covariance, poolSums, varianceCaptured } from './posture.ts';
import type { TrialRecord } from './trial.ts';

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
}

export interface Checkpoint1 {
  grade: Grade;
  clauses: Clause[];
  kinematics: Kinematics;
  postures: number;
  trials: TrialSummary[];
}

// If any trial leaves the finite numbers, every clause fails.
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
    records.filter((r) => r.finite && bouts(r.velocity, CHECKPOINT_1.bout.seconds).length > 0).length / records.length;
  const allFinite = records.every((r) => r.finite);
  const clause = (name: string, value: number | null, grade: Grade): Clause => ({
    name,
    value,
    grade: allFinite ? grade : 'fail',
  });
  const clauses = [
    clause('frequency', k.frequency, gradeRange(k.frequency, CHECKPOINT_1.frequency)),
    clause('wavelength', k.wavelength, gradeRange(k.wavelength, CHECKPOINT_1.wavelength)),
    clause('speed', k.speed, gradeRange(k.speed, CHECKPOINT_1.speed)),
    clause('eigenworms', captured, gradeAtLeast(captured, CHECKPOINT_1.eigenworms)),
    clause('bout', boutShare, gradeAtLeast(boutShare, CHECKPOINT_1.bout)),
  ];
  return { grade: overall(clauses.map((c) => c.grade)), clauses, kinematics: k, postures: pooled.count, trials };
}

export interface Checkpoint0 {
  grade: Grade;
  // Forward bouts of 10 s or more, over all trials; the clause passes with none.
  bouts: number;
  trials: TrialSummary[];
}

// Checkpoint 0's crawling clause: no forward bout of 10 s or more in any trial. Backward activity is
// reported, not graded.
export function checkpoint0(records: readonly TrialRecord[]): Checkpoint0 {
  const trials = records.map(summariseTrial);
  const count = records.reduce((n, r) => n + bouts(r.velocity).length, 0);
  return { grade: count === 0 && records.every((r) => r.finite) ? 'pass' : 'fail', bouts: count, trials };
}
