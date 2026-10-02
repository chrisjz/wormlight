// One worm of the chemotaxis assay on the CPU reference (PLAN §7.4, checkpoint 4's protocol, which checkpoint 0's
// chemotaxis clause runs on the silenced network): a World started with its centroid at the dish's centre, from
// a real posture drawn by its seed, sensing the assay's steady field, run until any part of its body comes
// within 0.5 cm of either spot's centre, as sodium azide stops a worm there, or its time runs out. Checkpoint 4 runs
// each worm twice, sensing the field and as its control, with AWC-ON's input off: the world given no odour, so
// AWC-ON's current is exactly zero, nothing lesioned (DECISIONS.md, 2026-10-02). Its runs also take the mechanism's
// samples (src/validation/mechanism.ts), reading the field in both arms alike.

import type { WormlightData } from '../data/schema.ts';
import { CAPTURE_RADIUS, CONTROL, SPOT } from '../sim/env/dish.ts';
import { NEURAL_STEP } from '../sim/numerics.ts';
import type { AwcSide, Odour } from '../sim/sensing.ts';
import { fisherGreater } from '../sim/stats.ts';
import {
  klinokinesis,
  MECHANISM,
  mechanism,
  MechanismSampler,
  resampled,
  turningRatio,
  weathervaning,
  type MechanismRecord,
  type MechanismResult,
  type Resampled,
} from './mechanism.ts';
import { MOTION_SAMPLE } from './motion.ts';
import { startingWorld, type StartOptions } from './trial.ts';

export interface ChemotaxisOptions extends StartOptions {
  seconds: number;
  // The assay's field, at its steady state.
  odour: Odour;
  // Where the centroid starts (m from the dish's centre): the assay's is the centre itself.
  at?: readonly [number, number];
  // Checkpoint 4's control, AWC-ON's input off: the world senses no odour, though the field is still read for the
  // mechanism.
  control?: boolean;
  // Whether to take the mechanism's samples, as checkpoint 4 does.
  mechanism?: boolean;
}

export type Spot = 'odour' | 'control';

export interface ChemotaxisRecord {
  seed: number;
  posture: number;
  turn: number;
  awcSide: AwcSide;
  // False if the body left the finite numbers, in which case the run stops there.
  finite: boolean;
  // The spot the worm reached, and when (s), or null if it reached neither in the run's time.
  reached: Spot | null;
  time: number | null;
  // The simulated time run (s).
  seconds: number;
  // The nearest any part of the body came to each spot's centre (m).
  closest: Record<Spot, number>;
  // The centroid at the start and the end (m from the dish's centre), the end null if the body left the finite
  // numbers, and the farthest it got from its start, sampled every 0.1 s and at the end.
  start: [number, number];
  end: [number, number] | null;
  farthest: number;
  unconverged: number;
  // Checkpoint 4's runs: which arm, and the mechanism's record.
  control?: boolean;
  mechanism?: MechanismRecord;
}

// The nearest any rod's centre lies to a point (m). The rods lie 21 µm apart along the midline.
function nearest(x: ArrayLike<number>, y: ArrayLike<number>, [px, py]: readonly [number, number]): number {
  let best = Infinity;
  for (let i = 0; i < x.length; i++) best = Math.min(best, Math.hypot(x[i] - px, y[i] - py));
  return best;
}

export function runChemotaxis(data: WormlightData, options: ChemotaxisOptions): ChemotaxisRecord {
  const { seed, seconds } = options;
  // The control senses nothing: its world has no odour.
  const {
    world,
    start,
    posture: angles,
  } = startingWorld(data, options.control ? { ...options, odour: undefined } : options);
  const { body } = world;
  const centroid = (): [number, number] => {
    let x = 0;
    let y = 0;
    for (let i = 0; i < body.rods; i++) {
      x += body.x[i];
      y += body.y[i];
    }
    return [x / body.rods, y / body.rods];
  };
  // The same posture moved so its centroid sits at the dish's centre, with AWC-ON adapted there.
  const [cx, cy] = centroid();
  const [ax, ay] = options.at ?? [0, 0];
  body.pose(angles, ax - cx, ay - cy);
  world.adapt();
  const from = centroid();
  // The mechanism's samples, from t = 0 every 0.1 s, the field read in either arm.
  const sampler = options.mechanism ? new MechanismSampler(body, options.odour, world.nose) : null;
  sampler?.sample();
  const closest = { odour: Infinity, control: Infinity };
  // The spot the body now reaches, if any, noting how near it has come to each.
  const arrived = (): Spot | null => {
    closest.odour = Math.min(closest.odour, nearest(body.x, body.y, SPOT));
    closest.control = Math.min(closest.control, nearest(body.x, body.y, CONTROL));
    return closest.odour <= CAPTURE_RADIUS ? 'odour' : closest.control <= CAPTURE_RADIUS ? 'control' : null;
  };
  const every = Math.round(MOTION_SAMPLE / NEURAL_STEP);
  const steps = Math.round(seconds / NEURAL_STEP);
  let farthest = 0;
  let finite = true;
  let reached = arrived();
  let step = 0;
  while (reached === null && step < steps) {
    world.step();
    step++;
    if (!body.x.every(Number.isFinite) || !body.y.every(Number.isFinite)) {
      finite = false;
      break;
    }
    if (step % every === 0) {
      const [x, y] = centroid();
      farthest = Math.max(farthest, Math.hypot(x - from[0], y - from[1]));
      sampler?.sample();
    }
    reached = arrived();
  }
  const end = finite ? centroid() : null;
  if (end) farthest = Math.max(farthest, Math.hypot(end[0] - from[0], end[1] - from[1]));
  return {
    seed,
    posture: start.index,
    turn: start.turn,
    awcSide: world.awcSide,
    finite,
    reached,
    time: reached === null ? null : step * NEURAL_STEP,
    seconds: step * NEURAL_STEP,
    closest,
    start: from,
    end,
    farthest,
    unconverged: world.brain.unconverged,
    ...(options.control ? { control: true } : {}),
    ...(sampler && finite ? { mechanism: sampler.reduce(body.params.segmentLength * body.params.segments) } : {}),
  };
}

// Checkpoint 4 (PLAN §7.4; DECISIONS.md, 2026-10-02): 100 worms for up to 60 min, each run intact and as its control.
// It passes with a chemotaxis index of 0.6 or more and more intact worms than control worms reaching the odour, by
// Fisher's exact test, one-sided, and is partial with an index from 0.2 with the test.
export const CHECKPOINT_4 = { worms: 100, seconds: 3600, pass: 0.6, partial: 0.2 } as const;

export interface Arrivals {
  odour: number;
  control: number;
  neither: number;
  // (at odour − at control) / every worm run.
  index: number;
}

export interface Checkpoint4 {
  grade: 'pass' | 'partial' | 'fail';
  worms: number;
  unmeasured: string | null;
  unconverged: number;
  intact: Arrivals;
  control: Arrivals;
  // Fisher's exact test, one-sided: more intact worms than control worms reaching the odour.
  p: number;
  // The mechanism, reported and never gating, null where no worm's run gave its samples.
  klinokinesis: MechanismResult | null;
  weathervaning: MechanismResult | null;
  // Their companions, reported: the turning ratio, and weathervaning's slope over every transition with the floor
  // kept and over the clean ones with none, each with its intact 80% interval and the control's value.
  companions: { name: string; intact: Resampled; control: number | null }[];
  // The runs, by seed, for the report's table.
  runs: { seed: number; awcSide: string; intact: ChemotaxisRecord; control: ChemotaxisRecord }[];
}

const arrivals = (runs: readonly ChemotaxisRecord[]): Arrivals => {
  const odour = runs.filter((r) => r.reached === 'odour').length;
  const control = runs.filter((r) => r.reached === 'control').length;
  return {
    odour,
    control,
    neither: runs.length - odour - control,
    index: runs.length > 0 ? (odour - control) / runs.length : 0,
  };
};

export function checkpoint4(
  intact: readonly ChemotaxisRecord[],
  control: readonly ChemotaxisRecord[],
  resamples: number = MECHANISM.resamples,
): Checkpoint4 {
  const a = [...intact].sort((x, y) => x.seed - y.seed);
  const b = [...control].sort((x, y) => x.seed - y.seed);
  if (a.length !== b.length || a.some((r, k) => r.seed !== b[k].seed)) {
    throw new Error('the intact runs and their controls pair seed by seed');
  }
  const all = [...a, ...b];
  const broken = all.find((r) => !r.finite);
  const unmeasured = a.length === 0 ? 'no worms' : broken ? `seed ${broken.seed}'s run left the finite numbers` : null;
  const [ia, ca] = [arrivals(a), arrivals(b)];
  const p = fisherGreater(ia.odour, a.length, ca.odour, b.length);
  const significant = p < 0.05;
  const grade =
    unmeasured !== null
      ? 'fail'
      : ia.index >= CHECKPOINT_4.pass && significant
        ? 'pass'
        : ia.index >= CHECKPOINT_4.partial && significant
          ? 'partial'
          : 'fail';
  // The mechanism over the worms whose two runs both gave their samples, paired by seed.
  const paired = a.flatMap((r, k) => (r.mechanism && b[k].mechanism ? [[r.mechanism, b[k].mechanism] as const] : []));
  const [mi, mc] = [paired.map((p) => p[0]), paired.map((p) => p[1])];
  const sound = paired.length > 0;
  const companion = (
    name: string,
    statistic: (set: readonly MechanismRecord[]) => number | null,
  ): Checkpoint4['companions'][number] => ({
    name,
    intact: resampled(mi, statistic, resamples),
    control: statistic(mc),
  });
  return {
    grade,
    worms: a.length,
    unmeasured,
    unconverged: all.reduce((n, r) => n + r.unconverged, 0),
    intact: ia,
    control: ca,
    p,
    klinokinesis: sound ? mechanism(mi, mc, klinokinesis, 1, resamples) : null,
    weathervaning: sound
      ? mechanism(mi, mc, (set) => weathervaning(set, { clean: true, floor: true }), 0, resamples)
      : null,
    companions: sound
      ? [
          companion('turning', turningRatio),
          companion('every transition', (set) => weathervaning(set, { clean: false, floor: true })),
          companion('no floor', (set) => weathervaning(set, { clean: true, floor: false })),
        ]
      : [],
    runs: a.map((r, k) => ({ seed: r.seed, awcSide: r.awcSide, intact: r, control: b[k] })),
  };
}
