// npm run equivalence -- --fit <refit|planned> [--jobs N] [--trials N]
//
// PLAN §7.2's comparison with the noise on (the paragraph after its table, set 2026-09-28 before it first ran): a
// fit's 200 trials of 120 s at the model's step dt and at dt/2, seeds 1 to 200, each step in a copy of the
// committed tree with its step changed (scripts/experiments/trees.ts), then each clause's percentile interval for
// the difference (src/validation/equivalence.ts). The refit is the registry's values, which must be calibrated; the
// planned fit is src/science/planned.ts's, with its white noise. A full run writes data/equivalence/<fit>.json and
// regenerates VALIDATION.md's section from every fit's file; --trials shortens a run for a look, writing only to
// harness-out/. Trees and records go to harness-out/equivalence/, in folders named by a hash of the sources the
// trials depend on (treeSource), so a run at other sources never touches another's, and a set is reused whole or in
// part while its manifest matches. Each tree carries its sources, which every trial checks before it runs.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateWormlightData } from '../../src/data/schema.ts';
import { NEURAL_STEP } from '../../src/sim/numerics.ts';
import { isCalibrated, type LoopParams } from '../../src/sim/world.ts';
import { checkpoint1, TRIAL_SECONDS } from '../../src/validation/checkpoints.ts';
import { compareSteps, EQUIVALENCE, EQUIVALENCE_SEEDS } from '../../src/validation/equivalence.ts';
import type { TrialRecord } from '../../src/validation/trial.ts';
import { formatJson, formatMarkdown } from '../data/render.ts';
import { ROOT } from '../data/sources.ts';
import { buildTree, forkPool, prepareSet, treeSource, writeWhole } from '../experiments/trees.ts';
import { commit } from './commit.ts';
import { readPinned } from './pinned.ts';
import { equivalenceSection, replaceSection, type EquivalenceRun } from './report.ts';

type Fit = EquivalenceRun['fit'];
const FITS: readonly Fit[] = ['refit', 'planned'];
const STEPS: [number, number] = [NEURAL_STEP, NEURAL_STEP / 2];
const OUT = join(ROOT, 'harness-out', 'equivalence');
const RESULTS = join(ROOT, 'data', 'equivalence');
const PAGE = join(ROOT, 'VALIDATION.md');
const STAMP = '.source';
// A short name for a set of sources, for the folders.
const keyOf = (source: string): string => createHash('sha1').update(source).digest('hex').slice(0, 10);
const tree = (step: number, source: string): string => join(OUT, `tree-${Math.round(step * 1e6)}us-${keyOf(source)}`);
const setDir = (fit: Fit, step: number, source: string): string =>
  join(OUT, `${fit}-${Math.round(step * 1e6)}us-${keyOf(source)}`);

// A step's tree at these sources, built unless one carrying them is already there.
function ensureTree(step: number, source: string): string {
  const dir = tree(step, source);
  const stamp = join(dir, STAMP);
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === source) return dir;
  buildTree(dir, step);
  writeFileSync(stamp, source);
  return dir;
}

interface Manifest {
  fit: Fit;
  source: string;
  step: number;
  seconds: number;
  node: string;
}
interface Job {
  tree: string;
  manifest: Manifest;
  seed: number;
  out: string;
}

type World = typeof import('../../src/sim/world.ts');
type Planned = typeof import('../../src/science/planned.ts');

// A fit's values in a tree: the registry's, which a refit needs calibrated, or the planned model's fit.
function paramsOf(fit: Fit, world: World, planned: Planned): LoopParams {
  if (fit === 'planned') return world.plannedParams(planned.PLANNED.calibrated);
  if (!world.isCalibrated()) throw new Error("the registry isn't calibrated: copy R's refit into params.ts first");
  return world.currentParams();
}

async function runJob(job: Job): Promise<void> {
  if (readFileSync(join(job.tree, STAMP), 'utf8') !== job.manifest.source) {
    throw new Error(`${job.tree} no longer holds the sources its manifest names`);
  }
  const from = <T>(path: string): Promise<T> => import(pathToFileURL(join(job.tree, path)).href) as Promise<T>;
  const { NEURAL_STEP: step } = await from<typeof import('../../src/sim/numerics.ts')>('src/sim/numerics.ts');
  if (step !== job.manifest.step) throw new Error(`${job.tree} steps at ${step}, not ${job.manifest.step}`);
  const world = await from<World>('src/sim/world.ts');
  const planned = await from<Planned>('src/science/planned.ts');
  const { runTrial } = await from<typeof import('../../src/validation/trial.ts')>('src/validation/trial.ts');
  const { readPostures } = await from<typeof import('./pinned.ts')>('scripts/harness/pinned.ts');
  const data = validateWormlightData(JSON.parse(readFileSync(join(job.tree, 'public/data/wormlight.v1.json'), 'utf8')));
  const record = runTrial(data, {
    seed: job.seed,
    seconds: job.manifest.seconds,
    params: paramsOf(job.manifest.fit, world, planned),
    postures: await readPostures(),
  });
  writeWhole(job.out, JSON.stringify(record));
}

const USAGE = 'npm run equivalence -- --fit <refit|planned> [--jobs N] [--trials N]';

// Every option given once, each with its value after it, so that a mistyped one can't run the full comparison.
export function parseArgs(args: readonly string[]): { fit: Fit; jobs: number; trials: number } {
  const values = new Map<string, string>();
  for (let k = 0; k < args.length; k += 2) {
    const [flag, value] = [args[k], args[k + 1]];
    if (!['--fit', '--jobs', '--trials'].includes(flag)) throw new Error(`unknown option ${flag}; usage: ${USAGE}`);
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value; usage: ${USAGE}`);
    if (values.has(flag)) throw new Error(`${flag} is given twice`);
    values.set(flag, value);
  }
  const fit = values.get('--fit') as Fit | undefined;
  if (fit === undefined || !FITS.includes(fit)) throw new Error(`usage: ${USAGE}`);
  const whole = (flag: string, least: number, most: number, otherwise: number): number => {
    const text = values.get(flag);
    if (text === undefined) return otherwise;
    if (!/^\d+$/.test(text) || Number(text) < least || Number(text) > most) {
      throw new Error(`${flag} needs a whole number from ${least} to ${most}`);
    }
    return Number(text);
  };
  return {
    fit,
    jobs: whole('--jobs', 1, 1024, availableParallelism()),
    trials: whole('--trials', 2, EQUIVALENCE.trials, EQUIVALENCE.trials),
  };
}

const readSet = (dir: string, seeds: readonly number[]): TrialRecord[] =>
  seeds.map((seed) => JSON.parse(readFileSync(join(dir, `${seed}.json`), 'utf8')) as TrialRecord);

if (process.argv[2] === '--worker') {
  await runJob(JSON.parse(process.argv[3]) as Job);
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const full = options.trials === EQUIVALENCE.trials;
  const committed = commit();
  if (/uncommitted/.test(committed)) throw new Error('commit first: the trees are taken from HEAD');
  // The committed registry is the trees' too.
  if (options.fit === 'refit' && !isCalibrated()) {
    throw new Error("the registry isn't calibrated: copy R's refit into params.ts first");
  }
  const source = treeSource();
  const seeds = EQUIVALENCE_SEEDS.slice(0, options.trials);
  mkdirSync(OUT, { recursive: true });
  const jobs: Job[] = [];
  for (const step of STEPS) {
    const at = ensureTree(step, source);
    const manifest: Manifest = { fit: options.fit, source, step, seconds: TRIAL_SECONDS, node: process.version };
    const dir = setDir(options.fit, step, source);
    for (const seed of prepareSet(dir, manifest, seeds)) {
      jobs.push({ tree: at, manifest, seed, out: join(dir, `${seed}.json`) });
    }
  }
  // The finer step's trials first, since they take longest.
  jobs.sort((a, b) => a.manifest.step - b.manifest.step);
  process.stderr.write(`${jobs.length} trials to run\n`);
  const started = Date.now();
  await forkPool(fileURLToPath(import.meta.url), jobs, options.jobs, (job) => {
    return `${job.manifest.fit} at ${job.manifest.step * 1000} ms, seed ${job.seed}`;
  });
  process.stderr.write(`${jobs.length} trials in ${((Date.now() - started) / 1000).toFixed(0)} s\n`);

  const [coarse, fine] = STEPS.map((step) => readSet(setDir(options.fit, step, source), seeds));
  const basis = await readPinned('eigenworms');
  const run: EquivalenceRun = {
    fit: options.fit,
    date: new Date().toISOString().slice(0, 10),
    commit: committed,
    trials: options.trials,
    seconds: TRIAL_SECONDS,
    steps: STEPS,
    resamples: EQUIVALENCE.resamples,
    grades: [checkpoint1(coarse, basis).grade, checkpoint1(fine, basis).grade],
    unconverged: [coarse, fine].map((set) => set.reduce((n, r) => n + r.unconverged, 0)) as [number, number],
    comparison: compareSteps(coarse, fine),
  };
  const section = equivalenceSection([run]);
  process.stdout.write(`${section}\n\n`);
  if (full) {
    mkdirSync(RESULTS, { recursive: true });
    const file = join(RESULTS, `${options.fit}.json`);
    writeFileSync(file, await formatJson(JSON.stringify({ ...run, source }), file));
    // Every fit's latest full run, the refit first.
    const runs = FITS.filter((fit) => readdirSync(RESULTS).includes(`${fit}.json`)).map(
      (fit) => JSON.parse(readFileSync(join(RESULTS, `${fit}.json`), 'utf8')) as EquivalenceRun,
    );
    const page = replaceSection(readFileSync(PAGE, 'utf8'), 'equivalence', equivalenceSection(runs));
    writeFileSync(PAGE, await formatMarkdown(page, PAGE));
    process.stderr.write(`Wrote data/equivalence/${options.fit}.json and updated VALIDATION.md.\n`);
  } else {
    writeFileSync(join(OUT, `${options.fit}-${options.trials}.json`), `${JSON.stringify(run, null, 2)}\n`);
    process.stderr.write('A shortened run: data/equivalence/ and VALIDATION.md are left as they were.\n');
  }
}
