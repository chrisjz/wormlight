// npm run harness -- --checkpoint <n> [--checkpoint <m>] [--jobs N] [--trials N] [--seconds S]
// npm run harness -- --sensitivity [--jobs N] [--trials N] [--seconds S]
//
// The behavioural harness (PLAN §8): checkpoint 0, the silenced network, and checkpoint 1 (PLAN §7.2, §7.4), run on the
// CPU reference in parallel worker processes, one per core by default, on the calibrated parameters, or the
// provisional ones before calibration. Checkpoint 0 runs its 20 trials untouched and touched, each touch forking a sham
// twin, and 30 worms in the chemotaxis assay for 60 min each. Each checkpoint's records and summary go to
// harness-out/checkpoint-<n>.json, and its section of VALIDATION.md is regenerated. --trials and --seconds shorten a
// run for a quick look, setting the trials' and the worms' numbers and lengths alike; such a run leaves VALIDATION.md
// alone, since the checkpoints are fixed.
//
// --sensitivity runs the sensitivity settings (spec §2.4; PLAN §2.4, §3.2; src/validation/sensitivity.ts): under
// each, checkpoint 1's trials and the same trials of the silenced network, reported and not graded, into
// harness-out/sensitivity.json and their own section of VALIDATION.md.

import { fork, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWormlightData, type WormlightData } from '../../src/data/schema.ts';
import { steadyField } from '../../src/sim/env/dish.ts';
import type { OdourField } from '../../src/sim/env/odour.ts';
import { currentParams, isCalibrated } from '../../src/sim/world.ts';
import { runChemotaxis, type ChemotaxisRecord } from '../../src/validation/chemotaxis.ts';
import type { Network } from '../../src/sim/brain/network.ts';
import {
  CHECKPOINT_0_CHEMOTAXIS,
  CHECKPOINT_0_TOUCH,
  TOUCH_NEEDS,
  checkpoint0,
  checkpoint1,
  crawlingClause,
  pacing,
  touchSchedule,
  TRIAL_SECONDS,
  TRIALS,
} from '../../src/validation/checkpoints.ts';
import { MEASURE_FROM, VELOCITY_WINDOW } from '../../src/validation/motion.ts';
import { SETTINGS, settingNetwork } from '../../src/validation/sensitivity.ts';
import { runTrial, type TrialRecord } from '../../src/validation/trial.ts';
import { formatMarkdown } from '../data/render.ts';
import { ROOT } from '../data/sources.ts';
import { commit } from './commit.ts';
import { readPinned, readPostures } from './pinned.ts';
import {
  checkpoint0Section,
  checkpoint1Section,
  replaceSection,
  sensitivitySection,
  type RunInfo,
  type SensitivityRow,
} from './report.ts';

const CHECKPOINTS = [0, 1] as const;
type Checkpoint = (typeof CHECKPOINTS)[number];

// A trial, the same trial touched (checkpoint 0 only), or a worm in the chemotaxis assay (checkpoint 0 only), and
// the record each gives.
interface Records {
  trial: TrialRecord;
  touched: TrialRecord;
  assay: ChemotaxisRecord;
}
type Kind = keyof Records;

interface Job {
  checkpoint: Checkpoint;
  kind: Kind;
  seed: number;
  seconds: number;
  // A sensitivity setting, whose brain the trial runs on; the real wiring without one.
  setting?: string;
}

interface Result {
  job: Job;
  record?: TrialRecord | ChemotaxisRecord;
  error?: string;
}

const DATA = join(ROOT, 'public/data/wormlight.v1.json');
const PAGE = join(ROOT, 'VALIDATION.md');

let cached: { data: WormlightData; postures: number[][] } | undefined;
// A worker's latest sensitivity setting and its brain, as the settings come one after another.
let brain: { setting: string; network: Network } | undefined;
// The assay's steady field, solved once in each worker that runs a worm; every worm reads the same copy.
let assay: OdourField | undefined;

async function runJob(job: Job): Promise<TrialRecord | ChemotaxisRecord> {
  cached ??= {
    data: validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8'))),
    postures: await readPostures(),
  };
  if (job.setting !== undefined && brain?.setting !== job.setting) {
    brain = { setting: job.setting, network: settingNetwork(cached.data, job.setting) };
  }
  const common = {
    seed: job.seed,
    seconds: job.seconds,
    params: currentParams(),
    silenced: job.checkpoint === 0,
    postures: cached.postures,
    ...(job.setting !== undefined && brain ? { network: brain.network } : {}),
  };
  if (job.kind === 'assay') {
    assay ??= steadyField('assay');
    return runChemotaxis(cached.data, { ...common, odour: assay });
  }
  // Each touched trial's touches fork sham twins, as checkpoint 0's reruns grade them (PLAN §7.4).
  return runTrial(cached.data, {
    ...common,
    ...(job.kind === 'touched' ? { touches: touchSchedule(job.seed, job.seconds), shams: true } : {}),
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
  'npm run harness -- --checkpoint <0|1> [--checkpoint <0|1>] [--jobs N] [--trials N] [--seconds S], or -- --sensitivity [--jobs N] [--trials N] [--seconds S]';

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
} {
  // --sensitivity takes no value; the other options each take one.
  const sensitivity = given.includes('--sensitivity');
  const args = given.filter((a) => a !== '--sensitivity');
  const checkpoints: Checkpoint[] = [];
  const numbers = new Map<string, number>();
  // A trial needs a velocity sample after its first 10 s, whose window ends half a second later.
  const least: Record<string, number> = { '--jobs': 1, '--trials': 1, '--seconds': MEASURE_FROM + VELOCITY_WINDOW };
  for (let a = 0; a < args.length; a += 2) {
    const [flag, text] = [args[a], args[a + 1]];
    if (flag === '--checkpoint') {
      const n = whole(flag, text, 0);
      if (!CHECKPOINTS.includes(n as Checkpoint))
        throw new Error(`the harness runs checkpoints ${CHECKPOINTS.join(' and ')}`);
      checkpoints.push(n as Checkpoint);
    } else if (flag in least) numbers.set(flag, whole(flag, text, least[flag]));
    else throw new Error(`unknown option ${flag}; usage: ${USAGE}`);
  }
  if (sensitivity && checkpoints.length > 0) throw new Error(`--sensitivity runs by itself; usage: ${USAGE}`);
  if (!sensitivity && checkpoints.length === 0) throw new Error(`say which checkpoint; usage: ${USAGE}`);
  const seconds = numbers.get('--seconds') ?? TRIAL_SECONDS;
  // Checkpoint 0's touch clause needs trials long enough for its first touch's windows.
  const fits = Math.ceil(CHECKPOINT_0_TOUCH.first + TOUCH_NEEDS);
  if (checkpoints.includes(0) && seconds < fits) throw new Error(`checkpoint 0 needs --seconds ${fits} or more`);
  return {
    checkpoints: [...new Set(checkpoints)].sort((x, y) => x - y),
    sensitivity,
    jobs: numbers.get('--jobs') ?? availableParallelism(),
    trials: numbers.get('--trials') ?? TRIALS,
    seconds,
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
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const full = options.trials === TRIALS && options.seconds === TRIAL_SECONDS;
  // A full run's worms are the assay's; a shortened run's are as many and as long as its trials.
  const worms = full ? CHECKPOINT_0_CHEMOTAXIS.worms : options.trials;
  const wormSeconds = full ? CHECKPOINT_0_CHEMOTAXIS.seconds : options.seconds;
  const info: RunInfo = {
    date: new Date().toISOString().slice(0, 10),
    commit: commit(),
    calibrated: isCalibrated(),
    trials: options.trials,
    seconds: options.seconds,
    ...(options.checkpoints.includes(0) ? { worms, wormSeconds } : {}),
  };
  // Fetch the pinned files once here, so the workers read them from the cache.
  const postures = await readPostures();
  const basis = await readPinned('eigenworms');
  const jobs = (checkpoint: Checkpoint, kind: Kind, count: number, seconds: number): Job[] =>
    Array.from({ length: count }, (_, i) => ({ checkpoint, kind, seed: i + 1, seconds }));
  // The longest first, so that no long run starts last.
  const queue: Job[] = options.checkpoints
    .flatMap((checkpoint) =>
      checkpoint === 0
        ? [
            ...jobs(0, 'assay', worms, wormSeconds),
            ...jobs(0, 'trial', options.trials, options.seconds),
            ...jobs(0, 'touched', options.trials, options.seconds),
          ]
        : jobs(checkpoint, 'trial', options.trials, options.seconds),
    )
    .sort((a, b) => b.seconds - a.seconds);
  // The sensitivity runs' settings, each with checkpoint 1's trials and the silenced network's.
  const settings = options.sensitivity ? SETTINGS : [];
  const perSetting = 2 * options.trials;
  const total = queue.length + settings.length * perSetting;
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
        silencedGate: pacing(of(0))?.open ?? null,
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
    const of = <K extends Kind>(kind: K): Records[K][] =>
      results
        .filter((r) => r.job.checkpoint === checkpoint && r.job.kind === kind)
        .map((r) => r.record as Records[K])
        .sort((a, b) => a.seed - b.seed);
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
  if (full) {
    writeFileSync(PAGE, await formatMarkdown(page, PAGE));
    process.stderr.write('Updated VALIDATION.md.\n');
  } else process.stderr.write('A shortened run: VALIDATION.md is left as it was.\n');
}
