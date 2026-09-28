// One behavioural trial on the CPU reference (PLAN §7.4): a World started from a real posture drawn by the
// trial's seed, run for its duration, touched if its protocol says so, and sampled for the measures
// checkpoints 0 and 1 take.

import type { WormlightData } from '../data/schema.ts';
import { hash, uniform } from '../sim/brain/rng.ts';
import { NEURAL_STEP } from '../sim/numerics.ts';
import { curvature } from '../sim/proprio.ts';
import type { Odour } from '../sim/sensing.ts';
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

// A tap at body coordinate s (0 at the nose, 1 at the tail's tip) at `time` (s).
export interface TrialTouch {
  time: number;
  s: number;
}

// What a world at the start of a trial or an assay run needs.
export interface StartOptions {
  seed: number;
  params: LoopParams;
  // Checkpoint 0's silenced network (PLAN §7.2).
  silenced?: boolean;
  // Neurons laser-ablated, as checkpoint 5's rows lesion them, keeping the intact network's thresholds (PLAN §3.3).
  lesions?: readonly string[];
  // The second numerics study's options, which the model doesn't use (World's, DECISIONS.md, 2026-09-28).
  neuralSubsteps?: number;
  noiseGrid?: number;
  // The real postures, each the tangent angles head first with their mean removed.
  postures: readonly (readonly number[])[];
  // The odour AWC-ON senses; trials have none.
  odour?: Odour;
}

export interface TrialOptions extends StartOptions {
  seconds: number;
  // Touches, each starting with the step after its time (PLAN §7.4, checkpoint 0's touch clause).
  touches?: readonly TrialTouch[];
}

export interface TrialRecord {
  seed: number;
  // The trial's length (s).
  seconds: number;
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
  // The touches made, and the receptors each reached.
  touches: (TrialTouch & { reached: string[] })[];
  // For checkpoint 1's diagnostics (PLAN §7.4): when the head switch flipped (s from the start), and AVA's
  // activation, the mean of AVAL's and AVAR's, aligned with the velocity samples.
  switchFlips: number[];
  ava: number[];
}

// The world at its start: the real posture its seed draws, turned, head at the dish's centre.
export function startingWorld(
  data: WormlightData,
  options: StartOptions,
): { world: World; start: { index: number; turn: number }; posture: number[] } {
  const { seed, params, postures } = options;
  const start = startingPosture(seed, postures.length);
  const posture = postures[start.index].map((a) => a + start.turn);
  return {
    world: new World(data, params, {
      seed,
      silenced: options.silenced,
      lesions: options.lesions,
      neuralSubsteps: options.neuralSubsteps,
      noiseGrid: options.noiseGrid,
      posture,
      odour: options.odour,
    }),
    start,
    posture,
  };
}

export function runTrial(data: WormlightData, options: TrialOptions): TrialRecord {
  const { seed, seconds } = options;
  const { world, start } = startingWorld(data, options);
  const { body } = world;
  const length = body.params.segmentLength * body.params.segments;
  const every = Math.round(MOTION_SAMPLE / NEURAL_STEP);
  const posturesEvery = Math.round(POSTURE_SAMPLE / NEURAL_STEP);
  const from = Math.round(MEASURE_FROM / NEURAL_STEP);
  const steps = Math.round(seconds / NEURAL_STEP);
  // Each touch by the step it follows, which must be one of the trial's.
  const due = new Map<number, TrialTouch>();
  for (const t of options.touches ?? []) {
    const after = t.time / NEURAL_STEP;
    const step = Math.round(after);
    if (Math.abs(after - step) > 1e-6 || step < 0 || step >= steps || due.has(step)) {
      throw new Error(`a touch at ${t.time} s doesn't fall on a step of its own within the trial`);
    }
    due.set(step, t);
  }
  const touches: TrialRecord['touches'] = [];
  const switchFlips: number[] = [];
  let side = world.headSwitch.h;
  const avaIndex = ['AVAL', 'AVAR'].map((name) => data.neurons.findIndex((n) => n.name === name));
  const avaSamples: number[] = [];
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
    avaSamples.push(avaIndex.reduce((a, i) => a + world.brain.activation[i], 0) / avaIndex.length);
  };
  sample();
  for (let s = 1; s <= steps; s++) {
    const touch = due.get(s - 1);
    if (touch) touches.push({ ...touch, reached: world.touch(touch.s).map((r) => r.name) });
    world.step();
    if (!body.x.every(Number.isFinite) || !body.y.every(Number.isFinite)) {
      finite = false;
      break;
    }
    if (world.headSwitch.h !== side) {
      side = world.headSwitch.h;
      switchFlips.push(s * NEURAL_STEP);
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
    seconds,
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
    touches,
    switchFlips,
    ava: aligned(avaSamples),
  };
}
