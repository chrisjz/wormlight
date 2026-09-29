// Which of CI's jobs a change needs (.github/workflows/ci.yml). The checks job runs on every change; the others
// run only when a file they read changed, so a change to the docs alone skips the GPU's nine minutes. Each job's
// files are listed by prefix, and changes.test.ts checks that everything its entry points import is listed. A
// change to the workflow, these rules or the dependencies runs every job, and so does a run whose changed files
// can't be found.
//
//   node scripts/ci/changes.ts        in CI: writes site, data, visual and gpu to $GITHUB_OUTPUT

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// `site` is the built app, which the deploy job publishes.
export type Job = 'site' | 'data' | 'visual' | 'gpu';
export const JOBS: readonly Job[] = ['site', 'data', 'visual', 'gpu'];

// A prefix ending in / names a folder; any other names one file.
const EVERY = ['.github/', 'scripts/ci/', 'package.json', 'package-lock.json', '.gitattributes'];
const SITE = ['index.html', 'vite.config.ts', 'tsconfig.json', 'public/', 'src/'];
const BROWSER = ['scripts/browser.ts', 'scripts/data/sources.ts'];

const FILES: Record<Job, { read: readonly string[]; not?: readonly string[] }> = {
  // The trials' code, which no page imports.
  site: { read: SITE, not: ['src/validation/'] },
  visual: { read: [...SITE, ...BROWSER, 'scripts/visual/', 'tests/visual/'], not: ['src/validation/'] },
  // The parity page and the modules it imports, the runtime data it fetches, and its runner.
  gpu: {
    read: [
      'parity.html',
      'vite.config.ts',
      'tsconfig.json',
      'public/data/',
      'src/data/',
      'src/gpu/',
      'src/science/',
      'src/sim/',
      'src/style.css',
      ...BROWSER,
      'scripts/safari.ts',
      'scripts/gpu/',
    ],
  },
  // The data build, its pinned inputs and its outputs, which it formats with Prettier.
  data: {
    read: [
      'scripts/data/',
      'src/data/',
      'src/science/',
      'src/validation/posture.ts',
      'data/',
      'public/data/',
      'DATA_SOURCES.md',
      '.prettierrc.json',
      '.prettierignore',
    ],
    not: ['data/calibration/', 'data/equivalence/'],
  },
};

const under = (file: string, prefixes: readonly string[]): boolean =>
  prefixes.some((p) => (p.endsWith('/') ? file.startsWith(p) : file === p));

// The jobs a change to one file needs, beyond checks. Unit tests are the checks job's alone.
export function needs(file: string): Job[] {
  if (under(file, EVERY)) return [...JOBS];
  if (file.endsWith('.test.ts')) return [];
  return JOBS.filter((job) => under(file, FILES[job].read) && !under(file, FILES[job].not ?? []));
}

export function jobsFor(files: readonly string[]): Record<Job, boolean> {
  const needed = new Set(files.flatMap(needs));
  return Object.fromEntries(JOBS.map((job) => [job, needed.has(job)])) as Record<Job, boolean>;
}

// The files a run's change touches, renamed files under both names: a pull request's against its base, through
// the merge commit the checkout holds, and a push's against the commit before it. Null when they can't be found,
// as for a new branch's first push.
export function changedFiles(event: string, before: string | undefined): string[] | null {
  const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' });
  const diff = (from: string): string[] =>
    git('diff', '--name-only', '--no-renames', from, 'HEAD')
      .split('\n')
      .filter((line) => line !== '');
  try {
    if (event === 'pull_request') return diff('HEAD^1');
    if (event === 'push' && before && !/^0+$/.test(before)) {
      git('fetch', '--no-tags', '--depth=1', 'origin', before);
      return diff(before);
    }
  } catch {
    return null;
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = changedFiles(process.env.GITHUB_EVENT_NAME ?? '', process.env.BEFORE);
  const jobs = jobsFor(files ?? EVERY);
  const output = JOBS.map((job) => `${job}=${jobs[job]}\n`).join('');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  console.log(
    files === null
      ? "The changed files couldn't be found, so every job runs."
      : `${files.length} changed:\n${files.join('\n')}`,
  );
  console.log(output);
}
