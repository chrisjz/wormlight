import { describe, expect, it } from 'vitest';
import { CITATIONS, reference, type CitationId } from './citations.ts';
import { COMPONENTS, OMITTED, PRESENTATION, SUBSYSTEMS, subsystemLevels, type SubsystemId } from './fidelity.ts';
import { isFree, levelRange } from './levels.ts';
import { FREE_PARAMETER_BUDGET, PARAMS, freeParams, type Param } from './params.ts';
import { REFERENCE_DATA } from './validation.ts';

const params = Object.values(PARAMS) as Param[];

describe('citations', () => {
  it('are each used somewhere in the registry', () => {
    const used = new Set<CitationId>([
      ...COMPONENTS.flatMap((c) => c.sources),
      ...Object.values(SUBSYSTEMS).flatMap((s) => s.sources),
      ...params.flatMap((p) => p.sources),
      ...[...OMITTED, ...PRESENTATION].flatMap((item) => item.sources),
      ...REFERENCE_DATA.flatMap((r) => r.sources),
    ]);
    expect((Object.keys(CITATIONS) as CitationId[]).filter((id) => !used.has(id))).toEqual([]);
  });

  it('carry a well-formed DOI or a URL', () => {
    for (const [id, c] of Object.entries(CITATIONS) as [CitationId, (typeof CITATIONS)[CitationId]][]) {
      const doi: string | undefined = 'doi' in c ? c.doi : undefined;
      const url: string | undefined = 'url' in c ? c.url : undefined;
      expect(doi ?? url, id).toBeTruthy();
      if (doi) expect(doi, id).toMatch(/^10\.\d{4,}\/\S+$/);
    }
  });

  it('format as one-line references without doubled full stops', () => {
    expect(reference('cook2019')).toBe(
      'Cook SJ, Jarrell TA, Brittin CA, et al. Whole-animal connectomes of both Caenorhabditis elegans sexes. Nature 571:63–71 (2019), doi:10.1038/s41586-019-1352-7',
    );
    expect(reference('c302')).toMatch(/^OpenWorm\. c302:/);
  });
});

describe('parameters', () => {
  it('keep within the free-parameter budget: eight calibrated and six fixed in advance', () => {
    const free = freeParams();
    expect(free).toHaveLength(14);
    expect(free.length).toBeLessThanOrEqual(FREE_PARAMETER_BUDGET);
    expect(free.filter((id) => PARAMS[id].level === 1)).toHaveLength(8);
    expect(free.filter((id) => PARAMS[id].level === 0)).toHaveLength(6);
  });

  it('say how every free value is set', () => {
    for (const p of params.filter((q) => isFree(q.level))) {
      if (p.level === 1) {
        expect(p.value, p.name).toBeNull();
        expect(p.calibratedAgainst, p.name).toBeTruthy();
      } else {
        expect(p.value !== null || Boolean(p.rule), p.name).toBe(true);
      }
    }
  });

  it('cite a source for every value taken from the literature', () => {
    for (const p of params.filter((q) => !isFree(q.level))) {
      expect(p.value, p.name).not.toBeNull();
      expect(p.sources.length, p.name).toBeGreaterThan(0);
    }
  });
});

describe('the ledger', () => {
  it('gives every subsystem the level range PLAN.md and the spec describe', () => {
    const ranges = Object.fromEntries(
      (Object.keys(SUBSYSTEMS) as SubsystemId[])
        .filter((id) => !SUBSYSTEMS[id].tag)
        .map((id) => [id, levelRange(subsystemLevels(id))]),
    );
    expect(ranges).toEqual({
      anatomy: '5–4',
      signs: '5–0',
      strengths: '2–0',
      neurons: '3–1',
      rhythm: '3–0',
      sensing: '4–0',
      body: '3–0',
      environment: '3–0',
    });
  });

  it('lists each component under a real subsystem, levels highest first', () => {
    for (const c of COMPONENTS) {
      expect(SUBSYSTEMS[c.subsystem].tag, String(c.name)).toBeUndefined();
      if (typeof c.levels !== 'string') {
        expect(
          [...c.levels].sort((a, b) => b - a),
          String(c.name),
        ).toEqual([...c.levels]);
        expect(new Set(c.levels).size, String(c.name)).toBe(c.levels.length);
      }
    }
  });

  it('gives every untagged subsystem at least one component', () => {
    for (const id of Object.keys(SUBSYSTEMS) as SubsystemId[]) {
      expect(
        COMPONENTS.some((c) => c.subsystem === id),
        id,
      ).toBe(!SUBSYSTEMS[id].tag);
    }
  });
});
