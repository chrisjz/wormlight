// What the numerics studies share (DECISIONS.md, 2026-09-28): copies of the committed tree with the neural step
// changed, record sets whose manifests say what their trials ran on, and a pool of worker processes.

import { execSync, fork } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hash, uniform } from '../../src/sim/brain/rng.ts';
import type { LoopParams, RValues } from '../../src/sim/world.ts';
import { ROOT } from '../data/sources.ts';

type WorldModule = typeof import('../../src/sim/world.ts');

// The points the studies ran at, pinned as they ran, since the registry has moved on to the coloured noise
// (DECISIONS.md, 2026-09-28): R's first fit, as data/calibration/r1.json records it, and R's provisional values
// as they were then, each with white noise. `world` is a tree's world module.
export function firstFit(world: WorldModule): LoopParams {
  const fit = JSON.parse(readFileSync(join(ROOT, 'data/calibration/r1.json'), 'utf8')) as {
    final: { values: Omit<RValues, 'noiseCorrelation'> };
  };
  return world.loopParams({ ...fit.final.values, noiseCorrelation: 0 });
}
export function firstStart(world: WorldModule): LoopParams {
  return { ...world.provisionalParams(), noise: WHITE_PROVISIONAL, noiseCorrelation: 0 };
}
// R's provisional σ_n before the coloured noise, the white noise's (DECISIONS.md, 2026-09-27).
const WHITE_PROVISIONAL = 0.0834;

// The git trees whose content a trial depends on, less the step: the model's code, the data, the pins, the
// harness's readers and the scripts they read the pins with, and this file, whose buildTree sets the step. A change
// anywhere else, such as to a study or to the docs, leaves records valid.
export function treeSource(): string {
  const paths = [
    'src',
    'public/data',
    'data/sources.json',
    'scripts/harness',
    'scripts/data',
    'scripts/experiments/trees.ts',
  ];
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

// A pooled measure's chance variation: its standard deviation over `resamples` resamplings of the trials, with
// replacement, as a share of its value, the draws from the model's own hash so every run makes the same ones.
export function resampledChance<T>(
  trials: readonly T[],
  value: (sample: T[]) => number | null,
  resamples: number,
): number | null {
  const full = value([...trials]);
  if (full === null || full === 0) return null;
  const draws: number[] = [];
  for (let b = 0; b < resamples; b++) {
    const sample = trials.map((_, k) => trials[Math.floor(uniform(hash(RESAMPLING_SEED, b, k)) * trials.length)]);
    const v = value(sample);
    if (v !== null) draws.push(v);
  }
  if (draws.length < 2) return null;
  const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
  return Math.sqrt(draws.reduce((a, b) => a + (b - mean) ** 2, 0) / (draws.length - 1)) / Math.abs(full);
}
const RESAMPLING_SEED = 12345;
