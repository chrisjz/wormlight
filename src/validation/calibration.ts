// PLAN §7.3's calibration, all but its trials: the search space, the measures and the objective, and the choice
// of the final parameters. The runner (scripts/calibrate/run.ts) evaluates candidates on the CPU reference.

import { PARAMS } from '../science/params.ts';
import { CALIBRATED } from '../sim/world.ts';
import { FRONT_ROD, MOTION_SAMPLE, REAR_ROD, bouts, kinematics, reversals } from './motion.ts';

export type CalibratedId = (typeof CALIBRATED)[number];
export type Values = Record<CalibratedId, number>;

// How each parameter is mapped onto [0, 1] within its bounds (PLAN §7.3): logarithmically or linearly, as the
// go/no-go drew it.
export const MAPPING: Record<CalibratedId, 'log' | 'linear'> = {
  oscillatorExcitability: 'log',
  oscillatorRecoveryTime: 'log',
  oscillatorDriveThreshold: 'linear',
  headSwitchGain: 'log',
  proprioceptiveGain: 'log',
  neuromuscularGain: 'log',
  neuromuscularThreshold: 'linear',
  noiseIntensity: 'linear',
};

// The procedure's settings (PLAN §7.3).
export const CALIBRATION = {
  budget: 2000,
  trialSeconds: 120,
  fitSeeds: [1001, 1002, 1003, 1004],
  // The final check: the ten best candidates and the final mean, on 16 fresh seeds.
  checkSeeds: Array.from({ length: 16 }, (_, i) => 1005 + i),
  rechecked: 10,
  start: 0.5,
  sigma: 0.3,
  seed: 1,
} as const;

// Checkpoint 1's targets (PLAN §7.3): Hz, body lengths, body lengths per second, reversals per minute.
export const TARGETS = { frequency: 0.3, wavelength: 0.65, speed: 0.22, reversalRate: 1.8 } as const;
export type Target = keyof typeof TARGETS;
// Each target's relative error is capped at this, and an unmeasured one takes the cap.
export const ERROR_CAP = 2;

export function bounds(id: CalibratedId): readonly [number, number] {
  const b = PARAMS[id].bounds;
  if (!b) throw new Error(`${id} has no bounds`);
  return b;
}

const clip = (u: number): number => Math.min(1, Math.max(0, u));

// A point in [0, 1]ⁿ, in CALIBRATED's order, as parameter values in the registry's units; a coordinate
// outside [0, 1] is taken at the nearest point inside.
export function fromUnit(u: readonly number[]): Values {
  if (u.length !== CALIBRATED.length) throw new Error(`a candidate needs ${CALIBRATED.length} coordinates`);
  return Object.fromEntries(
    CALIBRATED.map((id, i) => {
      const [lo, hi] = bounds(id);
      const t = clip(u[i]);
      return [id, MAPPING[id] === 'log' ? lo * (hi / lo) ** t : lo + (hi - lo) * t];
    }),
  ) as Values;
}

export function toUnit(values: Values): number[] {
  return CALIBRATED.map((id) => {
    const [lo, hi] = bounds(id);
    const v = values[id];
    return MAPPING[id] === 'log' ? Math.log(v / lo) / Math.log(hi / lo) : (v - lo) / (hi - lo);
  });
}

// The squared distance a candidate lies outside [0, 1]ⁿ, which the search adds to its objective.
export const outside = (u: readonly number[]): number => u.reduce((s, x) => s + (x - clip(x)) ** 2, 0);

// What a trial gives the objective: its velocity and the curvature at the three rods, from the first 10 s on.
export interface KinematicRecord {
  finite: boolean;
  velocity: ArrayLike<number>;
  mid: ArrayLike<number>;
  front: ArrayLike<number>;
  rear: ArrayLike<number>;
}

export interface Measures {
  finite: boolean;
  // Forward bouts of 10 s or more, pooled over the trials.
  bouts: number;
  // Null when unmeasured: the frequency and wavelength with no bout, the wavelength with no head-to-tail wave.
  frequency: number | null;
  wavelength: number | null;
  // Over the bouts, or the mean forward velocity over the measured windows when there is none.
  speed: number;
  reversalRate: number;
}

// The four targets' measures, pooled over the trials (PLAN §7.3).
export function measure(records: readonly KinematicRecord[]): Measures {
  const finite = records.length > 0 && records.every((r) => r.finite);
  const withBouts = records.map((r) => ({ ...r, bouts: bouts(r.velocity) }));
  const count = withBouts.reduce((n, r) => n + r.bouts.length, 0);
  const samples = records.reduce((n, r) => n + r.velocity.length, 0);
  const minutes = (samples * MOTION_SAMPLE) / 60;
  const reversalRate = minutes > 0 ? records.reduce((n, r) => n + reversals(r.velocity).length, 0) / minutes : 0;
  if (count === 0) {
    let sum = 0;
    for (const r of records) for (let k = 0; k < r.velocity.length; k++) sum += r.velocity[k];
    return {
      finite,
      bouts: 0,
      frequency: null,
      wavelength: null,
      speed: samples > 0 ? sum / samples : 0,
      reversalRate,
    };
  }
  const k = kinematics(withBouts, (REAR_ROD - FRONT_ROD) / PARAMS.bodyUnits.value);
  return {
    finite,
    bouts: count,
    frequency: k.frequency,
    wavelength: k.wavelength,
    speed: k.speed ?? 0,
    reversalRate,
  };
}

export interface Score {
  // The sum of the capped squared relative errors; infinite if a trial left the finite numbers.
  value: number;
  errors: Record<Target, number>;
}

export function objective(m: Measures): Score {
  const error = (x: number | null, target: number): number =>
    x === null || !Number.isFinite(x) ? ERROR_CAP : Math.min(ERROR_CAP, Math.abs((x - target) / target));
  const errors: Record<Target, number> = {
    frequency: error(m.frequency, TARGETS.frequency),
    wavelength: error(m.wavelength, TARGETS.wavelength),
    speed: error(m.speed, TARGETS.speed),
    reversalRate: error(m.reversalRate, TARGETS.reversalRate),
  };
  const value = m.finite ? Object.values(errors).reduce((s, e) => s + e * e, 0) : Infinity;
  return { value, errors };
}

// The candidates the final check runs again: the best evaluated ones, distinct, lowest objective first and
// the earlier first on a tie, as many as it takes.
export function best<T extends { values: Values; value: number }>(evaluated: readonly T[], count: number): T[] {
  const seen = new Set<string>();
  return evaluated
    .map((e, order) => ({ e, order }))
    .sort((a, b) => a.e.value - b.e.value || a.order - b.order)
    .map(({ e }) => e)
    .filter((e) => {
      const key = JSON.stringify(CALIBRATED.map((id) => e.values[id]));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, count);
}
