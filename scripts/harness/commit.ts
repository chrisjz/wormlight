// The commit a run of the harness or the calibration stands on.

import { execFileSync } from 'node:child_process';
import { ROOT } from '../data/sources.ts';

// The commit the trials run on, taken before they start. Prose can't change a result, so Markdown, the page
// the harness writes included, doesn't count as a change; untracked files do, since code may import them.
export function commit(): string {
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  const head = git('rev-parse', '--short', 'HEAD');
  const changes = git('status', '--porcelain', '--', '.', ':!*.md');
  return changes === '' ? head : `${head}, with uncommitted changes`;
}
