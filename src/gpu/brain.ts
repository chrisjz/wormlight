// The neural model on the GPU (PLAN §1, §3.4): a network's wiring and constants in buffers, and one compute
// pass that takes any number of steps. It mirrors the CPU reference's Brain, which it is checked against
// (parity.ts), and trades state with it as a BrainState. A lesion or a brain swap is a new network in the
// same buffers' places (setNetwork); the thresholds stay what the caller gave (PLAN §3.3).

import type { BrainState, Oscillators } from '../sim/brain/brain.ts';
import { midpointActivation } from '../sim/brain/brain.ts';
import type { Network } from '../sim/brain/network.ts';
import { CG_MAX_ITERATIONS, CG_TOLERANCE_GPU } from '../sim/numerics.ts';
import { BRAIN_SHADER, MAX_NEURONS, NEURON_WORDS, PARAM_WORDS, STATE_WORDS, STATUS_WORDS } from './brainShader.ts';

// FitzHugh's constants, as brain.ts has them: a neuron's recovery starts on its w-nullcline.
const FHN_A = 0.7;
const FHN_B = 0.8;

export interface GpuBrainOptions {
  tolerance?: number;
  maxIterations?: number;
}

// The solver's record since the state was last set.
export interface GpuBrainStatus {
  steps: number;
  // The last solve's iterations, the most in the last run, and the total over it.
  iterations: number;
  peakIterations: number;
  totalIterations: number;
  // Solves that stopped at the iteration cap or met a residual that isn't finite.
  unconverged: number;
}

// The wiring in the shader's layout. Topology holds the gap rows' starts, the chemical rows' starts, the gap
// partners and the chemical presynaptic neurons; every array has at least one element, since WebGPU binds no
// empty buffer.
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
  const topology = new Uint32Array(Math.max(chemIndexAt + synapses, 1));
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
  readonly threshold: Float64Array;
  network: Network;
  // White current noise intensity, σ_n in current·√s, and the seed of its hash, as the CPU's Brain has them.
  noise = 0;
  seed = 0;

  private oscillators: Oscillators | null = null;
  private wiring: PackedNetwork;
  private wiringBuffers: GPUBuffer[] = [];
  private bindGroup: GPUBindGroup;
  private readonly pipeline: GPUComputePipeline;
  private readonly params: GPUBuffer;
  private readonly neurons: GPUBuffer;
  private readonly input: GPUBuffer;
  private readonly state: GPUBuffer;
  private readonly status: GPUBuffer;
  private readonly tolerance: number;
  private readonly maxIterations: number;
  // The step size the history was taken at, which the GPU keeps only as f32.
  private historyStep = 0;

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
    const buffer = (words: number, usage: number): GPUBuffer => device.createBuffer({ size: 4 * words, usage });
    this.params = buffer(PARAM_WORDS, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.neurons = buffer(NEURON_WORDS * n, storage());
    this.input = buffer(n, storage());
    this.state = buffer(STATE_WORDS * n, storage() | GPUBufferUsage.COPY_SRC);
    this.status = buffer(STATUS_WORDS, storage() | GPUBufferUsage.COPY_SRC);
    this.wiring = packNetwork(network);
    this.bindGroup = this.bind();
    this.writeNeurons();
    this.rest();
  }

  // Build a GPU brain. The pipeline is created asynchronously, so a shader that fails validation rejects here.
  static async create(
    device: GPUDevice,
    network: Network,
    threshold: Float64Array,
    options: GpuBrainOptions = {},
  ): Promise<GpuBrain> {
    const n = network.names.length;
    if (n > MAX_NEURONS) throw new Error(`the GPU brain holds at most ${MAX_NEURONS} neurons, not ${n}`);
    if (threshold.length !== n) throw new Error(`expected ${n} thresholds`);
    const module = device.createShaderModule({ code: BRAIN_SHADER });
    const pipeline = await device.createComputePipelineAsync({
      layout: 'auto',
      compute: { module, entryPoint: 'advance' },
    });
    device.pushErrorScope('validation');
    const brain = new GpuBrain(device, pipeline, network, threshold, options);
    const error = await device.popErrorScope();
    if (error) throw new Error(`the GPU brain could not be set up: ${error.message}`);
    return brain;
  }

  // Swap in another network on the same neurons, such as a lesioned or rewired one; the state carries over.
  setNetwork(network: Network): void {
    if (network.names.length !== this.n) throw new Error(`expected a network of ${this.n} neurons`);
    this.network = network;
    this.wiring = packNetwork(network);
    this.bindGroup = this.bind();
  }

  // Attach oscillators, or none. Their recovery comes with the next restored state, or rest().
  setOscillators(oscillators: Oscillators | null): void {
    this.oscillators = oscillators;
    this.writeNeurons();
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

  // Set the state, history and step count, as the CPU's restore() does.
  restore(state: BrainState): void {
    const n = this.n;
    const oscillators = this.oscillators?.neurons ?? new Int32Array(0);
    if (state.recovery.length !== oscillators.length) throw new Error('the state has other oscillators');
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
    // The solver's record starts afresh.
    this.device.queue.writeBuffer(
      this.status,
      0,
      Uint32Array.of(state.steps >>> 0, f32Bits(state.history), 0, 0, 0, 0),
    );
  }

  // Make the next step implicit Euler, as after a jump in the input.
  restart(): void {
    this.historyStep = 0;
    this.device.queue.writeBuffer(this.status, 4, Uint32Array.of(0));
  }

  // The external current each neuron receives during the steps that follow, in pA.
  setInput(input: ArrayLike<number>): void {
    if (input.length !== this.n) throw new Error(`expected ${this.n} input currents`);
    this.device.queue.writeBuffer(this.input, 0, Float32Array.from(input));
  }

  // Take `steps` steps of dt seconds in one dispatch, queued behind any earlier work.
  run(dt: number, steps: number): void {
    const words = new ArrayBuffer(4 * PARAM_WORDS);
    const u = new Uint32Array(words);
    const f = new Float32Array(words);
    const { network, wiring, oscillators } = this;
    u.set([
      this.n,
      steps,
      this.seed >>> 0,
      this.maxIterations,
      wiring.chemStartAt,
      wiring.gapIndexAt,
      wiring.chemIndexAt,
    ]);
    f.set(
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
    this.device.queue.writeBuffer(this.params, 0, words);
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.dispatchWorkgroups(1);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    if (steps > 0) this.historyStep = dt;
  }

  // The state and the solver's record once the queued work is done.
  async read(): Promise<{ state: BrainState; status: GpuBrainStatus }> {
    const n = this.n;
    const stateBytes = 4 * STATE_WORDS * n;
    const staging = this.device.createBuffer({
      size: stateBytes + 4 * STATUS_WORDS,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.state, 0, staging, 0, stateBytes);
    encoder.copyBufferToBuffer(this.status, 0, staging, stateBytes, 4 * STATUS_WORDS);
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const bytes = staging.getMappedRange().slice(0);
    staging.unmap();
    staging.destroy();
    const words = new Float32Array(bytes, 0, STATE_WORDS * n);
    const record = new Uint32Array(bytes, stateBytes, STATUS_WORDS);
    const field = (offset: number): Float64Array =>
      Float64Array.from({ length: n }, (_, i) => words[STATE_WORDS * i + offset]);
    const oscillators = this.oscillators?.neurons ?? new Int32Array(0);
    const history = new Float32Array(record.buffer, record.byteOffset + 4, 1)[0];
    return {
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

  destroy(): void {
    for (const b of [this.params, this.neurons, this.input, this.state, this.status, ...this.wiringBuffers]) {
      b.destroy();
    }
  }

  private bind(): GPUBindGroup {
    for (const b of this.wiringBuffers) b.destroy();
    const upload = (data: Uint32Array | Float32Array): GPUBuffer => {
      const b = this.device.createBuffer({ size: data.byteLength, usage: storage() });
      this.device.queue.writeBuffer(b, 0, data);
      return b;
    };
    const { topology, gapWeight, chemical } = this.wiring;
    this.wiringBuffers = [upload(topology), upload(gapWeight), upload(chemical)];
    const resources = [this.params, ...this.wiringBuffers, this.neurons, this.input, this.state, this.status];
    return this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: resources.map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
  }

  private writeNeurons(): void {
    const words = new Float32Array(NEURON_WORDS * this.n);
    for (let i = 0; i < this.n; i++) words[NEURON_WORDS * i] = this.threshold[i];
    const oscillators = this.oscillators;
    oscillators?.neurons.forEach((i, k) => {
      words[NEURON_WORDS * i + 1] = oscillators.shift[k];
      words[NEURON_WORDS * i + 2] = 1;
    });
    this.device.queue.writeBuffer(this.neurons, 0, words);
  }
}

function f32Bits(x: number): number {
  return new Uint32Array(Float32Array.of(x).buffer)[0];
}
