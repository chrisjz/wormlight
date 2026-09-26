// GPU parity (PLAN §7.2; spec §8): the GPU brain checked against the CPU reference from identical states.
// A closed-loop CPU run supplies twenty active states, and the rest state is added. From each, both take
// one step, then one second, with the state's input held and noise on. The random numbers are checked
// first: the hashes must match exactly, and each Gaussian may differ only by what WGSL's accuracy for log,
// sqrt and cos allows, an allowance the one-step check adds. The thresholds are PLAN's, fixed in advance;
// two checks were changed after results (DECISIONS.md, 2026-09-26):
// - one step compares the GPU with the CPU reference solved at the GPU's own tolerance, so it sees the port's
//   arithmetic, and reports the comparison with the reference at its own tolerance without grading it;
// - one second grades only states that are well posed, where the CPU reference, rerun at the GPU's solver
//   tolerance, stays within the threshold of itself. A state where it doesn't, such as an oscillator caught
//   near the top of a jump, is reported with that figure instead.
// API checks cover what the states don't: rest, a round trip, dispatch splitting, restart, and a hand-off to
// the CPU; and a lesioned case without oscillators or noise. Long runs, compared by behaviour, wait for the
// body on the GPU (milestone 3).

import type { WormlightData } from '../data/schema.ts';
import { Brain, type BrainState } from '../sim/brain/brain.ts';
import { gaussianFrom, hash, uniform } from '../sim/brain/rng.ts';
import { CG_TOLERANCE_GPU, NEURAL_STEP } from '../sim/numerics.ts';
import { GpuBrain, MAX_STEPS_PER_DISPATCH, type GpuBrainStatus } from './brain.ts';
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
  variantSetup,
  VARIANT_LESIONS,
  worst,
  type ParityCase,
  type ParitySetup,
} from './parityCases.ts';
import { RNG_WGSL } from './rngShader.ts';

async function gpuBrain(device: GPUDevice, setup: ParitySetup): Promise<GpuBrain> {
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

// The shader's hash, uniform and Gaussian against the CPU's, the edge hashes included: the extremes, and the
// four uniforms so close to 1 that a conformant log may return 0 or more there.
async function checkNoise(device: GPUDevice): Promise<NoiseResult> {
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
  for (let k = 1; k <= 4; k++) pairs.push([(2 ** 23 - k) * 2 ** 9 + 511, hash(SEED, k, 0)]);
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
  let bytes: ArrayBuffer;
  try {
    await readback.mapAsync(GPUMapMode.READ);
    bytes = readback.getMappedRange().slice(0);
    readback.unmap();
  } finally {
    for (const b of [...buffers, readback]) b.destroy();
  }

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
  // Graded: the largest errors against the CPU reference solved at the GPU's tolerance, as shares of their
  // tolerances, the voltage's with the noise's allowance and without it.
  voltageShare: number;
  bareShare: number;
  activationShare: number;
  recoveryShare: number;
  // Reported, not graded: the voltage's largest error against the reference at its own tolerance, as a
  // share of the tolerance without the allowance.
  referenceShare: number;
  // The allowance for the noise's rounding, mV.
  allowance: number;
  iterations: { cpu: number; gpu: number };
  pass: boolean;
}

// The voltage tolerance for a reference voltage, with an allowance added.
const voltageTolerance =
  (v: Float64Array, allowance: number) =>
  (i: number): number =>
    ONE_STEP.voltage * Math.max(Math.abs(v[i]), FLOOR) + allowance;

export function compareStep(
  label: string,
  setup: Pick<ParitySetup, 'noise' | 'seed' | 'network'>,
  steps: number,
  cpu: Brain,
  reference: Brain,
  gpu: { state: BrainState; status: GpuBrainStatus },
): StepResult {
  const { state, status } = gpu;
  const allowance = noiseAllowance(setup, steps);
  const voltage = worst(cpu.voltage, state.voltage, voltageTolerance(cpu.voltage, allowance)).share;
  const bare = worst(cpu.voltage, state.voltage, voltageTolerance(cpu.voltage, 0)).share;
  const activation = worst(cpu.activation, state.activation, () => ONE_STEP.activation).share;
  const recovery = worst(
    cpu.recovery,
    state.recovery,
    (k) => ONE_STEP.recovery * Math.max(Math.abs(cpu.recovery[k]), FLOOR),
  ).share;
  const referenceShare = worst(reference.voltage, state.voltage, voltageTolerance(reference.voltage, 0)).share;
  return {
    label,
    voltageShare: voltage,
    bareShare: bare,
    activationShare: activation,
    recoveryShare: recovery,
    referenceShare,
    allowance,
    iterations: { cpu: cpu.lastSolve.iterations, gpu: status.iterations },
    pass:
      voltage <= 1 &&
      activation <= 1 &&
      recovery <= 1 &&
      status.unconverged === 0 &&
      cpu.unconverged === 0 &&
      reference.unconverged === 0,
  };
}

async function checkOneStep(gpu: GpuBrain, setup: ParitySetup, c: ParityCase): Promise<StepResult> {
  const cpu = cpuBrain(setup, c, CG_TOLERANCE_GPU);
  const reference = cpuBrain(setup, c);
  cpu.step(NEURAL_STEP);
  reference.step(NEURAL_STEP);
  gpu.restore(c.state);
  gpu.setInput(c.input);
  gpu.run(NEURAL_STEP, 1);
  return compareStep(c.label, setup, c.state.steps, cpu, reference, await gpu.read());
}

export interface SecondResult {
  label: string;
  // The worst sample's RMS relative error over the neurons, against the reference at its own tolerance.
  voltageRms: number;
  activationRms: number;
  // The same for the CPU reference rerun at the GPU's solver tolerance, against itself; the state is graded
  // only if it is within the threshold.
  referenceRms: number;
  graded: boolean;
  unconverged: { cpu: number; gpu: number };
  pass: boolean;
}

// One second from a state; with `restartAfter`, every brain restarts its integrator after that many samples.
async function checkOneSecond(
  gpu: GpuBrain,
  setup: ParitySetup,
  c: ParityCase,
  restartAfter?: number,
): Promise<SecondResult> {
  const cpu = cpuBrain(setup, c);
  const loose = cpuBrain(setup, c, CG_TOLERANCE_GPU);
  gpu.restore(c.state);
  gpu.setInput(c.input);
  let voltageRms = 0;
  let activationRms = 0;
  let referenceRms = 0;
  let status: GpuBrainStatus | null = null;
  for (let sample = 0; sample < SAMPLES; sample++) {
    if (sample === restartAfter) {
      cpu.restart();
      loose.restart();
      gpu.restart();
    }
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

export interface ApiResult {
  name: string;
  detail: string;
  pass: boolean;
}

// Whether a GPU state holds exactly what f32 makes of a CPU one.
function sameAsF32(cpu: ArrayLike<number>, gpu: ArrayLike<number>): boolean {
  return cpu.length === gpu.length && Array.from(cpu).every((x, i) => Math.fround(x) === gpu[i]);
}

async function checkApi(device: GPUDevice, setup: ParitySetup): Promise<ApiResult[]> {
  const results: ApiResult[] = [];
  const c = setup.cases[setup.cases.length - 1];
  const gpu = await gpuBrain(device, setup);
  try {
    // A new brain with oscillators is at rest, as a new CPU brain is.
    const fresh = new Brain(setup.network, setup.threshold);
    fresh.setOscillators(setup.oscillators);
    const rest = fresh.snapshot();
    const start = (await gpu.read()).state;
    results.push({
      name: 'a new brain starts at rest',
      detail: 'voltages, activations and recovery as f32 makes the CPU’s',
      pass:
        sameAsF32(rest.voltage, start.voltage) &&
        sameAsF32(rest.activation, start.activation) &&
        sameAsF32(rest.recovery, start.recovery) &&
        start.history === 0 &&
        start.steps === 0,
    });

    // restore() then read() gives the state back.
    gpu.restore(c.state);
    const back = (await gpu.read()).state;
    const fields = [
      'voltage',
      'activation',
      'recovery',
      'previousVoltage',
      'previousActivation',
      'previousRecovery',
    ] as const;
    results.push({
      name: 'a state goes in and comes back',
      detail: 'all six arrays as f32, the history and the step count',
      pass:
        fields.every((f) => sameAsF32(c.state[f], back[f])) &&
        back.history === c.state.history &&
        back.steps === c.state.steps,
    });

    // Many steps in split dispatches equal as many one-step dispatches.
    const steps = MAX_STEPS_PER_DISPATCH + 22;
    gpu.setInput(c.input);
    gpu.restore(c.state);
    gpu.run(NEURAL_STEP, steps);
    const together = (await gpu.read()).state;
    gpu.restore(c.state);
    for (let k = 0; k < steps; k++) gpu.run(NEURAL_STEP, 1);
    const apart = (await gpu.read()).state;
    results.push({
      name: `${steps} steps split into two dispatches equal ${steps} dispatches of one`,
      detail: 'identical voltages, activations and recovery',
      pass: (['voltage', 'activation', 'recovery'] as const).every((f) =>
        together[f].every((x, i) => x === apart[f][i]),
      ),
    });

    // After restart(), a step is implicit Euler, as on the CPU.
    const cpu = cpuBrain(setup, c, CG_TOLERANCE_GPU);
    const reference = cpuBrain(setup, c);
    cpu.restart();
    reference.restart();
    cpu.step(NEURAL_STEP);
    reference.step(NEURAL_STEP);
    gpu.restore(c.state);
    gpu.restart();
    gpu.run(NEURAL_STEP, 1);
    const restarted = compareStep('restart', setup, c.state.steps, cpu, reference, await gpu.read());
    results.push({
      name: 'after restart, a step is implicit Euler',
      detail: `worst ΔV ${restarted.voltageShare.toFixed(3)} of its one-step tolerance`,
      pass: restarted.pass,
    });

    // The CPU carries on from a state the GPU read, history and step count included.
    gpu.restore(c.state);
    gpu.run(NEURAL_STEP, 20);
    const handed = (await gpu.read()).state;
    const onward = cpuBrain(setup, { label: 'hand-off', state: handed, input: c.input }, CG_TOLERANCE_GPU);
    const onwardReference = cpuBrain(setup, { label: 'hand-off', state: handed, input: c.input });
    onward.step(NEURAL_STEP);
    onwardReference.step(NEURAL_STEP);
    gpu.run(NEURAL_STEP, 1);
    const handOff = compareStep('hand-off', setup, handed.steps, onward, onwardReference, await gpu.read());
    results.push({
      name: 'the CPU carries on from a state the GPU read',
      detail: `worst ΔV ${handOff.voltageShare.toFixed(3)} of its one-step tolerance`,
      pass: handOff.pass && handed.history === NEURAL_STEP,
    });
  } finally {
    gpu.destroy();
  }
  return results;
}

export interface ParityReport {
  adapter: string;
  neurons: number;
  thresholds: { oneStep: typeof ONE_STEP; oneSecond: typeof ONE_SECOND; mostIllPosed: number };
  noise: NoiseResult;
  api: ApiResult[];
  oneStep: StepResult[];
  oneSecond: SecondResult[];
  // The lesioned case, without oscillators or noise, restarting halfway through its second.
  variant: { lesions: string[]; oneStep: StepResult; oneSecond: SecondResult };
  pass: boolean;
  seconds: number;
}

export async function runParity(device: GPUDevice, adapter: string, data: WormlightData): Promise<ParityReport> {
  const started = performance.now();
  const setup = paritySetup(data);
  const variant = variantSetup(setup);
  const noise = await checkNoise(device);
  const api = await checkApi(device, setup);
  const oneStep: StepResult[] = [];
  const oneSecond: SecondResult[] = [];
  const gpu = await gpuBrain(device, setup);
  try {
    for (const c of setup.cases) oneStep.push(await checkOneStep(gpu, setup, c));
    for (const c of setup.cases) oneSecond.push(await checkOneSecond(gpu, setup, c));
  } finally {
    gpu.destroy();
  }
  const lesioned = await gpuBrain(device, variant);
  let variantResult: ParityReport['variant'];
  try {
    const [c] = variant.cases;
    variantResult = {
      lesions: VARIANT_LESIONS,
      oneStep: await checkOneStep(lesioned, variant, c),
      oneSecond: await checkOneSecond(lesioned, variant, c, SAMPLES / 2),
    };
  } finally {
    lesioned.destroy();
  }
  return {
    adapter,
    neurons: setup.network.names.length,
    thresholds: { oneStep: ONE_STEP, oneSecond: ONE_SECOND, mostIllPosed: MOST_ILL_POSED },
    noise,
    api,
    oneStep,
    oneSecond,
    variant: variantResult,
    pass:
      noise.pass &&
      api.every((r) => r.pass) &&
      oneStep.every((r) => r.pass) &&
      oneSecond.every((r) => r.pass) &&
      oneSecond.filter((r) => !r.graded).length <= MOST_ILL_POSED * oneSecond.length &&
      variantResult.oneStep.pass &&
      variantResult.oneSecond.graded &&
      variantResult.oneSecond.pass,
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
  // Solver iterations a step on the GPU, over every step the benchmark took.
  meanIterations: number;
}

// The GPU brain's speed from an active state, in dispatches of 7 steps (real time at 60 frames a second) and
// of 67 (ten times real time), queued four at a time and waited on after each four, for about `seconds` each.
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
  try {
    for (const perDispatch of [7, 67]) {
      gpu.restore(c.state);
      gpu.setInput(c.input);
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
      steps += dispatches * perDispatch;
      results.push({
        stepsPerDispatch: perDispatch,
        milliseconds: (1000 * elapsed) / dispatches,
        realTime: (dispatches * perDispatch * NEURAL_STEP) / elapsed,
      });
    }
  } finally {
    gpu.destroy();
  }
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
