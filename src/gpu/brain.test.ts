import { describe, expect, it } from 'vitest';
import { chemicalRows, gapRows, type Network } from '../sim/brain/network.ts';
import { packNetwork } from './brain.ts';
import { MAX_NEURONS } from './brainShader.ts';

function network(n: number, gap: [number, number, number][], chemical: [number, number, number, number][]): Network {
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

describe('the GPU brain’s buffers', () => {
  it('pack every row where the shader reads it', () => {
    const net = network(
      3,
      [[0, 2, 0.5]],
      [
        [1, 0, 0.25, 0],
        [1, 2, 0.75, -48],
        [0, 0, 0.1, 0],
      ],
    );
    const packed = packNetwork(net);
    const { topology, gapWeight, chemical, chemStartAt, gapIndexAt, chemIndexAt } = packed;
    for (let i = 0; i < 3; i++) {
      const gaps = [];
      for (let e = topology[i]; e < topology[i + 1]; e++) gaps.push([topology[gapIndexAt + e], gapWeight[e]]);
      const expectedGaps = [];
      for (let k = net.gap.start[i]; k < net.gap.start[i + 1]; k++)
        expectedGaps.push([net.gap.index[k], net.gap.weight[k]]);
      expect(gaps).toEqual(expectedGaps);
      const synapses = [];
      for (let e = topology[chemStartAt + i]; e < topology[chemStartAt + i + 1]; e++) {
        synapses.push([topology[chemIndexAt + e], chemical[2 * e], chemical[2 * e + 1]]);
      }
      const expected = [];
      for (let k = net.chemical.start[i]; k < net.chemical.start[i + 1]; k++) {
        expected.push([net.chemical.index[k], Math.fround(net.chemical.weight[k]), net.chemical.reversal[k]]);
      }
      expect(synapses).toEqual(expected);
    }
  });

  it('never leaves a buffer empty, which WebGPU cannot bind', () => {
    const packed = packNetwork(network(2, [], []));
    expect(packed.gapWeight.length).toBeGreaterThan(0);
    expect(packed.chemical.length).toBeGreaterThan(1);
    expect(Array.from(packed.topology.subarray(0, 6))).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('holds the whole connectome in one workgroup', () => {
    expect(MAX_NEURONS).toBeGreaterThanOrEqual(302);
  });
});
