// VALIDATION.md's section for §7.2's comparison against the committed results it is generated from
// (scripts/harness/equivalence.ts), so that neither can change without the other.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatMarkdown } from '../scripts/data/render.ts';
import { ROOT } from '../scripts/data/sources.ts';
import { recorded, resultNames } from '../scripts/harness/equivalence.ts';
import { equivalenceSection, replaceSection, type EquivalenceRun } from '../scripts/harness/report.ts';

describe("VALIDATION.md's comparison section", () => {
  it("is the one the committed results give, in the runner's order", async () => {
    const path = join(ROOT, 'VALIDATION.md');
    const page = readFileSync(path, 'utf8');
    // The runner's order, R's fits first, then round 3's picks and track S's; the refit and the planned fit have run.
    const fits = resultNames();
    expect(fits).toEqual(expect.arrayContaining(['refit', 'planned']));
    const runs = fits.map(
      (fit) => JSON.parse(readFileSync(join(ROOT, 'data', 'equivalence', `${fit}.json`), 'utf8')) as EquivalenceRun,
    );
    expect(await formatMarkdown(replaceSection(page, 'equivalence', equivalenceSection(runs)), path)).toBe(page);
  });
});

describe("the comparison's committed records", () => {
  // A full run refuses while its record exists, since those were made under the plain count of crossings
  // (DECISIONS.md, 2026-10-01).
  it('counts every committed record as recorded, and a fit without one as not', () => {
    for (const name of ['refit', 'round-2', 'planned', 'round-3-pick-1', 'round-3-pick-4']) {
      expect(recorded(name), name).toBe(true);
    }
    expect(recorded('track-s-pick-1')).toBe(existsSync(join(ROOT, 'data/equivalence/track-s-pick-1.json')));
  });
});
