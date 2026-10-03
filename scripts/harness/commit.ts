// The commit a run of the harness or the calibration stands on.

import { execFileSync } from 'node:child_process';
import { ROOT } from '../data/sources.ts';

// The commit the trials run on, taken before they start. Prose can't change a result, so Markdown, the page
// the harness writes included, doesn't count as a change; untracked files do, since code may import them. Nor do
// checkpoint 6's records, its nulls' tuning records and their graded summaries: each run writes its own, and the next
// must start at the same commit while they wait, uncommitted, for the verdict (DECISIONS.md, 2026-10-03). Only the
// grading reads a tuning record, and each summary names the record's own commit and hash.
export const IGNORED = [':!*.md', ':!data/calibration/null-*.json', ':!data/checkpoint-6/null-*.json'];
export function commit(): string {
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  const head = git('rev-parse', '--short', 'HEAD');
  const changes = git('status', '--porcelain', '--', '.', ...IGNORED);
  return changes === '' ? head : `${head}, with uncommitted changes`;
}
