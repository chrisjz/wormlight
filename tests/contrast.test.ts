// The contrast brain (spec §4, PLAN §3.5): the primary null's degree-preserving rewirings of the chemical synapses.

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Chemical } from '../src/data/schema.ts';
import { validateWormlightData } from '../src/data/schema.ts';
import { CONTRAST, contrastData, rewire } from '../src/sim/brain/rewire.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const rewirings = Array.from({ length: CONTRAST.rewirings }, (_, i) => i + 1);

// How many connections each neuron sends and receives, of every connection or of those `which` picks.
function degrees(
  chemical: readonly Chemical[],
  which: (c: Chemical) => boolean = () => true,
): Map<string, [number, number]> {
  const count = new Map<string, [number, number]>();
  for (const c of chemical.filter(which)) {
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
  const { chemical, signed, unsigned } = rewire(data.chemical, k);

  it('makes every swap it wants, ten per connection that is not an autapse, signed and unsigned apart', () => {
    const edges = (s: boolean): number => data.chemical.filter((c) => c.pre !== c.post && (c.sign !== 0) === s).length;
    expect([signed.edges, unsigned.edges]).toEqual([edges(true), edges(false)]);
    expect(unsigned.edges).toBeGreaterThan(0);
    for (const set of [signed, unsigned]) {
      expect(set.wanted).toBe(10 * set.edges);
      expect(set.swaps).toBe(set.wanted);
    }
  });

  it("keeps every neuron's numbers of inputs and outputs, and of signed ones", () => {
    expect(degrees(chemical)).toEqual(degrees(data.chemical));
    const isSigned = (c: Chemical): boolean => c.sign !== 0;
    expect(degrees(chemical, isSigned)).toEqual(degrees(data.chemical, isSigned));
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
  const posts = (k: number): string[] => rewire(data.chemical, k).chemical.map((c) => c.post);

  it('draws the same rewiring each time, and another for each number', () => {
    expect(posts(3)).toEqual(posts(3));
    const all = rewirings.map((k) => posts(k).join());
    expect(new Set(all).size).toBe(CONTRAST.rewirings);
  });

  // A link's ?brain=rewired-k shows rewiring k, so a change to the draws, or to the runtime data's list of chemical
  // connections, which the rewirings follow, must not pass unnoticed: it changes what every such link shows.
  it('draws the rewirings it drew when they were fixed', () => {
    const print = (k: number): string => createHash('sha256').update(posts(k).join(',')).digest('hex').slice(0, 16);
    expect(rewirings.map(print)).toEqual([
      '6d82b65baa02b37d',
      'bfae540be24acbcb',
      'f5997b72fa093799',
      'f567df8d5da38453',
      'e5c23c603b5c867a',
      '095b03cbe6de935c',
      'fc573a131f628b8c',
      '32942c8acb44a2cd',
      'dcb057a8dd36209d',
      'cc3c6f94fc187580',
    ]);
  });

  it('gives up after its attempts run out, leaving the connections where they were', () => {
    const one: Chemical[] = [
      { pre: 'A', post: 'B', sections: 2, sign: 1, signSource: 'rule' },
      { pre: 'A', post: 'A', sections: 1, sign: -1, signSource: 'rule' },
    ];
    const r = rewire(one, 1);
    expect([r.signed.wanted, r.signed.swaps, r.signed.attempts]).toEqual([10, 0, 1000]);
    expect([r.unsigned.wanted, r.unsigned.swaps, r.unsigned.attempts]).toEqual([0, 0, 0]);
    expect(r.chemical.map((c) => c.post)).toEqual(['B', 'A']);
  });

  it('never swaps a signed connection with an unsigned one', () => {
    // Two connections, one of each kind, that would swap if they could: no swap is made.
    const two: Chemical[] = [
      { pre: 'A', post: 'B', sections: 2, sign: 1, signSource: 'rule' },
      { pre: 'C', post: 'D', sections: 1, sign: 0, signSource: 'none' },
    ];
    const r = rewire(two, 1);
    expect([r.signed.swaps, r.unsigned.swaps]).toEqual([0, 0]);
    expect(r.chemical.map((c) => c.post)).toEqual(['B', 'D']);
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

  it('refuses a rewiring that falls short of its swaps', () => {
    const stuck = {
      ...data,
      chemical: [{ pre: 'AVAL', post: 'AVAR', sections: 2, sign: 1, signSource: 'rule' } as const],
    };
    expect(() => contrastData(stuck, 1)).toThrow(/made 0 of its 10 signed swaps/);
  });
});
