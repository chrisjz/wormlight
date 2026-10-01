// node scripts/experiments/fixes/run.ts [--jobs N]
//
// The second numerics study (DECISIONS.md, 2026-09-28), its design set before it was built:
// - two candidate fixes on the CPU reference, a coloured noise current with the synapses' decay time and neural
//   sub-steps, k = 1, 2 or 4;
// - judged at seven points of the search space, each at a loop step of 2.5 ms and 1.25 ms with the brain's sub-step
//   halved alongside, and the noise paths paired between the two;
// - on checkpoint 1's 20 trials with the noise as fitted, for each noise model and k, and with the noise off for each
//   k; and a gain sweep, with the noise off, for each k at each point, on 8 trials.
//
// Each loop step runs in a copy of the committed tree with it changed, under harness-out/fixes/trees/. Records go to
// harness-out/fixes/records/, one folder a set with a manifest, and the summary to harness-out/fixes/summary.json.
//
// DECISIONS.md's results came from a5e763f. After review its resamplings draw from the model's hash, and its verdicts
// record each clause's difference, so a rerun's chance figures differ slightly from those; its trials don't.
// Since 2026-10-01 checkpoint 1's frequency counts a crossing only once the mid-body curvature has left a band
// about the mean (DECISIONS.md), and this script grades through checkpoint1() and measure(), so a rerun's frequencies,
// wavelengths and chance figures differ from DECISIONS.md's tables wherever a gait lingers near its mean.

import { fork } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWormlightData } from '../../../src/data/schema.ts';
import { PARAMS } from '../../../src/science/params.ts';
import type { LoopParams } from '../../../src/sim/world.ts';
import { checkpoint1, SEEDS, TRIAL_SECONDS } from '../../../src/validation/checkpoints.ts';
import { bouts, reversals, MEASURE_FROM } from '../../../src/validation/motion.ts';
import type { TrialRecord } from '../../../src/validation/trial.ts';
import { ROOT } from '../../data/sources.ts';
import { commit } from '../../harness/commit.ts';
import { readPinned } from '../../harness/pinned.ts';
import {
  buildTree,
  firstFit,
  firstStart,
  forkPool,
  prepareSet,
  resampledChance,
  treeSource,
  workersFrom,
  writeWhole,
} from '../trees.ts';

const OUT = join(ROOT, 'harness-out', 'fixes');
const STEPS = [0.0025, 0.00125] as const;
const SUBSTEPS = [1, 2, 4] as const;
// τ_n, the synapses' decay time 1/a_d (DECISIONS.md, 2026-09-28).
const CORRELATION = 1 / PARAMS.synapticDecay.value;
const SWEEP = [0.3, 0.6, 1, 1.5, 2.14, 3, 5]; // nS
const SWEEP_SEEDS = SEEDS.slice(0, 8);
const RESAMPLES = 100;
// Judged only where the worm makes this many forward bouts of 10 s or more at both steps.
const EXERCISED = 3;
const AGREE = 0.02;

type Noise = 'white' | 'coloured' | 'off';
type PointId = 'start' | 'r-fit' | 'planned' | 'a0.3-b0' | 'a0.3-b5' | 'a5-b0' | 'a5-b5';
const POINTS: readonly PointId[] = ['start', 'r-fit', 'planned', 'a0.3-b0', 'a0.3-b5', 'a5-b0', 'a5-b5'];

// Each point's parameters, from a tree's own world module; `gains` overrides the oscillators' for the sweep.
interface Setting {
  point: PointId;
  noise: Noise;
  substeps: number;
  gains?: { a?: number; b?: number };
}

// What a record set ran on: the trees its trials depend on, its step, and the study's own settings for it, which
// live in this script, outside those trees.
interface Manifest extends Setting {
  source: string;
  step: number;
  correlation: number;
  grid: number;
}

interface Job {
  tree: string;
  manifest: Manifest;
  seed: number;
  out: string;
}

const tree = (step: number): string => join(OUT, 'trees', String(step * 1e6));
const slug = (s: Setting): string =>
  [
    s.point,
    s.noise,
    `k${s.substeps}`,
    s.gains?.a === undefined ? '' : `a${s.gains.a}`,
    s.gains?.b === undefined ? '' : `b${s.gains.b}`,
  ]
    .filter(Boolean)
    .join('-');
const setDir = (s: Setting, step: number): string => join(OUT, 'records', `${slug(s)}-${step * 1e6}us`);

type World = typeof import('../../../src/sim/world.ts');
type Planned = typeof import('../../../src/science/planned.ts');

function paramsAt(point: PointId, world: World, planned: Planned): LoopParams {
  if (point === 'r-fit') return firstFit(world);
  if (point === 'planned') return world.plannedParams(planned.PLANNED.calibrated);
  const start = firstStart(world);
  if (point === 'start') return start;
  const [a, b] = point.slice(1).split('-b').map(Number);
  return { ...start, oscillatorGain: a, oscillatorGainB: b };
}

async function runJob(job: Job): Promise<void> {
  const from = <T>(path: string): Promise<T> => import(join(job.tree, path)) as Promise<T>;
  const { NEURAL_STEP } = await from<typeof import('../../../src/sim/numerics.ts')>('src/sim/numerics.ts');
  const m = job.manifest;
  if (NEURAL_STEP !== m.step) throw new Error(`${job.tree} steps at ${NEURAL_STEP}, not ${m.step}`);
  const world = await from<World>('src/sim/world.ts');
  const planned = await from<Planned>('src/science/planned.ts');
  const { runTrial } = await from<typeof import('../../../src/validation/trial.ts')>('src/validation/trial.ts');
  const { readPostures } = await from<typeof import('../../harness/pinned.ts')>('scripts/harness/pinned.ts');
  const data = validateWormlightData(JSON.parse(readFileSync(join(job.tree, 'public/data/wormlight.v1.json'), 'utf8')));
  const base = paramsAt(m.point, world, planned);
  const params: LoopParams = {
    ...base,
    ...(m.noise === 'off' ? { noise: 0 } : {}),
    noiseCorrelation: m.noise === 'coloured' ? m.correlation : 0,
    ...(m.gains?.a === undefined ? {} : { oscillatorGain: m.gains.a }),
    ...(m.gains?.b === undefined ? {} : { oscillatorGainB: m.gains.b }),
  };
  const record = runTrial(data, {
    seed: job.seed,
    seconds: TRIAL_SECONDS,
    params,
    postures: await readPostures(),
    neuralSubsteps: m.substeps,
    // The finer of the pair's brain steps, which both runs' noise is drawn on.
    noiseGrid: m.grid,
  });
  writeWhole(job.out, JSON.stringify(record));
}

// The CPU's speed at each k: one world on R's fit at the coarser step, 20 s after 2 s to settle, on one core.
async function runSpeed(substeps: number): Promise<void> {
  const from = <T>(path: string): Promise<T> => import(join(tree(STEPS[0]), path)) as Promise<T>;
  const world = await from<World>('src/sim/world.ts');
  const data = validateWormlightData(
    JSON.parse(readFileSync(join(tree(STEPS[0]), 'public/data/wormlight.v1.json'), 'utf8')),
  );
  const w = new world.World(data, firstFit(world), { seed: 1, neuralSubsteps: substeps });
  for (let k = 0; k < Math.round(2 / STEPS[0]); k++) w.step();
  const steps = Math.round(20 / STEPS[0]);
  const started = performance.now();
  for (let k = 0; k < steps; k++) w.step();
  process.send?.({ substeps, realTime: (steps * STEPS[0]) / ((performance.now() - started) / 1000) });
}

function speed(substeps: number): Promise<{ substeps: number; realTime: number }> {
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(import.meta.url), ['--speed', String(substeps)], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });
    let result: { substeps: number; realTime: number } | null = null;
    child.once('message', (m) => (result = m as { substeps: number; realTime: number }));
    child.on('exit', (code) =>
      code === 0 && result ? resolve(result) : reject(new Error(`the speed run at k = ${substeps} gave no result`)),
    );
  });
}

const describe = (job: Job): string => `${slug(job.manifest)} at ${job.manifest.step * 1000} ms, seed ${job.seed}`;

const readSet = (dir: string, seeds: readonly number[]): TrialRecord[] =>
  seeds.map((seed) => JSON.parse(readFileSync(join(dir, `${seed}.json`), 'utf8')) as TrialRecord);

const meanVelocity = (trials: readonly TrialRecord[]): number => {
  const all = trials.flatMap((r) => r.velocity);
  return all.reduce((a, b) => a + b, 0) / all.length;
};

interface Measured {
  grade: string;
  clauses: Record<string, number | null>;
  bouts: number;
  reversalsPerMinute: number;
  meanVelocity: number;
  unconverged: number;
  chance?: Record<string, number | null>;
}

async function measureSet(dir: string, seeds: readonly number[], withChance: boolean): Promise<Measured> {
  const trials = readSet(dir, seeds);
  const basis = await readPinned('eigenworms');
  const c = checkpoint1(trials, basis);
  const minutes = trials.reduce((m, r) => m + (r.seconds - MEASURE_FROM) / 60, 0);
  const clause = (name: string) => (sample: TrialRecord[]) =>
    checkpoint1(sample, basis).clauses.find((k) => k.name === name)?.value ?? null;
  return {
    grade: c.grade,
    clauses: Object.fromEntries(c.clauses.map((k) => [k.name, k.value])),
    bouts: trials.reduce((n, r) => n + bouts(r.velocity).length, 0),
    reversalsPerMinute: trials.reduce((n, r) => n + reversals(r.velocity).length, 0) / minutes,
    meanVelocity: meanVelocity(trials),
    unconverged: trials.reduce((n, r) => n + r.unconverged, 0),
    ...(withChance
      ? {
          chance: {
            frequency: resampledChance(trials, clause('frequency'), RESAMPLES),
            wavelength: resampledChance(trials, clause('wavelength'), RESAMPLES),
            speed: resampledChance(trials, clause('speed'), RESAMPLES),
            meanVelocity: resampledChance(trials, meanVelocity, RESAMPLES),
          },
        }
      : {}),
  };
}

// The criterion: judged only where the worm crawls at both steps; converged if every clause value agrees within 2%
// and the grade is the same. Each clause's difference is recorded: relative to the finer run's value, but absolute for
// the bout clause, a share of trials; a clause measured at one step only is marked so.
function verdict(
  coarse: Measured,
  fine: Measured,
): { verdict: string; differences: Record<string, number | 'one step only' | null> } {
  const differences: Record<string, number | 'one step only' | null> = {};
  let agree = coarse.grade === fine.grade;
  for (const name of Object.keys(coarse.clauses)) {
    const [a, b] = [coarse.clauses[name], fine.clauses[name]];
    if (a === null && b === null) differences[name] = null;
    else if (a === null || b === null) {
      differences[name] = 'one step only';
      agree = false;
    } else {
      const d = name === 'bout' ? Math.abs(a - b) : a === b ? 0 : Math.abs(a - b) / Math.abs(b);
      differences[name] = d;
      if (!(d <= AGREE)) agree = false;
    }
  }
  if (coarse.bouts < EXERCISED || fine.bouts < EXERCISED) return { verdict: 'not exercised', differences };
  return { verdict: agree ? 'converged' : 'not converged', differences };
}

function settings(): { main: Setting[]; sweep: Setting[] } {
  const main: Setting[] = [];
  for (const point of POINTS) {
    for (const substeps of SUBSTEPS) {
      for (const noise of ['white', 'coloured', 'off'] as const) main.push({ point, noise, substeps });
    }
  }
  const sweep: Setting[] = [];
  for (const point of POINTS) {
    for (const substeps of SUBSTEPS) {
      for (const g of SWEEP) {
        sweep.push({ point, noise: 'off', substeps, gains: { a: g } });
        // The planned model has one gain for both classes.
        if (point !== 'planned') sweep.push({ point, noise: 'off', substeps, gains: { b: g } });
      }
    }
  }
  return { main, sweep };
}

if (process.argv[2] === '--worker') {
  await runJob(JSON.parse(process.argv[3]) as Job);
} else if (process.argv[2] === '--speed') {
  await runSpeed(Number(process.argv[3]));
  process.disconnect?.();
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const workers = workersFrom(process.argv, availableParallelism());
  const committed = commit();
  if (/uncommitted/.test(committed)) throw new Error('commit first: the trees are taken from HEAD');
  const source = treeSource();
  mkdirSync(OUT, { recursive: true });
  for (const step of STEPS) buildTree(tree(step), step);
  const { main, sweep } = settings();
  const jobs: Job[] = [];
  const reused: string[] = [];
  const queue = (s: Setting, seeds: readonly number[]): void => {
    for (const step of STEPS) {
      const manifest: Manifest = { ...s, source, step, correlation: CORRELATION, grid: STEPS[1] / s.substeps };
      const dir = setDir(s, step);
      const needed = prepareSet(dir, manifest, seeds);
      if (needed.length < seeds.length) reused.push(dir);
      for (const seed of needed) jobs.push({ tree: tree(step), manifest, seed, out: join(dir, `${seed}.json`) });
    }
  };
  for (const s of main) queue(s, SEEDS);
  for (const s of sweep) queue(s, SWEEP_SEEDS);
  // The costliest first: the finer step, then the most sub-steps.
  jobs.sort((a, b) => a.manifest.step - b.manifest.step || b.manifest.substeps - a.manifest.substeps);
  process.stderr.write(`${jobs.length} trials to run\n`);
  const started = Date.now();
  await forkPool(fileURLToPath(import.meta.url), jobs, workers, describe);
  const trialSeconds = (Date.now() - started) / 1000;

  const cost = [];
  for (const k of SUBSTEPS) cost.push(await speed(k));

  const judged = async (s: Setting, seeds: readonly number[], withChance: boolean) => {
    const [coarse, fine] = [
      await measureSet(setDir(s, STEPS[0]), seeds, withChance),
      await measureSet(setDir(s, STEPS[1]), seeds, withChance),
    ];
    return { ...s, coarse, fine, ...verdict(coarse, fine) };
  };
  const mainResults = [];
  for (const s of main) mainResults.push(await judged(s, SEEDS, true));
  const sweepResults = [];
  for (const s of sweep) sweepResults.push(await judged(s, SWEEP_SEEDS, false));

  const summary = {
    commit: committed,
    source,
    date: new Date().toISOString(),
    node: process.version,
    design: {
      steps: STEPS,
      substeps: SUBSTEPS,
      correlation: CORRELATION,
      points: POINTS,
      sweep: SWEEP,
      seeds: SEEDS,
      sweepSeeds: SWEEP_SEEDS,
      seconds: TRIAL_SECONDS,
      exercised: EXERCISED,
      agree: AGREE,
      resamples: RESAMPLES,
    },
    trialSeconds,
    reused,
    cost,
    main: mainResults,
    sweep: sweepResults,
  };
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  process.stderr.write(`wrote ${join(OUT, 'summary.json')} (${reused.length} record sets reused)\n`);
}
