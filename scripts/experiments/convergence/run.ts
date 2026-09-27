// node scripts/experiments/convergence/run.ts [--jobs N]
//
// The convergence study (DECISIONS.md, 2026-09-28), set before it ran:
// - the oscillator alone (oscillator.ts), held where it cycles and excited by noise, at each step;
// - both fits in the loop, R's and the planned model's, on checkpoint 1's 20 trials and the calibration's 16 fresh
//   seeds, with their noise as fitted and off, at each step.
//
// The neural step is a module constant, so each step runs in a copy of the committed tree with it changed, under
// harness-out/convergence/trees/. Records go to harness-out/convergence/records/, and the summary, with the
// commit it ran at, to harness-out/convergence/summary.json.

import { execSync, fork } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure, objective } from '../../../src/validation/calibration.ts';
import { checkpoint1 } from '../../../src/validation/checkpoints.ts';
import { reversals } from '../../../src/validation/motion.ts';
import type { TrialRecord } from '../../../src/validation/trial.ts';
import { ROOT } from '../../data/sources.ts';
import { commit } from '../../harness/commit.ts';
import { readPinned } from '../../harness/pinned.ts';
import { GAINS, RECOVERIES, STEPS, excited, held } from './oscillator.ts';

const OUT = join(ROOT, 'harness-out', 'convergence');
const CHECKPOINT_SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const FRESH_SEEDS = Array.from({ length: 16 }, (_, i) => 1005 + i);
const SECONDS = 120;
type Model = 'r' | 'planned';
type Noise = 'fitted' | 'off';

interface Job {
  tree: string;
  step: number;
  model: Model;
  noise: Noise;
  seed: number;
  out: string;
}

const tree = (step: number): string => join(OUT, 'trees', String(step * 1e6));
const recordDir = (step: number, model: Model, noise: Noise): string =>
  join(OUT, 'records', `${step * 1e6}us-${model}-${noise}`);

// A copy of the committed tree with the neural step changed, sharing the dependencies and the pinned cache.
function buildTree(step: number): void {
  const dir = tree(step);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'data'), { recursive: true });
  execSync(`git archive HEAD src scripts public/data | tar -x -C ${JSON.stringify(dir)}`, { cwd: ROOT });
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
  symlinkSync(join(ROOT, 'data', 'cache'), join(dir, 'data', 'cache'));
  const numerics = join(dir, 'src', 'sim', 'numerics.ts');
  const text = readFileSync(numerics, 'utf8');
  const changed = text.replace('export const NEURAL_STEP = 0.0025;', `export const NEURAL_STEP = ${step};`);
  if (changed === text && step !== 0.0025) throw new Error('the neural step was not where the study expects it');
  writeFileSync(numerics, changed);
}

// A trial in a step's tree, whose modules are the main tree's but for the step.
async function runJob(job: Job): Promise<void> {
  const from = <T>(path: string): Promise<T> => import(join(job.tree, path)) as Promise<T>;
  const { validateWormlightData } = await from<typeof import('../../../src/data/schema.ts')>('src/data/schema.ts');
  const { currentParams, plannedParams } = await from<typeof import('../../../src/sim/world.ts')>('src/sim/world.ts');
  const { PLANNED } = await from<typeof import('../../../src/science/planned.ts')>('src/science/planned.ts');
  const { runTrial } = await from<typeof import('../../../src/validation/trial.ts')>('src/validation/trial.ts');
  const { readPostures } = await from<typeof import('../../harness/pinned.ts')>('scripts/harness/pinned.ts');
  const data = validateWormlightData(JSON.parse(readFileSync(join(job.tree, 'public/data/wormlight.v1.json'), 'utf8')));
  const fitted = job.model === 'planned' ? plannedParams(PLANNED.calibrated) : currentParams();
  const params = job.noise === 'off' ? { ...fitted, noise: 0 } : fitted;
  const record = runTrial(data, { seed: job.seed, seconds: SECONDS, params, postures: await readPostures() });
  writeFileSync(job.out, JSON.stringify(record));
}

async function pool(jobs: Job[], workers: number): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        await new Promise<void>((resolve, reject) => {
          const child = fork(self, ['--worker', JSON.stringify(job)], { stdio: 'inherit' });
          child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`seed ${job.seed} exited ${code}`))));
        });
        if (++done % 36 === 0) process.stderr.write(`${done}/${jobs.length} trials\n`);
      }
    }),
  );
}

// A fit's measures at one step, with or without its noise. Grading doesn't depend on the step: the records are
// sampled every 0.1 s at any step.
async function grade(step: number, model: Model, noise: Noise): Promise<Record<string, unknown>> {
  const dir = recordDir(step, model, noise);
  const read = (seeds: number[]): TrialRecord[] =>
    seeds.map((seed) => JSON.parse(readFileSync(join(dir, `${seed}.json`), 'utf8')) as TrialRecord);
  const trials = read(CHECKPOINT_SEEDS);
  const fresh = read(FRESH_SEEDS);
  const c = checkpoint1(trials, await readPinned('eigenworms'));
  const minutes = trials.reduce((m, r) => m + (r.velocity.length * 0.1) / 60, 0);
  const revs = trials.reduce((n, r) => n + reversals(r.velocity).length, 0);
  const flips = trials.reduce((n, r) => n + r.switchFlips.filter((t) => t >= 10).length, 0);
  const m = measure(fresh);
  return {
    step,
    model,
    noise,
    grade: c.grade,
    clauses: Object.fromEntries(c.clauses.map((k) => [k.name, { value: k.value, grade: k.grade }])),
    reversalsPerMinute: revs / minutes,
    flipsPerMinute: flips / minutes,
    unconverged: [...trials, ...fresh].reduce((n, r) => n + r.unconverged, 0),
    fresh: { ...m, objective: objective(m).value },
  };
}

if (process.argv[2] === '--worker') {
  await runJob(JSON.parse(process.argv[3]) as Job);
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--jobs');
  const workers = at > 0 ? Number(process.argv[at + 1]) : availableParallelism();
  const head = { commit: commit(), date: new Date().toISOString(), node: process.version, steps: STEPS };
  mkdirSync(OUT, { recursive: true });

  process.stderr.write('the oscillator alone\n');
  const oscillator = {
    held: GAINS.flatMap((g) => RECOVERIES.flatMap((r) => held(g, r))),
    excited: GAINS.flatMap((g) => RECOVERIES.flatMap((r) => STEPS.map((s) => excited(g, r, s)))),
  };

  process.stderr.write('both fits in the loop\n');
  for (const step of STEPS) buildTree(step);
  const jobs: Job[] = [];
  // The finest step first: its trials take longest.
  for (const step of [...STEPS].reverse()) {
    for (const model of ['r', 'planned'] as const) {
      for (const noise of ['fitted', 'off'] as const) {
        const dir = recordDir(step, model, noise);
        mkdirSync(dir, { recursive: true });
        for (const seed of [...CHECKPOINT_SEEDS, ...FRESH_SEEDS]) {
          const out = join(dir, `${seed}.json`);
          if (!existsSync(out)) jobs.push({ tree: tree(step), step, model, noise, seed, out });
        }
      }
    }
  }
  const started = Date.now();
  await pool(jobs, workers);
  const loop = [];
  for (const step of STEPS)
    for (const model of ['r', 'planned'] as const)
      for (const noise of ['fitted', 'off'] as const) loop.push(await grade(step, model, noise));
  const summary = { ...head, seconds: (Date.now() - started) / 1000, oscillator, loop };
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  process.stderr.write(
    `wrote ${join(OUT, 'summary.json')} (${readdirSync(join(OUT, 'records')).length} record sets)\n`,
  );
}
