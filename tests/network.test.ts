// The production network built from the runtime data (PLAN §3.1, §3.2).

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { countFacts } from '../src/science/facts.ts';
import { connections, cookNetwork, lesion } from '../src/sim/brain/network.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const facts = countFacts(data);
const network = cookNetwork(data);
const at = (name: string): number => network.names.indexOf(name);

// Every (pre, weight, reversal) onto a neuron.
function inputs(post: string): [string, number, number][] {
  const c = network.chemical;
  const i = at(post);
  return Array.from({ length: c.start[i + 1] - c.start[i] }, (_, k) => {
    const e = c.start[i] + k;
    return [network.names[c.index[e]], c.weight[e], c.reversal[e]];
  });
}

describe('cookNetwork', () => {
  it('keeps every signed chemical connection, autapses included, and gives unsigned ones no conductance', () => {
    expect(network.chemical.index.length).toBe(facts.chemical - facts.signs.none.count);
    const signed = data.chemical.filter((c) => c.sign !== 0);
    expect(signed.some((c) => c.pre === c.post)).toBe(true);
    for (const c of signed.filter((e) => e.pre === e.post)) {
      expect(inputs(c.post).map(([pre]) => pre)).toContain(c.pre);
    }
  });

  it('scales sections to nS with the Cook-to-Varshney factor and 100 pS per unit', () => {
    const c = data.chemical.find((e) => e.sign === -1);
    if (!c) throw new Error('no inhibitory connection');
    expect(inputs(c.post)).toContainEqual([c.pre, c.sections * 0.3444 * 0.1, -48]);
    const e = data.chemical.find((x) => x.sign === 1 && x.pre !== x.post);
    if (!e) throw new Error('no excitatory connection');
    expect(inputs(e.post)).toContainEqual([e.pre, e.sections * 0.3444 * 0.1, 0]);
  });

  it("puts each gap junction in both rows, ALA's ~27 nS among them", () => {
    expect(network.gap.index.length).toBe(2 * facts.gapPairs);
    const { start, weight } = network.gap;
    const ala = at('ALA');
    let total = 0;
    for (let k = start[ala]; k < start[ala + 1]; k++) total += weight[k];
    expect(total).toBeCloseTo(1314 * 0.2055 * 0.1, 9);
  });

  it('uses the registry constants in nF, nS, mV and s', () => {
    expect([network.capacitance, network.leak, network.leakPotential]).toEqual([0.001, 0.01, -35]);
    expect([network.rise, network.decay, network.slope]).toEqual([1, 5, 0.125]);
  });
});

describe('lesion', () => {
  it('removes every connection of the lesioned neurons and leaves the rest exactly as they were', () => {
    const gone = new Set([at('AVAL'), at('AVAR')]);
    const before = connections(network);
    const after = connections(lesion(network, ['AVAL', 'AVAR']));
    expect(after.gap).toEqual(before.gap.filter(([a, b]) => !gone.has(a) && !gone.has(b)));
    expect(after.chemical).toEqual(before.chemical.filter(([post, pre]) => !gone.has(post) && !gone.has(pre)));
    expect(after.gap.length).toBeLessThan(before.gap.length);
    expect(after.chemical.length).toBeLessThan(before.chemical.length);
  });
});
