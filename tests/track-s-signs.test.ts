// Track S's measured signs (PLAN §9; DECISIONS.md, 2026-10-01): the side file the data build checks, the module it
// generates, and the copy of the data that only track S's model reads.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOverrides, signChemical } from '../scripts/data/signs.ts';
import { ROOT } from '../scripts/data/sources.ts';
import { TRACK_S_SIGNS, TRACK_S_SOURCE } from '../src/data/trackSSigns.ts';
import { validateWormlightData } from '../src/data/schema.ts';
import { PARAMS } from '../src/science/params.ts';
import { withMeasuredSigns } from '../src/sim/trackS.ts';
import { currentParams, World } from '../src/sim/world.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const sideText = readFileSync(join(ROOT, 'data/sign-overrides-s.csv'), 'utf8');
const side = parseOverrides(sideText);
const key = (pre: string, post: string): string => `${pre}→${post}`;

describe("track S's side file and its module", () => {
  it('carries the side file whole, with its digest', () => {
    expect(TRACK_S_SOURCE.sha256).toBe(createHash('sha256').update(sideText).digest('hex'));
    expect(TRACK_S_SIGNS.map((r) => [r.pre, r.post, r.sign, r.citation])).toEqual(
      side.map((o) => [o.pre, o.post, o.sign, o.citation]),
    );
  });

  it('quotes its source in every row, and names no edge the main overrides do', () => {
    const main = new Set(
      parseOverrides(readFileSync(join(ROOT, 'data/sign-overrides.csv'), 'utf8')).map((o) => key(o.pre, o.post)),
    );
    for (const o of side) {
      expect(o.evidence, key(o.pre, o.post)).toMatch(/"[^"]+"/);
      expect(main.has(key(o.pre, o.post)), key(o.pre, o.post)).toBe(false);
    }
  });

  it('flips 27 connections to inhibitory and confirms 17', () => {
    const now = new Map(data.chemical.map((c) => [key(c.pre, c.post), c.sign]));
    const flips = TRACK_S_SIGNS.filter((r) => now.get(key(r.pre, r.post)) !== r.sign);
    expect(flips).toHaveLength(27);
    expect(flips.every((r) => r.sign === -1)).toBe(true);
    expect(TRACK_S_SIGNS.length - flips.length).toBe(17);
  });
});

describe("track S's data", () => {
  const measured = withMeasuredSigns(data);
  const at = (d: typeof data, pre: string, post: string) =>
    d.chemical.find((c) => c.pre === pre && c.post === post) ?? null;

  it('signs its rows as cited physiology, and leaves every other connection and the runtime data as they were', () => {
    expect(at(measured, 'AVAL', 'AVBL')).toMatchObject({ sign: -1, signSource: 'physiology', citation: 'roberts2016' });
    expect(at(data, 'AVAL', 'AVBL')).toMatchObject({ sign: 1, signSource: 'rule' });
    expect(at(measured, 'PVPL', 'AVBL')).toMatchObject({ sign: 1, signSource: 'physiology', citation: 'zhang2025' });
    const rows = new Set(TRACK_S_SIGNS.map((r) => key(r.pre, r.post)));
    const others = (d: typeof data) => d.chemical.filter((c) => !rows.has(key(c.pre, c.post)));
    expect(others(measured)).toEqual(others(data));
    expect(measured.meta.citations.roberts2016).toBeDefined();
    expect(data.meta.citations).not.toHaveProperty('roberts2016');
    expect(validateWormlightData(measured).chemical).toHaveLength(data.chemical.length);
  });

  it("reaches track S's brain alone: AVA's synapse onto AVB inhibits there and excites in the refit's", () => {
    const reversal = (world: World, pre: string, post: string): number => {
      const { names, chemical } = world.brain.network;
      const [i, j] = [names.indexOf(post), names.indexOf(pre)];
      for (let k = chemical.start[i]; k < chemical.start[i + 1]; k++)
        if (chemical.index[k] === j) return chemical.reversal[k];
      throw new Error(`no synapse ${pre} → ${post}`);
    };
    const refit = new World(data, currentParams());
    const trackS = new World(data, { ...currentParams(), measuredSigns: true });
    expect(reversal(refit, 'AVAL', 'AVBL')).toBe(PARAMS.reversalExcitatory.value);
    expect(reversal(trackS, 'AVAL', 'AVBL')).toBe(PARAMS.reversalInhibitory.value);
    expect(reversal(trackS, 'AWCL', 'AIYL')).toBe(reversal(refit, 'AWCL', 'AIYL'));
  });
});

describe("track S's guards", () => {
  it('refuses a network beside the switch, since the World could not see which signs built it', () => {
    const network = new World(data, currentParams()).brain.network;
    expect(() => new World(data, { ...currentParams(), measuredSigns: true }, { network })).toThrow(/takes no network/);
  });

  it('builds one copy of the data for every world that reads it', () => {
    expect(withMeasuredSigns(data)).toBe(withMeasuredSigns(data));
  });

  it('names the edge an override lists twice across the two files, and the file a bad row is in', () => {
    const row = side[0];
    const edges = data.chemical.map((c) => ({ pre: c.pre, post: c.post, sections: c.sections }));
    const inputs = { identities: new Map(), ruleSign: new Map(), fenyves: [] };
    expect(() => signChemical(edges, { ...inputs, overrides: [row, row] })).toThrow(
      new RegExp(`list ${row.pre}.*${row.post} twice`),
    );
    const bad = 'pre,post,sign,citation,evidence\nAVAL,AVBL,+1,roberts2016,"x"\n';
    expect(() => parseOverrides(bad, 'data/sign-overrides-s.csv')).toThrow(/sign-overrides-s\.csv row 2/);
  });
});
