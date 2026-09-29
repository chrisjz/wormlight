// The contrast brain (spec §4, PLAN §3.5): the primary null's degree-preserving rewirings of the chemical synapses.

import { describe, expect, it } from 'vitest';
import type { Chemical } from '../src/data/schema.ts';
import { validateWormlightData } from '../src/data/schema.ts';
import { CONTRAST, contrastData, rewire } from '../src/sim/brain/rewire.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const rewirings = Array.from({ length: CONTRAST.rewirings }, (_, i) => i + 1);

// How many connections each neuron sends and receives.
function degrees(chemical: readonly Chemical[]): Map<string, [number, number]> {
  const count = new Map<string, [number, number]>();
  for (const c of chemical) {
    const out = count.get(c.pre) ?? [0, 0];
    out[0]++;
    count.set(c.pre, out);
    const into = count.get(c.post) ?? [0, 0];
    into[1]++;
    count.set(c.post, into);
  }
  return count;
}

// Each neuron's outgoing connections as (sections, sign, source) triples, sorted.
function outputs(chemical: readonly Chemical[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const c of chemical) out.set(c.pre, [...(out.get(c.pre) ?? []), `${c.sections}/${c.sign}/${c.signSource}`]);
  for (const list of out.values()) list.sort();
  return out;
}

describe.each(rewirings)('rewiring %i', (k) => {
  const { chemical, wanted, swaps } = rewire(data.chemical, k);

  it('makes every swap it wants, ten per connection that is not an autapse', () => {
    const edges = data.chemical.filter((c) => c.pre !== c.post).length;
    expect(wanted).toBe(10 * edges);
    expect(swaps).toBe(wanted);
  });

  it("keeps every neuron's number of inputs and outputs", () => {
    expect(degrees(chemical)).toEqual(degrees(data.chemical));
  });

  it("keeps every connection's presynaptic neuron, sections and sign, so each neuron's outputs are its own", () => {
    expect(
      chemical.map(({ pre, sections, sign, signSource, citation }) => ({ pre, sections, sign, signSource, citation })),
    ).toEqual(
      data.chemical.map(({ pre, sections, sign, signSource, citation }) => ({
        pre,
        sections,
        sign,
        signSource,
        citation,
      })),
    );
    expect(outputs(chemical)).toEqual(outputs(data.chemical));
    expect(chemical.map((c) => c.original)).toEqual(data.chemical.map((c) => c.post));
  });

  it('leaves the autapses in place and makes no new self-loop or repeated connection', () => {
    const autapses = data.chemical.flatMap((c, i) => (c.pre === c.post ? [i] : []));
    expect(autapses.length).toBeGreaterThan(0);
    expect(chemical.flatMap((c, i) => (c.pre === c.post ? [i] : []))).toEqual(autapses);
    expect(new Set(chemical.map((c) => `${c.pre}>${c.post}`)).size).toBe(chemical.length);
  });

  it('moves nearly every other connection', () => {
    const moved = chemical.filter((c) => c.pre !== c.post && c.post !== c.original).length;
    expect(moved / chemical.filter((c) => c.pre !== c.post).length).toBeGreaterThan(0.95);
  });
});

describe('rewire', () => {
  it('draws the same rewiring each time, and another for each number', () => {
    const posts = (k: number): string[] => rewire(data.chemical, k).chemical.map((c) => c.post);
    expect(posts(3)).toEqual(posts(3));
    const all = rewirings.map((k) => posts(k).join());
    expect(new Set(all).size).toBe(CONTRAST.rewirings);
  });

  it('gives up after its attempts run out, leaving the connections where they were', () => {
    const one: Chemical[] = [
      { pre: 'A', post: 'B', sections: 2, sign: 1, signSource: 'rule' },
      { pre: 'A', post: 'A', sections: 1, sign: -1, signSource: 'rule' },
    ];
    const r = rewire(one, 1);
    expect([r.wanted, r.swaps, r.attempts]).toEqual([10, 0, 1000]);
    expect(r.chemical.map((c) => c.post)).toEqual(['B', 'A']);
  });

  it('refuses a rewiring that is not a whole number from 1, and a repeated connection', () => {
    for (const k of [0, -1, 1.5, NaN]) expect(() => rewire(data.chemical, k)).toThrow(/whole number/);
    const twice = [data.chemical[0], data.chemical[0]];
    expect(() => rewire(twice, 1)).toThrow(/repeated/);
  });
});

describe('contrastData', () => {
  it('changes only the chemical synapses', () => {
    const contrast = contrastData(data, 1);
    expect(contrast.neurons).toBe(data.neurons);
    expect(contrast.gap).toBe(data.gap);
    expect(contrast.neuromuscular).toBe(data.neuromuscular);
    expect(contrast.muscles).toBe(data.muscles);
    expect(contrast.chemical).toEqual(rewire(data.chemical, 1).chemical);
    expect(() => validateWormlightData(JSON.parse(JSON.stringify(contrast)))).not.toThrow();
  });

  it('has ten rewirings and no more', () => {
    expect(() => contrastData(data, CONTRAST.rewirings + 1)).toThrow(/10 rewirings/);
  });
});
