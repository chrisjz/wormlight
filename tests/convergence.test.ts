// The integrator's convergence order on the full Cook model (PLAN §7.2): self-convergence under a smooth
// input, with the solve tight enough that only the integrator's error shows. Halving the step should cut
// the difference between successive runs fourfold, an order of 2 ± 0.3.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { Brain, equilibrium, inputConductance, midpointActivation } from '../src/sim/brain/brain.ts';
import { cookNetwork } from '../src/sim/brain/network.ts';
import { readJson } from './checks.ts';

const network = cookNetwork(validateWormlightData(readJson('public/data/wormlight.v1.json')));
const rest = midpointActivation(network);
const threshold = equilibrium(network, rest);
const driven = ['AVBL', 'AVBR', 'PLML', 'PLMR'].map((name) => network.names.indexOf(name));
// A raised cosine over 1 s, peaking at the current that would hold each neuron 20 mV up at rest.
const peak = driven.map((i) => 20 * inputConductance(network, rest, i));
const DURATION = 1;
const SAMPLE = 0.01;

// Voltages and activations every 10 ms, activations scaled to a comparable size (0–100).
function trajectory(dt: number): Float64Array[] {
  const brain = new Brain(network, threshold, { tolerance: 1e-13, maxIterations: 1000 });
  const per = Math.round(SAMPLE / dt);
  const samples: Float64Array[] = [];
  for (let k = 1; k <= Math.round(DURATION / SAMPLE); k++) {
    for (let q = 0; q < per; q++) {
      const t = (brain.steps + 1) * dt;
      const envelope = 0.5 * (1 - Math.cos((2 * Math.PI * t) / DURATION));
      driven.forEach((i, c) => (brain.input[i] = peak[c] * envelope));
      brain.step(dt);
    }
    samples.push(Float64Array.from([...brain.voltage, ...brain.activation.map((s) => 100 * s)]));
  }
  return samples;
}

const largestDifference = (a: Float64Array[], b: Float64Array[]): number =>
  Math.max(...a.map((row, k) => Math.max(...row.map((v, i) => Math.abs(v - b[k][i])))));

describe('the integrator', () => {
  it('converges at second order on the Cook model', () => {
    const runs = [0.005, 0.0025, 0.00125, 0.000625].map(trajectory);
    const differences = runs.slice(1).map((run, i) => largestDifference(runs[i], run));
    for (let i = 0; i + 1 < differences.length; i++) {
      const order = Math.log2(differences[i] / differences[i + 1]);
      expect(Math.abs(order - 2), `order ${order.toFixed(3)}`).toBeLessThanOrEqual(0.3);
    }
  });
});
