import { describe, expect, it } from 'vitest';
import { Brain, equilibrium, inputConductance, midpointActivation } from './brain.ts';
import { chemicalRows, gapRows, lesion, type Network } from './network.ts';

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

describe('rest', () => {
  // Three neurons with a gap junction, excitatory and inhibitory synapses and an autapse.
  const net = network(
    3,
    [[0, 1, 0.2]],
    [
      [1, 0, 0.1, 0],
      [2, 1, 0.3, -48],
      [2, 2, 0.05, 0],
      [0, 2, 0.02, -48],
    ],
  );
  const threshold = equilibrium(net, midpointActivation(net));

  it('is a fixed point: thresholds with activation at a_r / (a_r + 2 a_d)', () => {
    const brain = new Brain(net, threshold, { tolerance: 1e-12 });
    for (let k = 0; k < 400; k++) brain.step(0.0025);
    brain.voltage.forEach((v, i) => expect(v).toBeCloseTo(threshold[i], 9));
    brain.activation.forEach((s) => expect(s).toBeCloseTo(1 / 11, 12));
  });

  it('gives each neuron an input conductance: the current that holds it 1 mV up', () => {
    const s = midpointActivation(net);
    const conductance = inputConductance(net, s, 2);
    const input = new Float64Array(3);
    input[2] = conductance;
    expect(equilibrium(net, s, input)[2] - threshold[2]).toBeCloseTo(1, 9);
  });
});

describe('noise', () => {
  const lone = network(1);
  const sigma = 0.005;
  // An Ornstein–Uhlenbeck process: C dV = −G_c V dt + σ dW has variance σ² / (2 C G_c).
  const expected = (sigma * sigma) / (2 * lone.capacitance * lone.leak);

  function variance(dt: number, seed: number, duration: number): number {
    const brain = new Brain(lone, Float64Array.of(-35));
    brain.noise = sigma;
    brain.seed = seed;
    let sum = 0;
    let squares = 0;
    let count = 0;
    run(brain, [-35], dt, duration, (t) => {
      if (t < 1) return;
      const v = brain.voltage[0] + 35;
      sum += v;
      squares += v * v;
      count++;
    });
    return squares / count - (sum / count) ** 2;
  }

  it('has the same power at any step, as σ/√dt scaling promises', () => {
    // 1,000 s is about 5,000 correlation times, so the estimate's error is about 2%.
    expect(variance(0.001, 1, 1000) / expected).toBeCloseTo(1, 1);
    expect(variance(0.0025, 2, 1000) / expected).toBeCloseTo(1, 1);
  });

  it('is fixed by its seed', () => {
    expect(variance(0.0025, 5, 3)).toBe(variance(0.0025, 5, 3));
    expect(variance(0.0025, 5, 3)).not.toBe(variance(0.0025, 6, 3));
  });
});

describe('lesion', () => {
  it('removes every connection of the lesioned neuron and keeps the rest', () => {
    const net = network(
      3,
      [
        [0, 1, 0.2],
        [1, 2, 0.1],
        [0, 2, 0.3],
      ],
      [
        [1, 0, 0.1, 0],
        [2, 1, 0.3, -48],
        [1, 1, 0.05, 0],
        [0, 2, 0.02, -48],
      ],
    );
    const cut = lesion(net, ['N1']);
    expect(Array.from(cut.gap.index)).toEqual([2, 0]);
    expect(Array.from(cut.chemical.start)).toEqual([0, 1, 1, 1]);
    expect(Array.from(cut.chemical.index)).toEqual([2]);
    expect(Array.from(cut.chemical.reversal)).toEqual([-48]);
    expect(() => lesion(net, ['AVAL'])).toThrow(/unknown neuron/);
  });
});
