// Track S's measured signs (PLAN §2.4, §9; DECISIONS.md, 2026-10-01 and 2026-10-02): every chemical sign for which a
// response was recorded in the postsynaptic cell to a manipulation targeted at the presynaptic cell. They waited in a
// side file that only track S's model read until its fit was chosen, and moved into the main overrides file then, so
// the runtime data and every brain built from it carry them.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOverrides, signChemical } from '../scripts/data/signs.ts';
import { ROOT } from '../scripts/data/sources.ts';
import { validateWormlightData } from '../src/data/schema.ts';
import { PARAMS } from '../src/science/params.ts';
import { currentParams, World } from '../src/sim/world.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const rows = parseOverrides(readFileSync(join(ROOT, 'data/sign-overrides.csv'), 'utf8'));
const key = (pre: string, post: string): string => `${pre}→${post}`;
// Track S's sources, which no earlier override cites.
const S_SOURCES = new Set(['roberts2016', 'zhang2025', 'piggott2011', 'wang2020', 'huo2024', 'li2014', 'lin2024']);
const trackS = rows.filter((o) => S_SOURCES.has(o.citation));

describe("track S's signs in the main overrides file", () => {
  it('are 44 of its 51 rows, 29 inhibitory and 15 excitatory, each quoting its source', () => {
    expect(rows).toHaveLength(51);
    expect(trackS).toHaveLength(44);
    expect(trackS.filter((o) => o.sign === -1)).toHaveLength(29);
    for (const o of rows) expect(o.evidence, key(o.pre, o.post)).toMatch(/"[^"]+"/);
  });

  it('sign their connections in the runtime data as cited physiology, and cite their sources there', () => {
    const at = new Map(data.chemical.map((c) => [key(c.pre, c.post), c]));
    for (const o of trackS) {
      expect(at.get(key(o.pre, o.post)), key(o.pre, o.post)).toMatchObject({
        sign: o.sign,
        signSource: 'physiology',
        citation: o.citation,
      });
    }
    for (const id of S_SOURCES) expect(data.meta.citations, id).toHaveProperty(id);
  });

  it("reach the app's brain: AVA's synapse onto AVB inhibits there", () => {
    const { names, chemical } = new World(data, currentParams()).brain.network;
    const [i, j] = [names.indexOf('AVBL'), names.indexOf('AVAL')];
    let reversal: number | null = null;
    for (let k = chemical.start[i]; k < chemical.start[i + 1]; k++)
      if (chemical.index[k] === j) reversal = chemical.reversal[k];
    expect(reversal).toBe(PARAMS.reversalInhibitory.value);
  });

  it('name the edge an override lists twice, and the file a bad row is in', () => {
    const row = trackS[0];
    const edges = data.chemical.map((c) => ({ pre: c.pre, post: c.post, sections: c.sections }));
    const inputs = { identities: new Map(), ruleSign: new Map(), fenyves: [] };
    expect(() => signChemical(edges, { ...inputs, overrides: [row, row] })).toThrow(
      new RegExp(`list ${row.pre}.*${row.post} twice`),
    );
    const bad = 'pre,post,sign,citation,evidence\nAVAL,AVBL,+1,roberts2016,"x"\n';
    expect(() => parseOverrides(bad)).toThrow(/sign-overrides\.csv row 2/);
  });
});
