// node scripts/experiments/convergence/run.ts [--jobs N]
//
// The convergence study (DECISIONS.md, 2026-09-28), its design set before it ran:
// - the oscillator alone (oscillator.ts), held where it cycles and excited by noise, at each step;
// - both fits in the loop, R's and the planned model's, on checkpoint 1's 20 trials and the calibration's 16 fresh
//   seeds, with their noise as fitted and off, at each step;
// - the cause, added after those ran: R's fit with the A-types lesioned, and with the A-types' g_osc lowered, at the
//   coarsest step and at 0.625 ms, on seeds 1 to 8;
// - and, added after review, each record set's chance variation, resampling its trials, and the CPU's speed at each
//   step.
//
// The neural step is a module constant, so each step runs in a copy of the committed tree with it changed, under
// harness-out/convergence/trees/. Records go to harness-out/convergence/records/, one folder a set, each with a
// manifest naming what its trials ran on; a set whose manifest doesn't match is run again. The summary goes to
// harness-out/convergence/summary.json.
//
// DECISIONS.md's results came from aaacc70. Its resamplings have since moved to the model's hash, so a rerun's chance
// figures differ slightly from those; its trials don't.

import { fork } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWormlightData } from '../../../src/data/schema.ts';
import { CALIBRATION, measure, objective } from '../../../src/validation/calibration.ts';
import { SEEDS, TRIAL_SECONDS, checkpoint1 } from '../../../src/validation/checkpoints.ts';
import { MEASURE_FROM, MOTION_SAMPLE, reversals } from '../../../src/validation/motion.ts';
import type { TrialRecord } from '../../../src/validation/trial.ts';
import { ROOT } from '../../data/sources.ts';
import { commit } from '../../harness/commit.ts';
import { readPinned } from '../../harness/pinned.ts';
import { buildTree, forkPool, prepareSet, resampledChance, treeSource, workersFrom, writeWhole } from '../trees.ts';
import { GAINS, LONE_SETTINGS, RECOVERIES, STEPS, excited, held } from './oscillator.ts';

const OUT = join(ROOT, 'harness-out', 'convergence');
const FRESH_SEEDS: readonly number[] = CALIBRATION.checkSeeds;
const SECONDS = TRIAL_SECONDS; // the same as the calibration's trials
if (CALIBRATION.trialSeconds !== TRIAL_SECONDS) throw new Error("checkpoint 1's trials and the calibration's differ");
type Model = 'r' | 'planned';
type Noise = 'fitted' | 'off';
const NOISES = ['fitted', 'off'] as const;

// What a record set's trials run on: the tree the trials come from, less the step, and the set's own settings.
interface Manifest {
  source: string;
  step: number;
  model: Model;
  noise: Noise;
  lesions: string[] | null;
  oscillatorGain: number | null;
}

interface Job {
  tree: string;
  manifest: Manifest;
  seed: number;
  out: string;
}

// The cause's variants of R's fit, each with a folder name of its own.
const CAUSE_STEPS = [0.0025, 0.000625];
const CAUSE_SEEDS = Array.from({ length: 8 }, (_, i) => i + 1);
const CAUSE_VARIANTS: { slug: string; name: string; lesions?: 'A'; oscillatorGain?: number }[] = [
  { slug: 'a-lesioned', name: 'A-types lesioned', lesions: 'A' },
  { slug: 'a-0.4ns', name: "A-types' g_osc 0.4 nS", oscillatorGain: 0.4 },
  { slug: 'a-1ns', name: "A-types' g_osc 1 nS", oscillatorGain: 1 },
  { slug: 'a-2.14ns', name: "A-types' g_osc 2.14 nS", oscillatorGain: 2.14 },
];
const RESAMPLES = 100;

const tree = (step: number): string => join(OUT, 'trees', String(step * 1e6));
const recordDir = (step: number, model: Model, noise: Noise): string =>
  join(OUT, 'records', `${step * 1e6}us-${model}-${noise}`);
const causeDir = (slug: string, step: number, noise: Noise): string =>
  join(OUT, 'records', `cause-${slug}-${step * 1e6}us-${noise}`);

// A trial in a step's tree, whose modules are the main tree's but for the step, which it checks.
async function runJob(job: Job): Promise<void> {
  const from = <T>(path: string): Promise<T> => import(join(job.tree, path)) as Promise<T>;
  const { NEURAL_STEP } = await from<typeof import('../../../src/sim/numerics.ts')>('src/sim/numerics.ts');
  if (NEURAL_STEP !== job.manifest.step)
    throw new Error(`${job.tree} steps at ${NEURAL_STEP}, not ${job.manifest.step}`);
  const { currentParams, plannedParams } = await from<typeof import('../../../src/sim/world.ts')>('src/sim/world.ts');
  const { PLANNED } = await from<typeof import('../../../src/science/planned.ts')>('src/science/planned.ts');
  const { runTrial } = await from<typeof import('../../../src/validation/trial.ts')>('src/validation/trial.ts');
  const { readPostures } = await from<typeof import('../../harness/pinned.ts')>('scripts/harness/pinned.ts');
  const data = validateWormlightData(JSON.parse(readFileSync(join(job.tree, 'public/data/wormlight.v1.json'), 'utf8')));
  const { model, noise, lesions, oscillatorGain } = job.manifest;
  const fitted = model === 'planned' ? plannedParams(PLANNED.calibrated) : currentParams();
  const params = {
    ...fitted,
    ...(noise === 'off' ? { noise: 0 } : {}),
    ...(oscillatorGain === null ? {} : { oscillatorGain }),
  };
  const record = runTrial(data, {
    seed: job.seed,
    seconds: SECONDS,
    params,
    postures: await readPostures(),
    lesions: lesions ?? undefined,
  });
  writeWhole(job.out, JSON.stringify(record));
}

// The CPU reference's speed in a step's tree: one world on R's fit, 20 s after 2 s to settle, on one core.
async function runSpeed(treeDir: string): Promise<void> {
  const from = <T>(path: string): Promise<T> => import(join(treeDir, path)) as Promise<T>;
  const { NEURAL_STEP } = await from<typeof import('../../../src/sim/numerics.ts')>('src/sim/numerics.ts');
  const { World, currentParams } = await from<typeof import('../../../src/sim/world.ts')>('src/sim/world.ts');
  const data = validateWormlightData(JSON.parse(readFileSync(join(treeDir, 'public/data/wormlight.v1.json'), 'utf8')));
  const world = new World(data, currentParams(), { seed: 1 });
  for (let k = 0; k < Math.round(2 / NEURAL_STEP); k++) world.step();
  const steps = Math.round(20 / NEURAL_STEP);
  const started = performance.now();
  for (let k = 0; k < steps; k++) world.step();
  process.send?.({ step: NEURAL_STEP, realTime: (steps * NEURAL_STEP) / ((performance.now() - started) / 1000) });
}

const describe = (job: Job): string => {
  const m = job.manifest;
  const variant = m.lesions ? 'A-types lesioned' : m.oscillatorGain === null ? '' : `, g_osc ${m.oscillatorGain} nS`;
  return `${m.model}'s fit${variant}, noise ${m.noise}, step ${m.step * 1000} ms, seed ${job.seed}`;
};

function speed(treeDir: string): Promise<{ step: number; realTime: number }> {
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(import.meta.url), ['--speed', treeDir], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });
    let result: { step: number; realTime: number } | null = null;
    child.once('message', (m) => (result = m as { step: number; realTime: number }));
    child.on('exit', (code) =>
      code === 0 && result ? resolve(result) : reject(new Error(`the speed run in ${treeDir} gave no result`)),
    );
  });
}

const readSet = (dir: string, seeds: readonly number[]): TrialRecord[] =>
  seeds.map((seed) => JSON.parse(readFileSync(join(dir, `${seed}.json`), 'utf8')) as TrialRecord);

// Per minute of the measured windows, from MEASURE_FROM on.
const measuredMinutes = (trials: readonly TrialRecord[]): number =>
  trials.reduce((m, r) => m + (r.seconds - MEASURE_FROM) / 60, 0);

const meanVelocity = (trials: readonly TrialRecord[]): number => {
  const all = trials.flatMap((r) => r.velocity);
  return all.reduce((a, b) => a + b, 0) / all.length;
};

// A fit's measures at one step, with or without its noise. Grading doesn't depend on the step: the records are
// sampled every MOTION_SAMPLE s at any step.
async function grade(step: number, model: Model, noise: Noise): Promise<Record<string, unknown>> {
  const dir = recordDir(step, model, noise);
  const trials = readSet(dir, SEEDS);
  const fresh = readSet(dir, FRESH_SEEDS);
  const basis = await readPinned('eigenworms');
  const c = checkpoint1(trials, basis);
  const clause = (name: string) => (sample: TrialRecord[]) =>
    checkpoint1(sample, basis).clauses.find((k) => k.name === name)?.value ?? null;
  const minutes = measuredMinutes(trials);
  const m = measure(fresh);
  return {
    step,
    model,
    noise,
    manifest: JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest,
    grade: c.grade,
    clauses: Object.fromEntries(c.clauses.map((k) => [k.name, { value: k.value, grade: k.grade }])),
    reversalsPerMinute: trials.reduce((n, r) => n + reversals(r.velocity).length, 0) / minutes,
    flipsPerMinute: trials.reduce((n, r) => n + r.switchFlips.filter((t) => t >= MEASURE_FROM).length, 0) / minutes,
    meanVelocity: meanVelocity(trials),
    chance: {
      frequency: resampledChance(trials, clause('frequency'), RESAMPLES),
      wavelength: resampledChance(trials, clause('wavelength'), RESAMPLES),
      speed: resampledChance(trials, clause('speed'), RESAMPLES),
      meanVelocity: resampledChance(trials, meanVelocity, RESAMPLES),
    },
    unconverged: [...trials, ...fresh].reduce((n, r) => n + r.unconverged, 0),
    fresh: { ...m, objective: objective(m).value },
  };
}

if (process.argv[2] === '--worker') {
  await runJob(JSON.parse(process.argv[3]) as Job);
} else if (process.argv[2] === '--speed') {
  await runSpeed(process.argv[3]);
  process.disconnect?.();
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const workers = workersFrom(process.argv, availableParallelism());
  const committed = commit();
  if (/uncommitted/.test(committed)) throw new Error('commit first: the trees are taken from HEAD');
  const head = {
    commit: committed,
    source: treeSource(),
    date: new Date().toISOString(),
    node: process.version,
    steps: STEPS,
    trials: {
      seeds: SEEDS,
      freshSeeds: FRESH_SEEDS,
      seconds: SECONDS,
      measureFrom: MEASURE_FROM,
      sample: MOTION_SAMPLE,
    },
    lone: { ...LONE_SETTINGS, gains: GAINS, recoveries: RECOVERIES },
    cause: { steps: CAUSE_STEPS, seeds: CAUSE_SEEDS, variants: CAUSE_VARIANTS },
    resamples: RESAMPLES,
  };
  mkdirSync(OUT, { recursive: true });

  process.stderr.write('the oscillator alone\n');
  const oscillator = {
    held: GAINS.flatMap((g) => RECOVERIES.flatMap((r) => held(g, r))),
    excited: GAINS.flatMap((g) => RECOVERIES.flatMap((r) => STEPS.map((s) => excited(g, r, s)))),
  };

  for (const step of STEPS) buildTree(tree(step), step);
  const src = head.source;
  const jobs: Job[] = [];
  const reused: string[] = [];
  // The finest step first: its trials take longest.
  for (const step of [...STEPS].reverse()) {
    for (const model of ['r', 'planned'] as const) {
      for (const noise of NOISES) {
        const dir = recordDir(step, model, noise);
        const manifest: Manifest = { source: src, step, model, noise, lesions: null, oscillatorGain: null };
        const seeds = [...SEEDS, ...FRESH_SEEDS];
        const needed = prepareSet(dir, manifest, seeds);
        if (needed.length < seeds.length) reused.push(dir);
        for (const seed of needed) jobs.push({ tree: tree(step), manifest, seed, out: join(dir, `${seed}.json`) });
      }
    }
  }
  const data = validateWormlightData(JSON.parse(readFileSync(join(ROOT, 'public/data/wormlight.v1.json'), 'utf8')));
  const aTypes = data.neurons.filter((n) => n.oscillator === 'A').map((n) => n.name);
  for (const step of CAUSE_STEPS) {
    for (const v of CAUSE_VARIANTS) {
      for (const noise of NOISES) {
        const dir = causeDir(v.slug, step, noise);
        const manifest: Manifest = {
          source: src,
          step,
          model: 'r',
          noise,
          lesions: v.lesions === 'A' ? aTypes : null,
          oscillatorGain: v.oscillatorGain ?? null,
        };
        const needed = prepareSet(dir, manifest, CAUSE_SEEDS);
        if (needed.length < CAUSE_SEEDS.length) reused.push(dir);
        for (const seed of needed) jobs.push({ tree: tree(step), manifest, seed, out: join(dir, `${seed}.json`) });
      }
    }
  }
  process.stderr.write(`both fits in the loop, and the cause: ${jobs.length} trials to run\n`);
  const started = Date.now();
  await forkPool(fileURLToPath(import.meta.url), jobs, workers, describe);
  const trialSeconds = (Date.now() - started) / 1000;

  process.stderr.write("the CPU's speed\n");
  const cost = [];
  for (const step of STEPS) cost.push(await speed(tree(step)));

  const loop = [];
  for (const step of STEPS)
    for (const model of ['r', 'planned'] as const)
      for (const noise of NOISES) loop.push(await grade(step, model, noise));
  const cause = CAUSE_STEPS.flatMap((step) =>
    CAUSE_VARIANTS.flatMap((v) =>
      NOISES.map((noise) => {
        const records = readSet(causeDir(v.slug, step, noise), CAUSE_SEEDS);
        return { step, variant: v.name, noise, meanVelocity: meanVelocity(records), ...measure(records) };
      }),
    ),
  );
  const summary = { ...head, trialSeconds, reused, oscillator, cost, loop, cause };
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  process.stderr.write(
    `wrote ${join(OUT, 'summary.json')} (${readdirSync(join(OUT, 'records')).length} record sets, ${reused.length} reused)\n`,
  );
}
