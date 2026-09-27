// npm run calibrate -- [--budget N] [--jobs N]
//
// PLAN §7.3's calibration of the planned model's eight parameters, research track R's first step (PLAN §9):
// CMA-ES over the parameters mapped onto [0, 1], each candidate scored on 4 trials of 120 s on the CPU
// reference, seeds 1001 to 1004, in parallel worker processes, one per core by default. At the budget's end,
// the ten best candidates and the final mean are run again on 16 fresh seeds, and the best there is final.
// Everything goes to harness-out/calibration-planned.json. --budget shortens a run for a look.

import { fork, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWormlightData, type WormlightData } from '../../src/data/schema.ts';
import { CALIBRATED, loopParams } from '../../src/sim/world.ts';
import {
  CALIBRATION,
  best,
  fromUnit,
  measure,
  objective,
  outside,
  type KinematicRecord,
  type Measures,
  type Score,
  type Values,
} from '../../src/validation/calibration.ts';
import { Cmaes } from '../../src/validation/cmaes.ts';
import { runTrial } from '../../src/validation/trial.ts';
import { ROOT } from '../data/sources.ts';
import { readPostures } from '../harness/pinned.ts';

interface Job {
  values: Values;
  seed: number;
}

interface Result {
  job: Job;
  record?: KinematicRecord;
  error?: string;
}

const DATA = join(ROOT, 'public/data/wormlight.v1.json');

let cached: { data: WormlightData; postures: number[][] } | undefined;

async function runJob(job: Job): Promise<KinematicRecord> {
  cached ??= { data: validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8'))), postures: await readPostures() };
  const r = runTrial(cached.data, {
    seed: job.seed,
    seconds: CALIBRATION.trialSeconds,
    params: loopParams(job.values),
    postures: cached.postures,
  });
  // Only what the objective reads.
  return { finite: r.finite, velocity: r.velocity, mid: r.mid, front: r.front, rear: r.rear };
}

// A pool of worker processes, each taking one trial at a time.
class Pool {
  private readonly idle: ChildProcess[];
  private readonly waiting: { job: Job; resolve: (r: KinematicRecord) => void; reject: (e: Error) => void }[] = [];
  constructor(workers: ChildProcess[]) {
    this.idle = [...workers];
  }
  run(job: Job): Promise<KinematicRecord> {
    return new Promise((resolve, reject) => {
      this.waiting.push({ job, resolve, reject });
      this.next();
    });
  }
  private next(): void {
    while (this.idle.length > 0 && this.waiting.length > 0) {
      const worker = this.idle.pop() as ChildProcess;
      const { job, resolve, reject } = this.waiting.shift() as (typeof this.waiting)[number];
      const onExit = (code: number | null): void => reject(new Error(`a worker exited (${code}) on seed ${job.seed}`));
      worker.once('exit', onExit);
      worker.once('message', (r: Result) => {
        worker.off('exit', onExit);
        this.idle.push(worker);
        if (r.error || !r.record) reject(new Error(`seed ${job.seed}: ${r.error ?? 'no record'}`));
        else resolve(r.record);
        this.next();
      });
      worker.send(job);
    }
  }
}

// A candidate's score on some seeds: its trials' pooled measures and the objective.
async function score(pool: Pool, values: Values, seeds: readonly number[]): Promise<{ measures: Measures } & Score> {
  const records = await Promise.all(seeds.map((seed) => pool.run({ values, seed })));
  const measures = measure(records);
  return { measures, ...objective(measures) };
}

const USAGE = 'npm run calibrate -- [--budget N] [--jobs N]';

export function parseArgs(args: readonly string[]): { budget: number; jobs: number } {
  const out = { budget: CALIBRATION.budget as number, jobs: availableParallelism() };
  for (let a = 0; a < args.length; a += 2) {
    const [flag, text] = [args[a], args[a + 1]];
    if ((flag !== '--budget' && flag !== '--jobs') || text === undefined || !/^\d+$/.test(text) || Number(text) < 1) {
      throw new Error(`usage: ${USAGE}`);
    }
    out[flag === '--budget' ? 'budget' : 'jobs'] = Number(text);
  }
  return out;
}

const fixed = (x: number): string => (Math.abs(x) >= 100 ? x.toFixed(1) : x.toPrecision(4));

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
  await readPostures(); // fetch once here, so the workers read the cache
  const self = fileURLToPath(import.meta.url);
  const workers = Array.from({ length: options.jobs }, () => fork(self, ['--worker']));
  const pool = new Pool(workers);
  const started = Date.now();
  const n = CALIBRATED.length;
  const es = new Cmaes({
    mean: new Array<number>(n).fill(CALIBRATION.start),
    sigma: CALIBRATION.sigma,
    seed: CALIBRATION.seed,
  });
  const evaluated: {
    generation: number;
    candidate: number;
    unit: number[];
    values: Values;
    value: number;
    penalty: number;
    errors: Score['errors'];
    measures: Measures;
  }[] = [];
  const generations: {
    generation: number;
    evaluations: number;
    best: number;
    median: number;
    sigma: number;
    mean: number[];
  }[] = [];
  try {
    while (evaluated.length < options.budget) {
      const candidates = es.ask();
      const take = Math.min(candidates.length, options.budget - evaluated.length);
      const scores = await Promise.all(
        candidates.slice(0, take).map((u) => score(pool, fromUnit(u), CALIBRATION.fitSeeds)),
      );
      scores.forEach((s, k) => {
        const u = candidates[k];
        evaluated.push({
          generation: es.generation,
          candidate: k,
          unit: u,
          values: fromUnit(u),
          value: s.value,
          penalty: outside(u),
          errors: s.errors,
          measures: s.measures,
        });
      });
      const values = scores.map((s, k) => s.value + outside(candidates[k]));
      const sorted = [...values].sort((a, b) => a - b);
      const bestSoFar = Math.min(...evaluated.map((e) => e.value));
      generations.push({
        generation: es.generation,
        evaluations: evaluated.length,
        best: bestSoFar,
        median: sorted[Math.floor(sorted.length / 2)],
        sigma: es.sigma,
        mean: [...es.mean],
      });
      process.stderr.write(
        `generation ${es.generation}: ${evaluated.length}/${options.budget} evaluations, best ${bestSoFar.toFixed(4)}, σ ${es.sigma.toFixed(4)}, ${((Date.now() - started) / 1000).toFixed(0)} s\n`,
      );
      // A generation cut short by the budget doesn't update the search.
      if (take === candidates.length) es.tell(values);
    }
    // The final check: the ten best candidates and the final mean, on fresh seeds.
    const finalists = [
      ...best(evaluated, CALIBRATION.rechecked).map((e) => ({
        from: `generation ${e.generation}, candidate ${e.candidate}`,
        values: e.values,
        fit: e.value,
      })),
      { from: 'the final mean', values: fromUnit(es.mean), fit: null as number | null },
    ];
    const checked = [];
    for (const f of finalists) checked.push({ ...f, ...(await score(pool, f.values, CALIBRATION.checkSeeds)) });
    const final = checked.reduce((a, b) => (b.value < a.value ? b : a));
    const out = join(ROOT, 'harness-out');
    mkdirSync(out, { recursive: true });
    const file = join(out, full ? 'calibration-planned.json' : `calibration-planned-${options.budget}.json`);
    writeFileSync(
      file,
      JSON.stringify({
        model: 'planned',
        budget: options.budget,
        calibration: CALIBRATION,
        generations,
        evaluated,
        checked,
        final,
      }) + '\n',
    );
    process.stderr.write(
      `${evaluated.length} evaluations and the final check in ${((Date.now() - started) / 1000).toFixed(0)} s; wrote ${file}\n`,
    );
    process.stdout.write('The final check, on seeds 1005 to 1020:\n');
    for (const c of checked) {
      process.stdout.write(
        `  ${c.value.toFixed(4)} (fit ${c.fit === null ? '—' : c.fit.toFixed(4)})  ${c.from}: bouts ${c.measures.bouts}, f ${c.measures.frequency?.toFixed(3) ?? '—'} Hz, λ ${c.measures.wavelength?.toFixed(2) ?? '—'}, v ${c.measures.speed.toFixed(3)}, reversals ${c.measures.reversalRate.toFixed(2)}/min\n`,
      );
    }
    process.stdout.write(`Final, from ${final.from}:\n`);
    for (const id of CALIBRATED) process.stdout.write(`  ${id}: ${fixed(final.values[id])}\n`);
  } finally {
    for (const worker of workers) worker.kill();
  }
}
