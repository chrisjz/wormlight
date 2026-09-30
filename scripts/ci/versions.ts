// The model versions' history (PLAN §1) only grows: every entry main has pinned is still pinned, unchanged and in the
// same place, so a fingerprint that moved gets an entry of its own rather than an edit. CI's checks job runs it
// after fetching main; locally, `git fetch origin main` first.
//
//   npm run versions:check [-- <ref>]    compares with origin/main, or with <ref>

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../data/sources.ts';

// One entry: a model version, the data version it was pinned on, and its fingerprint's prints.
export interface Pinned {
  model: number;
  data: string;
  prints: string[];
}

export const HISTORY = 'tests/model-versions.json';

// What is wrong with `now` as `before` grown, or null if nothing is.
export function historyProblem(before: readonly Pinned[], now: readonly Pinned[]): string | null {
  for (const [k, was] of before.entries()) {
    const is = now.at(k);
    if (!is) return `entry ${k + 1} (model ${was.model}, data ${was.data}) was removed`;
    if (JSON.stringify(is) !== JSON.stringify(was))
      return `entry ${k + 1} (model ${was.model}, data ${was.data}) changed`;
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ref = process.argv[2] ?? 'origin/main';
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
  } catch {
    console.error(`${ref} isn't here to compare with: fetch it first (git fetch origin main).`);
    process.exit(1);
  }
  let before: Pinned[] = [];
  try {
    before = JSON.parse(git('show', `${ref}:${HISTORY}`)) as Pinned[];
  } catch {
    console.log(`${ref} has no ${HISTORY} yet, so there is nothing it pinned to keep.`);
  }
  const now = JSON.parse(readFileSync(join(ROOT, HISTORY), 'utf8')) as Pinned[];
  const problem = historyProblem(before, now);
  if (problem) {
    console.error(`${HISTORY}: ${problem} since ${ref}. Pinned entries are never changed; add one instead (PLAN §1).`);
    process.exit(1);
  }
  console.log(`${HISTORY} keeps ${ref}'s ${before.length} entries and adds ${now.length - before.length}.`);
}
