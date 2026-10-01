// Checkpoint 1's frequency band (PLAN §7.4, changed after results 2026-10-01, DECISIONS.md) comes from the pinned
// postures alone: the data build reports the 5th percentile of real worms' mid-body κL about its mean, and
// `data:check` keeps that report current.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../scripts/data/sources.ts';
import { FREQUENCY_BAND } from '../src/validation/motion.ts';

describe("checkpoint 1's frequency band", () => {
  it('is the 5th percentile the data build reports, to two significant figures', () => {
    const report = readFileSync(join(ROOT, 'data/reports/data-build.md'), 'utf8');
    const found = /departure from that mean has a 5th percentile of ([0-9]+\.[0-9]+)/.exec(report);
    if (!found) throw new Error("the data build's report gives no band for the mid-body");
    expect(Number(Number(found[1]).toPrecision(2))).toBe(FREQUENCY_BAND);
  });
});
