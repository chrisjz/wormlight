// Which of CI's jobs a change needs (.github/workflows/ci.yml). The checks job runs on every change; the others
// run only when a file they use changed, so a change to the docs, the ledger or the trials' code alone skips the
// GPU's nine minutes. A job's code is traced when CI runs, through every import from its pages and scripts; the
// files it reads without importing them, such as the runtime data and the baselines, are listed below. A change to
// the workflow, these rules or the dependencies runs every job, and so does a run whose changed files can't be
// found.
//
//   node scripts/ci/changes.ts        in CI: writes site, data, visual and gpu to $GITHUB_OUTPUT

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// `site` is the built app, which the deploy job publishes.
export type Job = 'site' | 'data' | 'visual' | 'gpu';
export const JOBS: readonly Job[] = ['site', 'data', 'visual', 'gpu'];

// A prefix ending in / names a folder; any other names one file.
const EVERY = ['.github/', 'scripts/ci/', 'package.json', 'package-lock.json', '.gitattributes'];
const BUILD = ['vite.config.ts', 'tsconfig.json'];

interface Uses {
  // The pages and scripts the job runs, whose imports are traced.
  entries: readonly string[];
  // What it reads without importing it, and what it doesn't.
  reads: readonly string[];
  not?: readonly string[];
}

export const USES: Record<Job, Uses> = {
  site: { entries: ['index.html'], reads: [...BUILD, 'public/'] },
  visual: {
    entries: ['index.html', 'scripts/visual/capture.ts', 'scripts/visual/compare.ts'],
    reads: [...BUILD, 'public/', 'tests/visual/'],
  },
  gpu: { entries: ['parity.html', 'scripts/gpu/parity.ts'], reads: [...BUILD, 'public/data/'] },
  // The data build's pinned inputs and its outputs, which it formats with Prettier.
  data: {
    entries: ['scripts/data/build.ts'],
    reads: ['data/', 'public/data/', 'DATA_SOURCES.md', '.prettierrc.json', '.prettierignore'],
    not: ['data/calibration/', 'data/equivalence/'],
  },
};

const PATTERNS = [
  /(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]/g,
  /import\s*['"]([^'"]+)['"]/g,
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  /<script[^>]*\ssrc="([^"]+)"/g,
  /<link[^>]*\shref="([^"]+)"/g,
];

// Every repository file reachable from the entries, relative to the root: through static imports and exports,
// literal dynamic imports, and an HTML page's scripts and stylesheets. Packages are left to the lockfile.
export function reachable(entries: readonly string[], root = ROOT): Set<string> {
  const seen = new Set<string>();
  const resolveSpec = (from: string, spec: string): string | null => {
    if (!spec.startsWith('.') && !spec.startsWith('/')) return null;
    const path = spec.split('?')[0];
    const base = path.startsWith('/') ? join(root, path) : resolve(dirname(from), path);
    return [base, `${base}.ts`, join(base, 'index.ts')].find((p) => existsSync(p) && statSync(p).isFile()) ?? null;
  };
  const visit = (file: string): void => {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    if (!/\.(ts|html)$/.test(file)) return;
    const text = readFileSync(file, 'utf8');
    for (const pattern of PATTERNS) {
      for (const [, spec] of text.matchAll(pattern)) {
        const next = resolveSpec(file, spec);
        if (next) visit(next);
      }
    }
  };
  for (const entry of entries) visit(join(root, entry));
  return new Set([...seen].map((f) => relative(root, f)));
}

const under = (file: string, prefixes: readonly string[]): boolean =>
  prefixes.some((p) => (p.endsWith('/') ? file.startsWith(p) : file === p));

export type Code = Record<Job, ReadonlySet<string>>;

export function traced(root = ROOT): Code {
  const trace = (job: Job): Set<string> => reachable(USES[job].entries, root);
  return { site: trace('site'), data: trace('data'), visual: trace('visual'), gpu: trace('gpu') };
}

// The jobs a change to one file needs, beyond checks: those whose traced code holds it, or that read it.
export function needs(file: string, code: Code): Job[] {
  if (under(file, EVERY)) return [...JOBS];
  return JOBS.filter((job) => {
    const uses = USES[job];
    return (
      code[job].has(file) || under(file, uses.entries) || (under(file, uses.reads) && !under(file, uses.not ?? []))
    );
  });
}

export function jobsFor(files: readonly string[], code: Code): Record<Job, boolean> {
  const needed = new Set(files.flatMap((f) => needs(f, code)));
  return Object.fromEntries(JOBS.map((job) => [job, needed.has(job)])) as Record<Job, boolean>;
}

// The files a run's change touches, renamed files under both names: a pull request's against its base, through
// the merge commit the checkout holds, and a push's against the commit before it. Null when they can't be found,
// as for a new branch's first push. The code is traced in the tree the checkout holds, so a file the change stops
// importing no longer counts, but the importer, changed too, does.
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
  const jobs = jobsFor(files ?? EVERY, traced());
  const output = JOBS.map((job) => `${job}=${jobs[job]}\n`).join('');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  console.log(
    files === null
      ? "The changed files couldn't be found, so every job runs."
      : `${files.length} changed:\n${files.join('\n')}`,
  );
  console.log(output);
}
