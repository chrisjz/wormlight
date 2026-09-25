import { describe, expect, it } from 'vitest';
import { CITATIONS } from './citations.ts';
import { COMPONENTS } from './fidelity.ts';
import { SCALE } from './levels.ts';
import {
  chemicalProvenance,
  GAP_PROVENANCE,
  MUSCLE_SIGN_LEVELS,
  muscleProvenance,
  SIGN_LEVELS,
  type Provenance,
} from './provenance.ts';

const ledger = (name: string): readonly number[] => {
  const component = COMPONENTS.find((c) => c.name === name);
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
  it('gives each source the level the ledger gives it', () => {
    expect([...new Set(Object.values(SIGN_LEVELS))].sort()).toEqual([...ledger('Chemical synapse signs')].sort());
    expect([...new Set(Object.values(MUSCLE_SIGN_LEVELS))].sort()).toEqual([...ledger('Neuromuscular signs')].sort());
  });

  it("opens each explanation with its level's name on the scale", () => {
    for (const p of all) {
      const step = SCALE.find((s) => s.level === p.level);
      expect(p.detail.startsWith(`${step?.name}:`), p.detail).toBe(true);
    }
  });

  it('cites only works in the registry, and a physiology sign its own paper', () => {
    for (const p of all) if (p.cite) expect(CITATIONS[p.cite], p.label).toBeDefined();
    const physiology = chemicalProvenance({ signSource: 'physiology', citation: 'chalasani2007' });
    expect(physiology.cite).toBe('chalasani2007');
    expect(physiology.detail).toContain(CITATIONS.chalasani2007.short);
  });
});
