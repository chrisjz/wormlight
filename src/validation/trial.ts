// One behavioural trial on the CPU reference (PLAN §7.4): a World started from a real posture drawn by the
// trial's seed, run for its duration, touched if its protocol says so, and sampled for the measures
// checkpoints 0 and 1 take.

import type { WormlightData } from '../data/schema.ts';
import { PARAMS } from '../science/params.ts';
import { passiveLoads } from '../sim/brain/brain.ts';
import type { Network } from '../sim/brain/network.ts';
import { hash, uniform } from '../sim/brain/rng.ts';
import { NEURAL_STEP } from '../sim/numerics.ts';
import type { Odour } from '../sim/sensing.ts';
import { World, type LoopParams } from '../sim/world.ts';
import {
  MEASURE_FROM,
  MOTION_SAMPLE,
  forwardVelocity,
  headAngle,
  measuredRun,
  noMotion,
  takeMotion,
} from './motion.ts';
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
  // A different brain on the same neurons, as a sensitivity setting is (src/validation/sensitivity.ts), with its own
  // thresholds; the real wiring without one.
  network?: Network;
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
  // Whether each touch forks a sham twin, as checkpoint 0's reruns grade them (PLAN §7.4, changed after results
  // 2026-09-27): at the touch the world is copied, the copy takes a sham touch in its place, and it runs SHAM_SECONDS
  // on while the touched line runs on.
  shams?: boolean;
  // Whether to record the head angle at each sample, for head swings (PLAN §7.1), as checkpoint 5's rows count them
  // within reversals.
  headAngles?: boolean;
}

// How long a sham twin runs after its touch: as long as the touch's windows need, TOUCH_NEEDS in checkpoints.ts, which
// a test holds it to.
export const SHAM_SECONDS = 3.5;

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
  // The head angle (rad) at the same samples, when the trial was asked to record it (PLAN §7.1).
  headAngle?: number[];
  // Postures from the first 10 s on, at 4 Hz: the sums for their covariance, and how many self-intersected.
  postures: PostureSums;
  selfIntersecting: number;
  // Brain solves that did not converge.
  unconverged: number;
  // The touches made, and the receptors each reached.
  touches: (TrialTouch & { reached: string[] })[];
  // With shams, each touch's twin, in the touches' order: whether it stayed finite, its brain solves that didn't
  // converge, and its forward velocity from the first 10 s on, from the touched line's positions up to the touch and
  // its own after, until 3 s after it, where the touch's windows end.
  shams?: { time: number; finite: boolean; unconverged: number; velocity: number[] }[];
  // For checkpoint 1's diagnostics (PLAN §7.4): when the head switch flipped (s from the start), and AVA's
  // activation, the mean of AVAL's and AVAR's, aligned with the velocity samples.
  switchFlips: number[];
  ava: number[];
  // For the voltage diagnostic (PLAN §7.4, added 2026-09-29): how many neurons lie outside the model's reversal
  // range at each sample, and how many lie more than FAR_OUTSIDE past it, aligned with the velocity samples; and
  // the lowest and highest voltages at every step of the 0.1 s each of those samples starts (mV). Records made
  // before it have none, and so does a trial too short to measure.
  outside?: number[];
  far?: number[];
  lowest?: number;
  highest?: number;
  // In the conductance form (PLAN §7.4, added 2026-09-29), over the measured samples: their count; the sums of each
  // layer's shunt, the mean over its targets of their conductance over their passive loads at rest, the head switch's
  // on the SMDs and proprioception's on the A- and B-types with fields, or null for a layer with no targets; and how
  // many times the head switch's gate turned on or off over the measured steps. Trials in the current form have none.
  conductance?: { samples: number; switchShunt: number | null; proprioShunt: number | null; gateToggles: number };
  // For what paces the crawl (PLAN §7.4, added 2026-09-29 before round 3 ran), over the measured steps, in either
  // form: their count, those whose gate was open, and the sums of the head-switch drive less θ_osc that each step's
  // gate read, and of its square (mV, mV²). The gate is open when that margin is above 0, whatever g_sw is, so a
  // switch at 0 still shows it. Records made before it have none.
  gate?: { steps: number; open: number; margin: number; marginSquares: number };
}

// The voltage diagnostic's second count: neurons more than this far past the reversal range (mV). Ours, and
// reported, not graded (PLAN §7.4, added after review 2026-09-29).
export const FAR_OUTSIDE = 10;

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
      network: options.network,
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
  const { world, start, posture } = startingWorld(data, options);
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
  const shams: NonNullable<TrialRecord['shams']> = [];
  // A twin runs SHAM_SECONDS on, so its touch must leave it that long before the next touch and the trial's end:
  // otherwise the touched line would take a touch its twin doesn't, or the twin would outrun the trial.
  if (options.shams) {
    const times = [...(options.touches ?? [])].map((t) => t.time).sort((a, b) => a - b);
    times.forEach((time, k) => {
      const next = k + 1 < times.length ? times[k + 1] : seconds;
      if (time + SHAM_SECONDS > next + 1e-9) {
        throw new Error(
          `a touch at ${time} s leaves its sham twin under ${SHAM_SECONDS} s before the next touch or the end`,
        );
      }
    });
  }
  const switchFlips: number[] = [];
  let side = world.headSwitch.h;
  const avaIndex = ['AVAL', 'AVAR'].map((name) => data.neurons.findIndex((n) => n.name === name));
  const avaSamples: number[] = [];
  // The reversal range: no chemical synapse or leak can take a neuron past it. Injected currents can, and so can
  // gap currents from a neuron already past it.
  const [floor, ceiling] = [PARAMS.reversalInhibitory.value as number, PARAMS.reversalExcitatory.value as number];
  const outsideSamples: number[] = [];
  const farSamples: number[] = [];
  // The shunt's targets, and their passive loads in this world's network, lesioned or silenced as it is, at its rest,
  // each rectified junction's gate as that rest sets it.
  const conducting = world.params.form === 'conductance';
  const loads = conducting ? passiveLoads(world.brain.restNetwork(), world.brain.restActivations()) : null;
  const switchTargets = [...world.dorsalSwitch, ...world.ventralSwitch];
  const fieldTargets = world.fields.map((f) => f.neuron);
  const shunt: { switch: number[]; proprioception: number[] } = { switch: [], proprioception: [] };
  const share = (targets: readonly number[]): number =>
    loads ? targets.reduce((sum, i) => sum + world.brain.conductance[i] / loads[i], 0) / targets.length : 0;
  // The gate's turns on or off, over the 0.1 s from each sample to the next.
  const toggles: number[] = [];
  let [turned, open] = [0, world.switchCurrent !== 0];
  // The gate over the same stretches, each step counted in the stretch its gate was read in: its steps, those it was
  // open, and the drive's margin, summed and squared.
  const gate: [number, number, number, number][] = [];
  let [gateSteps, gateOpen, margin, margins] = [0, 0, 0, 0];
  // The voltages' extremes at every step, over the 0.1 s from each sample to the next.
  const extremes: [number, number][] = [];
  let [low, high] = [Infinity, -Infinity];
  const scan = (): void => {
    for (const v of world.brain.voltage) {
      if (v < low) low = v;
      if (v > high) high = v;
    }
  };
  const motion = noMotion();
  const angles: number[] = [];
  const k = new Float64Array(body.rods);
  const sums = emptySums();
  let selfIntersecting = 0;
  let finite = true;
  const sample = (): void => {
    takeMotion(motion, body.x, body.y, length, k);
    if (options.headAngles) angles.push(headAngle(body.x, body.y, body.params.segments));
    avaSamples.push(avaIndex.reduce((a, i) => a + world.brain.activation[i], 0) / avaIndex.length);
    // A voltage that isn't a number counts as outside, in both counts.
    let outside = 0;
    let far = 0;
    for (const v of world.brain.voltage) {
      if (!(v >= floor && v <= ceiling)) outside++;
      if (!(v >= floor - FAR_OUTSIDE && v <= ceiling + FAR_OUTSIDE)) far++;
    }
    outsideSamples.push(outside);
    farSamples.push(far);
    if (conducting) {
      shunt.switch.push(share(switchTargets));
      shunt.proprioception.push(share(fieldTargets));
    }
  };
  sample();
  scan();
  // A sham twin of the world as it stands, at the touch before step s: a copy that takes a sham touch in its place
  // and runs SHAM_SECONDS on, sampled as the touched line is. It draws the same noise, since its state and seed are
  // the touched line's.
  const shamTwin = (touch: TrialTouch, s: number): NonNullable<TrialRecord['shams']>[number] => {
    const twin = new World(data, options.params, {
      seed,
      silenced: options.silenced,
      lesions: options.lesions,
      network: options.network,
      neuralSubsteps: options.neuralSubsteps,
      noiseGrid: options.noiseGrid,
      posture,
      odour: options.odour,
    });
    twin.restore(world.snapshot());
    const unconverged = twin.brain.unconverged;
    twin.sham(touch.s);
    const [c, h] = [[...motion.centroid], [...motion.head]];
    let ok = true;
    for (let j = 0; j < Math.round(SHAM_SECONDS / NEURAL_STEP); j++) {
      twin.step();
      if (!twin.body.x.every(Number.isFinite) || !twin.body.y.every(Number.isFinite)) {
        ok = false;
        break;
      }
      if ((s + j) % every === 0) {
        let [x, y] = [0, 0];
        for (let i = 0; i < twin.body.rods; i++) [x, y] = [x + twin.body.x[i], y + twin.body.y[i]];
        c.push(x / twin.body.rods, y / twin.body.rods);
        h.push(twin.body.x[0], twin.body.y[0]);
      }
    }
    return {
      time: touch.time,
      finite: ok,
      unconverged: twin.brain.unconverged - unconverged,
      velocity: Array.from(forwardVelocity(c, h, length)),
    };
  };
  for (let s = 1; s <= steps; s++) {
    const touch = due.get(s - 1);
    if (touch && options.shams) shams.push(shamTwin(touch, s));
    if (touch) touches.push({ ...touch, reached: world.touch(touch.s).map((r) => r.name) });
    // The margin this step's gate reads: the step computes the same drive before it moves anything.
    const m = world.headDrive() - world.params.driveThreshold;
    world.step();
    if (!body.x.every(Number.isFinite) || !body.y.every(Number.isFinite)) {
      finite = false;
      break;
    }
    [gateSteps, gateOpen] = [gateSteps + 1, gateOpen + (m > 0 ? 1 : 0)];
    [margin, margins] = [margin + m, margins + m * m];
    if (world.headSwitch.h !== side) {
      side = world.headSwitch.h;
      switchFlips.push(s * NEURAL_STEP);
    }
    if (s % every === 0) {
      extremes.push([low, high]);
      toggles.push(turned);
      gate.push([gateSteps, gateOpen, margin, margins]);
      [low, high, turned] = [Infinity, -Infinity, 0];
      [gateSteps, gateOpen, margin, margins] = [0, 0, 0, 0];
      sample();
    }
    scan();
    if ((world.switchCurrent !== 0) !== open) [turned, open] = [turned + 1, !open];
    if (s >= from && s % posturesEvery === 0) {
      const points = resample(body.midline());
      if (selfIntersects(points)) selfIntersecting++;
      else addPosture(sums, tangentAngles(points));
    }
  }
  extremes.push([low, high]);
  toggles.push(turned);
  gate.push([gateSteps, gateOpen, margin, margins]);
  const run = measuredRun(motion, length);
  const { velocity } = run;
  // The other samples that line up with the velocity's, as its curvature samples do: from the first 10 s, as many
  // as it has.
  const first = Math.round(MEASURE_FROM / MOTION_SAMPLE);
  const aligned = <T>(a: T[]): T[] => a.slice(first, first + velocity.length);
  const measured = aligned(extremes);
  const total = (a: readonly number[]): number => a.reduce((sum, x) => sum + x, 0);
  const gated = aligned(gate);
  const column = (c: number): number => total(gated.map((g) => g[c]));
  return {
    seed,
    seconds,
    posture: start.index,
    turn: start.turn,
    finite,
    velocity: Array.from(velocity),
    mid: run.mid,
    front: run.front,
    rear: run.rear,
    ...(options.headAngles ? { headAngle: aligned(angles) } : {}),
    postures: sums,
    selfIntersecting,
    unconverged: world.brain.unconverged,
    touches,
    ...(options.shams ? { shams } : {}),
    switchFlips,
    ava: aligned(avaSamples),
    ...(measured.length > 0
      ? {
          outside: aligned(outsideSamples),
          far: aligned(farSamples),
          lowest: measured.reduce((m, [lo]) => Math.min(m, lo), Infinity),
          highest: measured.reduce((m, [, hi]) => Math.max(m, hi), -Infinity),
          gate: { steps: column(0), open: column(1), margin: column(2), marginSquares: column(3) },
          ...(conducting
            ? {
                conductance: {
                  samples: measured.length,
                  switchShunt: switchTargets.length > 0 ? total(aligned(shunt.switch)) : null,
                  proprioShunt: fieldTargets.length > 0 ? total(aligned(shunt.proprioception)) : null,
                  gateToggles: total(aligned(toggles)),
                },
              }
            : {}),
        }
      : {}),
  };
}
