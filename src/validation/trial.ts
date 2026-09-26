// One behavioural trial on the CPU reference (PLAN §7.4): a World started from a real posture drawn by the
// trial's seed, run for its duration, and sampled for the measures checkpoints 0 and 1 take.

import type { WormlightData } from '../data/schema.ts';
import { hash, uniform } from '../sim/brain/rng.ts';
import { NEURAL_STEP } from '../sim/numerics.ts';
import { curvature } from '../sim/proprio.ts';
import { World, type LoopParams } from '../sim/world.ts';
import { FRONT_ROD, MEASURE_FROM, MID_ROD, MOTION_SAMPLE, REAR_ROD, forwardVelocity } from './motion.ts';
import { addPosture, emptySums, resample, selfIntersects, tangentAngles, type PostureSums } from './posture.ts';

// Postures are sampled at 4 Hz, as Stephens et al. sampled theirs.
export const POSTURE_SAMPLE = 0.25; // s

// The trial's starting posture: which of the real postures, and the angle it is turned through. The draws use
// hashes no noise draw reaches, and differ from the one that picks the head switch's first side.
export function startingPosture(seed: number, count: number): { index: number; turn: number } {
  return {
    index: Math.floor(uniform(hash(seed, 0, 0xfffffffe)) * count),
    turn: 2 * Math.PI * uniform(hash(seed, 0, 0xfffffffd)),
  };
}

export interface TrialOptions {
  seed: number;
  seconds: number;
  params: LoopParams;
  // Checkpoint 0's silenced network (PLAN §7.2).
  silenced?: boolean;
  // The real postures, each the tangent angles head first with their mean removed.
  postures: readonly (readonly number[])[];
}

export interface TrialRecord {
  seed: number;
  posture: number;
  turn: number;
  // False if the body left the finite numbers, in which case the samples stop there.
  finite: boolean;
  // From the first 10 s on, every 0.1 s: forward velocity (body lengths per second) and κL at the mid-body,
  // front and rear rods, aligned sample for sample.
  velocity: number[];
  mid: number[];
  front: number[];
  rear: number[];
  // Postures from the first 10 s on, at 4 Hz: the sums for their covariance, and how many self-intersected.
  postures: PostureSums;
  selfIntersecting: number;
  // Brain solves that did not converge.
  unconverged: number;
}

export function runTrial(data: WormlightData, options: TrialOptions): TrialRecord {
  const { seed, seconds, params, postures } = options;
  const start = startingPosture(seed, postures.length);
  const world = new World(data, params, {
    seed,
    silenced: options.silenced,
    posture: postures[start.index].map((a) => a + start.turn),
  });
  const { body } = world;
  const length = body.params.segmentLength * body.params.segments;
  const every = Math.round(MOTION_SAMPLE / NEURAL_STEP);
  const posturesEvery = Math.round(POSTURE_SAMPLE / NEURAL_STEP);
  const from = Math.round(MEASURE_FROM / NEURAL_STEP);
  const steps = Math.round(seconds / NEURAL_STEP);
  const centroid: number[] = [];
  const head: number[] = [];
  const bend: [number[], number[], number[]] = [[], [], []];
  const k = new Float64Array(body.rods);
  const sums = emptySums();
  let selfIntersecting = 0;
  let finite = true;
  const sample = (): void => {
    let x = 0;
    let y = 0;
    for (let i = 0; i < body.rods; i++) {
      x += body.x[i];
      y += body.y[i];
    }
    centroid.push(x / body.rods, y / body.rods);
    head.push(body.x[0], body.y[0]);
    curvature(body, k);
    bend[0].push(k[MID_ROD]);
    bend[1].push(k[FRONT_ROD]);
    bend[2].push(k[REAR_ROD]);
  };
  sample();
  for (let s = 1; s <= steps; s++) {
    world.step();
    if (!body.x.every(Number.isFinite) || !body.y.every(Number.isFinite)) {
      finite = false;
      break;
    }
    if (s % every === 0) sample();
    if (s >= from && s % posturesEvery === 0) {
      const points = resample(body.midline());
      if (selfIntersects(points)) selfIntersecting++;
      else addPosture(sums, tangentAngles(points));
    }
  }
  const velocity = forwardVelocity(centroid, head, length);
  // The curvature samples that line up with the velocity's: from the first 10 s, as many as it has.
  const first = Math.round(MEASURE_FROM / MOTION_SAMPLE);
  const aligned = (a: number[]): number[] => a.slice(first, first + velocity.length);
  return {
    seed,
    posture: start.index,
    turn: start.turn,
    finite,
    velocity: Array.from(velocity),
    mid: aligned(bend[0]),
    front: aligned(bend[1]),
    rear: aligned(bend[2]),
    postures: sums,
    selfIntersecting,
    unconverged: world.brain.unconverged,
  };
}
