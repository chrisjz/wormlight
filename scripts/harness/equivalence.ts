// npm run equivalence -- --fit <refit|round-2|planned|round-3|track-s> [--pick N] [--jobs N] [--trials N]
//
// PLAN §7.2's comparison with the noise on (the paragraph after its table, set 2026-09-28 before it first ran): a
// fit's 200 trials of 120 s at the model's step dt and at dt/2, seeds 1 to 200, each step in a copy of the
// committed tree with its step changed (scripts/experiments/trees.ts), then each clause's percentile interval for
// the difference (src/validation/equivalence.ts). R's fits take their values from their committed records, the refit
// from data/calibration/r2.json, the second round's from r3.json and round 3's picks from r5.json, whatever the
// registry holds; the planned fit is src/science/planned.ts's, with its white noise. A full run writes
// data/equivalence/<fit>.json, round-3-pick-<N>.json for round 3's, and regenerates VALIDATION.md's section from every
// fit's file, and refuses while that fit's record exists, since those were made under checkpoint 1's plain count of
// crossings (DECISIONS.md, 2026-10-01); --trials shortens a run for a look, writing only to harness-out/. Trees and
// records go to harness-out/equivalence/, in folders named by a hash of the sources the trials depend on (treeSource),
// so a run at other sources never touches another's, and a set is reused whole or in part while its manifest
// matches. Each tree carries its sources, which every trial checks before it runs.
//
// Round 3's picks take the comparison in their order, down the four until one passes (PLAN §9): a full run of pick N
// needs picks 1 to N − 1 to have failed it, at their recorded values. The first to pass is round 3's fit. Its run
// then grades checkpoint 1 from the comparison's first 20 trials at dt, adds the speed's interval, and runs those
// trials again with the head switch off and at its lower bound and with the B-types, the A-types, and AVBL and AVBR
// lesioned (PLAN §7.4), writing data/calibration/r5-chosen.json; VALIDATION.md's checkpoint 1 section waits until
// the harness runs the fit from the registry.
//
// Track S's picks (`--fit track-s`, from data/calibration/s1.json) take it the same way, on track S's model, its
// measured signs, the D-types' offset and its rectifier, which each trial switches on in its tree; their records are
// track-s-pick-<N>.json, and the first to pass writes data/calibration/s1-chosen.json (DECISIONS.md, 2026-10-01). Every
// record a run writes names checkpoint 1's frequency band, on which it grades.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateWormlightData } from '../../src/data/schema.ts';
import { NEURAL_STEP } from '../../src/sim/numerics.ts';
import type { Model } from '../../src/sim/trackS.ts';
import { CALIBRATED, type Form, type LoopParams } from '../../src/sim/world.ts';
import { bounds, THIRD_ROUND, TRACK_S_ROUND, type Values } from '../../src/validation/calibration.ts';
import { checkpoint1, SEEDS, summariseTrial, TRIAL_SECONDS } from '../../src/validation/checkpoints.ts';
import {
  atSpeedFloor,
  compareSteps,
  EQUIVALENCE,
  EQUIVALENCE_SEEDS,
  speedInterval,
} from '../../src/validation/equivalence.ts';
import { FREQUENCY_BAND } from '../../src/validation/motion.ts';
import type { TrialRecord } from '../../src/validation/trial.ts';
import { formatJson, formatMarkdown } from '../data/render.ts';
import { ROOT } from '../data/sources.ts';
import { buildTree, forkPool, prepareSet, treeSource, writeWhole } from '../experiments/trees.ts';
import { commit } from './commit.ts';
import { readPinned } from './pinned.ts';
import { chosenSection, equivalenceSection, replaceSection, type ChosenReport, type EquivalenceRun } from './report.ts';

type Fit = EquivalenceRun['fit'];
const FITS: readonly Fit[] = ['refit', 'round-2', 'planned', 'round-3', 'track-s'];
// Where each calibrated fit is recorded, by its calibration's summary.
const RECORDS: Partial<Record<Fit, string>> = {
  refit: 'data/calibration/r2.json',
  'round-2': 'data/calibration/r3.json',
  'round-3': 'data/calibration/r5.json',
  'track-s': 'data/calibration/s1.json',
};
// The fits whose calibrations give four picks, each taking the comparison in order (PLAN §9), and where the first to
// pass is recorded.
const PICKED: Partial<Record<Fit, { count: number; chosen: string }>> = {
  'round-3': { count: THIRD_ROUND.phase2.continued, chosen: join(ROOT, 'data/calibration/r5-chosen.json') },
  'track-s': { count: TRACK_S_ROUND.phase2.continued, chosen: join(ROOT, 'data/calibration/s1-chosen.json') },
};
export const picked = (fit: Fit): boolean => PICKED[fit] !== undefined;
// The model a fit runs: track S's for its calibration's picks, track R's for every other.
export const modelOf = (fit: Fit): Model => (fit === 'track-s' ? 'track S' : 'track R');
const STEPS: [number, number] = [NEURAL_STEP, NEURAL_STEP / 2];
const OUT = join(ROOT, 'harness-out', 'equivalence');
const RESULTS = join(ROOT, 'data', 'equivalence');
const PAGE = join(ROOT, 'VALIDATION.md');
const STAMP = '.source';
// A short name for a set of sources, for the folders.
const keyOf = (source: string): string => createHash('sha1').update(source).digest('hex').slice(0, 10);
const tree = (step: number, source: string): string => join(OUT, `tree-${Math.round(step * 1e6)}us-${keyOf(source)}`);
// A fit's name in files and folders: a picked fit's carries its pick.
export const nameOf = (fit: Fit, pick: number): string => (picked(fit) ? `${fit}-pick-${pick}` : fit);
const setDir = (name: string, step: number, source: string): string =>
  join(OUT, `${name}-${Math.round(step * 1e6)}us-${keyOf(source)}`);

// The committed results VALIDATION.md's section shows, in the runner's order: R's fits first, then round 3's picks,
// then track S's.
export function resultNames(): string[] {
  const picks = (fit: Fit): string[] => Array.from({ length: PICKED[fit]?.count ?? 0 }, (_, k) => nameOf(fit, k + 1));
  const names = [...FITS.filter((fit) => !picked(fit)), ...picks('round-3'), ...picks('track-s')];
  return existsSync(RESULTS) ? names.filter((name) => readdirSync(RESULTS).includes(`${name}.json`)) : [];
}

// A step's tree at these sources, built unless one carrying them is already there.
function ensureTree(step: number, source: string): string {
  const dir = tree(step, source);
  const stamp = join(dir, STAMP);
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === source) return dir;
  buildTree(dir, step);
  writeFileSync(stamp, source);
  return dir;
}

export interface Manifest {
  fit: Fit;
  // A picked fit's pick; absent for the other fits, so that their earlier manifests still match.
  pick?: number;
  // The model, named only when it isn't track R's, so that earlier manifests still match.
  model?: Model;
  // An R fit's values, from its record, so that a set is reused only for the values it ran; null for the planned fit.
  values: Values | null;
  // Its form, named only when it isn't the current form, so that earlier manifests still match (PLAN §4.3).
  form?: Form;
  // A run of the chosen pick's trials with neurons lesioned, or with g_sw changed in `values` (PLAN §7.4).
  variant?: string;
  lesions?: string[];
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
type TrackS = typeof import('../../src/sim/trackS.ts');

// A fit's parameters in a tree: a calibrated fit's recorded values, on its model, or the planned model's fit.
export function paramsOf(manifest: Manifest, world: World, planned: Planned, trackS: TrackS): LoopParams {
  if (manifest.values) {
    return {
      ...world.loopParams(manifest.values, manifest.form ?? 'current'),
      ...trackS.partsOf(manifest.model ?? 'track R'),
    };
  }
  return world.plannedParams(planned.PLANNED.calibrated);
}

interface CalibrationRecord {
  model?: string;
  complete?: boolean;
  form?: Form;
  final?: { values?: { [id: string]: unknown } };
  picks?: { seed: number; from: string; values?: { [id: string]: unknown } }[];
}

const readRecord = (fit: Fit): CalibrationRecord | null => {
  const record = RECORDS[fit];
  if (!record) return null;
  const path = join(ROOT, record);
  if (!existsSync(path)) throw new Error(`${fit} has no calibration yet: ${record} is missing`);
  return JSON.parse(readFileSync(path, 'utf8')) as CalibrationRecord;
};

// A calibrated fit's final values, from its calibration's committed summary, which must be a whole run of the fit's
// model with a value for every calibrated parameter, each within its bounds; for a picked fit, its pick's, from 1 in
// their order; null for the planned fit, whose values are src/science/planned.ts's.
export function valuesOf(fit: Fit, pick = 1): Values | null {
  const run = readRecord(fit);
  if (!run) return null;
  const record = RECORDS[fit] as string;
  if (!picked(fit)) return checkedValues(run, record);
  const chosen = run.picks?.[pick - 1];
  if (!chosen) throw new Error(`${record} has no pick ${pick}`);
  return checkedValues({ ...run, final: chosen }, `${record}'s pick ${pick}`, modelOf(fit));
}

// An R fit's form, from its record: a record that names none is the current form, as every record before round 3.
export function formOf(fit: Fit): Form {
  return readRecord(fit)?.form ?? 'current';
}

// A calibration summary's final values, once it is known to be a whole run of the model, track R's unless named, with
// a value for every calibrated parameter, each within the model's bounds.
export function checkedValues(run: CalibrationRecord, record: string, model: Model = 'track R'): Values {
  if (!run.complete) throw new Error(`${record} isn't a whole run`);
  const fits = model === 'track R' ? run.model?.startsWith('track R') : run.model === model;
  if (!fits) throw new Error(`${record} isn't a fit of ${model}'s model`);
  const values = run.final?.values ?? {};
  const keys = Object.keys(values).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...CALIBRATED].sort())) {
    throw new Error(`${record}'s final values aren't the calibrated parameters`);
  }
  for (const id of CALIBRATED) {
    const v = values[id];
    const [lo, hi] = bounds(id, run.form ?? 'current', model);
    if (typeof v !== 'number' || !(v >= lo && v <= hi)) throw new Error(`${record}'s ${id} lies outside its bounds`);
  }
  return values as Values;
}

// A run's manifest at a step: its fit, a picked fit's pick, its model where it isn't track R's, its values and form,
// the sources its trees carry, and how long each trial runs.
export function manifestOf(
  run: { fit: Fit; pick: number; values: Values | null; form: Form; source: string },
  step: number,
): Manifest {
  const model = modelOf(run.fit);
  return {
    fit: run.fit,
    ...(picked(run.fit) ? { pick: run.pick } : {}),
    ...(model !== 'track R' ? { model } : {}),
    values: run.values,
    ...(run.form === 'conductance' ? { form: run.form } : {}),
    source: run.source,
    step,
    seconds: TRIAL_SECONDS,
    node: process.version,
  };
}

// Whether round 3's pick may take the comparison in full: only once each pick before it has failed it, at the values
// its record now holds (PLAN §9).
export function mayTake(
  pick: number,
  earlier: (k: number) => { values?: unknown; comparison?: { pass?: boolean } } | null,
  values: (k: number) => Values | null,
): boolean {
  for (let k = 1; k < pick; k++) {
    const run = earlier(k);
    if (!run || run.comparison?.pass !== false) return false;
    if (JSON.stringify(run.values) !== JSON.stringify(values(k))) return false;
  }
  return true;
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
  const trackS = await from<TrackS>('src/sim/trackS.ts');
  // The model a manifest names is its fit's, and the trial runs it, or the job stops.
  const model = job.manifest.model ?? 'track R';
  if (model !== modelOf(job.manifest.fit))
    throw new Error(`${job.manifest.fit}'s trials run ${modelOf(job.manifest.fit)}'s model, not ${model}'s`);
  const params = paramsOf(job.manifest, world, planned, trackS);
  if (trackS.trackSKey(params) !== trackS.trackSKey(trackS.partsOf(model))) {
    throw new Error(`a trial of ${job.manifest.fit} would run the model "${trackS.trackSKey(params)}"`);
  }
  const { runTrial } = await from<typeof import('../../src/validation/trial.ts')>('src/validation/trial.ts');
  const { readPostures } = await from<typeof import('./pinned.ts')>('scripts/harness/pinned.ts');
  const data = validateWormlightData(JSON.parse(readFileSync(join(job.tree, 'public/data/wormlight.v1.json'), 'utf8')));
  const record = runTrial(data, {
    seed: job.seed,
    seconds: job.manifest.seconds,
    params,
    lesions: job.manifest.lesions,
    postures: await readPostures(),
  });
  writeWhole(job.out, JSON.stringify(record));
}

// Whether a full run of `name` would replace a committed record. Those records were made under checkpoint 1's plain
// count of crossings, and no past comparison is graded again under the band that replaced it (PLAN §7.4, changed after
// results 2026-10-01, DECISIONS.md), so a full run refuses while one exists; moving it aside is a decision to rerun.
export const recorded = (name: string): boolean => existsSync(join(RESULTS, `${name}.json`));

const USAGE = 'npm run equivalence -- --fit <refit|round-2|planned|round-3|track-s> [--pick N] [--jobs N] [--trials N]';

// Every option given once, each with its value after it, so that a mistyped one can't run the full comparison.
export function parseArgs(args: readonly string[]): { fit: Fit; pick: number; jobs: number; trials: number } {
  const values = new Map<string, string>();
  for (let k = 0; k < args.length; k += 2) {
    const [flag, value] = [args[k], args[k + 1]];
    if (!['--fit', '--pick', '--jobs', '--trials'].includes(flag)) {
      throw new Error(`unknown option ${flag}; usage: ${USAGE}`);
    }
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value; usage: ${USAGE}`);
    if (values.has(flag)) throw new Error(`${flag} is given twice`);
    values.set(flag, value);
  }
  const fit = values.get('--fit') as Fit | undefined;
  if (fit === undefined || !FITS.includes(fit)) throw new Error(`usage: ${USAGE}`);
  if (values.has('--pick') && !picked(fit)) throw new Error("--pick is for round 3's and track S's picks alone");
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
    pick: whole('--pick', 1, PICKED[fit]?.count ?? 1, 1),
    jobs: whole('--jobs', 1, 1024, availableParallelism()),
    trials: whole('--trials', 2, EQUIVALENCE.trials, EQUIVALENCE.trials),
  };
}

// The runs that show what paces a crawl (PLAN §7.4): checkpoint 1's trials again with the head switch off and at its
// lower bound, and with classes lesioned, by name in the runtime data.
export function variants(
  neurons: readonly { name: string; oscillator?: string | null }[],
  values: Values,
  form: Form,
  model: Model = 'track R',
): { name: string; values: Values; lesions?: string[] }[] {
  const of = (c: string): string[] => neurons.filter((n) => n.oscillator === c).map((n) => n.name);
  return [
    { name: 'The head switch off, g_sw at 0', values: { ...values, headSwitchGain: 0 } },
    {
      name: 'g_sw at its lower bound',
      values: { ...values, headSwitchGain: bounds('headSwitchGain', form, model)[0] },
    },
    { name: `The ${of('B').length} B-types lesioned`, values, lesions: of('B') },
    { name: `The ${of('A').length} A-types lesioned`, values, lesions: of('A') },
    { name: 'AVBL and AVBR lesioned', values, lesions: ['AVBL', 'AVBR'] },
  ];
}

const readSet = (dir: string, seeds: readonly number[]): TrialRecord[] =>
  seeds.map((seed) => JSON.parse(readFileSync(join(dir, `${seed}.json`), 'utf8')) as TrialRecord);

if (process.argv[2] === '--worker') {
  await runJob(JSON.parse(process.argv[3]) as Job);
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const { fit, pick } = options;
  const picks = picked(fit);
  const model = modelOf(fit);
  const name = nameOf(fit, pick);
  const full = options.trials === EQUIVALENCE.trials;
  const committed = commit();
  if (/uncommitted/.test(committed)) throw new Error('commit first: the trees are taken from HEAD');
  const values = valuesOf(fit, pick);
  const form = values ? formOf(fit) : 'current';
  const earlier = (k: number): { values?: unknown; comparison?: { pass?: boolean } } | null => {
    const path = join(RESULTS, `${nameOf(fit, k)}.json`);
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { comparison?: { pass?: boolean } }) : null;
  };
  if (full && recorded(name)) {
    // A record that names no band was made under the plain count of crossings (DECISIONS.md, 2026-10-01).
    const banded = (JSON.parse(readFileSync(join(RESULTS, `${name}.json`), 'utf8')) as EquivalenceRun).frequencyBand;
    const why =
      banded === undefined
        ? ', under the plain count of crossings; no past comparison is run again under the band (DECISIONS.md, 2026-10-01)'
        : '';
    throw new Error(
      `data/equivalence/${name}.json already records this comparison${why}. Move it aside to rerun on purpose, or use --trials for a look.`,
    );
  }
  if (picks && full && !mayTake(pick, earlier, (k) => valuesOf(fit, k))) {
    throw new Error(`pick ${pick} takes the comparison only once picks 1 to ${pick - 1} have failed it (PLAN §9)`);
  }
  const source = treeSource();
  const seeds = EQUIVALENCE_SEEDS.slice(0, options.trials);
  mkdirSync(OUT, { recursive: true });
  const base = (step: number): Manifest => manifestOf({ fit, pick, values, form, source }, step);
  const run = async (sets: { dir: string; manifest: Manifest; seeds: readonly number[] }[]): Promise<void> => {
    const jobs: Job[] = [];
    for (const set of sets) {
      const at = ensureTree(set.manifest.step, source);
      for (const seed of prepareSet(set.dir, set.manifest, set.seeds)) {
        jobs.push({ tree: at, manifest: set.manifest, seed, out: join(set.dir, `${seed}.json`) });
      }
    }
    // The finer step's trials first, since they take longest.
    jobs.sort((a, b) => a.manifest.step - b.manifest.step);
    process.stderr.write(`${jobs.length} trials to run\n`);
    const started = Date.now();
    await forkPool(fileURLToPath(import.meta.url), jobs, options.jobs, (job) => {
      const what = job.manifest.variant ? `, ${job.manifest.variant}` : '';
      return `${nameOf(job.manifest.fit, job.manifest.pick ?? 1)}${what} at ${job.manifest.step * 1000} ms, seed ${job.seed}`;
    });
    process.stderr.write(`${jobs.length} trials in ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
  };
  await run(STEPS.map((step) => ({ dir: setDir(name, step, source), manifest: base(step), seeds })));

  const [coarse, fine] = STEPS.map((step) => readSet(setDir(name, step, source), seeds));
  const basis = await readPinned('eigenworms');
  const result: EquivalenceRun = {
    fit,
    ...(picks ? { pick } : {}),
    values,
    frequencyBand: FREQUENCY_BAND,
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
  const section = equivalenceSection([result]);
  process.stdout.write(`${section}\n\n`);
  if (full) {
    mkdirSync(RESULTS, { recursive: true });
    const file = join(RESULTS, `${name}.json`);
    writeFileSync(file, await formatJson(JSON.stringify({ ...result, source }), file));
    const runs = resultNames().map(
      (n) => JSON.parse(readFileSync(join(RESULTS, `${n}.json`), 'utf8')) as EquivalenceRun,
    );
    const page = replaceSection(readFileSync(PAGE, 'utf8'), 'equivalence', equivalenceSection(runs));
    writeFileSync(PAGE, await formatMarkdown(page, PAGE));
    process.stderr.write(`Wrote data/equivalence/${name}.json and updated VALIDATION.md.\n`);
  } else {
    writeFileSync(join(OUT, `${name}-${options.trials}.json`), `${JSON.stringify(result, null, 2)}\n`);
    process.stderr.write('A shortened run: data/equivalence/ and VALIDATION.md are left as they were.\n');
  }

  // Round 3's or track S's fit, the first pick to pass: checkpoint 1 from the comparison's first 20 trials at dt, the
  // speed's interval, and the runs that show what paces its crawl, at dt (PLAN §7.4, §9).
  const chosenAt = PICKED[fit]?.chosen;
  if (chosenAt && full && result.comparison.pass && values) {
    const own = coarse.slice(0, SEEDS.length);
    if (own.some((r, k) => r.seed !== SEEDS[k])) throw new Error("the comparison's first trials aren't checkpoint 1's");
    // The neurons by name as the trials' own tree holds them.
    const at = ensureTree(STEPS[0], source);
    const data = validateWormlightData(JSON.parse(readFileSync(join(at, 'public/data/wormlight.v1.json'), 'utf8')));
    const runs = variants(data.neurons, values, form, model).map((v) => ({
      ...v,
      dir: setDir(`${name}-${v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, STEPS[0], source),
      manifest: { ...base(STEPS[0]), values: v.values, variant: v.name, ...(v.lesions ? { lesions: v.lesions } : {}) },
    }));
    await run(runs.map((v) => ({ dir: v.dir, manifest: v.manifest, seeds: SEEDS })));
    const graded = checkpoint1(own, basis);
    const speed = speedInterval(own);
    const fineSpeed = result.comparison.clauses.find((c) => c.name === 'speed')?.fine ?? null;
    const record = (readRecord(fit) as CalibrationRecord).picks?.[pick - 1] as { seed: number; from: string };
    const report: ChosenReport = {
      ...(fit === 'track-s' ? { fit } : {}),
      frequencyBand: FREQUENCY_BAND,
      pick,
      seed: record.seed,
      from: record.from,
      values,
      date: result.date,
      commit: committed,
      checkpoint1: graded,
      speed: {
        value: speed.speed,
        interval: speed.interval,
        unmeasured: speed.unmeasured,
        fine: fineSpeed,
        // The label reads a partial alone (PLAN §7.4).
        atFloor: graded.grade === 'partial' ? atSpeedFloor(speed.interval, fineSpeed) : null,
      },
      variants: runs.map((v) => {
        const records = readSet(v.dir, SEEDS);
        const g = checkpoint1(records, basis);
        const trials = records.map(summariseTrial);
        const mean = (x: readonly number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
        return {
          name: v.name,
          grade: g.grade,
          clauses: g.clauses,
          forward: mean(trials.map((t) => t.forward)),
          meanVelocity: mean(trials.map((t) => t.meanVelocity)),
        };
      }),
    };
    writeFileSync(chosenAt, await formatJson(JSON.stringify({ ...report, source }), chosenAt));
    process.stdout.write(`${chosenSection(report)}\n\n`);
    process.stderr.write(
      `Wrote ${relative(ROOT, chosenAt)}: ${fit === 'track-s' ? 'track S' : 'round 3'} has its fit.\n`,
    );
  }
}
