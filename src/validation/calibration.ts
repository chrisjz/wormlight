// PLAN §7.3's calibration, all but its trials: the search space, the measures and the objective, and the choice
// of the final parameters. The runner (scripts/calibrate/run.ts) evaluates candidates on the CPU reference.

import { PARAMS } from '../science/params.ts';
import { CALIBRATED } from '../sim/world.ts';
import { spectralPeak } from './checkpoints.ts';
import { Cmaes, defaultLambda } from './cmaes.ts';
import { FRONT_ROD, MOTION_FLOOR, MOTION_SAMPLE, REAR_ROD, bouts, kinematics, reversals } from './motion.ts';

export type CalibratedId = (typeof CALIBRATED)[number];
export type Values = Record<CalibratedId, number>;

// How each parameter is mapped onto [0, 1] within its bounds (PLAN §7.3): logarithmically or linearly, as the
// go/no-go drew it.
export const MAPPING: Record<CalibratedId, 'log' | 'linear'> = {
  oscillatorExcitability: 'log',
  oscillatorExcitabilityB: 'linear',
  gapGainB: 'log',
  smdGain: 'log',
  oscillatorRecoveryTime: 'log',
  oscillatorDriveThreshold: 'linear',
  headSwitchGain: 'log',
  proprioceptiveGain: 'log',
  neuromuscularGain: 'log',
  neuromuscularThreshold: 'linear',
  noiseIntensity: 'linear',
  noiseCorrelation: 'log',
};

// The procedure's settings (PLAN §7.3).
export const CALIBRATION = {
  budget: 2000,
  trialSeconds: 120,
  fitSeeds: [1001, 1002, 1003, 1004],
  // The final check: the ten best candidates and the final mean, on 16 fresh seeds.
  checkSeeds: Array.from({ length: 16 }, (_, i) => 1005 + i),
  rechecked: 10,
  // The search starts from the calibrated parameters' provisional values, where R's muscles move; the planned
  // model's fit started at the centre, 0.5 (DECISIONS.md, 2026-09-27).
  start: 'provisional',
  sigma: 0.3,
  seed: 1,
} as const;

// Checkpoint 1's targets (PLAN §7.3): Hz, body lengths, body lengths per second, reversals per minute.
export const TARGETS = { frequency: 0.3, wavelength: 0.65, speed: 0.22, reversalRate: 1.8 } as const;
export type Target = keyof typeof TARGETS;
export const ALL_TARGETS: readonly Target[] = ['frequency', 'wavelength', 'speed', 'reversalRate'];

// R's second round (PLAN §7.3, set 2026-09-28 before any of it ran): the crawl fitted first on the kinematics
// alone, then the noise alone on all four targets; each stage's search restarting, its population doubled, when its
// step falls below `sigma` or its best hasn't fallen for `stall` generations; and a probe of short runs of stage 1,
// each pick graded on seeds of its own, before the full run.
export const SECOND_ROUND = {
  crawl: { targets: ['frequency', 'wavelength', 'speed'] as readonly Target[], budget: 2000 },
  noise: {
    ids: ['noiseIntensity', 'noiseCorrelation'] as readonly CalibratedId[],
    targets: ALL_TARGETS,
    budget: 200,
  },
  restart: { sigma: 0.01, stall: 20 },
  probe: {
    budget: 400,
    seeds: [11, 12, 13, 14],
    gradeSeeds: Array.from({ length: 20 }, (_, i) => 2001 + i),
  },
} as const;
// Each target's relative error is capped at this, and an unmeasured one takes the cap.
export const ERROR_CAP = 2;

export function bounds(id: CalibratedId): readonly [number, number] {
  const b = PARAMS[id].bounds;
  if (!b) throw new Error(`${id} has no bounds`);
  if (MAPPING[id] === 'log' && !(b[0] > 0))
    throw new Error(`${id} is searched logarithmically, so its lower bound must be above 0`);
  return b;
}

const clip = (u: number): number => Math.min(1, Math.max(0, u));

// The calibrated parameters' provisional values (PLAN §6.2), where the search starts.
export function provisionalValues(): Values {
  return Object.fromEntries(
    CALIBRATED.map((id) => {
      const v = PARAMS[id].provisional;
      if (v === undefined) throw new Error(`${id} has no provisional value`);
      return [id, v];
    }),
  ) as Values;
}

// A point in [0, 1]ⁿ, one coordinate for each of `ids` in their order, as parameter values in the registry's
// units, the rest taken from `fixed`; a coordinate outside [0, 1] is taken at the nearest point inside.
export function fromUnit(u: readonly number[], ids: readonly CalibratedId[] = CALIBRATED, fixed?: Values): Values {
  if (u.length !== ids.length) throw new Error(`a candidate needs ${ids.length} coordinates`);
  if (ids.length !== CALIBRATED.length && !fixed) throw new Error('a search over some parameters needs the rest');
  const mapped = Object.fromEntries(
    ids.map((id, i) => {
      const [lo, hi] = bounds(id);
      const t = clip(u[i]);
      // Held within the bounds, so rounding can't carry a value at a bound past it.
      const v = MAPPING[id] === 'log' ? lo * (hi / lo) ** t : lo + (hi - lo) * t;
      return [id, Math.min(hi, Math.max(lo, v))];
    }),
  );
  return { ...fixed, ...mapped } as Values;
}

export function toUnit(values: Values, ids: readonly CalibratedId[] = CALIBRATED): number[] {
  return ids.map((id) => {
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
  // Null when unmeasured: the wavelength with no bout or no head-to-tail wave, and the frequency with no bout of a
  // worm that doesn't move forward past the motion floor; with no bout, a forward mover's is its spectrum's peak.
  frequency: number | null;
  wavelength: number | null;
  // Over the bouts, or the mean forward velocity over the measured windows when there is none.
  speed: number;
  reversalRate: number;
}

// The four targets' measures, pooled over the trials (PLAN §7.3). With `spectral`, as R's second round scores
// (SECOND_ROUND), a worm without a bout that moves forward on average, past the motion floor, has the mid-body
// spectrum's peak for its frequency; without it, as round 1 and the refit's procedure score, it takes the cap.
export function measure(records: readonly KinematicRecord[], options: { spectral?: boolean } = {}): Measures {
  const finite = records.length > 0 && records.every((r) => r.finite);
  const withBouts = records.map((r) => ({ ...r, bouts: bouts(r.velocity) }));
  const count = withBouts.reduce((n, r) => n + r.bouts.length, 0);
  const samples = records.reduce((n, r) => n + r.velocity.length, 0);
  const minutes = (samples * MOTION_SAMPLE) / 60;
  const reversalRate = minutes > 0 ? records.reduce((n, r) => n + reversals(r.velocity).length, 0) / minutes : 0;
  if (count === 0) {
    let sum = 0;
    for (const r of records) for (let k = 0; k < r.velocity.length; k++) sum += r.velocity[k];
    const speed = samples > 0 ? sum / samples : 0;
    return {
      finite,
      bouts: 0,
      frequency: options.spectral && speed > MOTION_FLOOR ? spectralPeak(records).peak : null,
      wavelength: null,
      speed,
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

// The errors on every target, and their sum over `targets`: all four, or a stage's (SECOND_ROUND).
export function objective(m: Measures, targets: readonly Target[] = ALL_TARGETS): Score {
  const error = (x: number | null, target: number): number =>
    x === null || !Number.isFinite(x) ? ERROR_CAP : Math.min(ERROR_CAP, Math.abs((x - target) / target));
  const errors: Record<Target, number> = {
    frequency: error(m.frequency, TARGETS.frequency),
    wavelength: error(m.wavelength, TARGETS.wavelength),
    speed: error(m.speed, TARGETS.speed),
    reversalRate: error(m.reversalRate, TARGETS.reversalRate),
  };
  const value = m.finite ? targets.reduce((s, t) => s + errors[t] ** 2, 0) : Infinity;
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

// One candidate as the search evaluated it: where CMA-ES sampled it, the values it ran at (clipped into the
// bounds), its objective on the fit's seeds, and the penalty the search added for lying outside.
export interface Evaluated {
  // The search's restart, 0 for its first, and the generation within it.
  restart: number;
  generation: number;
  candidate: number;
  unit: number[];
  values: Values;
  value: number;
  penalty: number;
  errors: Record<Target, number>;
  measures: Measures;
  // Brain solves that didn't converge over the candidate's trials.
  unconverged: number;
}

export interface Generation {
  restart: number;
  generation: number;
  // Candidates a generation in this restart, and the evaluations so far across all of them.
  lambda: number;
  evaluations: number;
  // The best objective evaluated so far, without the penalty, and this generation's median with it.
  best: number;
  median: number;
  sigma: number;
  mean: number[];
}

// A candidate's score on some seeds.
export type Scorer = (
  values: Values,
  seeds: readonly number[],
) => Promise<Score & { measures: Measures; unconverged: number }>;

export interface Finalist {
  from: string;
  values: Values;
  // Its objective on the fit's seeds, or null for the final mean.
  fit: number | null;
  value: number;
  errors: Record<Target, number>;
  measures: Measures;
  unconverged: number;
}

export interface Fit {
  generations: Generation[];
  evaluated: Evaluated[];
  checked: Finalist[];
  final: Finalist;
}

// PLAN §7.3's search, from the provisional values or `start`, up to `budget` evaluations, then the final check. It
// searches `ids`, every calibrated parameter by default, the rest held at `fixed`; with `restarts`, R's second
// round's (SECOND_ROUND), CMA-ES starts again from the same point with its population doubled whenever its step
// falls below `restarts.sigma` or its best hasn't fallen for `restarts.stall` generations. A run resumes from the
// evaluations of an earlier one with the same settings: CMA-ES replays them, and each candidate must come out as
// recorded, bit for bit. `extra` candidates join the final check, and `progress` sees each generation as it ends.
export async function calibrate(
  score: Scorer,
  options: {
    budget: number;
    ids?: readonly CalibratedId[];
    fixed?: Values;
    // A point in [0, 1]ⁿ, one coordinate for each of `ids`, to start from instead of the provisional values.
    start?: readonly number[];
    seed?: number;
    restarts?: { sigma: number; stall: number };
    extra?: readonly { from: string; values: Values }[];
    previous?: readonly Evaluated[];
    progress?: (fit: Omit<Fit, 'checked' | 'final'>) => void;
  },
): Promise<Fit> {
  const ids = options.ids ?? CALIBRATED;
  const at = (u: readonly number[]): Values => fromUnit(u, ids, options.fixed);
  const start = [...(options.start ?? toUnit(options.fixed ?? provisionalValues(), ids))];
  if (start.length !== ids.length) throw new Error(`the start needs ${ids.length} coordinates`);
  const seed = options.seed ?? CALIBRATION.seed;
  let restart = 0;
  let drawn = 0;
  const search = (): Cmaes =>
    new Cmaes({
      mean: start,
      sigma: CALIBRATION.sigma,
      seed,
      lambda: defaultLambda(ids.length) * 2 ** restart,
      drawn,
    });
  let es = search();
  // The restart's best, and the generations since it last fell.
  let restartBest = Infinity;
  let stalled = 0;
  // The mean after the last generation told, from whichever restart: the final check's "final mean", so that a
  // restart the budget ends before any update doesn't offer its start.
  let finalMean = [...es.mean];
  const evaluated: Evaluated[] = [];
  const generations: Generation[] = [];
  const previous = options.previous ?? [];
  while (evaluated.length < options.budget) {
    const { restarts } = options;
    if (restarts && es.generation > 0 && (es.sigma < restarts.sigma || stalled >= restarts.stall)) {
      drawn += es.generation;
      restart++;
      es = search();
      restartBest = Infinity;
      stalled = 0;
    }
    const candidates = es.ask();
    const take = Math.min(candidates.length, options.budget - evaluated.length);
    const replayed = previous.slice(evaluated.length, evaluated.length + take);
    const results = await Promise.all(
      candidates.slice(0, take).map(async (u, k): Promise<Evaluated> => {
        const record = replayed[k] as Evaluated | undefined;
        // JSON writes an infinite objective as null; read back, it must rank last again, not as 0.
        const was = record && { ...record, value: (record.value as number | null) ?? Infinity };
        if (was) {
          if (was.unit.length !== u.length || was.unit.some((x, i) => x !== u[i])) {
            throw new Error(
              `the resumed run parts from the recorded one at restart ${restart}, generation ${es.generation}, candidate ${k}`,
            );
          }
          return was;
        }
        const values = at(u);
        const s = await score(values, CALIBRATION.fitSeeds);
        return {
          restart,
          generation: es.generation,
          candidate: k,
          unit: u,
          values,
          value: s.value,
          penalty: outside(u),
          errors: s.errors,
          measures: s.measures,
          unconverged: s.unconverged,
        };
      }),
    );
    evaluated.push(...results);
    const ranked = results.map((e) => e.value + e.penalty);
    const sorted = [...ranked].sort((a, b) => a - b);
    const lowest = Math.min(...results.map((e) => e.value));
    if (lowest < restartBest) {
      restartBest = lowest;
      stalled = 0;
    } else stalled++;
    generations.push({
      restart,
      generation: es.generation,
      lambda: es.lambda,
      evaluations: evaluated.length,
      best: Math.min(...evaluated.map((e) => e.value)),
      median: sorted[Math.floor(sorted.length / 2)],
      sigma: es.sigma,
      mean: [...es.mean],
    });
    options.progress?.({ generations, evaluated });
    // A generation cut short by the budget doesn't update the search.
    if (take === candidates.length) {
      es.tell(ranked);
      finalMean = [...es.mean];
    }
  }
  // The extra candidates first, so that on a tie they are kept (stage 2 must beat stage 1's values), then the best
  // in order of their objective, then the final mean; a candidate already listed isn't run again.
  const seen = new Set<string>();
  const finalists = [
    ...(options.extra ?? []).map((x) => ({ ...x, fit: null as number | null })),
    ...best(evaluated, CALIBRATION.rechecked).map((e) => ({
      from: `${restart > 0 ? `restart ${e.restart}, ` : ''}generation ${e.generation}, candidate ${e.candidate}`,
      values: e.values,
      fit: e.value,
    })),
    { from: 'the final mean', values: at(finalMean), fit: null as number | null },
  ].filter((f) => {
    const key = JSON.stringify(CALIBRATED.map((id) => f.values[id]));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const checked = await Promise.all(
    finalists.map(async (f): Promise<Finalist> => ({ ...f, ...(await score(f.values, CALIBRATION.checkSeeds)) })),
  );
  // The lowest objective on the fresh seeds; on a tie, the earlier in the finalists' order.
  const final = checked.reduce((a, b) => (b.value < a.value ? b : a));
  return { generations, evaluated, checked, final };
}
