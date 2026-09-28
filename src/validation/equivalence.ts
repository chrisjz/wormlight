// PLAN §7.2's comparison with the noise on (the paragraph after its table, set 2026-09-28 before it first ran):
// checkpoint 1's measures over 200 trials at dt and at dt/2, the same seeds at both, and each clause's percentile
// interval for the difference, over 1,000 resamples of the seeds, within its margin.

import { PARAMS } from '../science/params.ts';
import { hash, uniform } from '../sim/brain/rng.ts';
import { CHECKPOINT_1 } from './checkpoints.ts';
import { FRONT_ROD, MOTION_SAMPLE, REAR_ROD, bouts, kinematics, reversals, type Run } from './motion.ts';
import type { TrialRecord } from './trial.ts';

export const EQUIVALENCE = {
  trials: 200,
  resamples: 1000,
  // The interval runs from the 26th to the 975th of the sorted differences.
  outside: 25,
  // Of the full trials' value at dt/2 for the kinematics; absolute for the share of trials with a 20 s bout and for
  // reversals per minute.
  margins: { frequency: 0.03, wavelength: 0.03, speed: 0.03, bout: 0.1, reversals: 0.3 },
  resamplingSeed: 12345,
} as const;
export const EQUIVALENCE_SEEDS: readonly number[] = Array.from({ length: EQUIVALENCE.trials }, (_, i) => i + 1);

export type Measure = keyof typeof EQUIVALENCE.margins;
export const MEASURES: readonly Measure[] = ['frequency', 'wavelength', 'speed', 'bout', 'reversals'];
const RELATIVE: ReadonlySet<Measure> = new Set(['frequency', 'wavelength', 'speed']);

type Bouted = TrialRecord & { bouts: readonly Run[] };
const bouted = (records: readonly TrialRecord[]): Bouted[] => records.map((r) => ({ ...r, bouts: bouts(r.velocity) }));

// The measures over a set of trials, each null where unmeasured: the kinematics and the bout share as checkpoint 1
// takes them, and reversals per minute over the recorded samples, as the calibration takes them.
function measuresOf(records: readonly Bouted[]): Record<Measure, number | null> {
  const k = kinematics(records, (REAR_ROD - FRONT_ROD) / PARAMS.bodyUnits.value);
  const minutes = (records.reduce((n, r) => n + r.velocity.length, 0) * MOTION_SAMPLE) / 60;
  const long = records.filter((r) => r.finite && bouts(r.velocity, CHECKPOINT_1.bout.seconds).length > 0).length;
  return {
    frequency: k.frequency,
    wavelength: k.wavelength,
    speed: k.speed,
    bout: records.length > 0 ? long / records.length : null,
    reversals: minutes > 0 ? records.reduce((n, r) => n + reversals(r.velocity).length, 0) / minutes : null,
  };
}
export const measures = (records: readonly TrialRecord[]): Record<Measure, number | null> =>
  measuresOf(bouted(records));

export interface ClauseComparison {
  name: Measure;
  // The full trials' values at dt and at dt/2, and the first less the second.
  coarse: number | null;
  fine: number | null;
  difference: number | null;
  // The percentile interval, and the margin it must lie within; null where the clause is unmeasured.
  interval: [number, number] | null;
  margin: number | null;
  // Resamples in which the clause was unmeasured at either step, each counted as outside the margin.
  unmeasured: number;
  pass: boolean;
}

export interface StepComparison {
  clauses: ClauseComparison[];
  // Trials that left the finite numbers, at either step: any fails the comparison, as it fails checkpoint 1.
  nonFinite: number;
  pass: boolean;
}

// The comparison of `coarse`, the trials at dt, with `fine`, the same seeds' at dt/2, in the same order.
export function compareSteps(
  coarse: readonly TrialRecord[],
  fine: readonly TrialRecord[],
  resamples: number = EQUIVALENCE.resamples,
): StepComparison {
  if (coarse.length !== fine.length || coarse.some((r, k) => r.seed !== fine[k].seed)) {
    throw new Error('the two steps must have the same seeds, in the same order');
  }
  const [a, b] = [bouted(coarse), bouted(fine)];
  const full = [measuresOf(a), measuresOf(b)];
  const differences = new Map<Measure, number[]>(MEASURES.map((m) => [m, []]));
  const n = a.length;
  for (let s = 0; s < resamples; s++) {
    const picks = Array.from({ length: n }, (_, k) => Math.floor(uniform(hash(EQUIVALENCE.resamplingSeed, s, k)) * n));
    const [x, y] = [measuresOf(picks.map((k) => a[k])), measuresOf(picks.map((k) => b[k]))];
    for (const m of MEASURES) {
      const [p, q] = [x[m], y[m]];
      (differences.get(m) as number[]).push(p === null || q === null ? Infinity : p - q);
    }
  }
  const clauses = MEASURES.map((name): ClauseComparison => {
    const [p, q] = [full[0][name], full[1][name]];
    // Unmeasured resamples sort last, as Infinity, which u − v can't compare with itself.
    const sorted = (differences.get(name) as number[]).sort((u, v) => (u < v ? -1 : u > v ? 1 : 0));
    const unmeasured = sorted.filter((d) => d === Infinity).length;
    if (p === null || q === null) {
      return { name, coarse: p, fine: q, difference: null, interval: null, margin: null, unmeasured, pass: false };
    }
    const margin = RELATIVE.has(name) ? EQUIVALENCE.margins[name] * Math.abs(q) : EQUIVALENCE.margins[name];
    const cut = Math.round((EQUIVALENCE.outside / EQUIVALENCE.resamples) * resamples);
    const interval: [number, number] = [sorted[cut], sorted[resamples - 1 - cut]];
    return {
      name,
      coarse: p,
      fine: q,
      difference: p - q,
      interval,
      margin,
      unmeasured,
      pass: interval[0] >= -margin && interval[1] <= margin,
    };
  });
  const nonFinite = [...coarse, ...fine].filter((r) => !r.finite).length;
  return { clauses, nonFinite, pass: nonFinite === 0 && clauses.every((c) => c.pass) };
}
