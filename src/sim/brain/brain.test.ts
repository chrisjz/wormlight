import { describe, expect, it } from 'vitest';
import { Brain, equilibrium, inputConductance, midpointActivation } from './brain.ts';
import { chemicalRows, connections, gapRows, lesion, type Network } from './network.ts';

// Production units: nF, nS, mV, s, pA.
function network(
  n: number,
  gap: [number, number, number][] = [],
  chemical: [number, number, number, number][] = [],
): Network {
  return {
    names: Array.from({ length: n }, (_, i) => `N${i}`),
    capacitance: 0.001,
    leak: 0.01,
    leakPotential: -35,
    rise: 1,
    decay: 5,
    slope: 0.125,
    gap: gapRows(n, gap),
    chemical: chemicalRows(n, chemical),
  };
}

// Run from `start` to time `end` at step dt, calling `sample` after every step.
function run(brain: Brain, start: number[], dt: number, end: number, sample: (t: number) => void = () => {}): void {
  brain.setState(start, new Float64Array(start.length));
  const steps = Math.round(end / dt);
  for (let k = 1; k <= steps; k++) {
    brain.step(dt);
    sample(k * dt);
  }
}

describe('a lone neuron', () => {
  const lone = network(1);
  const tau = lone.capacitance / lone.leak;
  const exact = (t: number): number => -35 + 35 * Math.exp(-t / tau);

  // The largest error over 0.3 s, starting from 0 mV.
  function error(dt: number): number {
    const brain = new Brain(lone, Float64Array.of(-35));
    let worst = 0;
    run(brain, [0], dt, 0.3, (t) => (worst = Math.max(worst, Math.abs(brain.voltage[0] - exact(t)))));
    return worst;
  }

  it('relaxes to E_c with time constant C/G_c', () => {
    expect(tau).toBeCloseTo(0.1, 12);
    expect(error(0.001)).toBeLessThan(5e-3);
  });

  it('converges at second order', () => {
    const errors = [0.004, 0.002, 0.001].map(error);
    for (let i = 0; i < 2; i++) expect(Math.log2(errors[i] / errors[i + 1])).toBeCloseTo(2, 0);
  });
});

describe('two gap-coupled neurons', () => {
  it('equalise at rate (G_c + 2g)/C while their mean relaxes at G_c/C', () => {
    const g = 0.05;
    const pair = network(2, [[0, 1, g]]);
    // A tight solve, so the comparison sees the integrator alone.
    const brain = new Brain(pair, Float64Array.of(-35, -35), { tolerance: 1e-12 });
    run(brain, [-25, -35], 1e-4, 0.02);
    const mean = 5 * Math.exp((-0.02 * pair.leak) / pair.capacitance);
    const difference = 10 * Math.exp((-0.02 * (pair.leak + 2 * g)) / pair.capacitance);
    expect(brain.voltage[0]).toBeCloseTo(-35 + mean + difference / 2, 3);
    expect(brain.voltage[1]).toBeCloseTo(-35 + mean - difference / 2, 3);
  });
});

// Three neurons with a gap junction, excitatory and inhibitory synapses and an autapse.
const three = network(
  3,
  [[0, 1, 0.2]],
  [
    [1, 0, 0.1, 0],
    [2, 1, 0.3, -48],
    [2, 2, 0.05, 0],
    [0, 2, 0.02, -48],
  ],
);
const restThreshold = equilibrium(three, midpointActivation(three));

describe('rest', () => {
  it('is a fixed point: thresholds with activation at a_r / (a_r + 2 a_d)', () => {
    const brain = new Brain(three, restThreshold, { tolerance: 1e-12 });
    for (let k = 0; k < 400; k++) brain.step(0.0025);
    brain.voltage.forEach((v, i) => expect(v).toBeCloseTo(restThreshold[i], 9));
    brain.activation.forEach((s) => expect(s).toBeCloseTo(1 / 11, 12));
  });

  it('gives each neuron an input conductance: the current that holds it 1 mV up, its partners following', () => {
    const s = midpointActivation(three);
    // Neuron 0 is coupled to neuron 1, so its input conductance is less than its own total conductance.
    const conductance = inputConductance(three, s, 0);
    expect(conductance).toBeLessThan(three.leak + 0.2 + 0.02 * s);
    const input = new Float64Array(3);
    input[0] = conductance;
    expect(equilibrium(three, s, input)[0] - restThreshold[0]).toBeCloseTo(1, 9);
  });
});

describe('the step', () => {
  // A brain driven away from rest for a few steps, and a copy of its state at that point.
  function driven(): { brain: Brain; voltage: Float64Array; activation: Float64Array } {
    const brain = new Brain(three, restThreshold, { tolerance: 1e-12 });
    brain.input.set([30, -20, 10]);
    for (let k = 0; k < 20; k++) brain.step(0.0025);
    return { brain, voltage: Float64Array.from(brain.voltage), activation: Float64Array.from(brain.activation) };
  }

  // One step from the copied state with no history: implicit Euler.
  function fresh(voltage: Float64Array, activation: Float64Array, dt: number): Float64Array {
    const brain = new Brain(three, restThreshold, { tolerance: 1e-12 });
    brain.input.set([30, -20, 10]);
    brain.setState(voltage, activation);
    brain.step(dt);
    return brain.voltage;
  }

  it('is implicit Euler after setState, after a change of step size and after restart', () => {
    const reset = driven();
    reset.brain.setState(reset.voltage, reset.activation);
    reset.brain.step(0.0025);
    expect(reset.brain.voltage).toEqual(fresh(reset.voltage, reset.activation, 0.0025));

    const resized = driven();
    resized.brain.step(0.001);
    expect(resized.brain.voltage).toEqual(fresh(resized.voltage, resized.activation, 0.001));

    const restarted = driven();
    restarted.brain.restart();
    restarted.brain.step(0.0025);
    expect(restarted.brain.voltage).toEqual(fresh(restarted.voltage, restarted.activation, 0.0025));
  });

  it('is BDF2 otherwise', () => {
    const run = driven();
    run.brain.step(0.0025);
    expect(run.brain.voltage).not.toEqual(fresh(run.voltage, run.activation, 0.0025));
  });

  it('reports a solve that meets a NaN instead of passing it off as converged', () => {
    const brain = new Brain(three, restThreshold);
    brain.input[1] = NaN;
    brain.step(0.0025);
    expect(brain.lastSolve.converged).toBe(false);
    expect(brain.unconverged).toBe(1);
  });
});

describe('noise', () => {
  const pair = network(2);
  const tau = pair.capacitance / pair.leak;
  const sigma = 0.005;
  // An Ornstein–Uhlenbeck process: C dV = −G_c V dt + σ dW has variance σ² / (2 C G_c).
  const continuous = (sigma * sigma) / (2 * pair.capacitance * pair.leak);

  // BDF2's own stationary variance for that process, as a share of the continuous value. The scheme is the
  // AR(2) recurrence x′ = a₁x + a₂x₋₁ + e with D = 3/2 + dt/τ, a₁ = 2/D, a₂ = −1/(2D) and var(e) =
  // σ²dt/(C²D²), whose variance is var(e)(1 − a₂) / ((1 + a₂)((1 − a₂)² − a₁²)).
  function bdf2Share(dt: number): number {
    const D = 1.5 + dt / tau;
    const a1 = 2 / D;
    const a2 = -0.5 / D;
    const e = (sigma * sigma * dt) / (pair.capacitance ** 2 * D * D);
    return (e * (1 - a2)) / ((1 + a2) * ((1 - a2) ** 2 - a1 * a1)) / continuous;
  }

  // Two uncoupled neurons after the first second: each one's variance, and their correlation.
  function measure(dt: number, seed: number, duration: number): { variance: number[]; correlation: number } {
    const brain = new Brain(pair, Float64Array.of(-35, -35));
    brain.noise = sigma;
    brain.seed = seed;
    const sum = [0, 0];
    const squares = [0, 0];
    let product = 0;
    let count = 0;
    run(brain, [-35, -35], dt, duration, (t) => {
      if (t < 1) return;
      const x = [brain.voltage[0] + 35, brain.voltage[1] + 35];
      for (let i = 0; i < 2; i++) {
        sum[i] += x[i];
        squares[i] += x[i] * x[i];
      }
      product += x[0] * x[1];
      count++;
    });
    const mean = sum.map((s) => s / count);
    const variance = squares.map((s, i) => s / count - mean[i] ** 2);
    const correlation = (product / count - mean[0] * mean[1]) / Math.sqrt(variance[0] * variance[1]);
    return { variance, correlation };
  }

  it("has the same power at any step, up to BDF2's own O(dt/τ) bias", () => {
    // The σ/√dt scaling leaves only the scheme's bias, which is under 2% at the production step.
    expect(bdf2Share(0.001)).toBeCloseTo(0.9926, 4);
    expect(bdf2Share(0.0025)).toBeCloseTo(0.9817, 4);
    // 2,000 s of two neurons is about 20,000 correlation times, so each estimate's error is about 1%.
    for (const [dt, seed] of [
      [0.001, 1],
      [0.0025, 2],
    ]) {
      const { variance } = measure(dt, seed, 2000);
      const share = (variance[0] + variance[1]) / 2 / continuous;
      expect(Math.abs(share / bdf2Share(dt) - 1)).toBeLessThan(0.04);
    }
  });

  it('draws independently for each neuron', () => {
    // The correlation's standard error over 1,000 s is about 0.01.
    expect(Math.abs(measure(0.0025, 3, 1000).correlation)).toBeLessThan(0.05);
  });

  it('is fixed by its seed, and continues from a restored step count', () => {
    const trace = (seed: number, from = 0): number[] => {
      const brain = new Brain(pair, Float64Array.of(-35, -35));
      brain.noise = sigma;
      brain.seed = seed;
      brain.setState([-35, -35], [0, 0], from);
      return Array.from({ length: 5 }, () => (brain.step(0.0025), brain.voltage[0]));
    };
    expect(trace(5)).toEqual(trace(5));
    expect(trace(5)).not.toEqual(trace(6));
    expect(trace(5, 100)).not.toEqual(trace(5));
  });
});

describe('lesion', () => {
  // Four neurons; neuron 0 keeps two inputs with different weights and reversals.
  const net = network(
    4,
    [
      [0, 1, 0.2],
      [1, 2, 0.1],
      [0, 2, 0.3],
      [2, 3, 0.4],
    ],
    [
      [1, 0, 0.1, 0],
      [2, 1, 0.3, -48],
      [1, 1, 0.05, 0],
      [0, 2, 0.02, -48],
      [0, 3, 0.07, 0],
      [3, 0, 0.06, -48],
      [3, 2, 0.08, 0],
    ],
  );

  it('lists connections as they were built', () => {
    expect(connections(net).gap).toEqual([
      [0, 1, 0.2],
      [0, 2, 0.3],
      [1, 2, 0.1],
      [2, 3, 0.4],
    ]);
    expect(connections(net).chemical).toEqual([
      [0, 2, 0.02, -48],
      [0, 3, 0.07, 0],
      [1, 0, 0.1, 0],
      [1, 1, 0.05, 0],
      [2, 1, 0.3, -48],
      [3, 0, 0.06, -48],
      [3, 2, 0.08, 0],
    ]);
  });

  it('removes every connection of the lesioned neuron and keeps the rest, weights and reversals intact', () => {
    const cut = lesion(net, ['N1']);
    expect(connections(cut).gap).toEqual([
      [0, 2, 0.3],
      [2, 3, 0.4],
    ]);
    expect(connections(cut).chemical).toEqual([
      [0, 2, 0.02, -48],
      [0, 3, 0.07, 0],
      [3, 0, 0.06, -48],
      [3, 2, 0.08, 0],
    ]);
    expect(() => lesion(net, ['AVAL'])).toThrow(/unknown neuron/);
  });
});
