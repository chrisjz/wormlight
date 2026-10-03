// The commit a run of the harness or the calibration stands on.

import { execFileSync } from 'node:child_process';
import { ROOT } from '../data/sources.ts';

// The commit the trials run on, taken before they start. Prose can't change a result, so Markdown, the page
// the harness writes included, doesn't count as a change; untracked files do, since code may import them. Nor do
// checkpoint 6's nulls' records, which no code reads: each null's run writes its own, and the next must start at the
// same commit while they wait, uncommitted, for the grading (DECISIONS.md, 2026-10-03).
export const IGNORED = [':!*.md', ':!data/calibration/null-*.json'];
export function commit(): string {
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  const head = git('rev-parse', '--short', 'HEAD');
  const changes = git('status', '--porcelain', '--', '.', ...IGNORED);
  return changes === '' ? head : `${head}, with uncommitted changes`;
}
