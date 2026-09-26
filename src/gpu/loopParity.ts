// GPU parity for the whole loop (PLAN §7.2): the body, the muscles and the head switch join the brain. Both
// sides take one step, then one second, running every layer, from whole-world states: the rest world and
// twenty from the trial values' closed loop; copies of them moved across the dish and turned, which the CPU
// doesn't notice and the GPU must not; copies pressed against the dish's wall, which both push back; and states
// from two variants that make the head switch flip and gate.
// The thresholds are the body's row of §7.2, set before any loop results and changed after them (DECISIONS.md,
// 2026-09-26); the brain's are as before. Long runs, LONG_SEEDS a side for 60 s, compare the body wave's
// statistics by Welch's two one-sided tests while the worm doesn't crawl.

import type { WormlightData } from '../data/schema.ts';
import { boyleBody } from '../sim/body/body.ts';
import { WAVE_ROD, WAVE_SAMPLE, WAVE_WARM_UP, bodyWave, type BodyWave } from '../sim/bodyWave.ts';
import { CG_TOLERANCE_GPU, NEURAL_STEP } from '../sim/numerics.ts';
import { curvatureOf } from '../sim/proprio.ts';
import { equivalence, spreadRatio, type Equivalence, type SpreadRatio } from '../sim/stats.ts';
import type { World, WorldState } from '../sim/world.ts';
import { compareStep, type ApiResult, type StepResult } from './parity.ts';
import {
  centroidFloor,
  COPIES,
  againstWall,
  WALL_COPIES,
  cpuWorld,
  endVelocities,
  FLOOR,
  LOOP_SECOND,
  LOOP_SETUPS,
  LOOP_STEP,
  loopCases,
  MOST_ILL_POSED,
  movedAndTurned,
  ONE_SECOND,
  rms,
  SAMPLES,
  SECOND,
  seededWorld,
  velocityFloors,
  type LoopCase,
  type LoopSetup,
} from './parityCases.ts';
import { GpuWorld } from './world.ts';

export interface LoopStepResult extends StepResult {
  // Graded: the largest error in the rods' centres' velocities, in x, y and θ, as shares of their tolerance.
  // Reported: the same for the rods' end points, in x and y.
  centreShares: [number, number, number];
  endShares: [number, number];
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

// Whether the GPU's head switch is in the CPU's state, its current compared as f32 holds it.
const sameSwitch = (cpu: World, gpu: WorldState): boolean =>
  cpu.headSwitch.h === gpu.h && Math.fround(cpu.switchCurrent) === gpu.switchCurrent;

async function checkLoopStep(gpu: GpuWorld, data: WormlightData, c: LoopCase): Promise<LoopStepResult> {
  const cpu = cpuWorld(data, c.state, CG_TOLERANCE_GPU, c.setup);
  const reference = cpuWorld(data, c.state, undefined, c.setup);
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
  const centreShares = shares(rates, state.velocity, 3, floors) as [number, number, number];
  const endShares = shares(
    endVelocities(cpu, c.state.theta, rates),
    endVelocities(cpu, c.state.theta, state.velocity),
    2,
    floors.slice(0, 2),
  ) as [number, number];
  let muscle = 0;
  cpu.muscles.activation.forEach((a, m) => {
    muscle = Math.max(muscle, Math.abs(a - state.muscles[m]) / LOOP_STEP.muscle);
  });
  const switchSame = sameSwitch(cpu, state);
  return {
    ...brain,
    centreShares,
    endShares,
    muscleShare: muscle,
    switchSame,
    pass: brain.pass && centreShares.every((v) => v <= 1) && muscle <= 1 && switchSame,
  };
}

export interface LoopSecondResult {
  label: string;
  // The worst sample's shares of the thresholds: the voltage's and activation's RMS relative errors (their
  // threshold is 10⁻²), the curvature profile's and the centroid's travel's; and whether the head switch
  // agreed at every sample.
  shares: { voltage: number; activation: number; curvature: number; centroid: number };
  switchSame: boolean;
  // The same for the CPU reference rerun at the GPU's solver tolerance, against itself: the state is graded
  // only if every share is at most 1 and its switch agreed throughout.
  referenceShare: number;
  referenceSwitchSame: boolean;
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
  const cpu = cpuWorld(data, c.state, undefined, c.setup);
  const loose = cpuWorld(data, c.state, CG_TOLERANCE_GPU, c.setup);
  gpu.restore(c.state);
  const start = centroid(c.state.x, c.state.y);
  const none = { voltage: 0, activation: 0, curvature: 0, centroid: 0 };
  let shares = none;
  let reference = none;
  let switchSame = true;
  let referenceSwitchSame = true;
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
    switchSame &&= sameSwitch(cpu, read.state);
    referenceSwitchSame &&= cpu.headSwitch.h === loose.headSwitch.h && cpu.switchCurrent === loose.switchCurrent;
  }
  const referenceShare = Math.max(...Object.values(reference));
  const graded = referenceShare <= 1 && referenceSwitchSame;
  return {
    label: c.label,
    shares,
    switchSame,
    referenceShare,
    referenceSwitchSame,
    graded,
    pass:
      unconverged === 0 &&
      cpu.brain.unconverged === 0 &&
      (!graded || (Object.values(shares).every((share) => share <= 1) && switchSame)),
  };
}

// The loop's own API: a world's state goes in and comes back, and a run split across dispatches is the run.
async function checkLoopApi(gpu: GpuWorld, c: LoopCase): Promise<ApiResult[]> {
  const results: ApiResult[] = [];
  gpu.restore(c.state);
  const back = (await gpu.read()).state;
  const f32 = (a: ArrayLike<number>, b: ArrayLike<number>): boolean =>
    a.length === b.length && Array.from(a).every((x, i) => Math.fround(x) === b[i]);
  // Positions and angles come back as a coarse part plus a remainder, each exact but for the remainder's f32.
  const near = (a: ArrayLike<number>, b: ArrayLike<number>, within: number): boolean =>
    a.length === b.length && Array.from(a).every((x, i) => Math.abs(x - b[i]) <= within);
  results.push({
    name: 'a world goes in and comes back',
    detail: 'the brain, velocities, muscles and switch as f32; places within 10⁻¹³ m and angles within 10⁻¹⁰ rad',
    pass:
      f32(c.state.brain.voltage, back.brain.voltage) &&
      f32(c.state.velocity, back.velocity) &&
      f32(c.state.muscles, back.muscles) &&
      near(c.state.x, back.x, 1e-13) &&
      near(c.state.y, back.y, 1e-13) &&
      near(c.state.theta, back.theta, 1e-10) &&
      c.state.h === back.h &&
      Math.fround(c.state.switchCurrent) === back.switchCurrent &&
      (c.state.previousCurvature === null
        ? back.previousCurvature === null
        : Math.fround(c.state.previousCurvature) === back.previousCurvature),
  });
  const steps = 150;
  gpu.restore(c.state);
  gpu.run(steps);
  const together = (await gpu.read()).state;
  gpu.restore(c.state);
  for (let k = 0; k < steps; k++) gpu.run(1);
  const apart = (await gpu.read()).state;
  const same = (a: ArrayLike<number>, b: ArrayLike<number>): boolean => Array.from(a).every((x, i) => x === b[i]);
  results.push({
    name: `${steps} whole-loop steps split into two dispatches equal ${steps} dispatches of one`,
    detail: 'identical brain, body, muscles and switch',
    pass:
      same(together.brain.voltage, apart.brain.voltage) &&
      same(together.x, apart.x) &&
      same(together.theta, apart.theta) &&
      same(together.muscles, apart.muscles) &&
      together.h === apart.h &&
      together.switchCurrent === apart.switchCurrent,
  });
  return results;
}

export interface LoopReport {
  api: ApiResult[];
  oneStep: LoopStepResult[];
  oneSecond: LoopSecondResult[];
  pass: boolean;
  seconds: number;
}

// The copies a check runs: the trial values' states as they are and, for one step, moved and turned; for one
// second, every fifth moved and turned at once; each variant's as they are.
// The trial values' states and their copies: moved across the dish and turned, which the CPU's arithmetic
// doesn't notice; and pressed against the dish's wall, which it pushes back. One step takes every state's
// copies; one second, every fifth state's. The variants take their states alone.
function withCopies(
  cases: LoopCase[],
  setup: LoopSetup,
  second: boolean,
  radii: ArrayLike<number>,
  wall: number,
): LoopCase[] {
  if (setup.name !== LOOP_SETUPS[0].name) return cases.map((c) => ({ ...c, label: `${setup.name} ${c.label}` }));
  const pressed = (c: LoopCase): LoopCase[] =>
    WALL_COPIES.map((copy) => ({
      ...c,
      label: `${c.label}, ${copy.label}`,
      state: againstWall(c.state, radii, wall, copy),
    }));
  if (second) {
    const some = cases.filter((_, k) => k % 5 === 0);
    const both = some.map((c) => ({
      ...c,
      label: `${c.label}, moved and turned`,
      state: movedAndTurned(c.state, COPIES[0].dx, COPIES[0].dy, COPIES[1].turns),
    }));
    return [...cases, ...both, ...some.flatMap(pressed)];
  }
  return [
    ...cases,
    ...COPIES.flatMap((copy) =>
      cases.map((c) => ({
        ...c,
        label: `${c.label}, ${copy.label}`,
        state: movedAndTurned(c.state, copy.dx, copy.dy, copy.turns),
      })),
    ),
    ...cases.flatMap(pressed),
  ];
}

export async function runLoopParity(device: GPUDevice, data: WormlightData): Promise<LoopReport> {
  const started = performance.now();
  const api: ApiResult[] = [];
  const oneStep: LoopStepResult[] = [];
  const oneSecond: LoopSecondResult[] = [];
  for (const setup of LOOP_SETUPS) {
    const cases = loopCases(data, setup);
    const gpu = await GpuWorld.create(device, cpuWorld(data, cases[0].state, undefined, setup));
    try {
      if (setup === LOOP_SETUPS[0]) api.push(...(await checkLoopApi(gpu, cases[cases.length - 1])));
      const { radii, wall } = boyleBody();
      for (const c of withCopies(cases, setup, false, radii, wall)) oneStep.push(await checkLoopStep(gpu, data, c));
      for (const c of withCopies(cases, setup, true, radii, wall)) oneSecond.push(await checkLoopSecond(gpu, data, c));
    } finally {
      gpu.destroy();
    }
  }
  return {
    api,
    oneStep,
    oneSecond,
    pass:
      api.every((r) => r.pass) &&
      oneStep.every((r) => r.pass) &&
      oneSecond.every((r) => r.pass) &&
      oneSecond.filter((r) => !r.graded).length <= MOST_ILL_POSED * oneSecond.length,
    seconds: (performance.now() - started) / 1000,
  };
}

export interface LongReport {
  seeds: number;
  seconds: number;
  cpu: BodyWave[];
  gpu: BodyWave[];
  sd: Equivalence;
  frequency: Equivalence;
  // Reported, not graded: how the two sides' spreads compare.
  spread: { sd: SpreadRatio; frequency: SpreadRatio };
  // Solves that didn't converge, over every seed, on each side.
  unconverged: { cpu: number; gpu: number };
  pass: boolean;
}

// Long-run parity's seeds a side. The plan's 20 couldn't show the frequency equivalent whatever the means:
// its spread from seed to seed, 0.0297 Hz in that run, gives the difference a standard error of 0.0094 Hz,
// and Welch's two one-sided tests at α = 0.05 pass only below about 0.0050 Hz (the ±5% margin, 0.0085 Hz,
// over t at 0.95). For 90% power at no true difference they need a standard error of at most the margin over
// 3.29, 0.00258 Hz, which takes 2 (0.0297 / 0.00258)² ≈ 265 seeds a side (DECISIONS.md, 2026-09-26: sized from
// that run's spread, not its difference).
export const LONG_SEEDS = 265;

// Long-run parity: each seed's world run for `seconds` on each side, its mid-body curvature sampled every 0.1 s
// after the warm-up from the rods' places after each sample's last step, and the two sides' body waves
// compared by Welch's two one-sided tests at ±5% of the CPU's mean, α = 0.05. Every solve must converge.
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
  const unconverged = { cpu: 0, gpu: 0 };
  try {
    for (let seed = 1; seed <= seeds; seed++) {
      const world = seed === 1 ? first : seededWorld(data, seed);
      gpu.brain.seed = seed;
      gpu.restore(world.snapshot());
      const cpuSamples: number[] = [];
      const gpuSamples: number[] = [];
      let gpuUnconverged = 0;
      for (let sample = 1; sample <= samples; sample++) {
        gpu.run(every);
        for (let step = 0; step < every; step++) world.step();
        const { state, status } = await gpu.read();
        gpuUnconverged = status.unconverged;
        if (sample > warm) {
          cpuSamples.push(midCurvature(world.body.x, world.body.y));
          gpuSamples.push(midCurvature(state.x, state.y));
        }
      }
      unconverged.cpu += world.brain.unconverged;
      unconverged.gpu += gpuUnconverged;
      cpuWaves.push(bodyWave(cpuSamples, duration));
      gpuWaves.push(bodyWave(gpuSamples, duration));
    }
  } finally {
    gpu.destroy();
  }
  const values = (waves: BodyWave[], key: keyof BodyWave): number[] => waves.map((w) => w[key]);
  const sd = equivalence(values(cpuWaves, 'sd'), values(gpuWaves, 'sd'), 0.05);
  const frequency = equivalence(values(cpuWaves, 'frequency'), values(gpuWaves, 'frequency'), 0.05);
  return {
    seeds,
    seconds,
    cpu: cpuWaves,
    gpu: gpuWaves,
    sd,
    frequency,
    spread: {
      sd: spreadRatio(values(cpuWaves, 'sd'), values(gpuWaves, 'sd')),
      frequency: spreadRatio(values(cpuWaves, 'frequency'), values(gpuWaves, 'frequency')),
    },
    unconverged,
    pass: sd.equivalent && frequency.equivalent && unconverged.cpu === 0 && unconverged.gpu === 0,
  };
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
