// npm run harness -- --checkpoint <n> [--checkpoint <m>] [--jobs N] [--trials N] [--seconds S]
//
// The behavioural harness (PLAN §8): checkpoint 0's crawling clause and checkpoint 1 (PLAN §7.2, §7.4), run on
// the CPU reference in parallel worker processes, one per core by default, on the provisional parameters
// until calibration. Each checkpoint's records and summary go to harness-out/checkpoint-<n>.json, and its
// section of VALIDATION.md is regenerated. --trials and --seconds shorten a run for a quick look; such a
// run leaves VALIDATION.md alone, since the checkpoints are fixed at 20 trials of 120 s.

import { execFileSync, fork, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWormlightData, type WormlightData } from '../../src/data/schema.ts';
import { provisionalParams } from '../../src/sim/world.ts';
import { checkpoint0, checkpoint1, TRIAL_SECONDS, TRIALS } from '../../src/validation/checkpoints.ts';
import { POSTURE_ANGLES } from '../../src/validation/posture.ts';
import { runTrial, type TrialRecord } from '../../src/validation/trial.ts';
import { parseMatrix } from '../data/eigenworms.ts';
import { formatMarkdown } from '../data/render.ts';
import { loadSources, pinById, readFile, ROOT } from '../data/sources.ts';
import { checkpoint0Section, checkpoint1Section, replaceSection, type RunInfo } from './report.ts';

const CHECKPOINTS = [0, 1] as const;
type Checkpoint = (typeof CHECKPOINTS)[number];

interface Job {
  checkpoint: Checkpoint;
  seed: number;
  seconds: number;
}

interface Result {
  job: Job;
  record?: TrialRecord;
  error?: string;
}

const DATA = join(ROOT, 'public/data/wormlight.v1.json');
const PAGE = join(ROOT, 'VALIDATION.md');

// A pinned CSV of numbers, fetched or read from the cache and checked against its digest.
async function readPinned(id: string): Promise<number[][]> {
  const files = pinById(loadSources(), id).files;
  if (!files || files.length !== 1) throw new Error(`pin ${id} should hold one file`);
  return parseMatrix((await readFile(files[0])).toString('utf8'));
}

async function readPostures(): Promise<number[][]> {
  const postures = await readPinned('oist-postures');
  if (postures.some((p) => p.length !== POSTURE_ANGLES)) throw new Error(`postures need ${POSTURE_ANGLES} angles`);
  return postures;
}

let cached: { data: WormlightData; postures: number[][] } | undefined;

async function runJob(job: Job): Promise<TrialRecord> {
  cached ??= {
    data: validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8'))),
    postures: await readPostures(),
  };
  return runTrial(cached.data, {
    seed: job.seed,
    seconds: job.seconds,
    params: provisionalParams(),
    silenced: job.checkpoint === 0,
    postures: cached.postures,
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

function parseArgs(args: string[]): { checkpoints: Checkpoint[]; jobs: number; trials: number; seconds: number } {
  const checkpoints: Checkpoint[] = [];
  const numbers = new Map<string, number>();
  for (let a = 0; a < args.length; a += 2) {
    const value = Number(args[a + 1]);
    if (!Number.isFinite(value)) throw new Error(`${args[a]} needs a number`);
    if (args[a] === '--checkpoint') {
      if (!CHECKPOINTS.includes(value as Checkpoint))
        throw new Error(`the harness runs checkpoints ${CHECKPOINTS.join(' and ')}`);
      checkpoints.push(value as Checkpoint);
    } else if (['--jobs', '--trials', '--seconds'].includes(args[a])) numbers.set(args[a], value);
    else throw new Error(`unknown option ${args[a]}`);
  }
  if (checkpoints.length === 0) throw new Error('say which checkpoint: --checkpoint 0 or --checkpoint 1');
  return {
    checkpoints: [...new Set(checkpoints)].sort(),
    jobs: numbers.get('--jobs') ?? availableParallelism(),
    trials: numbers.get('--trials') ?? TRIALS,
    seconds: numbers.get('--seconds') ?? TRIAL_SECONDS,
  };
}

function commit(): string {
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  const head = git('rev-parse', '--short', 'HEAD');
  // Prose can't change a result, so Markdown, the page the harness writes included, doesn't count.
  const changes = git('status', '--porcelain', '--untracked-files=no', '--', '.', ':!*.md');
  return changes === '' ? head : `${head}, with uncommitted changes`;
}

if (process.argv.includes('--worker')) {
  process.on('message', (job: Job) => {
    runJob(job).then(
      (record) => process.send?.({ job, record } satisfies Result),
      (e: unknown) => process.send?.({ job, error: String(e) } satisfies Result),
    );
  });
} else {
  const options = parseArgs(process.argv.slice(2));
  // Fetch the pinned files once here, so the workers read them from the cache.
  const postures = await readPostures();
  const basis = await readPinned('eigenworms');
  const queue: Job[] = options.checkpoints.flatMap((checkpoint) =>
    Array.from({ length: options.trials }, (_, i) => ({ checkpoint, seed: i + 1, seconds: options.seconds })),
  );
  const total = queue.length;
  const results: Result[] = [];
  const started = Date.now();
  const self = fileURLToPath(import.meta.url);
  await Promise.all(
    Array.from({ length: Math.min(options.jobs, total) }, async () => {
      const worker = fork(self, ['--worker']);
      try {
        for (let job = queue.shift(); job; job = queue.shift()) {
          const result = await send(worker, job);
          if (result.error) {
            queue.length = 0;
            throw new Error(`checkpoint ${job.checkpoint}, seed ${job.seed}: ${result.error}`);
          }
          results.push(result);
          process.stderr.write(`${results.length}/${total}\r`);
        }
      } finally {
        worker.kill();
      }
    }),
  );
  process.stderr.write(`${total} trials in ${((Date.now() - started) / 1000).toFixed(0)} s\n`);

  const full = options.trials === TRIALS && options.seconds === TRIAL_SECONDS;
  const info: RunInfo = {
    date: new Date().toISOString().slice(0, 10),
    commit: commit(),
    trials: options.trials,
    seconds: options.seconds,
  };
  const out = join(ROOT, 'harness-out');
  mkdirSync(out, { recursive: true });
  let page = readFileSync(PAGE, 'utf8');
  for (const checkpoint of options.checkpoints) {
    const records = results
      .filter((r) => r.job.checkpoint === checkpoint)
      .map((r) => r.record as TrialRecord)
      .sort((a, b) => a.seed - b.seed);
    const summary = checkpoint === 0 ? checkpoint0(records) : checkpoint1(records, basis);
    const section =
      checkpoint === 0
        ? checkpoint0Section(summary as ReturnType<typeof checkpoint0>, info)
        : checkpoint1Section(summary as ReturnType<typeof checkpoint1>, info);
    const name = full
      ? `checkpoint-${checkpoint}.json`
      : `checkpoint-${checkpoint}-${options.trials}x${options.seconds}s.json`;
    writeFileSync(
      join(out, name),
      JSON.stringify({ checkpoint, ...info, postures: postures.length, summary, records }) + '\n',
    );
    process.stdout.write(`${section}\n\n`);
    if (full) page = replaceSection(page, checkpoint, section);
  }
  if (full) {
    writeFileSync(PAGE, await formatMarkdown(page, PAGE));
    process.stderr.write('Updated VALIDATION.md.\n');
  } else process.stderr.write('A shortened run: VALIDATION.md is left as it was.\n');
}
