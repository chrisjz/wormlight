// The simulation on the GPU (PLAN §1, §3.4): a network's wiring and constants in buffers, and one compute pass
// that takes any number of steps. It mirrors the CPU reference's Brain, which it is checked against
// (parity.ts), and trades state with it as a BrainState. It runs whatever network it is given, a lesioned or
// rewired one included, with the thresholds the caller gives, which stay fixed (PLAN §3.3). Given a loop
// layout (world.ts), each step is a whole World's instead: the brain, and the loop outside it.

import type { BrainState, Oscillators } from '../sim/brain/brain.ts';
import { midpointActivation } from '../sim/brain/brain.ts';
import type { Network } from '../sim/brain/network.ts';
import { CG_MAX_ITERATIONS, CG_TOLERANCE_GPU } from '../sim/numerics.ts';
import type { WorldState } from '../sim/world.ts';
import {
  ANGLE_GRID,
  BRAIN_SHADER,
  MAX_NEURONS,
  NEURON_WORDS,
  PARAM_WORDS,
  POSITION_GRID,
  ROD_WORDS,
  STATE_WORDS,
  STATUS_WORDS,
} from './brainShader.ts';
import type { LoopLayout } from './world.ts';

// FitzHugh's constants, as brain.ts has them: a neuron's recovery starts on its w-nullcline.
const FHN_A = 0.7;
const FHN_B = 0.8;

// The most steps one dispatch takes: longer runs are split, so no dispatch runs long enough to trip a GPU
// watchdog. At 2.5 ms steps that is 0.32 s of worm time, some 11 ms on an M5 Max and 0.8 s on SwiftShader.
export const MAX_STEPS_PER_DISPATCH = 128;

// How a run of `steps` steps is split into dispatches.
export function dispatches(steps: number): number[] {
  if (!Number.isInteger(steps) || steps < 0) throw new Error(`a run takes a whole number of steps, not ${steps}`);
  const out: number[] = [];
  for (let left = steps; left > 0; left -= MAX_STEPS_PER_DISPATCH) out.push(Math.min(left, MAX_STEPS_PER_DISPATCH));
  return out;
}

export interface GpuBrainOptions {
  tolerance?: number;
  maxIterations?: number;
  // The loop outside the brain, to step a whole World.
  loop?: LoopLayout;
}

// A World's state but its brain's, as the GPU keeps it.
export type LoopState = Omit<WorldState, 'brain'>;

// The solver's record: the last solve's iterations, and since the state was last set, the most in one solve,
// the total, and the solves that stopped at the iteration cap or met a residual that isn't finite.
export interface GpuBrainStatus {
  steps: number;
  iterations: number;
  peakIterations: number;
  totalIterations: number;
  unconverged: number;
}

// The wiring in the shader's layout. Topology holds the gap rows' starts, the chemical rows' starts, the gap
// partners and the chemical presynaptic neurons; the weight arrays have at least one element, since WebGPU
// binds no empty buffer.
export interface PackedNetwork {
  topology: Uint32Array;
  gapWeight: Float32Array;
  chemical: Float32Array;
  chemStartAt: number;
  gapIndexAt: number;
  chemIndexAt: number;
}

export function packNetwork(network: Network): PackedNetwork {
  const n = network.names.length;
  const { gap, chemical } = network;
  const gaps = gap.index.length;
  const synapses = chemical.index.length;
  const chemStartAt = n + 1;
  const gapIndexAt = 2 * (n + 1);
  const chemIndexAt = gapIndexAt + gaps;
  const topology = new Uint32Array(chemIndexAt + synapses);
  topology.set(gap.start, 0);
  topology.set(chemical.start, chemStartAt);
  topology.set(gap.index, gapIndexAt);
  topology.set(chemical.index, chemIndexAt);
  const gapWeight = new Float32Array(Math.max(gaps, 1));
  gapWeight.set(gap.weight);
  const packed = new Float32Array(Math.max(2 * synapses, 2));
  for (let k = 0; k < synapses; k++) {
    packed[2 * k] = chemical.weight[k];
    packed[2 * k + 1] = chemical.reversal[k];
  }
  return { topology, gapWeight, chemical: packed, chemStartAt, gapIndexAt, chemIndexAt };
}

// Read when used, not at import, so a page without WebGPU can still load this module to explain itself.
const storage = (): number => GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;

export class GpuBrain {
  readonly device: GPUDevice;
  readonly n: number;
  readonly network: Network;
  // White current noise intensity, σ_n in current·√s, and the seed of its hash, as the CPU's Brain has them.
  noise = 0;
  seed = 0;

  private oscillators: Oscillators | null = null;
  private readonly threshold: Float64Array;
  private readonly wiring: PackedNetwork;
  private readonly wiringBuffers: GPUBuffer[];
  private readonly bindGroup: GPUBindGroup;
  private readonly pipeline: GPUComputePipeline;
  private readonly params: GPUBuffer;
  private readonly neurons: GPUBuffer;
  private readonly input: GPUBuffer;
  private readonly state: GPUBuffer;
  private readonly status: GPUBuffer;
  private readonly body: GPUBuffer;
  private readonly loop: LoopLayout | null;
  // Where the loop's arrays start in the topology and weights buffers.
  private readonly loopAt: {
    nmStart: number;
    nmPre: number;
    cover: number;
    nmWeight: number;
    rodConstants: number;
    segmentConstants: number;
  };
  private readonly tolerance: number;
  private readonly maxIterations: number;
  // The step size the history was taken at, which the GPU keeps only as f32.
  private historyStep = 0;
  private destroyed = false;
  private lost: string | null = null;

  private constructor(
    device: GPUDevice,
    pipeline: GPUComputePipeline,
    network: Network,
    threshold: Float64Array,
    options: GpuBrainOptions,
  ) {
    const n = network.names.length;
    this.device = device;
    this.pipeline = pipeline;
    this.n = n;
    this.network = network;
    this.threshold = Float64Array.from(threshold);
    this.tolerance = options.tolerance ?? CG_TOLERANCE_GPU;
    this.maxIterations = options.maxIterations ?? CG_MAX_ITERATIONS;
    const loop = options.loop ?? null;
    this.loop = loop;
    const buffer = (words: number, usage: number): GPUBuffer => device.createBuffer({ size: 4 * words, usage });
    this.params = buffer(PARAM_WORDS, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.neurons = buffer(NEURON_WORDS * n, storage());
    this.input = buffer(n, storage());
    this.state = buffer(STATE_WORDS * n, storage() | GPUBufferUsage.COPY_SRC);
    this.status = buffer(STATUS_WORDS, storage() | GPUBufferUsage.COPY_SRC);
    this.body = buffer(
      loop ? ROD_WORDS * loop.rods + Math.max(loop.muscles, 1) : 1,
      storage() | GPUBufferUsage.COPY_SRC,
    );
    this.wiring = packNetwork(network);
    // The loop's arrays follow the network's in the same two buffers.
    const topologyEnd = this.wiring.topology.length;
    const weightEnd = this.wiring.gapWeight.length;
    this.loopAt = {
      nmStart: topologyEnd,
      nmPre: topologyEnd + (loop?.nmStart.length ?? 0),
      cover: topologyEnd + (loop ? loop.nmStart.length + loop.nmPre.length : 0),
      nmWeight: weightEnd,
      rodConstants: weightEnd + (loop?.nmWeight.length ?? 0),
      segmentConstants: weightEnd + (loop ? loop.nmWeight.length + loop.rodConstants.length : 0),
    };
    const topology = loop
      ? Uint32Array.from([...this.wiring.topology, ...loop.nmStart, ...loop.nmPre, ...loop.cover])
      : this.wiring.topology;
    const weights = loop
      ? Float32Array.from([...this.wiring.gapWeight, ...loop.nmWeight, ...loop.rodConstants, ...loop.segmentConstants])
      : this.wiring.gapWeight;
    const upload = (data: Uint32Array | Float32Array): GPUBuffer => {
      const b = device.createBuffer({ size: data.byteLength, usage: storage() });
      device.queue.writeBuffer(b, 0, data);
      return b;
    };
    this.wiringBuffers = [upload(topology), upload(weights), upload(this.wiring.chemical)];
    const resources = [
      this.params,
      ...this.wiringBuffers,
      this.neurons,
      this.input,
      this.state,
      this.status,
      this.body,
    ];
    this.bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: resources.map((b, binding) => ({ binding, resource: { buffer: b } })),
    });
    void device.lost.then((info) => {
      this.lost = info.message || info.reason;
    });
    this.writeNeurons();
    this.rest();
  }

  // Build a GPU brain, at rest and without oscillators. Every validation error in setting it up, the shader's
  // included, rejects here, where the page can explain it.
  static async create(
    device: GPUDevice,
    network: Network,
    threshold: Float64Array,
    options: GpuBrainOptions = {},
  ): Promise<GpuBrain> {
    const n = network.names.length;
    if (n === 0 || n > MAX_NEURONS) throw new Error(`the GPU brain holds 1 to ${MAX_NEURONS} neurons, not ${n}`);
    if (threshold.length !== n) throw new Error(`expected ${n} thresholds`);
    // The scope is popped whatever happens, so a failure can't leave it open on the device.
    device.pushErrorScope('validation');
    let brain: GpuBrain | null = null;
    let failure: unknown = null;
    try {
      const module = device.createShaderModule({ code: BRAIN_SHADER });
      const pipeline = await device.createComputePipelineAsync({
        layout: 'auto',
        compute: { module, entryPoint: 'advance' },
      });
      brain = new GpuBrain(device, pipeline, network, threshold, options);
    } catch (e) {
      failure = e;
    }
    const error = await device.popErrorScope();
    if (error || failure !== null || !brain) {
      brain?.destroy();
      if (error) throw new Error(`the GPU brain could not be set up: ${error.message}`);
      throw failure instanceof Error ? failure : new Error(String(failure));
    }
    return brain;
  }

  // Attach oscillators, or none, and put the brain at rest (rest()). The CPU's setOscillators keeps the
  // present voltages and puts each recovery on its nullcline there; the GPU's state lives on the GPU, so this
  // starts from rest instead, which is where the CPU's brain is until it steps. Restore a state to start
  // elsewhere.
  setOscillators(oscillators: Oscillators | null): void {
    this.alive();
    this.oscillators = oscillators;
    this.writeNeurons();
    this.rest();
  }

  // Every neuron at its threshold with activation at the midpoint, oscillators on their w-nullclines, as the
  // CPU's rest() leaves it, and no history.
  rest(): void {
    const n = this.n;
    const count = this.oscillators?.neurons.length ?? 0;
    // At threshold, x = −θ/v₀.
    const v0 = 1 / (2 * this.network.slope);
    const recovery = Float64Array.from(this.oscillators?.shift ?? [], (shift) => (-shift / v0 + FHN_A) / FHN_B);
    this.restore({
      voltage: this.threshold,
      activation: new Float64Array(n).fill(midpointActivation(this.network)),
      recovery,
      previousVoltage: new Float64Array(n),
      previousActivation: new Float64Array(n),
      previousRecovery: new Float64Array(count),
      history: 0,
      steps: 0,
    });
  }

  // Set the state, history and step count, as the CPU's restore() does, and start the solver's record afresh.
  restore(state: BrainState): void {
    this.alive();
    const n = this.n;
    const oscillators = this.oscillators?.neurons ?? new Int32Array(0);
    const lengths = [state.voltage, state.activation, state.previousVoltage, state.previousActivation];
    if (lengths.some((a) => a.length !== n)) throw new Error(`the state is not of ${n} neurons`);
    if (state.recovery.length !== oscillators.length || state.previousRecovery.length !== oscillators.length) {
      throw new Error('the state has other oscillators');
    }
    const words = new Float32Array(STATE_WORDS * n);
    for (let i = 0; i < n; i++) {
      words[STATE_WORDS * i] = state.voltage[i];
      words[STATE_WORDS * i + 1] = state.previousVoltage[i];
      words[STATE_WORDS * i + 2] = state.activation[i];
      words[STATE_WORDS * i + 3] = state.previousActivation[i];
    }
    oscillators.forEach((i, k) => {
      words[STATE_WORDS * i + 4] = state.recovery[k];
      words[STATE_WORDS * i + 5] = state.previousRecovery[k];
    });
    this.device.queue.writeBuffer(this.state, 0, words);
    this.historyStep = state.history;
    this.device.queue.writeBuffer(
      this.status,
      0,
      Uint32Array.of(state.steps >>> 0, f32Bits(state.history), 0, 0, 0, 0),
    );
  }

  // Set the loop's state: the body, each coordinate split into a coarse part on its grid and a remainder, the
  // muscles and the head switch.
  restoreLoop(state: LoopState): void {
    this.alive();
    const loop = this.loop;
    if (!loop) throw new Error('this GPU brain has no loop');
    const { rods, muscles } = loop;
    if (state.x.length !== rods || state.muscles.length !== muscles) throw new Error('the state has another body');
    const words = new Float32Array(ROD_WORDS * rods + Math.max(muscles, 1));
    const split = (value: number, grid: number, at: number): void => {
      const coarse = Math.round(value / grid) * grid;
      words[at] = coarse;
      words[at + 1] = value - coarse;
    };
    for (let i = 0; i < rods; i++) {
      const at = ROD_WORDS * i;
      split(state.x[i], POSITION_GRID, at);
      split(state.y[i], POSITION_GRID, at + 2);
      split(state.theta[i], ANGLE_GRID, at + 4);
      words[at + 6] = state.velocity[3 * i];
      words[at + 7] = state.velocity[3 * i + 1];
      words[at + 8] = state.velocity[3 * i + 2];
    }
    words.set(state.muscles, ROD_WORDS * rods);
    this.device.queue.writeBuffer(this.body, 0, words);
    const bytes = new ArrayBuffer(4 * 4);
    const f = new Float32Array(bytes);
    const u = new Uint32Array(bytes);
    f[0] = state.h;
    f[1] = state.previousCurvature ?? 0;
    u[2] = state.previousCurvature === null ? 0 : 1;
    f[3] = state.switchCurrent;
    this.device.queue.writeBuffer(this.status, 4 * 8, bytes);
  }

  // Make the next step implicit Euler, as after a jump in the input.
  restart(): void {
    this.alive();
    this.historyStep = 0;
    this.device.queue.writeBuffer(this.status, 4, Uint32Array.of(0));
  }

  // The external current each neuron receives during the steps that follow, in pA.
  setInput(input: ArrayLike<number>): void {
    this.alive();
    if (input.length !== this.n) throw new Error(`expected ${this.n} input currents`);
    this.device.queue.writeBuffer(this.input, 0, Float32Array.from(input));
  }

  // Take `steps` steps of dt seconds, queued behind any earlier work, in dispatches of at most
  // MAX_STEPS_PER_DISPATCH.
  run(dt: number, steps: number): void {
    this.alive();
    if (!(dt > 0 && Number.isFinite(dt))) throw new Error(`a step of ${dt} s is not a step`);
    const { network, wiring, oscillators } = this;
    for (const count of dispatches(steps)) {
      const words = new ArrayBuffer(4 * PARAM_WORDS);
      const loop = this.loop;
      new Uint32Array(words).set([
        this.n,
        count,
        this.seed >>> 0,
        this.maxIterations,
        wiring.chemStartAt,
        wiring.gapIndexAt,
        wiring.chemIndexAt,
        loop ? 1 : 0,
      ]);
      if (loop) {
        const at = this.loopAt;
        new Uint32Array(words).set(
          [
            loop.rods,
            loop.muscles,
            at.nmStart,
            at.nmPre,
            at.cover,
            loop.headFrom,
            loop.headTo,
            at.nmWeight,
            at.rodConstants,
            at.segmentConstants,
          ],
          20,
        );
        new Float32Array(words).set(loop.scalars, 32);
      }
      new Float32Array(words).set(
        [
          dt,
          network.capacitance,
          network.leak,
          network.leakPotential,
          network.rise,
          network.decay,
          network.slope,
          this.noise,
          oscillators?.gain ?? 0,
          oscillators?.recovery ?? 1,
          this.tolerance,
        ],
        8,
      );
      // Writes and submissions run in queue order, so each dispatch reads its own parameters.
      this.device.queue.writeBuffer(this.params, 0, words);
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.dispatchWorkgroups(1);
      pass.end();
      this.device.queue.submit([encoder.finish()]);
      this.historyStep = dt;
    }
  }

  // The state and the solver's record once the queued work is done.
  async read(): Promise<{ state: BrainState; status: GpuBrainStatus; loop: LoopState | null }> {
    this.alive();
    const n = this.n;
    const stateBytes = 4 * STATE_WORDS * n;
    const bodyBytes = this.body.size;
    const staging = this.device.createBuffer({
      size: stateBytes + 4 * STATUS_WORDS + bodyBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    let bytes: ArrayBuffer;
    try {
      this.device.pushErrorScope('validation');
      const encoder = this.device.createCommandEncoder();
      encoder.copyBufferToBuffer(this.state, 0, staging, 0, stateBytes);
      encoder.copyBufferToBuffer(this.status, 0, staging, stateBytes, 4 * STATUS_WORDS);
      encoder.copyBufferToBuffer(this.body, 0, staging, stateBytes + 4 * STATUS_WORDS, bodyBytes);
      this.device.queue.submit([encoder.finish()]);
      const error = await this.device.popErrorScope();
      if (error) throw new Error(`the GPU brain could not be read: ${error.message}`);
      await staging.mapAsync(GPUMapMode.READ);
      bytes = staging.getMappedRange().slice(0);
      staging.unmap();
    } catch (e) {
      if (this.lost !== null) throw new Error(`the GPU brain's device was lost: ${this.lost}`, { cause: e });
      throw e;
    } finally {
      staging.destroy();
    }
    const words = new Float32Array(bytes, 0, STATE_WORDS * n);
    const record = new Uint32Array(bytes, stateBytes, STATUS_WORDS);
    const field = (offset: number): Float64Array =>
      Float64Array.from({ length: n }, (_, i) => words[STATE_WORDS * i + offset]);
    const oscillators = this.oscillators?.neurons ?? new Int32Array(0);
    const history = new Float32Array(record.buffer, record.byteOffset + 4, 1)[0];
    const loop = this.loop ? this.readLoop(bytes, stateBytes) : null;
    return {
      loop,
      state: {
        voltage: field(0),
        previousVoltage: field(1),
        activation: field(2),
        previousActivation: field(3),
        recovery: Float64Array.from(oscillators, (i) => words[STATE_WORDS * i + 4]),
        previousRecovery: Float64Array.from(oscillators, (i) => words[STATE_WORDS * i + 5]),
        // The GPU keeps the history's step as f32; report the step it was taken at.
        history: history !== 0 && history === Math.fround(this.historyStep) ? this.historyStep : history,
        steps: record[0],
      },
      status: {
        steps: record[0],
        iterations: record[2],
        unconverged: record[3],
        peakIterations: record[4],
        totalIterations: record[5],
      },
    };
  }

  // The loop's state from a read's bytes: the body's coordinates rejoined, the muscles and the switch.
  private readLoop(bytes: ArrayBuffer, stateBytes: number): LoopState {
    const loop = this.loop as LoopLayout;
    const { rods, muscles } = loop;
    const status = new Float32Array(bytes, stateBytes, STATUS_WORDS);
    const flags = new Uint32Array(bytes, stateBytes, STATUS_WORDS);
    const words = new Float32Array(bytes, stateBytes + 4 * STATUS_WORDS, ROD_WORDS * rods + Math.max(muscles, 1));
    const joined = (offset: number): Float64Array =>
      Float64Array.from({ length: rods }, (_, i) => words[ROD_WORDS * i + offset] + words[ROD_WORDS * i + offset + 1]);
    return {
      x: joined(0),
      y: joined(2),
      theta: joined(4),
      velocity: Float64Array.from({ length: 3 * rods }, (_, k) => words[ROD_WORDS * Math.floor(k / 3) + 6 + (k % 3)]),
      muscles: Float64Array.from(words.subarray(ROD_WORDS * rods, ROD_WORDS * rods + muscles)),
      h: status[8],
      previousCurvature: flags[10] === 1 ? status[9] : null,
      switchCurrent: status[11],
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const b of [
      this.params,
      this.neurons,
      this.input,
      this.state,
      this.status,
      this.body,
      ...this.wiringBuffers,
    ]) {
      b.destroy();
    }
  }

  private alive(): void {
    if (this.destroyed) throw new Error('the GPU brain has been destroyed');
  }

  private writeNeurons(): void {
    const bytes = new ArrayBuffer(4 * NEURON_WORDS * this.n);
    const f = new Float32Array(bytes);
    const u = new Uint32Array(bytes);
    const loop = this.loop;
    for (let i = 0; i < this.n; i++) {
      const at = NEURON_WORDS * i;
      f[at] = this.threshold[i];
      if (loop) {
        f[at + 3] = loop.fieldSide[i];
        u[at + 4] = loop.fieldFrom[i];
        u[at + 5] = loop.fieldTo[i];
        f[at + 6] = loop.switchSide[i];
      }
    }
    const oscillators = this.oscillators;
    oscillators?.neurons.forEach((i, k) => {
      f[NEURON_WORDS * i + 1] = oscillators.shift[k];
      f[NEURON_WORDS * i + 2] = 1;
    });
    this.device.queue.writeBuffer(this.neurons, 0, bytes);
  }
}

function f32Bits(x: number): number {
  return new Uint32Array(Float32Array.of(x).buffer)[0];
}
