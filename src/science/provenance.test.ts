import { describe, expect, it } from 'vitest';
import { CITATIONS } from './citations.ts';
import type { Facts } from './facts.ts';
import { COMPONENTS, render } from './fidelity.ts';
import { SCALE } from './levels.ts';
import {
  chemicalProvenance,
  GAP_PROVENANCE,
  MUSCLE_SIGN_LEVELS,
  muscleProvenance,
  SIGN_LEVELS,
  type Provenance,
} from './provenance.ts';

// Component names that quote the data need figures to render; only their words matter here.
const facts = { neurons: 0, chemical: 0, gapPairs: 0, muscles: 0 } as unknown as Facts;
const ledger = (name: string): readonly number[] => {
  const component = COMPONENTS.find((c) => render(c.name, facts).startsWith(name));
  if (!component || typeof component.levels === 'string') throw new Error(`no component ${name}`);
  return component.levels;
};

const all: Provenance[] = [
  chemicalProvenance({ signSource: 'physiology', citation: 'chalasani2007' }),
  chemicalProvenance({ signSource: 'expression' }),
  chemicalProvenance({ signSource: 'rule' }),
  chemicalProvenance({ signSource: 'none' }),
  muscleProvenance({ signSource: 'receptor' }),
  muscleProvenance({ signSource: 'none' }),
  GAP_PROVENANCE,
];

describe('sign provenance', () => {
  it("gives each source PLAN §2.4's level, all of them levels the ledger's components list", () => {
    expect(SIGN_LEVELS).toEqual({ physiology: 5, expression: 4, rule: 0, none: 0 });
    expect(MUSCLE_SIGN_LEVELS).toEqual({ receptor: 4, none: 0 });
    expect([...new Set(Object.values(SIGN_LEVELS))].sort()).toEqual([...ledger('Chemical synapse signs')].sort());
    expect([...new Set(Object.values(MUSCLE_SIGN_LEVELS))].sort()).toEqual([...ledger('Neuromuscular signs')].sort());
    expect(ledger('Gap junctions')).toEqual([GAP_PROVENANCE.level]);
  });

  it("opens each explanation with its level's name on the scale", () => {
    for (const p of all) {
      const step = SCALE.find((s) => s.level === p.level);
      expect(p.detail.startsWith(`${step?.name}:`), p.detail).toBe(true);
    }
  });

  it('labels every source differently, so a badge names one source', () => {
    expect(new Set(all.map((p) => p.label)).size).toBe(all.length);
    expect(new Set(all.map((p) => p.detail)).size).toBe(all.length);
  });

  it('cites only works in the registry, and a physiology sign its own paper', () => {
    for (const p of all) if (p.cite) expect(CITATIONS[p.cite], p.label).toBeDefined();
    const physiology = chemicalProvenance({ signSource: 'physiology', citation: 'chalasani2007' });
    expect(physiology.cite).toBe('chalasani2007');
    expect(physiology.detail).toContain(CITATIONS.chalasani2007.short);
    expect(chemicalProvenance({ signSource: 'physiology', citation: 'unknown' }).cite).toBeNull();
  });
});
