// The CPU reference neural model (PLAN §3): Kunert, Shlizerman & Kutz's graded network, stepped at second
// order. Each step solves the voltages by BDF2, with leak, gap-junction and synaptic conductances on the
// left and synaptic activation extrapolated to the new time (2sₙ − sₙ₋₁); it then advances activation by
// BDF2 with φ at the new voltages. That update is linear in s, so it has a closed form. The first step,
// any step after a change of step size, and the step after `restart()` are implicit Euler: BDF2 needs a
// history, and a history that spans a jump in the input costs it an order.

import { CG_MAX_ITERATIONS, CG_TOLERANCE } from '../numerics.ts';
import type { Network } from './network.ts';
import { drawNoise } from './noise.ts';
import { gaussian } from './rng.ts';
import { ConjugateGradient, type Solve } from './solver.ts';

// Intrinsic oscillators on the A- and B-type motor neurons (PLAN §4.3): a FitzHugh–Nagumo pair per neuron,
// I_osc = g_osc v₀ (x − x³/3 − w) with x = (V − V_th − θ)/v₀ and τ_w dw/dt = x + 0.7 − 0.8 w, where
// v₀ = 1/(2β) and θ is the drive threshold for B-types and 0 for A-types.
export interface Oscillators {
  neurons: Int32Array;
  // θ for each, in mV, and g_osc for each, in nS: one per class, as track R splits the A- and B-types' (PLAN §9).
  shift: Float64Array;
  gain: Float64Array;
  // τ_w in s.
  recovery: number;
}

// Oscillators both brains can run alike: one shift and one gain for each, every gain above 0. The GPU takes a
// gain of 0 for no oscillator, so a class without one is left out instead (World does).
export function checkOscillators(oscillators: Oscillators | null): void {
  if (!oscillators) return;
  const { neurons, shift, gain } = oscillators;
  if (shift.length !== neurons.length || gain.length !== neurons.length) {
    throw new Error('oscillators need one shift and one gain for each');
  }
  if (!gain.every((g) => g > 0)) throw new Error('an oscillator needs a gain above 0; leave one out instead');
}

// FitzHugh's textbook constants.
const FHN_A = 0.7;
const FHN_B = 0.8;

// Everything a step reads: the state, the previous step's (BDF2's history) and the step size that history
// was taken at, 0 when there is none and the next step is implicit Euler.
export interface BrainState {
  voltage: Float64Array;
  activation: Float64Array;
  recovery: Float64Array;
  previousVoltage: Float64Array;
  previousActivation: Float64Array;
  previousRecovery: Float64Array;
  // Each neuron's coloured noise current, 0 throughout with white noise.
  noise: Float64Array;
  history: number;
  steps: number;
}

export interface SolverOptions {
  tolerance?: number;
  maxIterations?: number;
}

// Activation at the sigmoid's midpoint when V = V_th, which makes that state a fixed point (PLAN §3.3).
export const midpointActivation = (network: Network): number => network.rise / (network.rise + 2 * network.decay);

// A neuron's activation at rest when it rests `offset` mV below its threshold (track S's class offsets, PLAN §3.3;
// DECISIONS.md, 2026-10-02): the steady state of ds/dt = a_r φ (1 − s) − a_d s with φ at V_th − offset. At an offset
// of 0 it is the midpoint value, given as midpointActivation gives it.
export function restActivation(network: Network, offset: number): number {
  if (offset === 0) return midpointActivation(network);
  const phi = 1 / (1 + Math.exp(network.slope * offset));
  return (network.rise * phi) / (network.rise * phi + network.decay);
}

// Activations held at rest: one value for every neuron, or each neuron's own.
export type Held = number | ArrayLike<number>;

// With every activation held at its value: each neuron's total conductance (leak, gap junctions and synapses), the
// diagonal of the system, and the constant current into it. A synapse's activation is its presynaptic neuron's.
function held(network: Network, s: Held, input?: Float64Array): { d: Float64Array; b: Float64Array } {
  const n = network.names.length;
  const d = new Float64Array(n);
  const b = new Float64Array(n);
  const { gap, chemical } = network;
  for (let i = 0; i < n; i++) {
    let g = network.leak;
    let current = network.leak * network.leakPotential + (input ? input[i] : 0);
    for (let k = gap.start[i]; k < gap.start[i + 1]; k++) g += gap.weight[k];
    for (let k = chemical.start[i]; k < chemical.start[i + 1]; k++) {
      const sj = typeof s === 'number' ? s : s[chemical.index[k]];
      g += chemical.weight[k] * sj;
      current += chemical.weight[k] * sj * chemical.reversal[k];
    }
    d[i] = g;
    b[i] = current;
  }
  return { d, b };
}

// Each neuron's passive load at rest (nS): its leak, its gap junctions and its synapses at the midpoint activation,
// with its partners held and the oscillators off. The conductance form's bounds and shunt are taken against it
// (PLAN §4.3, §7.3).
export const passiveLoads = (network: Network, s: Held = midpointActivation(network)): Float64Array =>
  held(network, s).d;

function solveHeld(network: Network, d: Float64Array, b: Float64Array, x: Float64Array, tolerance: number): void {
  const n = network.names.length;
  const solve = new ConjugateGradient(n).solve(d, network.gap, b, x, tolerance, 10 * n);
  if (!solve.converged) throw new Error('a solve with activations held did not converge');
}

// The network's equilibrium voltages with every activation held at s and the given input: with s at the
// midpoint value and no input, these are the rest thresholds. The solve warm-starts from `start`.
export function equilibrium(
  network: Network,
  s: Held,
  input?: Float64Array,
  start?: Float64Array,
  tolerance = 1e-12,
): Float64Array {
  const { d, b } = held(network, s, input);
  const v = start ? Float64Array.from(start) : new Float64Array(network.names.length);
  solveHeld(network, d, b, v, tolerance);
  return v;
}

// A neuron's input conductance with every activation held at s: the current that holds it 1 mV from its
// equilibrium once the neurons it is coupled to have followed.
export function inputConductance(network: Network, s: Held, neuron: number): number {
  const { d } = held(network, s);
  const unit = new Float64Array(d.length);
  unit[neuron] = 1;
  const response = new Float64Array(d.length);
  solveHeld(network, d, unit, response, 1e-12);
  return 1 / response[neuron];
}

// How a set of neurons respond to one another with every activation held at s: entry [j][i] is how far neuron
// neurons[i] moves from its equilibrium, in mV, under 1 pA into neurons[j], once all have followed.
export function responses(network: Network, s: Held, neurons: readonly number[]): Float64Array[] {
  const { d } = held(network, s);
  return neurons.map((j) => {
    const unit = new Float64Array(d.length);
    unit[j] = 1;
    const response = new Float64Array(d.length);
    solveHeld(network, d, unit, response, 1e-12);
    return Float64Array.from(neurons, (i) => response[i]);
  });
}

// A network's rest with each neuron `offset` mV below its threshold (PLAN §3.3): each activation is known from its
// offset, so the rest is the equilibrium with every activation held at its value, one sparse solve, and each
// threshold is the rest plus its offset. With every offset 0 it is the rest PLAN §3.3 has always set.
export function restOf(
  network: Network,
  offset: ArrayLike<number>,
): { voltage: Float64Array; activation: Float64Array; threshold: Float64Array } {
  const activation = Float64Array.from(offset, (o) => restActivation(network, o));
  const voltage = equilibrium(network, activation);
  return { voltage, activation, threshold: Float64Array.from(voltage, (v, i) => v + offset[i]) };
}

export class Brain {
  readonly network: Network;
  readonly n: number;
  readonly voltage: Float64Array;
  readonly activation: Float64Array;
  // Each neuron's sigmoid threshold. Production keeps the rest thresholds; Neural Interactome mode moves
  // them with its input, as its code does.
  readonly threshold: Float64Array;
  // The external current during the next step, applied at its end as the implicit scheme reads it.
  readonly input: Float64Array;
  // The conductances the layers outside the brain open during the next step (nS), and the current each would carry
  // at 0 mV, Σ g·E (pA). The solve takes them as it takes a synapse's, on its diagonal and its right-hand side, so
  // they hold a neuron between their reversal potentials; left at 0, the step is the same, bit for bit.
  readonly conductance: Float64Array;
  readonly conductanceCurrent: Float64Array;
  // The current noise's intensity, σ_n in current·√s. As white noise, each step adds σ_n/√dt times a standard
  // normal draw.
  noise = 0;
  seed = 0;
  // Both 0 by default, which leaves the white noise above bit for bit. With a correlation time τ_n above 0, the
  // noise is an Ornstein–Uhlenbeck current, τ_n dη = −η dt + σ_n dW, updated exactly, as track R's model runs it
  // from its refit on (DECISIONS.md, 2026-09-28); it starts from 0 when the state is set and is carried in a
  // BrainState. With a grid, which the second numerics study tests and the GPU lacks, each step's noise comes from
  // one path drawn on it, so that runs at different steps, each a multiple of it, share their noise.
  noiseCorrelation = 0;
  noiseGrid = 0;
  // Steps taken since the state was set: the noise's counter, and the clock of fixed-step callers.
  steps = 0;
  // The last voltage solve, and how many solves have failed to converge: stopped at the iteration cap, or
  // met a residual that isn't finite.
  lastSolve: Solve = { iterations: 0, converged: true };
  unconverged = 0;
  // The oscillators, if any, and each one's recovery variable w.
  oscillators: Oscillators | null = null;
  recovery = new Float64Array(0);

  private previousRecovery = new Float64Array(0);
  private coloured = new Float64Array(0);
  private drawn = new Float64Array(0);
  private readonly previousVoltage: Float64Array;
  private readonly previousActivation: Float64Array;
  private historyStep = 0;
  private readonly d: Float64Array;
  private readonly b: Float64Array;
  private readonly next: Float64Array;
  private readonly solver: ConjugateGradient;
  private readonly tolerance: number;
  private readonly maxIterations: number;

  // How far each neuron rests below its threshold, in mV: 0 for every neuron but in track S's model, whose class
  // offsets rest the A-types below theirs and the D-types above (PLAN §3.3; DECISIONS.md, 2026-10-02).
  readonly offset: Float64Array;

  constructor(network: Network, threshold: Float64Array, options: SolverOptions = {}, offset?: ArrayLike<number>) {
    const n = network.names.length;
    this.network = network;
    if (threshold.length !== n) throw new Error(`expected ${n} thresholds`);
    if (offset && offset.length !== n) throw new Error(`expected ${n} offsets`);
    this.n = n;
    this.threshold = Float64Array.from(threshold);
    this.offset = offset ? Float64Array.from(offset) : new Float64Array(n);
    this.voltage = new Float64Array(n);
    this.activation = new Float64Array(n);
    this.input = new Float64Array(n);
    this.conductance = new Float64Array(n);
    this.conductanceCurrent = new Float64Array(n);
    this.previousVoltage = new Float64Array(n);
    this.previousActivation = new Float64Array(n);
    this.d = new Float64Array(n);
    this.b = new Float64Array(n);
    this.next = new Float64Array(n);
    this.coloured = new Float64Array(n);
    this.solver = new ConjugateGradient(n);
    this.tolerance = options.tolerance ?? CG_TOLERANCE;
    this.maxIterations = options.maxIterations ?? CG_MAX_ITERATIONS;
    this.rest();
  }

  // Attach oscillators, each starting on its w-nullcline at the neuron's present voltage.
  setOscillators(oscillators: Oscillators | null): void {
    checkOscillators(oscillators);
    this.oscillators = oscillators;
    const count = oscillators?.neurons.length ?? 0;
    this.recovery = new Float64Array(count);
    this.previousRecovery = new Float64Array(count);
    if (oscillators) {
      const v0 = 1 / (2 * this.network.slope);
      oscillators.neurons.forEach((i, k) => {
        const x = (this.voltage[i] - this.threshold[i] - oscillators.shift[k]) / v0;
        this.recovery[k] = (x + FHN_A) / FHN_B;
      });
    }
    this.historyStep = 0;
  }

  // Every neuron its offset below its threshold, at its activation there: the network's fixed point with no input,
  // and with oscillators off. Without offsets, every neuron at its threshold with activation at the midpoint.
  // Oscillators start on their w-nullclines.
  rest(): void {
    this.setState(
      Float64Array.from(this.threshold, (v, i) => v - this.offset[i]),
      Float64Array.from(this.offset, (o) => restActivation(this.network, o)),
    );
    if (this.oscillators) this.setOscillators(this.oscillators);
  }

  // Set the state, as after `steps` steps, so a restored state draws the noise it would have drawn next.
  setState(voltage: ArrayLike<number>, activation: ArrayLike<number>, steps = 0, recovery?: ArrayLike<number>): void {
    this.voltage.set(voltage);
    this.activation.set(activation);
    if (recovery) this.recovery.set(recovery);
    this.steps = steps;
    this.historyStep = 0;
    this.coloured.fill(0);
  }

  // A copy of everything the next step reads, so another brain, on the CPU or the GPU, can take the same step.
  snapshot(): BrainState {
    return {
      voltage: Float64Array.from(this.voltage),
      activation: Float64Array.from(this.activation),
      recovery: Float64Array.from(this.recovery),
      previousVoltage: Float64Array.from(this.previousVoltage),
      previousActivation: Float64Array.from(this.previousActivation),
      previousRecovery: Float64Array.from(this.previousRecovery),
      noise: Float64Array.from(this.coloured),
      history: this.historyStep,
      steps: this.steps,
    };
  }

  restore(state: BrainState): void {
    if (state.recovery.length !== this.recovery.length) throw new Error('the state has other oscillators');
    if (!state.noise) throw new Error('the state carries no noise current, so it predates the coloured noise');
    if (state.noise.length !== this.n) throw new Error('the state has another number of neurons');
    this.coloured.set(state.noise);
    this.voltage.set(state.voltage);
    this.activation.set(state.activation);
    this.recovery.set(state.recovery);
    this.previousVoltage.set(state.previousVoltage);
    this.previousActivation.set(state.previousActivation);
    this.previousRecovery.set(state.previousRecovery);
    this.historyStep = state.history;
    this.steps = state.steps;
  }

  // Make the next step implicit Euler. Call it whenever the input jumps, such as a stimulus switching on or
  // off: BDF2 across a jump is first order.
  restart(): void {
    this.historyStep = 0;
  }

  // Each neuron's noise current over the next step, from the grid's path (noise.ts).
  private drawNoise(dt: number): Float64Array {
    if (this.drawn.length !== this.n) this.drawn = new Float64Array(this.n);
    const settings = {
      seed: this.seed,
      intensity: this.noise,
      correlation: this.noiseCorrelation,
      grid: this.noiseGrid,
    };
    drawNoise(this.drawn, this.coloured, settings, this.steps, dt);
    return this.drawn;
  }

  step(dt: number): void {
    const { n, network, voltage: v, activation: s, previousVoltage: vp, previousActivation: sp, d, b } = this;
    const { gap, chemical } = network;
    const bdf2 = this.historyStep === dt;
    // BDF2: (3y′ − 4y + y₋₁) / 2dt = f(y′), written as (a y′ − h) / dt with a = 3/2 and h = 2y − y₋₁/2.
    // Implicit Euler: a = 1 and h = y.
    const a = bdf2 ? 1.5 : 1;
    const c = network.capacitance / dt;
    const plain = this.noiseCorrelation === 0 && this.noiseGrid === 0;
    const noise = this.noise > 0 && plain ? this.noise / Math.sqrt(dt) : 0;
    const drawn = this.noise > 0 && !plain ? this.drawNoise(dt) : null;
    for (let i = 0; i < n; i++) {
      let g = a * c + network.leak + this.conductance[i];
      let current =
        c * (bdf2 ? 2 * v[i] - 0.5 * vp[i] : v[i]) +
        network.leak * network.leakPotential +
        this.input[i] +
        this.conductanceCurrent[i];
      if (noise > 0) current += noise * gaussian(this.seed, this.steps, i);
      else if (drawn) current += drawn[i];
      for (let k = gap.start[i]; k < gap.start[i + 1]; k++) g += gap.weight[k];
      for (let k = chemical.start[i]; k < chemical.start[i + 1]; k++) {
        const j = chemical.index[k];
        const conductance = chemical.weight[k] * (bdf2 ? 2 * s[j] - sp[j] : s[j]);
        g += conductance;
        current += conductance * chemical.reversal[k];
      }
      d[i] = g;
      b[i] = current;
    }
    // The oscillators' current, linearised about this step's voltage: implicitly where the cubic stabilises
    // (|x| > 1, the outer branches), which only adds conductance and keeps the system positive definite, and
    // explicitly where it destabilises (the middle branch, crossed in a fast jump).
    const osc = this.oscillators;
    const v0 = 1 / (2 * network.slope);
    if (osc) {
      osc.neurons.forEach((i, k) => {
        const x = (v[i] - this.threshold[i] - osc.shift[k]) / v0;
        const stabilising = osc.gain[k] * Math.max(x * x - 1, 0);
        d[i] += stabilising;
        b[i] += osc.gain[k] * v0 * (x - (x * x * x) / 3 - this.recovery[k]) + stabilising * v[i];
      });
    }
    const next = this.next;
    next.set(v);
    this.lastSolve = this.solver.solve(d, gap, b, next, this.tolerance, this.maxIterations);
    if (!this.lastSolve.converged) this.unconverged++;

    const { rise, decay, slope } = network;
    for (let i = 0; i < n; i++) {
      const phi = 1 / (1 + Math.exp(-slope * (next[i] - this.threshold[i])));
      const history = bdf2 ? 2 * s[i] - 0.5 * sp[i] : s[i];
      const updated = (history + dt * rise * phi) / (a + dt * (rise * phi + decay));
      sp[i] = s[i];
      s[i] = updated;
      vp[i] = v[i];
      v[i] = next[i];
    }
    // Recovery by BDF2 (implicit Euler first), linear in w, with x at the new voltage.
    if (osc) {
      const w = this.recovery;
      const wp = this.previousRecovery;
      const h = dt / osc.recovery;
      osc.neurons.forEach((i, k) => {
        const x = (v[i] - this.threshold[i] - osc.shift[k]) / v0;
        const history = bdf2 ? 2 * w[k] - 0.5 * wp[k] : w[k];
        wp[k] = w[k];
        w[k] = (history + h * (x + FHN_A)) / (a + h * FHN_B);
      });
    }
    this.historyStep = dt;
    this.steps++;
  }
}
