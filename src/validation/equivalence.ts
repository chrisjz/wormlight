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
  // The percentile interval, and the margin it must lie within; null where the clause is unmeasured. An end is
  // null where it is unbounded, reached by the unmeasured resamples (percentileInterval).
  interval: [number | null, number | null] | null;
  margin: number | null;
  // Resamples in which the clause was unmeasured at either step, each counted against both tails.
  unmeasured: number;
  pass: boolean;
}

export interface StepComparison {
  clauses: ClauseComparison[];
  // Trials that left the finite numbers, at either step: any fails the comparison, as it fails checkpoint 1.
  nonFinite: number;
  pass: boolean;
}

// The percentile interval of the resampled differences, leaving `outside` of them beyond each end, with an
// unmeasured resample (null) counted against both tails (PLAN §7.2, changed after results 2026-09-28): taken as the
// lowest for the lower end and the highest for the upper. So an end is unbounded (null) once the unmeasured
// resamples outnumber `outside`, and otherwise each end lies as many measured differences further in.
export function percentileInterval(
  differences: readonly (number | null)[],
  outside: number,
): [number | null, number | null] {
  const measured = differences.filter((d): d is number => d !== null).sort((u, v) => u - v);
  const spare = outside - (differences.length - measured.length);
  return spare < 0 ? [null, null] : [measured[spare], measured[measured.length - 1 - spare]];
}

// Checkpoint 1's speed with its 95% interval, drawn as the comparison draws its intervals (PLAN §7.4, added after
// results 2026-09-29, before round 3 ran): the pooled speed over resamples of the trials with replacement, from the
// comparison's resampling seed, and the 26th to the 975th of 1,000, sorted, a resample with no bout counting below
// every value. An end is null where those reach it.
export function speedInterval(
  records: readonly TrialRecord[],
  resamples: number = EQUIVALENCE.resamples,
): { speed: number | null; interval: [number | null, number | null]; unmeasured: number } {
  const outside = (EQUIVALENCE.outside * resamples) / EQUIVALENCE.resamples;
  if (!Number.isInteger(outside) || outside < 1) throw new Error('the resamples must be a multiple of 40');
  const a = bouted(records);
  const n = a.length;
  const speeds: (number | null)[] = [];
  for (let s = 0; s < resamples; s++) {
    const picks = Array.from({ length: n }, (_, k) => Math.floor(uniform(hash(EQUIVALENCE.resamplingSeed, s, k)) * n));
    speeds.push(measuresOf(picks.map((k) => a[k])).speed);
  }
  const unmeasured = speeds.filter((v) => v === null).length;
  const sorted = [
    ...speeds.filter((v) => v === null),
    ...speeds.filter((v): v is number => v !== null).sort((u, v) => u - v),
  ];
  return {
    speed: measuresOf(a).speed,
    interval: [sorted[outside], sorted[resamples - 1 - outside]],
    unmeasured,
  };
}

// Whether a partial is reported as partial at the speed floor (PLAN §7.4, §9): its speed's interval reaches below
// the partial band's floor, or, for a fit that took the comparison, its pooled speed over the comparison's trials at
// dt/2 does. It changes no grade.
export function atSpeedFloor(
  interval: readonly [number | null, number | null],
  fineSpeed: number | null,
  floor: number = CHECKPOINT_1.speed.partial[0],
): boolean {
  return interval[0] === null || interval[0] < floor || (fineSpeed !== null && fineSpeed < floor);
}

// The comparison of `coarse`, the trials at dt, with `fine`, the same seeds' at dt/2, in the same order. The
// resamples must leave a whole number outside each end, as 1,000 leave 25.
export function compareSteps(
  coarse: readonly TrialRecord[],
  fine: readonly TrialRecord[],
  resamples: number = EQUIVALENCE.resamples,
): StepComparison {
  if (coarse.length !== fine.length || coarse.some((r, k) => r.seed !== fine[k].seed)) {
    throw new Error('the two steps must have the same seeds, in the same order');
  }
  const outside = (EQUIVALENCE.outside * resamples) / EQUIVALENCE.resamples;
  if (!Number.isInteger(outside) || outside < 1) throw new Error('the resamples must be a multiple of 40');
  const [a, b] = [bouted(coarse), bouted(fine)];
  const full = [measuresOf(a), measuresOf(b)];
  const differences = new Map<Measure, (number | null)[]>(MEASURES.map((m) => [m, []]));
  const n = a.length;
  for (let s = 0; s < resamples; s++) {
    const picks = Array.from({ length: n }, (_, k) => Math.floor(uniform(hash(EQUIVALENCE.resamplingSeed, s, k)) * n));
    const [x, y] = [measuresOf(picks.map((k) => a[k])), measuresOf(picks.map((k) => b[k]))];
    for (const m of MEASURES) {
      const [p, q] = [x[m], y[m]];
      (differences.get(m) as (number | null)[]).push(p === null || q === null ? null : p - q);
    }
  }
  const clauses = MEASURES.map((name): ClauseComparison => {
    const [p, q] = [full[0][name], full[1][name]];
    const resampled = differences.get(name) as (number | null)[];
    const unmeasured = resampled.filter((d) => d === null).length;
    if (p === null || q === null) {
      return { name, coarse: p, fine: q, difference: null, interval: null, margin: null, unmeasured, pass: false };
    }
    const margin = RELATIVE.has(name) ? EQUIVALENCE.margins[name] * Math.abs(q) : EQUIVALENCE.margins[name];
    const interval = percentileInterval(resampled, outside);
    const [lower, upper] = interval;
    return {
      name,
      coarse: p,
      fine: q,
      difference: p - q,
      interval,
      margin,
      unmeasured,
      pass: lower !== null && upper !== null && lower >= -margin && upper <= margin,
    };
  });
  const nonFinite = [...coarse, ...fine].filter((r) => !r.finite).length;
  return { clauses, nonFinite, pass: nonFinite === 0 && clauses.every((c) => c.pass) };
}
