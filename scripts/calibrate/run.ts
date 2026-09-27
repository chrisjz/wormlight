// npm run calibrate -- [--budget N] [--jobs N] [--resume]
//
// PLAN §7.3's calibration of the planned model's eight parameters, research track R's first step (PLAN §9):
// CMA-ES over the parameters mapped onto [0, 1], each candidate scored on 4 trials of 120 s on the CPU
// reference, seeds 1001 to 1004, in parallel worker processes, one per core by default. At the budget's end,
// the ten best candidates and the final mean are run again on 16 fresh seeds, and the best there is final.
//
// Everything goes to harness-out/calibration-planned.json (calibration-planned-<budget>.json for a shortened
// run), rewritten after every generation, so --resume can take a stopped run up again, replaying the
// generations it had. A full run also writes its summary, without the evaluations, to
// data/calibration/planned.json, which is committed: the registry's values must match its final ones.

import { fork, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWormlightData, type WormlightData } from '../../src/data/schema.ts';
import { CALIBRATED, loopParams } from '../../src/sim/world.ts';
import {
  CALIBRATION,
  ERROR_CAP,
  MAPPING,
  TARGETS,
  bounds,
  calibrate,
  measure,
  objective,
  type Evaluated,
  type KinematicRecord,
  type Values,
} from '../../src/validation/calibration.ts';
import { runTrial } from '../../src/validation/trial.ts';
import { formatJson } from '../data/render.ts';
import { ROOT } from '../data/sources.ts';
import { commit } from '../harness/commit.ts';
import { readPostures } from '../harness/pinned.ts';

interface Job {
  values: Values;
  seed: number;
}

// What a trial gives the objective, and its brain solves that didn't converge.
type TrialResult = KinematicRecord & { unconverged: number };

interface Result {
  job: Job;
  record?: TrialResult;
  error?: string;
}

const DATA = join(ROOT, 'public/data/wormlight.v1.json');
export const SUMMARY = join(ROOT, 'data/calibration/planned.json');

let cached: { data: WormlightData; postures: number[][] } | undefined;

async function runJob(job: Job): Promise<TrialResult> {
  cached ??= { data: validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8'))), postures: await readPostures() };
  const r = runTrial(cached.data, {
    seed: job.seed,
    seconds: CALIBRATION.trialSeconds,
    params: loopParams(job.values),
    postures: cached.postures,
  });
  // Only what the objective reads.
  return {
    finite: r.finite,
    velocity: r.velocity,
    mid: r.mid,
    front: r.front,
    rear: r.rear,
    unconverged: r.unconverged,
  };
}

// A pool of worker processes, each taking one trial at a time. A worker that dies fails the job it held, and
// is never handed another.
class Pool {
  private readonly idle: ChildProcess[];
  private readonly waiting: { job: Job; resolve: (r: TrialResult) => void; reject: (e: Error) => void }[] = [];
  constructor(workers: ChildProcess[]) {
    this.idle = [...workers];
    for (const worker of workers) {
      // A send to a dead worker reports through its callback below, not as an unhandled error.
      worker.on('error', () => undefined);
      worker.once('exit', () => {
        const k = this.idle.indexOf(worker);
        if (k >= 0) this.idle.splice(k, 1);
      });
    }
  }
  run(job: Job): Promise<TrialResult> {
    return new Promise((resolve, reject) => {
      this.waiting.push({ job, resolve, reject });
      this.next();
    });
  }
  private next(): void {
    while (this.idle.length > 0 && this.waiting.length > 0) {
      const worker = this.idle.pop() as ChildProcess;
      const { job, resolve, reject } = this.waiting.shift() as (typeof this.waiting)[number];
      const onExit = (code: number | null, signal: NodeJS.Signals | null): void =>
        reject(new Error(`a worker exited (${signal ?? code}) on seed ${job.seed}`));
      worker.once('exit', onExit);
      worker.once('message', (r: Result) => {
        worker.off('exit', onExit);
        this.idle.push(worker);
        if (r.error || !r.record) reject(new Error(`seed ${job.seed}: ${r.error ?? 'no record'}`));
        else resolve(r.record);
        this.next();
      });
      worker.send(job, (e) => {
        if (e) reject(new Error(`seed ${job.seed} couldn't reach its worker: ${e.message}`));
      });
    }
  }
}

const USAGE = 'npm run calibrate -- [--budget N] [--jobs N] [--resume]';

export function parseArgs(args: readonly string[]): { budget: number; jobs: number; resume: boolean } {
  const out = { budget: CALIBRATION.budget as number, jobs: availableParallelism(), resume: false };
  for (let a = 0; a < args.length; a++) {
    if (args[a] === '--resume') {
      out.resume = true;
      continue;
    }
    const [flag, text] = [args[a], args[a + 1]];
    if ((flag !== '--budget' && flag !== '--jobs') || text === undefined || !/^\d+$/.test(text) || Number(text) < 1) {
      throw new Error(`usage: ${USAGE}`);
    }
    out[flag === '--budget' ? 'budget' : 'jobs'] = Number(text);
    a++;
  }
  return out;
}

// What a run was: the settings a reader needs to interpret its units and scores.
export function settings(budget: number): Record<string, unknown> {
  return {
    model: 'planned',
    budget,
    calibration: CALIBRATION,
    bounds: Object.fromEntries(CALIBRATED.map((id) => [id, bounds(id)])),
    mapping: MAPPING,
    targets: TARGETS,
    errorCap: ERROR_CAP,
  };
}

// The committed summary: the run without its evaluations.
export function summary(run: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(run).filter(([key]) => key !== 'evaluated'));
}

if (process.argv.includes('--worker')) {
  process.on('disconnect', () => process.exit());
  process.on('message', (job: Job) => {
    runJob(job).then(
      (record) => process.send?.({ job, record } satisfies Result),
      (e: unknown) => process.send?.({ job, error: String(e) } satisfies Result),
    );
  });
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const full = options.budget === CALIBRATION.budget;
  const file = join(
    ROOT,
    'harness-out',
    full ? 'calibration-planned.json' : `calibration-planned-${options.budget}.json`,
  );
  let previous: Evaluated[] = [];
  if (options.resume) {
    if (!existsSync(file)) throw new Error(`there is no run to resume at ${file}`);
    previous = (JSON.parse(readFileSync(file, 'utf8')) as { evaluated: Evaluated[] }).evaluated;
    process.stderr.write(`resuming after ${previous.length} evaluations\n`);
  }
  await readPostures(); // fetch once here, so the workers read the cache
  const head = {
    ...settings(options.budget),
    commit: commit(),
    date: new Date().toISOString(),
    node: process.version,
    jobs: options.jobs,
  };
  const self = fileURLToPath(import.meta.url);
  const workers = Array.from({ length: options.jobs }, () => fork(self, ['--worker']));
  const pool = new Pool(workers);
  const started = Date.now();
  const elapsed = (): number => (Date.now() - started) / 1000;
  mkdirSync(dirname(file), { recursive: true });
  try {
    const fit = await calibrate(
      async (values, seeds) => {
        const records = await Promise.all(seeds.map((seed) => pool.run({ values, seed })));
        const measures = measure(records);
        return { measures, ...objective(measures), unconverged: records.reduce((n, r) => n + r.unconverged, 0) };
      },
      {
        budget: options.budget,
        previous,
        progress: ({ generations, evaluated }) => {
          const g = generations[generations.length - 1];
          writeFileSync(
            file,
            JSON.stringify({ ...head, complete: false, seconds: elapsed(), generations, evaluated }) + '\n',
          );
          process.stderr.write(
            `generation ${g.generation}: ${g.evaluations}/${options.budget} evaluations, best ${g.best.toFixed(4)}, σ ${g.sigma.toFixed(4)}, ${elapsed().toFixed(0)} s\n`,
          );
        },
      },
    );
    const run = { ...head, complete: true, seconds: elapsed(), ...fit };
    writeFileSync(file, JSON.stringify(run) + '\n');
    if (full) {
      mkdirSync(dirname(SUMMARY), { recursive: true });
      writeFileSync(SUMMARY, await formatJson(JSON.stringify(summary(run)), SUMMARY));
    }
    process.stderr.write(
      `${fit.evaluated.length} evaluations and the final check in ${elapsed().toFixed(0)} s; wrote ${file}\n`,
    );
    const seeds = CALIBRATION.checkSeeds;
    process.stdout.write(`The final check, on seeds ${seeds[0]} to ${seeds[seeds.length - 1]}:\n`);
    for (const c of fit.checked) {
      process.stdout.write(
        `  ${c.value.toFixed(4)} (fit ${c.fit === null ? '—' : c.fit.toFixed(4)})  ${c.from}: bouts ${c.measures.bouts}, f ${c.measures.frequency?.toFixed(3) ?? '—'} Hz, λ ${c.measures.wavelength?.toFixed(2) ?? '—'}, v ${c.measures.speed.toFixed(3)}, reversals ${c.measures.reversalRate.toFixed(2)}/min\n`,
      );
    }
    // Unrounded, as the registry takes them.
    process.stdout.write(`Final, from ${fit.final.from}:\n`);
    for (const id of CALIBRATED) process.stdout.write(`  ${id}: ${String(fit.final.values[id])}\n`);
  } finally {
    for (const worker of workers) worker.kill();
  }
}
