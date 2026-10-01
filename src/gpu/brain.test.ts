import { describe, expect, it } from 'vitest';
import { chemicalRows, gapRows, gatedAt, type Network } from '../sim/brain/network.ts';
import { dispatches, MAX_RECTIFIED, MAX_STEPS_PER_DISPATCH, packNetwork } from './brain.ts';

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

// The shader's gated row and product, emulated on the packed layout at the given voltages, against the CPU's network
// gated at them: each neuron's gap conductance, and its gap junctions' current from x.
function expectShaderGates(net: Network, v: number[], x: number[]): void {
  const { topology, gapWeight, gapIndexAt, rectAt } = packNetwork(net);
  const expected = gatedAt(net, v).gap;
  for (let i = 0; i < net.names.length; i++) {
    const [count, fromHere] = [topology[rectAt + 2 * i], topology[rectAt + 2 * i + 1]];
    let [g, product, gates] = [0, 0, 0];
    for (let q = 0; q < count; q++) {
      const partner = v[topology[gapIndexAt + topology[i] + q]];
      if ((fromHere >>> q) & 1 ? v[i] > partner : partner > v[i]) {
        gates |= 1 << q;
        g += gapWeight[topology[i] + q];
      }
    }
    for (let e = topology[i] + count; e < topology[i + 1]; e++) g += gapWeight[e];
    for (let q = 0; q < count; q++) {
      if ((gates >>> q) & 1) product += gapWeight[topology[i] + q] * x[topology[gapIndexAt + topology[i] + q]];
    }
    for (let e = topology[i] + count; e < topology[i + 1]; e++) product += gapWeight[e] * x[topology[gapIndexAt + e]];
    let [cpuG, cpuProduct] = [0, 0];
    for (let k = expected.start[i]; k < expected.start[i + 1]; k++) {
      cpuG += expected.weight[k];
      cpuProduct += expected.weight[k] * x[expected.index[k]];
    }
    expect(g, `${net.names[i]}'s conductance`).toBeCloseTo(cpuG, 6);
    expect(product, `${net.names[i]}'s product`).toBeCloseTo(cpuProduct, 6);
  }
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

  it("put a row's rectified junctions first and describe them, leaving a network without any as it was", () => {
    const pairs: [number, number, number][] = [
      [0, 1, 0.5],
      [0, 2, 0.25],
      [1, 2, 0.125],
      [2, 3, 2],
    ];
    const plain = network(4, pairs, []);
    expect(packNetwork(plain).rectAt).toBe(0);
    // Neuron 2 is the from side of its junction with 0 and the to side of its junction with 3.
    const net = { ...plain, rectified: [[2, 0] as const, [3, 2] as const] };
    const { topology, gapWeight, gapIndexAt, rectAt } = packNetwork(net);
    expect(rectAt).toBe(topology.length - 8);
    const row = (i: number): number[][] => {
      const out = [];
      for (let e = topology[i]; e < topology[i + 1]; e++) out.push([topology[gapIndexAt + e], gapWeight[e]]);
      return out;
    };
    // Each row's rectified entries first, in the network's order, then the rest.
    expect(row(0)).toEqual([
      [2, 0.25],
      [1, 0.5],
    ]);
    expect(row(2)).toEqual([
      [0, 0.25],
      [3, 2],
      [1, 0.125],
    ]);
    expect(Array.from(topology.subarray(rectAt))).toEqual([1, 0, 0, 0, 2, 0b01, 1, 1]);
    // The shader's gated product, emulated on this layout, is the CPU's with each gate as the voltages set it.
    expectShaderGates(net, [-5, -9, -7, -6], [0.3, -1.2, 2.5, 0.7]);
  });

  it('gate as many as a u32 has bits, the last in bit 31, and refuse more', () => {
    const n = MAX_RECTIFIED + 2;
    const hub = network(
      n,
      Array.from({ length: n - 1 }, (_, k) => [0, k + 1, 1 + k / 8] as [number, number, number]),
      [],
    );
    // The hub is the from side of its first 32 junctions.
    const rectified = Array.from({ length: MAX_RECTIFIED }, (_, k) => [0, k + 1] as const);
    const packed = packNetwork({ ...hub, rectified });
    expect(Array.from(packed.topology.subarray(packed.rectAt, packed.rectAt + 2))).toEqual([32, 0xffffffff]);
    // Every partner but the last below the hub, so all but the junction in bit 31 conduct; then all of them.
    const below = Array.from({ length: n }, (_, i) => (i === 0 ? -5 : i === MAX_RECTIFIED ? -4 : -6));
    const x = Array.from({ length: n }, (_, i) => Math.sin(i + 1));
    expectShaderGates({ ...hub, rectified }, below, x);
    expectShaderGates(
      { ...hub, rectified },
      below.map((v, i) => (i === MAX_RECTIFIED ? -6 : v)),
      x,
    );
    const toMany = Array.from({ length: n - 1 }, (_, k) => [k + 1, 0] as const);
    expect(() => packNetwork({ ...hub, rectified: toMany })).toThrow(/at most 32/);
  });

  it('never leaves a buffer empty, which WebGPU cannot bind', () => {
    const packed = packNetwork(network(2, [], []));
    expect(packed.gapWeight.length).toBeGreaterThan(0);
    expect(packed.chemical.length).toBeGreaterThan(1);
    expect(Array.from(packed.topology.subarray(0, 6))).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe("the GPU brain's dispatches", () => {
  it('split a long run so none is longer than the most a dispatch takes', () => {
    expect(dispatches(0)).toEqual([]);
    expect(dispatches(67)).toEqual([67]);
    expect(dispatches(2 * MAX_STEPS_PER_DISPATCH + 5)).toEqual([MAX_STEPS_PER_DISPATCH, MAX_STEPS_PER_DISPATCH, 5]);
  });

  it('refuse a step count that is not a whole number of steps', () => {
    for (const bad of [-1, 2.7, NaN, Infinity]) expect(() => dispatches(bad)).toThrow(/whole number/);
  });
});
