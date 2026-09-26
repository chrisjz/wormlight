// GPU parity (PLAN §7.2; spec §8): the GPU brain checked against the CPU reference from identical states.
// A closed-loop CPU run supplies twenty active states, and the rest state is added. From each, both take
// one step, then one second, with the state's input held and noise on. The thresholds are PLAN's, fixed in
// advance. The random numbers are checked first: the hashes must match exactly, and each Gaussian may
// differ only by what WGSL's accuracy for log, sqrt and cos allows, an allowance the one-step check adds.
// A one-second state is graded only if it is well posed: if the CPU reference, rerun at the GPU's solver
// tolerance, stays within the threshold of itself. A state where it doesn't, such as an oscillator caught
// mid-jump, is reported with that figure instead (DECISIONS.md, 2026-09-26). Long runs, compared by
// behaviour, wait for the body on the GPU (milestone 3).

import type { WormlightData } from '../data/schema.ts';
import { gaussianFrom, hash, uniform } from '../sim/brain/rng.ts';
import { CG_TOLERANCE_GPU, NEURAL_STEP } from '../sim/numerics.ts';
import { GpuBrain, type GpuBrainStatus } from './brain.ts';
import {
  cpuBrain,
  FLOOR,
  gaussianBound,
  MOST_ILL_POSED,
  noiseAllowance,
  ONE_SECOND,
  ONE_STEP,
  paritySetup,
  rms,
  SAMPLES,
  SECOND,
  SEED,
  worst,
  type ParityCase,
  type ParitySetup,
} from './parityCases.ts';
import { RNG_WGSL } from './rngShader.ts';

export async function gpuBrain(device: GPUDevice, setup: ParitySetup): Promise<GpuBrain> {
  const brain = await GpuBrain.create(device, setup.network, setup.threshold);
  brain.setOscillators(setup.oscillators);
  brain.noise = setup.noise;
  brain.seed = setup.seed;
  return brain;
}

export interface NoiseResult {
  hashes: number;
  hashMismatches: number;
  uniformMismatches: number;
  gaussians: number;
  // The largest error as a share of its bound, and in absolute terms.
  worstShare: number;
  worstError: number;
  pass: boolean;
}

// The shader's hash, uniform and Gaussian against the CPU's, the edge hashes included.
export async function checkNoise(device: GPUDevice): Promise<NoiseResult> {
  const top = 2 ** 32 - 1;
  const tuples: number[][] = [];
  for (const seed of [0, 1, 12345, top])
    for (const step of [0, 1, 678, 2 ** 31, top])
      for (const index of [0, 1, 90, 603, top]) tuples.push([seed, step, index]);
  const pairs: number[][] = [
    [0, 0],
    [0, top],
    [top, 0],
    [top, top],
    [2 ** 31, 2 ** 31],
  ];
  // The draws a run makes: 16 steps of 302 neurons under one seed.
  for (let step = 0; step < 16; step++)
    for (let i = 0; i < 302; i++) pairs.push([hash(SEED, step, 2 * i), hash(SEED, step, 2 * i + 1)]);

  const code = /* wgsl */ `
${RNG_WGSL}
@group(0) @binding(0) var<storage, read> tuples: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read> pairs: array<vec2<u32>>;
@group(0) @binding(2) var<storage, read_write> hashes: array<u32>;
@group(0) @binding(3) var<storage, read_write> draws: array<vec2<f32>>;

@compute @workgroup_size(64)
fn probe(@builtin(global_invocation_id) id: vec3<u32>) {
  let k = id.x;
  if (k < arrayLength(&tuples)) {
    let t = tuples[k];
    hashes[k] = hash(t.x, t.y, t.z);
  }
  if (k < arrayLength(&pairs)) {
    let p = pairs[k];
    draws[k] = vec2<f32>(unit(p.x), gaussian_from(p.x, p.y));
  }
}`;
  const pipeline = await device.createComputePipelineAsync({
    layout: 'auto',
    compute: { module: device.createShaderModule({ code }), entryPoint: 'probe' },
  });
  const storage = (data: Uint32Array | null, bytes: number, usage: number): GPUBuffer => {
    const b = device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | usage });
    if (data) device.queue.writeBuffer(b, 0, data);
    return b;
  };
  const tupleData = Uint32Array.from(tuples.flatMap(([a, b, c]) => [a, b, c, 0]));
  const pairData = Uint32Array.from(pairs.flat());
  const buffers = [
    storage(tupleData, tupleData.byteLength, GPUBufferUsage.COPY_DST),
    storage(pairData, pairData.byteLength, GPUBufferUsage.COPY_DST),
    storage(null, 4 * tuples.length, GPUBufferUsage.COPY_SRC),
    storage(null, 8 * pairs.length, GPUBufferUsage.COPY_SRC),
  ];
  const readback = device.createBuffer({
    size: 4 * tuples.length + 8 * pairs.length,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(
    0,
    device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
    }),
  );
  pass.dispatchWorkgroups(Math.ceil(Math.max(tuples.length, pairs.length) / 64));
  pass.end();
  encoder.copyBufferToBuffer(buffers[2], 0, readback, 0, 4 * tuples.length);
  encoder.copyBufferToBuffer(buffers[3], 0, readback, 4 * tuples.length, 8 * pairs.length);
  device.queue.submit([encoder.finish()]);
  await readback.mapAsync(GPUMapMode.READ);
  const bytes = readback.getMappedRange().slice(0);
  readback.unmap();
  for (const b of [...buffers, readback]) b.destroy();

  const hashes = new Uint32Array(bytes, 0, tuples.length);
  const draws = new Float32Array(bytes, 4 * tuples.length, 2 * pairs.length);
  const hashMismatches = tuples.filter(([seed, step, index], k) => hashes[k] !== hash(seed, step, index)).length;
  let uniformMismatches = 0;
  let worstShare = 0;
  let worstError = 0;
  pairs.forEach(([h1, h2], k) => {
    if (draws[2 * k] !== uniform(h1)) uniformMismatches++;
    const error = Math.abs(draws[2 * k + 1] - gaussianFrom(h1, h2));
    worstError = Math.max(worstError, error);
    worstShare = Math.max(worstShare, error / gaussianBound(h1, h2));
  });
  return {
    hashes: tuples.length,
    hashMismatches,
    uniformMismatches,
    gaussians: pairs.length,
    worstShare,
    worstError,
    pass: hashMismatches === 0 && uniformMismatches === 0 && worstShare <= 1,
  };
}

export interface StepResult {
  label: string;
  // The largest error as a share of its tolerance, and the errors themselves (mV, and activation).
  voltageShare: number;
  activationShare: number;
  voltageError: number;
  activationError: number;
  recoveryError: number;
  // The tolerance added for the noise's rounding, mV.
  allowance: number;
  cpuIterations: number;
  gpu: GpuBrainStatus;
  pass: boolean;
}

export interface SecondResult {
  label: string;
  // The worst sample's RMS relative error over the neurons.
  voltageRms: number;
  activationRms: number;
  // The same for the CPU reference rerun at the GPU's solver tolerance, against itself; the state is graded
  // only if both are within the threshold.
  referenceRms: number;
  graded: boolean;
  unconverged: { cpu: number; gpu: number };
  pass: boolean;
}

export async function checkOneStep(gpu: GpuBrain, setup: ParitySetup, c: ParityCase): Promise<StepResult> {
  const cpu = cpuBrain(setup, c);
  cpu.step(NEURAL_STEP);
  gpu.restore(c.state);
  gpu.setInput(c.input);
  gpu.run(NEURAL_STEP, 1);
  const { state, status } = await gpu.read();
  const allowance = noiseAllowance(setup, c.state.steps);
  const voltage = worst(
    cpu.voltage,
    state.voltage,
    (i) => ONE_STEP.voltage * Math.max(Math.abs(cpu.voltage[i]), FLOOR) + allowance,
  );
  const activation = worst(cpu.activation, state.activation, () => ONE_STEP.activation);
  const recovery = worst(cpu.recovery, state.recovery, () => 1);
  return {
    label: c.label,
    voltageShare: voltage.share,
    activationShare: activation.share,
    voltageError: voltage.error,
    activationError: activation.error,
    recoveryError: recovery.error,
    allowance,
    cpuIterations: cpu.lastSolve.iterations,
    gpu: status,
    pass: voltage.share <= 1 && activation.share <= 1 && status.unconverged === 0 && cpu.unconverged === 0,
  };
}

export async function checkOneSecond(gpu: GpuBrain, setup: ParitySetup, c: ParityCase): Promise<SecondResult> {
  const cpu = cpuBrain(setup, c);
  const loose = cpuBrain(setup, c, CG_TOLERANCE_GPU);
  gpu.restore(c.state);
  gpu.setInput(c.input);
  let voltageRms = 0;
  let activationRms = 0;
  let referenceRms = 0;
  let status: GpuBrainStatus | null = null;
  for (let sample = 0; sample < SAMPLES; sample++) {
    const steps = SECOND / SAMPLES;
    for (let k = 0; k < steps; k++) {
      cpu.step(NEURAL_STEP);
      loose.step(NEURAL_STEP);
    }
    gpu.run(NEURAL_STEP, steps);
    const read = await gpu.read();
    status = read.status;
    voltageRms = Math.max(voltageRms, rms(cpu.voltage, read.state.voltage, FLOOR));
    activationRms = Math.max(activationRms, rms(cpu.activation, read.state.activation, 1));
    referenceRms = Math.max(
      referenceRms,
      rms(cpu.voltage, loose.voltage, FLOOR),
      rms(cpu.activation, loose.activation, 1),
    );
  }
  const unconverged = { cpu: cpu.unconverged, gpu: status?.unconverged ?? 0 };
  const graded = referenceRms <= ONE_SECOND.rms;
  return {
    label: c.label,
    voltageRms,
    activationRms,
    referenceRms,
    graded,
    unconverged,
    pass:
      unconverged.cpu === 0 &&
      unconverged.gpu === 0 &&
      (!graded || (voltageRms <= ONE_SECOND.rms && activationRms <= ONE_SECOND.rms)),
  };
}

export interface ParityReport {
  adapter: string;
  neurons: number;
  noise: NoiseResult;
  oneStep: StepResult[];
  oneSecond: SecondResult[];
  pass: boolean;
  seconds: number;
}

export async function runParity(device: GPUDevice, adapter: string, data: WormlightData): Promise<ParityReport> {
  const started = performance.now();
  const setup = paritySetup(data);
  const noise = await checkNoise(device);
  const gpu = await gpuBrain(device, setup);
  const oneStep: StepResult[] = [];
  const oneSecond: SecondResult[] = [];
  for (const c of setup.cases) oneStep.push(await checkOneStep(gpu, setup, c));
  for (const c of setup.cases) oneSecond.push(await checkOneSecond(gpu, setup, c));
  gpu.destroy();
  return {
    adapter,
    neurons: setup.network.names.length,
    noise,
    oneStep,
    oneSecond,
    pass:
      noise.pass &&
      oneStep.every((r) => r.pass) &&
      oneSecond.every((r) => r.pass) &&
      oneSecond.filter((r) => !r.graded).length <= MOST_ILL_POSED * oneSecond.length,
    seconds: (performance.now() - started) / 1000,
  };
}

export interface SpeedResult {
  stepsPerDispatch: number;
  // Wall time per dispatch, and simulated seconds per wall second.
  milliseconds: number;
  realTime: number;
}

export interface BenchReport {
  adapter: string;
  dt: number;
  gpu: SpeedResult[];
  // The CPU reference's brain step in this page, for comparison.
  cpuRealTime: number;
  meanIterations: number;
}

// The GPU brain's speed from an active state: dispatches of 7 steps (real time at 60 frames a second) and of
// 67 (ten times real time), back to back for about `seconds` each.
export async function runBench(
  device: GPUDevice,
  adapter: string,
  data: WormlightData,
  seconds = 1.5,
): Promise<BenchReport> {
  const setup = paritySetup(data);
  const c = setup.cases[setup.cases.length - 1];
  const gpu = await gpuBrain(device, setup);
  const results: SpeedResult[] = [];
  let iterations = 0;
  let steps = 0;
  for (const perDispatch of [7, 67]) {
    gpu.restore(c.state);
    gpu.setInput(c.input);
    gpu.run(NEURAL_STEP, perDispatch);
    await device.queue.onSubmittedWorkDone();
    let dispatches = 0;
    const start = performance.now();
    while (performance.now() - start < seconds * 1000) {
      for (let k = 0; k < 4; k++) gpu.run(NEURAL_STEP, perDispatch);
      await device.queue.onSubmittedWorkDone();
      dispatches += 4;
    }
    const elapsed = (performance.now() - start) / 1000;
    const { status } = await gpu.read();
    iterations += status.totalIterations;
    steps += perDispatch;
    results.push({
      stepsPerDispatch: perDispatch,
      milliseconds: (1000 * elapsed) / dispatches,
      realTime: (dispatches * perDispatch * NEURAL_STEP) / elapsed,
    });
  }
  gpu.destroy();
  const cpu = cpuBrain(setup, c);
  let cpuSteps = 0;
  const start = performance.now();
  while (performance.now() - start < seconds * 1000) {
    for (let k = 0; k < 40; k++) cpu.step(NEURAL_STEP);
    cpuSteps += 40;
  }
  const cpuRealTime = (cpuSteps * NEURAL_STEP) / ((performance.now() - start) / 1000);
  return { adapter, dt: NEURAL_STEP, gpu: results, cpuRealTime, meanIterations: iterations / steps };
}
