// npm run harness -- --checkpoint <n> [--checkpoint <m>] [--jobs N] [--trials N] [--seconds S]
// npm run harness -- --sensitivity [--jobs N] [--trials N] [--seconds S]
// npm run harness -- --wiring <real|N> [--jobs N]
// npm run harness -- --checkpoint 6
//
// Checkpoint 6, the wiring test (DECISIONS.md, 2026-10-03): --wiring grades a brain at its fit, the real wiring at the
// registry's values or the primary null's rewiring N at its record's first pick, on the machine its search ran on:
// checkpoint 1 on seeds 1 to 20 with the runs that show what paces it, and, if it crawls, checkpoints 0 and 2 to 5 by
// their own protocols, writing its summary to data/checkpoint-6/ (scripts/harness/wiring.ts). --checkpoint 6 reads
// the eleven summaries and writes the verdict's section.
//
// The behavioural harness (PLAN §8): checkpoint 0, the silenced network, checkpoint 1, checkpoints 2 and 3, the
// touches, and checkpoint 4, chemotaxis (PLAN §7.2, §7.4), run on the CPU reference in parallel worker processes, one
// per core by default, on the calibrated parameters, or the provisional ones before calibration. Checkpoint 0 runs its
// 20 trials untouched and touched, each touch forking a sham twin, and 30 worms in the chemotaxis assay for 60 min
// each. Checkpoints 2 and 3 share one set of trials, up to 100 seeds each touched once during forward crawling,
// forking three ways (src/validation/touch.ts). Checkpoint 4 runs 100 worms for up to 60 min each, sensing the assay's
// field and again as their controls with AWC-ON's input off, with the mechanism's samples
// (src/validation/mechanism.ts). Checkpoint 5 runs 30 trials of 120 s for each lesion and the intact worm, and the
// touch trials for the intact worm and the lesions whose rows read touches (src/validation/lesions.ts). Each
// checkpoint's records and summary go to harness-out/checkpoint-<n>.json, and its
// section of VALIDATION.md is regenerated. --trials and --seconds shorten a run for a quick look, setting the trials'
// and the worms' numbers and lengths alike, and the touch trials' seeds and length; such a run leaves VALIDATION.md
// alone, since the checkpoints are fixed.
//
// --sensitivity runs the sensitivity settings (spec §2.4; PLAN §2.4, §3.2; src/validation/sensitivity.ts), of the
// uncertain signs, the scales and track S's rest: under each, checkpoint 1's trials and the same trials of the
// silenced network, reported and not graded, into harness-out/sensitivity.json and their own section of
// VALIDATION.md.

import { fork, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWormlightData, type WormlightData } from '../../src/data/schema.ts';
import { steadyField } from '../../src/sim/env/dish.ts';
import type { OdourField } from '../../src/sim/env/odour.ts';
import { CHOSEN_MODEL, partsOf } from '../../src/sim/trackS.ts';
import { CHOSEN_FORM } from '../../src/science/params.ts';
import { currentParams, isCalibrated, loopParams, type LoopParams } from '../../src/sim/world.ts';
import type { Values } from '../../src/validation/calibration.ts';
import { nullNetwork, NULLS } from '../../src/validation/wiringTest.ts';
import { CHECKPOINT_4, checkpoint4, runChemotaxis, type ChemotaxisRecord } from '../../src/validation/chemotaxis.ts';
import {
  checkpoint5,
  INTACT,
  LESION_SECONDS,
  LESION_TRIALS,
  lesionNeurons,
  PRIMARY,
  SECONDARY,
  TOUCHED,
} from '../../src/validation/lesions.ts';
import type { Network } from '../../src/sim/brain/network.ts';
import {
  CHECKPOINT_0_CHEMOTAXIS,
  CHECKPOINT_0_TOUCH,
  TOUCH_NEEDS,
  checkpoint0,
  checkpoint1,
  crawlingClause,
  outsideRange,
  pacing,
  touchSchedule,
  TRIAL_SECONDS,
  TRIALS,
} from '../../src/validation/checkpoints.ts';
import { MEASURE_FROM, VELOCITY_WINDOW } from '../../src/validation/motion.ts';
import { SETTINGS, settingNetwork, settingParams } from '../../src/validation/sensitivity.ts';
import {
  checkpoint2,
  checkpoint3,
  COPY_SECONDS,
  EARLIEST,
  runTouchTrial,
  TOUCH_SEEDS,
  type Checkpoint2,
  type Checkpoint3,
  type TouchTrialRecord,
} from '../../src/validation/touch.ts';
import { runTrial, type TrialRecord } from '../../src/validation/trial.ts';
import { formatMarkdown } from '../data/render.ts';
import { ROOT } from '../data/sources.ts';
import { commit } from './commit.ts';
import { gradeWiring, readSummaries, summaryPath, type Wiring } from './wiring.ts';
import { readPinned, readPostures } from './pinned.ts';
import {
  checkpoint0Section,
  checkpoint1Section,
  checkpoint2Section,
  checkpoint3Section,
  checkpoint4Section,
  checkpoint5Section,
  checkpoint6Section,
  replaceSection,
  sensitivitySection,
  type RunInfo,
  type SensitivityRow,
} from './report.ts';

const CHECKPOINTS = [0, 1, 2, 3, 4, 5] as const;
type Checkpoint = (typeof CHECKPOINTS)[number];

// A trial, the same trial touched (checkpoint 0 only), a worm in the chemotaxis assay (checkpoint 0 only), or a trial
// touched once during forward crawling, forking three ways (checkpoints 2 and 3, which share them), and the record
// each gives.
interface Records {
  trial: TrialRecord;
  touched: TrialRecord;
  assay: ChemotaxisRecord;
  touch: TouchTrialRecord;
  // Checkpoint 4's worms, sensing the field and as their controls, AWC-ON's input off.
  chemotaxis: ChemotaxisRecord;
  control: ChemotaxisRecord;
  // Checkpoint 5's trials, each arm lesioned as its job names or intact: spontaneous, with head angles, and touched as
  // checkpoints 2 and 3 touch.
  lesion: TrialRecord;
  lesionTouch: TouchTrialRecord;
}
type Kind = keyof Records;

interface Job {
  checkpoint: Checkpoint;
  kind: Kind;
  seed: number;
  seconds: number;
  // A sensitivity setting, whose brain the trial runs on; the real wiring without one.
  setting?: string;
  // Checkpoint 5's arm: a lesion's id, or 'intact' (src/validation/lesions.ts).
  lesion?: string;
  // Checkpoint 6's brain (DECISIONS.md, 2026-10-03): the primary null's rewiring, the real wiring without it; its fit's
  // values, the registry's without them; and neurons lesioned for a run that shows what paces it.
  rewiring?: number;
  values?: Values;
  lesions?: string[];
  // Which of the runs that show what paces the crawl a checkpoint 1 trial is, in `variants`' order.
  variant?: number;
}

interface Result {
  job: Job;
  record?: TrialRecord | ChemotaxisRecord | TouchTrialRecord;
  error?: string;
}

const DATA = join(ROOT, 'public/data/wormlight.v1.json');
const PAGE = join(ROOT, 'VALIDATION.md');

let cached: { data: WormlightData; postures: number[][] } | undefined;
// The loop's parameters a job runs: the registry's fit, a sensitivity setting's (src/validation/sensitivity.ts), or a
// checkpoint 6 brain's fit, on the chosen model.
export const jobParams = (setting?: string, values?: Values): LoopParams =>
  values
    ? { ...loopParams(values, CHOSEN_FORM), ...partsOf(CHOSEN_MODEL) }
    : setting === undefined
      ? currentParams()
      : settingParams(currentParams(), setting);

// A worker's latest sensitivity setting and its brain, as the settings come one after another.
let brain: { setting: string; network: Network } | undefined;
// The assay's steady field, solved once in each worker that runs a worm; every worm reads the same copy.
let assay: OdourField | undefined;

async function runJob(job: Job): Promise<TrialRecord | ChemotaxisRecord | TouchTrialRecord> {
  cached ??= {
    data: validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8'))),
    postures: await readPostures(),
  };
  if (job.setting !== undefined && brain?.setting !== job.setting) {
    brain = { setting: job.setting, network: settingNetwork(cached.data, job.setting) };
  }
  const key = job.rewiring === undefined ? undefined : `null ${job.rewiring}`;
  if (key && job.rewiring !== undefined && brain?.setting !== key) {
    brain = { setting: key, network: nullNetwork(cached.data, job.rewiring) };
  }
  const common = {
    seed: job.seed,
    seconds: job.seconds,
    params: jobParams(job.setting, job.values),
    silenced: job.checkpoint === 0,
    postures: cached.postures,
    ...((job.setting !== undefined || key) && brain ? { network: brain.network } : {}),
  };
  if (job.kind === 'assay') {
    assay ??= steadyField('assay');
    return runChemotaxis(cached.data, { ...common, odour: assay });
  }
  if (job.kind === 'touch') return runTouchTrial(cached.data, common);
  if (job.kind === 'lesion' || job.kind === 'lesionTouch') {
    const lesions = lesionNeurons(job.lesion ?? INTACT);
    return job.kind === 'lesion'
      ? runTrial(cached.data, { ...common, lesions, headAngles: true })
      : runTouchTrial(cached.data, { ...common, lesions });
  }
  if (job.kind === 'chemotaxis' || job.kind === 'control') {
    assay ??= steadyField('assay');
    return runChemotaxis(cached.data, { ...common, odour: assay, mechanism: true, control: job.kind === 'control' });
  }
  // Each touched trial's touches fork sham twins, as checkpoint 0's reruns grade them (PLAN §7.4).
  return runTrial(cached.data, {
    ...common,
    ...(job.kind === 'touched' ? { touches: touchSchedule(job.seed, job.seconds), shams: true } : {}),
    ...(job.lesions ? { lesions: job.lesions } : {}),
  });
}

function send(worker: ChildProcess, job: Job): Promise<Result> {
  return new Promise((resolve, reject) => {
    const onExit = (code: number | null): void =>
      reject(new Error(`a worker exited (${code}) during ${JSON.stringify(job)}`));
    worker.once('exit', onExit);
    worker.once('message', (r: Result) => {
      worker.off('exit', onExit);
      resolve(r);
    });
    worker.send(job);
  });
}

const USAGE =
  'npm run harness -- --checkpoint <0|1|2|3|4|5> [--checkpoint <n>] [--jobs N] [--trials N] [--seconds S], or -- --sensitivity [--jobs N] [--trials N] [--seconds S], or -- --wiring <real|1-10> [--jobs N], or -- --checkpoint 6';

// A whole number of at least `least`, written in plain digits.
function whole(flag: string, text: string | undefined, least: number): number {
  if (text === undefined || !/^\d+$/.test(text) || Number(text) < least) {
    throw new Error(`${flag} needs a whole number of at least ${least}`);
  }
  return Number(text);
}

export function parseArgs(given: readonly string[]): {
  checkpoints: Checkpoint[];
  sensitivity: boolean;
  jobs: number;
  trials: number;
  seconds: number;
  // Checkpoint 6 (DECISIONS.md, 2026-10-03): a wiring to grade, or the verdict to write.
  wiring?: Wiring;
  verdict: boolean;
} {
  // --sensitivity takes no value; the other options each take one.
  const sensitivity = given.includes('--sensitivity');
  const args = given.filter((a) => a !== '--sensitivity');
  const checkpoints: Checkpoint[] = [];
  const numbers = new Map<string, number>();
  let wiring: Wiring | undefined;
  let verdict = false;
  // A trial needs a velocity sample after its first 10 s, whose window ends half a second later.
  const least: Record<string, number> = { '--jobs': 1, '--trials': 1, '--seconds': MEASURE_FROM + VELOCITY_WINDOW };
  for (let a = 0; a < args.length; a += 2) {
    const [flag, text] = [args[a], args[a + 1]];
    if (flag === '--checkpoint' && text === '6') verdict = true;
    else if (flag === '--checkpoint') {
      const n = whole(flag, text, 0);
      if (!CHECKPOINTS.includes(n as Checkpoint)) {
        throw new Error(`the harness runs checkpoints ${CHECKPOINTS.join(', ')} and 6`);
      }
      checkpoints.push(n as Checkpoint);
    } else if (flag === '--wiring') {
      if (text !== 'real' && !NULLS.map(String).includes(text ?? '')) {
        throw new Error(`--wiring takes real or a rewiring from 1 to ${NULLS.length}; usage: ${USAGE}`);
      }
      wiring = text === 'real' ? 'real' : Number(text);
    } else if (flag in least) numbers.set(flag, whole(flag, text, least[flag]));
    else throw new Error(`unknown option ${flag}; usage: ${USAGE}`);
  }
  const modes = [sensitivity, checkpoints.length > 0, wiring !== undefined, verdict].filter(Boolean).length;
  if (modes > 1) throw new Error(`--sensitivity, --wiring and checkpoint 6 each run by itself; usage: ${USAGE}`);
  if (modes === 0) throw new Error(`say which checkpoint; usage: ${USAGE}`);
  // A wiring is graded by the checkpoints' own protocols, whole.
  if ((wiring !== undefined || verdict) && (numbers.has('--trials') || numbers.has('--seconds'))) {
    throw new Error(`checkpoint 6 runs the checkpoints whole, without --trials or --seconds; usage: ${USAGE}`);
  }
  const seconds = numbers.get('--seconds') ?? TRIAL_SECONDS;
  // Checkpoint 0's touch clause needs trials long enough for its first touch's windows.
  const fits = Math.ceil(CHECKPOINT_0_TOUCH.first + TOUCH_NEEDS);
  if (checkpoints.includes(0) && seconds < fits) throw new Error(`checkpoint 0 needs --seconds ${fits} or more`);
  // Checkpoints 2 and 3's touches come no earlier than 20 s, and need 3.5 s after them.
  const touches = Math.ceil(EARLIEST[0] + COPY_SECONDS);
  if (checkpoints.some((c) => c === 2 || c === 3) && seconds < touches) {
    throw new Error(`checkpoints 2 and 3 need --seconds ${touches} or more`);
  }
  return {
    checkpoints: [...new Set(checkpoints)].sort((x, y) => x - y),
    sensitivity,
    jobs: numbers.get('--jobs') ?? availableParallelism(),
    trials: numbers.get('--trials') ?? TRIALS,
    seconds,
    ...(wiring !== undefined ? { wiring } : {}),
    verdict,
  };
}

if (process.argv.includes('--worker')) {
  // A worker whose parent has gone stops.
  process.on('disconnect', () => process.exit());
  process.on('message', (job: Job) => {
    runJob(job).then(
      (record) => process.send?.({ job, record } satisfies Result),
      (e: unknown) => process.send?.({ job, error: String(e) } satisfies Result),
    );
  });
} else if (process.argv[1] === fileURLToPath(import.meta.url) && parseArgs(process.argv.slice(2)).verdict) {
  // Checkpoint 6's verdict, from the eleven summaries, which the grading's pull request merges before any is read.
  const { real, nulls, verdicts } = readSummaries();
  const section = checkpoint6Section(verdicts, real, nulls);
  process.stdout.write(`${section}\n\n`);
  writeFileSync(PAGE, await formatMarkdown(replaceSection(readFileSync(PAGE, 'utf8'), 6, section), PAGE));
  process.stderr.write('Updated VALIDATION.md.\n');
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  // A wiring's grading records the commit it ran at, so it runs only at one (DECISIONS.md, 2026-10-03).
  if (options.wiring !== undefined && /uncommitted/.test(commit())) {
    throw new Error("commit first: a wiring's grading records the commit it runs at");
  }
  const full = options.trials === TRIALS && options.seconds === TRIAL_SECONDS;
  // A full run's worms are the assay's; a shortened run's are as many and as long as its trials.
  const worms = full ? CHECKPOINT_0_CHEMOTAXIS.worms : options.trials;
  const wormSeconds = full ? CHECKPOINT_0_CHEMOTAXIS.seconds : options.seconds;
  const info: RunInfo = {
    date: new Date().toISOString().slice(0, 10),
    commit: commit(),
    calibrated: isCalibrated(),
    model: CHOSEN_MODEL,
    trials: options.trials,
    seconds: options.seconds,
    ...(options.checkpoints.includes(0) ? { worms, wormSeconds } : {}),
  };
  // Fetch the pinned files once here, so the workers read them from the cache.
  const postures = await readPostures();
  const basis = await readPinned('eigenworms');
  const jobs = (checkpoint: Checkpoint, kind: Kind, count: number, seconds: number): Job[] =>
    Array.from({ length: count }, (_, i) => ({ checkpoint, kind, seed: i + 1, seconds }));
  // Checkpoints 2 and 3 share their touch trials, run once whichever is asked for: up to 100 seeds in a full run, as
  // many as a shortened run's trials otherwise (PLAN §7.4).
  const touchSeeds = full ? TOUCH_SEEDS : options.trials;
  // Checkpoint 4's 100 worms for up to 60 min in a full run, as many and as long as a shortened run's trials otherwise.
  const assayWorms = full ? CHECKPOINT_4.worms : options.trials;
  const assaySeconds = full ? CHECKPOINT_4.seconds : options.seconds;
  // Checkpoint 5's 30 trials of 120 s for each arm in a full run, as many and as long as a shortened run's otherwise.
  const lesionTrials = full ? LESION_TRIALS : options.trials;
  const lesionSeconds = full ? LESION_SECONDS : options.seconds;
  // The longest first, so that no long run starts last.
  const queueFor = (checkpoints: readonly Checkpoint[]): Job[] => {
    const touching = checkpoints.some((c) => c === 2 || c === 3);
    return [
      ...checkpoints.flatMap((checkpoint) =>
        checkpoint === 0
          ? [
              ...jobs(0, 'assay', worms, wormSeconds),
              ...jobs(0, 'trial', options.trials, options.seconds),
              ...jobs(0, 'touched', options.trials, options.seconds),
            ]
          : checkpoint === 1
            ? jobs(1, 'trial', options.trials, options.seconds)
            : [],
      ),
      ...(touching ? jobs(2, 'touch', touchSeeds, options.seconds) : []),
      ...(checkpoints.includes(4)
        ? [...jobs(4, 'chemotaxis', assayWorms, assaySeconds), ...jobs(4, 'control', assayWorms, assaySeconds)]
        : []),
      ...(checkpoints.includes(5)
        ? [
            ...[INTACT, ...PRIMARY.map((l) => l.id), ...SECONDARY.map((l) => l.id)].flatMap((lesion) =>
              jobs(5, 'lesion', lesionTrials, lesionSeconds).map((job) => ({ ...job, lesion })),
            ),
            ...[INTACT, ...TOUCHED].flatMap((lesion) =>
              jobs(5, 'lesionTouch', touchSeeds, options.seconds).map((job) => ({ ...job, lesion })),
            ),
          ]
        : []),
    ].sort((a, b) => b.seconds - a.seconds);
  };
  const queue = queueFor(options.checkpoints);
  // The sensitivity runs' settings, each with checkpoint 1's trials and the silenced network's.
  const settings = options.sensitivity ? SETTINGS : [];
  // A setting the fit can't run refuses here, before any trial, rather than in a worker after the settings before it.
  for (const setting of settings) jobParams(setting.id);
  const perSetting = 2 * options.trials;
  // A wiring's grading: checkpoint 1's trials and its five variants, then, if it crawls, checkpoints 0 and 2 to 5.
  const graded = options.wiring === undefined ? 0 : 6 * options.trials + queueFor([0, 2, 4, 5]).length;
  const total = queue.length + settings.length * perSetting + graded;
  const results: Result[] = [];
  let done = 0;
  const started = Date.now();
  const self = fileURLToPath(import.meta.url);
  const workers = Array.from({ length: Math.min(options.jobs, total) }, () => fork(self, ['--worker']));
  // Run a queue over the workers, and give its results.
  const runAll = async (jobsQueue: Job[]): Promise<Result[]> => {
    const back: Result[] = [];
    const wanted = jobsQueue.length;
    try {
      await Promise.all(
        workers.map(async (worker) => {
          for (let job = jobsQueue.shift(); job; job = jobsQueue.shift()) {
            const result = await send(worker, job);
            if (result.error) {
              throw new Error(
                `${job.setting ? `${job.setting}, ` : ''}checkpoint ${job.checkpoint}, ${job.kind} ${job.seed}: ${result.error}`,
              );
            }
            back.push(result);
            process.stderr.write(`${++done}/${total}\r`);
          }
        }),
      );
    } catch (e) {
      // On a failure, stop the rest at once rather than letting them finish their trials.
      jobsQueue.length = 0;
      for (const worker of workers) worker.kill();
      throw e;
    }
    if (back.length !== wanted) throw new Error(`${back.length} of ${wanted} runs came back`);
    return back;
  };
  const rows: SensitivityRow[] = [];
  try {
    results.push(...(await runAll(queue)));
    if (options.wiring !== undefined) {
      const data = validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8')));
      const summary = await gradeWiring(options.wiring, data, { queueFor, runAll, basis, commit: info.commit });
      process.stdout.write(
        `${summary.wiring}: ${summary.fit ? `checkpoint 1 ${summary.checkpoint1?.grade ?? '—'}, ${summary.crawls ? 'crawls' : "doesn't crawl"}` : 'no fit'}; wrote ${relative(ROOT, summaryPath(options.wiring))}\n`,
      );
    }
    // One setting at a time, graded as its trials come back, so that no more than a setting's records are held.
    for (const setting of settings) {
      const back = await runAll([
        ...jobs(1, 'trial', options.trials, options.seconds).map((job) => ({ ...job, setting: setting.id })),
        ...jobs(0, 'trial', options.trials, options.seconds).map((job) => ({ ...job, setting: setting.id })),
      ]);
      const of = (checkpoint: Checkpoint): TrialRecord[] =>
        back
          .filter((r) => r.job.checkpoint === checkpoint)
          .map((r) => r.record as TrialRecord)
          .sort((a, b) => a.seed - b.seed);
      rows.push({
        label: setting.label,
        checkpoint1: checkpoint1(of(1), basis),
        silenced: crawlingClause(of(0)),
        silencedPacing: pacing(of(0)),
        silencedVoltages: outsideRange(of(0)),
      });
    }
  } finally {
    for (const worker of workers) worker.kill();
  }
  process.stderr.write(`${total} runs in ${((Date.now() - started) / 1000).toFixed(0)} s\n`);

  const out = join(ROOT, 'harness-out');
  mkdirSync(out, { recursive: true });
  let page = readFileSync(PAGE, 'utf8');
  if (options.sensitivity) {
    const section = sensitivitySection(rows, info);
    const file = join(out, full ? 'sensitivity.json' : `sensitivity-${options.trials}x${options.seconds}s.json`);
    writeFileSync(file, JSON.stringify({ ...info, settings: SETTINGS.map((s, k) => ({ ...s, ...rows[k] })) }) + '\n');
    process.stdout.write(`${section}\n\n`);
    if (full) page = replaceSection(page, 'sensitivity', section);
  }
  for (const checkpoint of options.checkpoints) {
    // Checkpoints 2 and 3 read the touch trials, queued under checkpoint 2.
    const of = <K extends Kind>(kind: K): Records[K][] =>
      results
        .filter((r) => r.job.checkpoint === (checkpoint === 3 ? 2 : checkpoint) && r.job.kind === kind)
        .map((r) => r.record as Records[K])
        .sort((a, b) => a.seed - b.seed);
    if (checkpoint === 5) {
      // Each arm's records, by lesion id.
      const byLesion = (kind: 'lesion' | 'lesionTouch'): Record<string, (TrialRecord | TouchTrialRecord)[]> => {
        const out: Record<string, (TrialRecord | TouchTrialRecord)[]> = {};
        for (const r of results.filter((x) => x.job.checkpoint === 5 && x.job.kind === kind)) {
          (out[r.job.lesion ?? INTACT] ??= []).push(r.record as TrialRecord | TouchTrialRecord);
        }
        for (const list of Object.values(out)) list.sort((a, b) => a.seed - b.seed);
        return out;
      };
      const [spont, touched] = [byLesion('lesion'), byLesion('lesionTouch')];
      const file = join(out, full ? 'checkpoint-5.json' : `checkpoint-5-${options.trials}x${options.seconds}s.json`);
      const { date, commit: at, calibrated, model } = info;
      const head = {
        checkpoint,
        date,
        commit: at,
        calibrated,
        model,
        trials: lesionTrials,
        seconds: lesionSeconds,
        seeds: touchSeeds,
      };
      writeFileSync(file, JSON.stringify({ ...head, spontaneous: spont, touches: touched }) + '\n');
      const summary = checkpoint5(
        spont as Record<string, TrialRecord[]>,
        touched as Record<string, TouchTrialRecord[]>,
      );
      const section = checkpoint5Section(summary, { ...info, trials: lesionTrials, seconds: lesionSeconds });
      writeFileSync(
        file,
        JSON.stringify({ ...head, summary: { ...summary, trials: undefined }, spontaneous: spont, touches: touched }) +
          '\n',
      );
      process.stdout.write(`${section}\n\n`);
      if (full) page = replaceSection(page, checkpoint, section);
      continue;
    }
    if (checkpoint === 4) {
      const [intact, control] = [of('chemotaxis'), of('control')];
      const file = join(out, full ? 'checkpoint-4.json' : `checkpoint-4-${options.trials}x${options.seconds}s.json`);
      const { date, commit: at, calibrated, model } = info;
      const head = { checkpoint, date, commit: at, calibrated, model, worms: assayWorms, seconds: assaySeconds };
      writeFileSync(file, JSON.stringify({ ...head, intact, control }) + '\n');
      const summary = checkpoint4(intact, control);
      const section = checkpoint4Section(summary, { ...info, worms: assayWorms, wormSeconds: assaySeconds });
      // The summary repeats the runs, which the records already hold, so it leaves them out.
      writeFileSync(
        file,
        JSON.stringify({ ...head, summary: { ...summary, runs: undefined }, intact, control }) + '\n',
      );
      process.stdout.write(`${section}\n\n`);
      if (full) page = replaceSection(page, checkpoint, section);
      continue;
    }
    if (checkpoint === 2 || checkpoint === 3) {
      const records = of('touch');
      const file = join(
        out,
        full ? `checkpoint-${checkpoint}.json` : `checkpoint-${checkpoint}-${options.trials}x${options.seconds}s.json`,
      );
      // The touch trials' run: its seeds, where the other checkpoints' give their trials.
      const { date, commit: at, calibrated, model, seconds } = info;
      const head = { checkpoint, date, commit: at, calibrated, model, seconds, seeds: touchSeeds };
      writeFileSync(file, JSON.stringify({ ...head, records }) + '\n');
      const summary = checkpoint === 2 ? checkpoint2(records) : checkpoint3(records);
      const section =
        checkpoint === 2
          ? checkpoint2Section(summary as Checkpoint2, info)
          : checkpoint3Section(summary as Checkpoint3, info);
      writeFileSync(file, JSON.stringify({ ...head, summary, records }) + '\n');
      process.stdout.write(`${section}\n\n`);
      if (full) page = replaceSection(page, checkpoint, section);
      continue;
    }
    const trials = of('trial');
    const touched = of('touched');
    const assayed = of('assay');
    const records = checkpoint === 0 ? { trials, touched, worms: assayed } : trials;
    const file = join(
      out,
      full ? `checkpoint-${checkpoint}.json` : `checkpoint-${checkpoint}-${options.trials}x${options.seconds}s.json`,
    );
    const head = { checkpoint, ...info, postures: postures.length };
    // The records first, so that a failure in grading or in the report loses no run.
    writeFileSync(file, JSON.stringify({ ...head, records }) + '\n');
    const summary = checkpoint === 0 ? checkpoint0(trials, touched, assayed) : checkpoint1(trials, basis);
    const section =
      checkpoint === 0
        ? checkpoint0Section(summary as ReturnType<typeof checkpoint0>, info)
        : checkpoint1Section(summary as ReturnType<typeof checkpoint1>, info);
    writeFileSync(file, JSON.stringify({ ...head, summary, records }) + '\n');
    process.stdout.write(`${section}\n\n`);
    if (full) page = replaceSection(page, checkpoint, section);
  }
  if (full && options.wiring === undefined) {
    writeFileSync(PAGE, await formatMarkdown(page, PAGE));
    process.stderr.write('Updated VALIDATION.md.\n');
  } else if (options.wiring === undefined) process.stderr.write('A shortened run: VALIDATION.md is left as it was.\n');
}
