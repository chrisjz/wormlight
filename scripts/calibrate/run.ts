// npm run calibrate -- [--budget N] [--jobs N] [--resume] [--probe]
//
// PLAN §7.3's calibration of track R's model in R's second round (PLAN §9), in two stages. Stage 1, the crawl:
// CMA-ES with restarts over the twelve calibrated parameters mapped onto [0, 1], from their provisional values, on
// the frequency, wavelength and speed alone. Stage 2, the noise: σ_n and τ_n alone, the other ten held at stage 1's
// final values, on all four targets, stage 1's final values joining its final check. Each candidate is scored on 4
// trials of 120 s on the CPU reference, seeds 1001 to 1004, in parallel worker processes, one per core by default;
// at each stage's end the ten best candidates and the final mean are run again on 16 fresh seeds, and the best
// there is final. R's refit, the first round's, is data/calibration/r2.json, R's first fit r1.json, and the planned
// model's planned.json.
//
// Everything goes to harness-out/calibration-r3.json (calibration-r3-<budget>.json when --budget shortens stage 1),
// rewritten after every generation, so --resume can take a stopped run up again, replaying the generations it had.
// A full run also writes its summary, without the evaluations, to data/calibration/r3.json, which is committed.
//
// --probe runs stage 1 four times at 400 evaluations, with seeds 11 to 14, and grades each pick by checkpoint 1's
// grading on 20 trials of its own, seeds 2001 to 2020; the full run goes ahead if any grades at least partial. It
// writes data/calibration/r3-probe.json.

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
  SECOND_ROUND,
  TARGETS,
  bounds,
  calibrate,
  measure,
  objective,
  provisionalValues,
  type Evaluated,
  type Fit,
  type KinematicRecord,
  type Scorer,
  type Target,
  type Values,
} from '../../src/validation/calibration.ts';
import { checkpoint1 } from '../../src/validation/checkpoints.ts';
import { runTrial, type TrialRecord } from '../../src/validation/trial.ts';
import { formatJson } from '../data/render.ts';
import { ROOT } from '../data/sources.ts';
import { commit } from '../harness/commit.ts';
import { readPinned, readPostures } from '../harness/pinned.ts';

interface Job {
  values: Values;
  seed: number;
  // The whole record, for grading by checkpoint 1, not only what the objective reads.
  whole?: boolean;
}

// What a trial gives the objective, and its brain solves that didn't converge; or, for grading, the whole record.
type TrialResult = (KinematicRecord & { unconverged: number }) | TrialRecord;

interface Result {
  job: Job;
  record?: TrialResult;
  error?: string;
}

const DATA = join(ROOT, 'public/data/wormlight.v1.json');
export const SUMMARY = join(ROOT, 'data/calibration/r3.json');
export const PROBE = join(ROOT, 'data/calibration/r3-probe.json');

let cached: { data: WormlightData; postures: number[][] } | undefined;

async function runJob(job: Job): Promise<TrialResult> {
  cached ??= { data: validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8'))), postures: await readPostures() };
  const r = runTrial(cached.data, {
    seed: job.seed,
    seconds: CALIBRATION.trialSeconds,
    params: loopParams(job.values),
    postures: cached.postures,
  });
  if (job.whole) return r;
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

const USAGE = 'npm run calibrate -- [--budget N] [--jobs N] [--resume] [--probe]';

export function parseArgs(args: readonly string[]): { budget: number; jobs: number; resume: boolean; probe: boolean } {
  const out = {
    budget: SECOND_ROUND.crawl.budget as number,
    jobs: availableParallelism(),
    resume: false,
    probe: false,
  };
  for (let a = 0; a < args.length; a++) {
    if (args[a] === '--resume' || args[a] === '--probe') {
      out[args[a] === '--resume' ? 'resume' : 'probe'] = true;
      continue;
    }
    const [flag, text] = [args[a], args[a + 1]];
    if ((flag !== '--budget' && flag !== '--jobs') || text === undefined || !/^\d+$/.test(text) || Number(text) < 1) {
      throw new Error(`usage: ${USAGE}`);
    }
    out[flag === '--budget' ? 'budget' : 'jobs'] = Number(text);
    a++;
  }
  if (out.probe && (out.resume || out.budget !== SECOND_ROUND.crawl.budget)) {
    throw new Error(`--probe takes its own budget and can't resume; usage: ${USAGE}`);
  }
  return out;
}

// What a run was: the settings a reader needs to interpret its units and scores.
export function settings(budget: number): Record<string, unknown> {
  return {
    model: 'track R, round 2',
    budget: { crawl: budget, noise: SECOND_ROUND.noise.budget },
    calibration: CALIBRATION,
    secondRound: SECOND_ROUND,
    start: provisionalValues(),
    bounds: Object.fromEntries(CALIBRATED.map((id) => [id, bounds(id)])),
    mapping: MAPPING,
    targets: TARGETS,
    errorCap: ERROR_CAP,
  };
}

// The committed summary: the run without its evaluations, its stages' included.
export function summary(run: Record<string, unknown>): Record<string, unknown> {
  const without = (o: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(o)
        .filter(([key]) => key !== 'evaluated')
        .map(([key, v]) => [
          key,
          key === 'stages'
            ? Object.fromEntries(
                Object.entries(v as Record<string, Record<string, unknown>>).map(([k, stage]) => [k, without(stage)]),
              )
            : v,
        ]),
    );
  return without(run);
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
  const full = options.budget === SECOND_ROUND.crawl.budget;
  const name = options.probe
    ? 'calibration-r3-probe.json'
    : full
      ? 'calibration-r3.json'
      : `calibration-r3-${options.budget}.json`;
  const file = join(ROOT, 'harness-out', name);
  let previous: { crawl?: Evaluated[]; noise?: Evaluated[] } = {};
  if (options.resume) {
    if (!existsSync(file)) throw new Error(`there is no run to resume at ${file}`);
    const stages = (JSON.parse(readFileSync(file, 'utf8')) as { stages: Record<string, { evaluated: Evaluated[] }> })
      .stages;
    previous = { crawl: stages.crawl?.evaluated, noise: stages.noise?.evaluated };
    process.stderr.write(
      `resuming after ${previous.crawl?.length ?? 0} and ${previous.noise?.length ?? 0} evaluations\n`,
    );
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
  // A stage's scorer: the objective on its targets.
  const scorer =
    (targets: readonly Target[]): Scorer =>
    async (values, seeds) => {
      const records = (await Promise.all(seeds.map((seed) => pool.run({ values, seed })))) as (KinematicRecord & {
        unconverged: number;
      })[];
      const measures = measure(records);
      return { measures, ...objective(measures, targets), unconverged: records.reduce((n, r) => n + r.unconverged, 0) };
    };
  const stages: Record<string, Partial<Fit>> = {};
  const save = (complete: boolean, extra: Record<string, unknown> = {}): void =>
    writeFileSync(file, JSON.stringify({ ...head, complete, seconds: elapsed(), stages, ...extra }) + '\n');
  const report = (stage: string, budget: number) => (fit: Omit<Fit, 'checked' | 'final'>) => {
    stages[stage] = fit;
    save(false);
    const g = fit.generations[fit.generations.length - 1];
    process.stderr.write(
      `${stage} ${g.restart > 0 ? `restart ${g.restart} ` : ''}generation ${g.generation}: ${g.evaluations}/${budget} evaluations, best ${g.best.toFixed(4)}, σ ${g.sigma.toFixed(4)}, ${elapsed().toFixed(0)} s\n`,
    );
  };
  const describe = (fit: Fit, targets: readonly Target[]): void => {
    const seeds = CALIBRATION.checkSeeds;
    process.stdout.write(
      `The final check on ${targets.join(', ')}, on seeds ${seeds[0]} to ${seeds[seeds.length - 1]}:\n`,
    );
    for (const c of fit.checked) {
      process.stdout.write(
        `  ${c.value.toFixed(4)} (fit ${c.fit === null ? '—' : c.fit.toFixed(4)})  ${c.from}: bouts ${c.measures.bouts}, f ${c.measures.frequency?.toFixed(3) ?? '—'} Hz, λ ${c.measures.wavelength?.toFixed(2) ?? '—'}, v ${c.measures.speed.toFixed(3)}, reversals ${c.measures.reversalRate.toFixed(2)}/min\n`,
      );
    }
  };
  try {
    if (options.probe) {
      const { probe, crawl, restart } = SECOND_ROUND;
      const basis = await readPinned('eigenworms');
      const runs = [];
      for (const seed of probe.seeds) {
        const stage = `probe ${seed}`;
        const fit = await calibrate(scorer(crawl.targets), {
          budget: probe.budget,
          seed,
          restarts: restart,
          progress: report(stage, probe.budget),
        });
        stages[stage] = fit;
        describe(fit, crawl.targets);
        const records = (await Promise.all(
          probe.gradeSeeds.map((s) => pool.run({ values: fit.final.values, seed: s, whole: true })),
        )) as TrialRecord[];
        const graded = checkpoint1(records, basis);
        const clauses = graded.clauses.map((c) => ({ name: c.name, value: c.value, grade: c.grade }));
        runs.push({
          seed,
          restarts: Math.max(...fit.generations.map((g) => g.restart)),
          final: {
            from: fit.final.from,
            values: fit.final.values,
            value: fit.final.value,
            measures: fit.final.measures,
          },
          grade: graded.grade,
          clauses,
        });
        process.stdout.write(
          `probe ${seed}: ${graded.grade} on seeds 2001 to 2020 (${clauses.map((c) => `${c.name} ${c.value === null ? '—' : c.value.toFixed(3)} ${c.grade}`).join('; ')})\n`,
        );
      }
      const goAhead = runs.some((r) => r.grade !== 'fail');
      save(true, { runs, goAhead });
      // The committed record: each run's pick and grade, without the searches' evaluations.
      const record = { ...head, complete: true, seconds: elapsed(), runs, goAhead };
      writeFileSync(PROBE, await formatJson(JSON.stringify(record), PROBE));
      process.stdout.write(
        `The full run ${goAhead ? 'goes ahead' : 'does not go ahead: the round stops and reports'}.\n`,
      );
    } else {
      const { crawl, noise, restart } = SECOND_ROUND;
      const first = await calibrate(scorer(crawl.targets), {
        budget: options.budget,
        restarts: restart,
        previous: previous.crawl,
        progress: report('crawl', options.budget),
      });
      stages.crawl = first;
      save(false);
      describe(first, crawl.targets);
      const second = await calibrate(scorer(noise.targets), {
        budget: noise.budget,
        ids: noise.ids,
        fixed: first.final.values,
        restarts: restart,
        extra: [{ from: "stage 1's final values", values: first.final.values }],
        previous: previous.noise,
        progress: report('noise', noise.budget),
      });
      stages.noise = second;
      describe(second, noise.targets);
      const run = { ...head, complete: true, seconds: elapsed(), stages, final: second.final };
      writeFileSync(file, JSON.stringify(run) + '\n');
      if (full) {
        mkdirSync(dirname(SUMMARY), { recursive: true });
        writeFileSync(SUMMARY, await formatJson(JSON.stringify(summary(run)), SUMMARY));
      }
      process.stderr.write(`both stages and their final checks in ${elapsed().toFixed(0)} s; wrote ${file}\n`);
      // Unrounded, as the registry takes them.
      process.stdout.write(`Final, from ${second.final.from}:\n`);
      for (const id of CALIBRATED) process.stdout.write(`  ${id}: ${String(second.final.values[id])}\n`);
    }
  } finally {
    for (const worker of workers) worker.kill();
  }
}
