// VALIDATION.md's section for §7.2's comparison against the committed results it is generated from
// (scripts/harness/equivalence.ts), so that neither can change without the other.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatMarkdown } from '../scripts/data/render.ts';
import { ROOT } from '../scripts/data/sources.ts';
import { equivalenceSection, replaceSection, type EquivalenceRun } from '../scripts/harness/report.ts';

describe("VALIDATION.md's comparison section", () => {
  it("is the one the committed results give, in the runner's order", async () => {
    const path = join(ROOT, 'VALIDATION.md');
    const page = readFileSync(path, 'utf8');
    // The runner's order, R's fits first; the refit and the planned fit have both run.
    const fits = ['refit', 'round-2', 'planned'].filter((fit) =>
      existsSync(join(ROOT, 'data', 'equivalence', `${fit}.json`)),
    );
    expect(fits).toEqual(expect.arrayContaining(['refit', 'planned']));
    const runs = fits.map(
      (fit) => JSON.parse(readFileSync(join(ROOT, 'data', 'equivalence', `${fit}.json`), 'utf8')) as EquivalenceRun,
    );
    expect(await formatMarkdown(replaceSection(page, 'equivalence', equivalenceSection(runs)), path)).toBe(page);
  });
});
