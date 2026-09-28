// VALIDATION.md's section for §7.2's comparison against the committed results it is generated from
// (scripts/harness/equivalence.ts), so that neither can change without the other.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatMarkdown } from '../scripts/data/render.ts';
import { ROOT } from '../scripts/data/sources.ts';
import { equivalenceSection, replaceSection, type EquivalenceRun } from '../scripts/harness/report.ts';

describe("VALIDATION.md's comparison section", () => {
  it('is the one the committed results give, the refit first', async () => {
    const path = join(ROOT, 'VALIDATION.md');
    const page = readFileSync(path, 'utf8');
    const runs = ['refit', 'planned']
      .map((fit) => join(ROOT, 'data', 'equivalence', `${fit}.json`))
      .filter((file) => existsSync(file))
      .map((file) => JSON.parse(readFileSync(file, 'utf8')) as EquivalenceRun);
    expect(runs.map((r) => r.fit)).toEqual(['refit', 'planned']);
    expect(await formatMarkdown(replaceSection(page, 'equivalence', equivalenceSection(runs)), path)).toBe(page);
  });
});
