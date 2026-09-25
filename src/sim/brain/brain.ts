// The CPU reference neural model (PLAN §3): Kunert, Shlizerman & Kutz's graded network, stepped at second
// order. Each step solves the voltages by BDF2, with leak, gap-junction and synaptic conductances on the
// left and synaptic activation extrapolated to the new time (2sₙ − sₙ₋₁); it then advances activation by
// BDF2 with φ at the new voltages. That update is linear in s, so it has a closed form. The first step,
// any step after a change of step size, and the step after `restart()` are implicit Euler: BDF2 needs a
// history, and a history that spans a jump in the input costs it an order.

import { CG_MAX_ITERATIONS, CG_TOLERANCE } from '../numerics.ts';
import type { Network } from './network.ts';
import { gaussian } from './rng.ts';
import { ConjugateGradient, type Solve } from './solver.ts';

export interface SolverOptions {
  tolerance?: number;
  maxIterations?: number;
}

// Activation at the sigmoid's midpoint when V = V_th, which makes that state a fixed point (PLAN §3.3).
export const midpointActivation = (network: Network): number => network.rise / (network.rise + 2 * network.decay);

// With every activation held at s: each neuron's total conductance (leak, gap junctions and synapses), the
// diagonal of the system, and the constant current into it.
function held(network: Network, s: number, input?: Float64Array): { d: Float64Array; b: Float64Array } {
  const n = network.names.length;
  const d = new Float64Array(n);
  const b = new Float64Array(n);
  const { gap, chemical } = network;
  for (let i = 0; i < n; i++) {
    let g = network.leak;
    let current = network.leak * network.leakPotential + (input ? input[i] : 0);
    for (let k = gap.start[i]; k < gap.start[i + 1]; k++) g += gap.weight[k];
    for (let k = chemical.start[i]; k < chemical.start[i + 1]; k++) {
      g += chemical.weight[k] * s;
      current += chemical.weight[k] * s * chemical.reversal[k];
    }
    d[i] = g;
    b[i] = current;
  }
  return { d, b };
}

function solveHeld(network: Network, d: Float64Array, b: Float64Array, x: Float64Array, tolerance: number): void {
  const n = network.names.length;
  const solve = new ConjugateGradient(n).solve(d, network.gap, b, x, tolerance, 10 * n);
  if (!solve.converged) throw new Error('a solve with activations held did not converge');
}

// The network's equilibrium voltages with every activation held at s and the given input: with s at the
// midpoint value and no input, these are the rest thresholds. The solve warm-starts from `start`.
export function equilibrium(
  network: Network,
  s: number,
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
export function inputConductance(network: Network, s: number, neuron: number): number {
  const { d } = held(network, s);
  const unit = new Float64Array(d.length);
  unit[neuron] = 1;
  const response = new Float64Array(d.length);
  solveHeld(network, d, unit, response, 1e-12);
  return 1 / response[neuron];
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
  // White current noise intensity, σ_n in current·√s: each step adds σ_n/√dt times a standard normal draw.
  noise = 0;
  seed = 0;
  // Steps taken since the state was set: the noise's counter, and the clock of fixed-step callers.
  steps = 0;
  // The last voltage solve, and how many solves have failed to converge: stopped at the iteration cap, or
  // met a residual that isn't finite.
  lastSolve: Solve = { iterations: 0, converged: true };
  unconverged = 0;

  private readonly previousVoltage: Float64Array;
  private readonly previousActivation: Float64Array;
  private historyStep = 0;
  private readonly d: Float64Array;
  private readonly b: Float64Array;
  private readonly next: Float64Array;
  private readonly solver: ConjugateGradient;
  private readonly tolerance: number;
  private readonly maxIterations: number;

  constructor(network: Network, threshold: Float64Array, options: SolverOptions = {}) {
    const n = network.names.length;
    this.network = network;
    if (threshold.length !== n) throw new Error(`expected ${n} thresholds`);
    this.n = n;
    this.threshold = Float64Array.from(threshold);
    this.voltage = new Float64Array(n);
    this.activation = new Float64Array(n);
    this.input = new Float64Array(n);
    this.previousVoltage = new Float64Array(n);
    this.previousActivation = new Float64Array(n);
    this.d = new Float64Array(n);
    this.b = new Float64Array(n);
    this.next = new Float64Array(n);
    this.solver = new ConjugateGradient(n);
    this.tolerance = options.tolerance ?? CG_TOLERANCE;
    this.maxIterations = options.maxIterations ?? CG_MAX_ITERATIONS;
    this.rest();
  }

  // Every neuron at its threshold with activation at the midpoint: the network's fixed point with no input.
  rest(): void {
    this.setState(this.threshold, new Float64Array(this.n).fill(midpointActivation(this.network)));
  }

  // Set the state, as after `steps` steps, so a restored state draws the noise it would have drawn next.
  setState(voltage: ArrayLike<number>, activation: ArrayLike<number>, steps = 0): void {
    this.voltage.set(voltage);
    this.activation.set(activation);
    this.steps = steps;
    this.historyStep = 0;
  }

  // Make the next step implicit Euler. Call it whenever the input jumps, such as a stimulus switching on or
  // off: BDF2 across a jump is first order.
  restart(): void {
    this.historyStep = 0;
  }

  step(dt: number): void {
    const { n, network, voltage: v, activation: s, previousVoltage: vp, previousActivation: sp, d, b } = this;
    const { gap, chemical } = network;
    const bdf2 = this.historyStep === dt;
    // BDF2: (3y′ − 4y + y₋₁) / 2dt = f(y′), written as (a y′ − h) / dt with a = 3/2 and h = 2y − y₋₁/2.
    // Implicit Euler: a = 1 and h = y.
    const a = bdf2 ? 1.5 : 1;
    const c = network.capacitance / dt;
    const noise = this.noise > 0 ? this.noise / Math.sqrt(dt) : 0;
    for (let i = 0; i < n; i++) {
      let g = a * c + network.leak;
      let current = c * (bdf2 ? 2 * v[i] - 0.5 * vp[i] : v[i]) + network.leak * network.leakPotential + this.input[i];
      if (noise > 0) current += noise * gaussian(this.seed, this.steps, i);
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
    this.historyStep = dt;
    this.steps++;
  }
}
