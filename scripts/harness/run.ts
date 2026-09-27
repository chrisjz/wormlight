// npm run harness -- --checkpoint <n> [--checkpoint <m>] [--jobs N] [--trials N] [--seconds S]
//
// The behavioural harness (PLAN §8): checkpoint 0, the silenced network, and checkpoint 1 (PLAN §7.2, §7.4),
// run on the CPU reference in parallel worker processes, one per core by default, on the calibrated
// parameters, or the provisional ones before calibration. Checkpoint 0 runs its 20 trials untouched and touched, and 30 worms in the
// chemotaxis assay for 60 min each. Each checkpoint's records and summary go to
// harness-out/checkpoint-<n>.json, and its section of VALIDATION.md is regenerated. --trials and --seconds
// shorten a run for a quick look, setting the trials' and the worms' numbers and lengths alike; such a run
// leaves VALIDATION.md alone, since the checkpoints are fixed.

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
import {
  CHECKPOINT_0_CHEMOTAXIS,
  CHECKPOINT_0_TOUCH,
  TOUCH_NEEDS,
  checkpoint0,
  checkpoint1,
  touchSchedule,
  TRIAL_SECONDS,
  TRIALS,
} from '../../src/validation/checkpoints.ts';
import { MEASURE_FROM, VELOCITY_WINDOW } from '../../src/validation/motion.ts';
import { runTrial, type TrialRecord } from '../../src/validation/trial.ts';
import { formatMarkdown } from '../data/render.ts';
import { ROOT } from '../data/sources.ts';
import { commit } from './commit.ts';
import { readPinned, readPostures } from './pinned.ts';
import { checkpoint0Section, checkpoint1Section, replaceSection, type RunInfo } from './report.ts';

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
}

interface Result {
  job: Job;
  record?: TrialRecord | ChemotaxisRecord;
  error?: string;
}

const DATA = join(ROOT, 'public/data/wormlight.v1.json');
const PAGE = join(ROOT, 'VALIDATION.md');

let cached: { data: WormlightData; postures: number[][] } | undefined;
// The assay's steady field, solved once in each worker that runs a worm; every worm reads the same copy.
let assay: OdourField | undefined;

async function runJob(job: Job): Promise<TrialRecord | ChemotaxisRecord> {
  cached ??= {
    data: validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8'))),
    postures: await readPostures(),
  };
  const common = {
    seed: job.seed,
    seconds: job.seconds,
    params: currentParams(),
    silenced: job.checkpoint === 0,
    postures: cached.postures,
  };
  if (job.kind === 'assay') {
    assay ??= steadyField('assay');
    return runChemotaxis(cached.data, { ...common, odour: assay });
  }
  return runTrial(cached.data, {
    ...common,
    touches: job.kind === 'touched' ? touchSchedule(job.seed, job.seconds) : undefined,
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

const USAGE = 'npm run harness -- --checkpoint <0|1> [--checkpoint <0|1>] [--jobs N] [--trials N] [--seconds S]';

// A whole number of at least `least`, written in plain digits.
function whole(flag: string, text: string | undefined, least: number): number {
  if (text === undefined || !/^\d+$/.test(text) || Number(text) < least) {
    throw new Error(`${flag} needs a whole number of at least ${least}`);
  }
  return Number(text);
}

export function parseArgs(args: readonly string[]): {
  checkpoints: Checkpoint[];
  jobs: number;
  trials: number;
  seconds: number;
} {
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
  if (checkpoints.length === 0) throw new Error(`say which checkpoint; usage: ${USAGE}`);
  const seconds = numbers.get('--seconds') ?? TRIAL_SECONDS;
  // Checkpoint 0's touch clause needs trials long enough for its first touch's windows.
  const fits = Math.ceil(CHECKPOINT_0_TOUCH.first + TOUCH_NEEDS);
  if (checkpoints.includes(0) && seconds < fits) throw new Error(`checkpoint 0 needs --seconds ${fits} or more`);
  return {
    checkpoints: [...new Set(checkpoints)].sort((x, y) => x - y),
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
  const total = queue.length;
  const results: Result[] = [];
  const started = Date.now();
  const self = fileURLToPath(import.meta.url);
  const workers = Array.from({ length: Math.min(options.jobs, total) }, () => fork(self, ['--worker']));
  try {
    await Promise.all(
      workers.map(async (worker) => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          const result = await send(worker, job);
          if (result.error) {
            throw new Error(`checkpoint ${job.checkpoint}, ${job.kind} ${job.seed}: ${result.error}`);
          }
          results.push(result);
          process.stderr.write(`${results.length}/${total}\r`);
        }
      }),
    );
  } finally {
    // On a failure, stop the rest at once rather than letting them finish their trials.
    queue.length = 0;
    for (const worker of workers) worker.kill();
  }
  if (results.length !== total) throw new Error(`${results.length} of ${total} runs came back`);
  process.stderr.write(`${total} runs in ${((Date.now() - started) / 1000).toFixed(0)} s\n`);

  const out = join(ROOT, 'harness-out');
  mkdirSync(out, { recursive: true });
  let page = readFileSync(PAGE, 'utf8');
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
