// What the numerics studies share (DECISIONS.md, 2026-09-28): copies of the committed tree with the neural step
// changed, record sets whose manifests say what their trials ran on, and a pool of worker processes.

import { execSync, fork } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../data/sources.ts';

// The git trees whose content a trial depends on, less the step: the model's code, the data, the pins and the
// harness's readers. A change anywhere else, such as to a study or to the docs, leaves records valid.
export function treeSource(): string {
  const paths = ['src', 'public/data', 'data/sources.json', 'scripts/harness'];
  return execSync(`git rev-parse ${paths.map((p) => `HEAD:${p}`).join(' ')}`, { cwd: ROOT, encoding: 'utf8' })
    .trim()
    .split('\n')
    .join(' ');
}

// A copy of the committed tree in `dir` with the neural step changed, sharing the dependencies and the pinned cache.
export function buildTree(dir: string, step: number): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'data'), { recursive: true });
  execSync(`git archive HEAD src scripts public/data data/sources.json | tar -x -C ${JSON.stringify(dir)}`, {
    cwd: ROOT,
  });
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
  symlinkSync(join(ROOT, 'data', 'cache'), join(dir, 'data', 'cache'));
  const numerics = join(dir, 'src', 'sim', 'numerics.ts');
  const text = readFileSync(numerics, 'utf8');
  const pattern = /^export const NEURAL_STEP = [0-9.e-]+;$/m;
  if ((text.match(new RegExp(pattern.source, 'gm')) ?? []).length !== 1) {
    throw new Error('the neural step is not declared once where the study expects it');
  }
  writeFileSync(numerics, text.replace(pattern, `export const NEURAL_STEP = ${step};`));
}

// A record set's folder, emptied unless its manifest is the one given; the seeds it still needs.
export function prepareSet(dir: string, manifest: object, seeds: readonly number[]): number[] {
  const path = join(dir, 'manifest.json');
  const same = existsSync(path) && readFileSync(path, 'utf8') === JSON.stringify(manifest);
  if (!same) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(manifest));
  }
  return seeds.filter((seed) => !existsSync(join(dir, `${seed}.json`)));
}

// Whole or not at all: a record left half-written would be taken as done.
export function writeWhole(path: string, text: string): void {
  writeFileSync(`${path}.part`, text);
  renameSync(`${path}.part`, path);
}

// Each job in a worker process of its own, `script --worker <job>`. The first failure stops new jobs; those under
// way finish, then it throws.
export async function forkPool<T>(
  script: string,
  jobs: readonly T[],
  workers: number,
  describe: (job: T) => string,
): Promise<void> {
  let next = 0;
  let done = 0;
  let failure: Error | null = null;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < jobs.length && !failure) {
        const job = jobs[next++];
        await new Promise<void>((resolve) => {
          const child = fork(script, ['--worker', JSON.stringify(job)], { stdio: 'inherit' });
          child.on('exit', (code) => {
            if (code !== 0) failure ??= new Error(`${describe(job)} exited ${code}`);
            resolve();
          });
        });
        if (++done % 100 === 0) process.stderr.write(`${done}/${jobs.length} trials\n`);
      }
    }),
  );
  // Set from the workers' callbacks, which the compiler's narrowing can't see.
  const error = failure as Error | null;
  if (error) throw error;
}

// A whole number of workers from `--jobs N`, or one per core.
export function workersFrom(args: readonly string[], cores: number): number {
  const at = args.indexOf('--jobs');
  const workers = at >= 0 ? Number(args[at + 1]) : cores;
  if (!Number.isInteger(workers) || workers < 1) throw new Error('usage: --jobs N, N a whole number');
  return workers;
}
