// GPU parity for the whole loop (PLAN §7.2): the body, the muscles and the head switch join the brain. From
// the rest world and twenty from its closed loop, both sides take one step, then one second, running every
// layer; the thresholds are the body's row of §7.2, set before any loop results, and the brain's are as
// before. Long runs, 20 seeds a side for 60 s, are compared by the body wave's statistics with Welch's two
// one-sided tests, while the worm doesn't crawl.

import type { WormlightData } from '../data/schema.ts';
import { WAVE_ROD, WAVE_SAMPLE, WAVE_WARM_UP, bodyWave, type BodyWave } from '../sim/bodyWave.ts';
import { CG_TOLERANCE_GPU, NEURAL_STEP } from '../sim/numerics.ts';
import { curvatureOf } from '../sim/proprio.ts';
import { equivalence, type Equivalence } from '../sim/stats.ts';
import type { World, WorldState } from '../sim/world.ts';
import { compareStep, type StepResult } from './parity.ts';
import {
  centroidFloor,
  cpuWorld,
  endVelocities,
  FLOOR,
  LOOP_SECOND,
  LOOP_STEP,
  loopCases,
  MOST_ILL_POSED,
  ONE_SECOND,
  rms,
  SAMPLES,
  SECOND,
  seededWorld,
  velocityFloors,
  type LoopCase,
} from './parityCases.ts';
import { GpuWorld } from './world.ts';

export interface LoopStepResult extends StepResult {
  // Graded: the largest error in the rods' end points' velocities, in x and y, as shares of their tolerance.
  // Reported: the same for the rods' centres, and their rotation.
  endShares: [number, number];
  centreShares: [number, number, number];
  muscleShare: number;
  switchSame: boolean;
}

// The largest error of each of `width` interleaved components, as a share of its tolerance: 10⁻² of the
// largest, or the floor.
function shares(cpu: ArrayLike<number>, gpu: ArrayLike<number>, width: number, floors: number[]): number[] {
  return floors.map((floor, c) => {
    let largest = 0;
    let error = 0;
    for (let i = c; i < cpu.length; i += width) {
      largest = Math.max(largest, Math.abs(cpu[i]));
      error = Math.max(error, Math.abs(cpu[i] - gpu[i]));
    }
    return error / Math.max(LOOP_STEP.velocity * largest, floor);
  });
}

async function checkLoopStep(gpu: GpuWorld, data: WormlightData, c: LoopCase): Promise<LoopStepResult> {
  const cpu = cpuWorld(data, c.state, CG_TOLERANCE_GPU);
  const reference = cpuWorld(data, c.state);
  cpu.step();
  reference.step();
  gpu.restore(c.state);
  gpu.run(1);
  const { state, status } = await gpu.read();
  const brain = compareStep(c.label, cpu.brain, c.state.brain.steps, cpu.brain, reference.brain, {
    state: state.brain,
    status,
  });
  const floors = velocityFloors(cpu);
  const rates = cpu.body.lastRates();
  const endShares = shares(
    endVelocities(cpu, c.state.theta, rates),
    endVelocities(cpu, c.state.theta, state.velocity),
    2,
    floors.slice(0, 2),
  ) as [number, number];
  const centreShares = shares(rates, state.velocity, 3, floors) as [number, number, number];
  let muscle = 0;
  cpu.muscles.activation.forEach((a, m) => {
    muscle = Math.max(muscle, Math.abs(a - state.muscles[m]) / LOOP_STEP.muscle);
  });
  const switchSame = cpu.headSwitch.h === state.h && cpu.switchCurrent === state.switchCurrent;
  return {
    ...brain,
    endShares,
    centreShares,
    muscleShare: muscle,
    switchSame,
    pass: brain.pass && endShares.every((v) => v <= 1) && muscle <= 1 && switchSame,
  };
}

export interface LoopSecondResult {
  label: string;
  // The worst sample's shares of the thresholds: the voltage's and activation's RMS relative errors (their
  // threshold is 10⁻²), the curvature profile's and the centroid's travel's.
  shares: { voltage: number; activation: number; curvature: number; centroid: number };
  // The same for the CPU reference rerun at the GPU's solver tolerance, against itself, as one share: the
  // state is graded only if it is at most 1.
  referenceShare: number;
  graded: boolean;
  pass: boolean;
}

const centroid = (x: ArrayLike<number>, y: ArrayLike<number>): [number, number] => {
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < x.length; i++) {
    cx += x[i];
    cy += y[i];
  }
  return [cx / x.length, cy / x.length];
};

// Shares of the one-second thresholds, of `other` against `reference`, from a common start.
function secondShares(
  world: World,
  start: [number, number],
  reference: WorldState,
  other: WorldState,
): LoopSecondResult['shares'] {
  const scale = world.body.params.segmentLength * world.body.params.segments;
  const kr = new Float64Array(reference.x.length);
  const ko = new Float64Array(other.x.length);
  curvatureOf(reference.x, reference.y, scale, kr);
  curvatureOf(other.x, other.y, scale, ko);
  let squares = 0;
  let size = 0;
  for (let i = 1; i < kr.length - 1; i++) {
    squares += (kr[i] - ko[i]) ** 2;
    size += kr[i] ** 2;
  }
  const interior = kr.length - 2;
  const curvature = Math.sqrt(squares / interior) / Math.max(Math.sqrt(size / interior), 1);
  const [rx, ry] = centroid(reference.x, reference.y);
  const [ox, oy] = centroid(other.x, other.y);
  const travelled = Math.hypot(rx - start[0], ry - start[1]);
  const centroidError = Math.hypot(ox - rx, oy - ry) / Math.max(travelled, centroidFloor(world));
  return {
    voltage: rms(reference.brain.voltage, other.brain.voltage, FLOOR) / ONE_SECOND.rms,
    activation: rms(reference.brain.activation, other.brain.activation, 1) / ONE_SECOND.rms,
    curvature: curvature / LOOP_SECOND.curvature,
    centroid: centroidError / LOOP_SECOND.centroid,
  };
}

const worse = (a: LoopSecondResult['shares'], b: LoopSecondResult['shares']): LoopSecondResult['shares'] => ({
  voltage: Math.max(a.voltage, b.voltage),
  activation: Math.max(a.activation, b.activation),
  curvature: Math.max(a.curvature, b.curvature),
  centroid: Math.max(a.centroid, b.centroid),
});

async function checkLoopSecond(gpu: GpuWorld, data: WormlightData, c: LoopCase): Promise<LoopSecondResult> {
  const cpu = cpuWorld(data, c.state);
  const loose = cpuWorld(data, c.state, CG_TOLERANCE_GPU);
  gpu.restore(c.state);
  const start = centroid(c.state.x, c.state.y);
  const none = { voltage: 0, activation: 0, curvature: 0, centroid: 0 };
  let shares = none;
  let reference = none;
  let unconverged = 0;
  for (let sample = 0; sample < SAMPLES; sample++) {
    const steps = SECOND / SAMPLES;
    for (let k = 0; k < steps; k++) {
      cpu.step();
      loose.step();
    }
    gpu.run(steps);
    const read = await gpu.read();
    unconverged = read.status.unconverged;
    const truth = cpu.snapshot();
    shares = worse(shares, secondShares(cpu, start, truth, read.state));
    reference = worse(reference, secondShares(cpu, start, truth, loose.snapshot()));
  }
  const referenceShare = Math.max(...Object.values(reference));
  const graded = referenceShare <= 1;
  return {
    label: c.label,
    shares,
    referenceShare,
    graded,
    pass:
      unconverged === 0 &&
      cpu.brain.unconverged === 0 &&
      (!graded || Object.values(shares).every((share) => share <= 1)),
  };
}

export interface LoopReport {
  oneStep: LoopStepResult[];
  oneSecond: LoopSecondResult[];
  pass: boolean;
}

export async function runLoopParity(device: GPUDevice, data: WormlightData): Promise<LoopReport> {
  const cases = loopCases(data);
  const gpu = await GpuWorld.create(device, cpuWorld(data, cases[0].state));
  const oneStep: LoopStepResult[] = [];
  const oneSecond: LoopSecondResult[] = [];
  try {
    for (const c of cases) oneStep.push(await checkLoopStep(gpu, data, c));
    for (const c of cases) oneSecond.push(await checkLoopSecond(gpu, data, c));
  } finally {
    gpu.destroy();
  }
  return {
    oneStep,
    oneSecond,
    pass:
      oneStep.every((r) => r.pass) &&
      oneSecond.every((r) => r.pass) &&
      oneSecond.filter((r) => !r.graded).length <= MOST_ILL_POSED * oneSecond.length,
  };
}

export interface LongReport {
  seeds: number;
  seconds: number;
  cpu: BodyWave[];
  gpu: BodyWave[];
  sd: Equivalence;
  frequency: Equivalence;
  pass: boolean;
}

// Long-run parity's seeds a side. The plan's 20 couldn't show the frequency equivalent: its spread from seed
// to seed, 0.0297 Hz in a pilot of 20 a side, puts the standard error above the ±5% margin (0.0085 Hz) by
// itself. For 90% power at no true difference, Welch's two one-sided tests at α = 0.05 need a standard error
// of at most margin / (1.645 + 1.645), which takes 2 (0.0297 / 0.00258)² = 265 seeds a side (DECISIONS.md,
// 2026-09-26, sized from the pilot's spread, not its difference).
export const LONG_SEEDS = 265;

// Long-run parity: each seed's world run for `seconds` on each side, its mid-body curvature sampled every 0.1 s
// after the warm-up from the rods' places after each sample's last step, and the two sides' body waves
// compared by Welch's two one-sided tests at ±5% of the CPU's mean, α = 0.05.
export async function runLongParity(
  device: GPUDevice,
  data: WormlightData,
  seeds = LONG_SEEDS,
  seconds = 60,
): Promise<LongReport> {
  const every = Math.round(WAVE_SAMPLE / NEURAL_STEP);
  const samples = Math.round(seconds / WAVE_SAMPLE);
  const warm = Math.round(WAVE_WARM_UP / WAVE_SAMPLE);
  const duration = seconds - WAVE_WARM_UP;
  const first = seededWorld(data, 1);
  const scale = first.body.params.segmentLength * first.body.params.segments;
  const k = new Float64Array(first.body.rods);
  const midCurvature = (x: ArrayLike<number>, y: ArrayLike<number>): number => {
    curvatureOf(x, y, scale, k);
    return k[WAVE_ROD];
  };
  const gpu = await GpuWorld.create(device, first);
  const cpuWaves: BodyWave[] = [];
  const gpuWaves: BodyWave[] = [];
  try {
    for (let seed = 1; seed <= seeds; seed++) {
      const world = seed === 1 ? first : seededWorld(data, seed);
      gpu.brain.seed = seed;
      gpu.restore(world.snapshot());
      const cpuSamples: number[] = [];
      const gpuSamples: number[] = [];
      for (let sample = 1; sample <= samples; sample++) {
        gpu.run(every);
        for (let step = 0; step < every; step++) world.step();
        const { state } = await gpu.read();
        if (sample > warm) {
          cpuSamples.push(midCurvature(world.body.x, world.body.y));
          gpuSamples.push(midCurvature(state.x, state.y));
        }
      }
      cpuWaves.push(bodyWave(cpuSamples, duration));
      gpuWaves.push(bodyWave(gpuSamples, duration));
    }
  } finally {
    gpu.destroy();
  }
  const sd = equivalence(
    cpuWaves.map((w) => w.sd),
    gpuWaves.map((w) => w.sd),
    0.05,
  );
  const frequency = equivalence(
    cpuWaves.map((w) => w.frequency),
    gpuWaves.map((w) => w.frequency),
    0.05,
  );
  return { seeds, seconds, cpu: cpuWaves, gpu: gpuWaves, sd, frequency, pass: sd.equivalent && frequency.equivalent };
}

export interface LoopSpeed {
  stepsPerDispatch: number;
  milliseconds: number;
  realTime: number;
}

// The whole step's speed, as runBench measures the brain's.
export async function runLoopBench(device: GPUDevice, data: WormlightData, seconds = 1.5): Promise<LoopSpeed[]> {
  const cases = loopCases(data);
  const c = cases[cases.length - 1];
  const gpu = await GpuWorld.create(device, cpuWorld(data, c.state));
  const results: LoopSpeed[] = [];
  try {
    for (const perDispatch of [7, 67]) {
      gpu.restore(c.state);
      let dispatches = 0;
      const start = performance.now();
      while (performance.now() - start < seconds * 1000) {
        for (let k = 0; k < 4; k++) gpu.run(perDispatch);
        await device.queue.onSubmittedWorkDone();
        dispatches += 4;
      }
      const elapsed = (performance.now() - start) / 1000;
      results.push({
        stepsPerDispatch: perDispatch,
        milliseconds: (1000 * elapsed) / dispatches,
        realTime: (dispatches * perDispatch * NEURAL_STEP) / elapsed,
      });
    }
  } finally {
    gpu.destroy();
  }
  return results;
}
