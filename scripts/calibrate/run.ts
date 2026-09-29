// npm run calibrate -- [--probe | --survey | --bounded] [--budget N] [--jobs N] [--resume]
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
//
// --survey runs the survey of the bounded model (PLAN §9; SURVEY): stage 1 sixteen times at 250 evaluations in the
// conductance form, from a Latin hypercube's starts, each restart from a fresh point, and grades each pick on seeds
// 3001 to 3020. It writes data/calibration/survey.json; if any pick grades at least partial, R's third round follows.
//
// --bounded calibrates the bounded model once by the refit's procedure, should the survey find no crawl (PLAN §9): one
// search of 2,000 evaluations on all four targets in the conductance form, from its provisional values, without
// restarts. It writes data/calibration/r4.json. The speed target is decided before it runs (PLAN §7.3).

import { fork, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWormlightData, type WormlightData } from '../../src/data/schema.ts';
import { CALIBRATED, loopParams, type Form } from '../../src/sim/world.ts';
import {
  ALL_TARGETS,
  CALIBRATION,
  ERROR_CAP,
  MAPPING,
  SECOND_ROUND,
  SURVEY,
  TARGETS,
  bounds,
  calibrate,
  measure,
  objective,
  provisionalValues,
  surveyStart,
  type Evaluated,
  type Fit,
  type KinematicRecord,
  type Scorer,
  type Target,
  type Values,
} from '../../src/validation/calibration.ts';
import { checkpoint1, type Diagnostics } from '../../src/validation/checkpoints.ts';
import { runTrial, type TrialRecord } from '../../src/validation/trial.ts';
import { formatJson } from '../data/render.ts';
import { ROOT } from '../data/sources.ts';
import { commit } from '../harness/commit.ts';
import { readPinned, readPostures } from '../harness/pinned.ts';

// A probe's or the survey's run: its pick, and checkpoint 1's grade of it on seeds of its own; for the survey, also
// its search's number and start, and the grading's diagnostics, the shunt and the gate's toggles among them.
interface ProbeRun {
  seed: number;
  restarts: number;
  final: { from: string; values: Values; value: number; measures: unknown };
  grade: string;
  clauses: { name: string; value: number | null; grade: string }[];
  search?: number;
  start?: number[];
  diagnostics?: Diagnostics;
}

interface Job {
  values: Values;
  // The form the values are in (PLAN §4.3).
  form: Form;
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

// R's second round, whose code this runner holds, runs the current form (PLAN §4.3).
const ROUND_FORM: Form = 'current';

const DATA = join(ROOT, 'public/data/wormlight.v1.json');
export const SUMMARY = join(ROOT, 'data/calibration/r3.json');
export const PROBE = join(ROOT, 'data/calibration/r3-probe.json');
export const SURVEYED = join(ROOT, 'data/calibration/survey.json');
export const BOUNDED = join(ROOT, 'data/calibration/r4.json');

let cached: { data: WormlightData; postures: number[][] } | undefined;

async function runJob(job: Job): Promise<TrialResult> {
  cached ??= { data: validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8'))), postures: await readPostures() };
  const r = runTrial(cached.data, {
    seed: job.seed,
    seconds: CALIBRATION.trialSeconds,
    params: loopParams(job.values, job.form),
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

// What a run is: R's second round, whole or shortened for a look; its probe; the survey of the bounded model; or the
// bounded model's calibration by the refit's procedure (PLAN §9).
export type Mode = 'round 2' | 'probe' | 'survey' | 'bounded';
const MODES: Record<string, Mode> = { '--probe': 'probe', '--survey': 'survey', '--bounded': 'bounded' };
const USAGE = 'npm run calibrate -- [--probe | --survey | --bounded] [--budget N] [--jobs N] [--resume]';

export function parseArgs(args: readonly string[]): { budget: number; jobs: number; resume: boolean; mode: Mode } {
  const out = {
    budget: CALIBRATION.budget as number,
    jobs: availableParallelism(),
    resume: false,
    mode: 'round 2' as Mode,
  };
  let budgeted = false;
  for (let a = 0; a < args.length; a++) {
    if (args[a] === '--resume') {
      out.resume = true;
      continue;
    }
    if (args[a] in MODES) {
      if (out.mode !== 'round 2') throw new Error(`one mode at a time; usage: ${USAGE}`);
      out.mode = MODES[args[a]];
      continue;
    }
    const [flag, text] = [args[a], args[a + 1]];
    if ((flag !== '--budget' && flag !== '--jobs') || text === undefined || !/^\d+$/.test(text) || Number(text) < 1) {
      throw new Error(`usage: ${USAGE}`);
    }
    if (flag === '--budget') budgeted = true;
    out[flag === '--budget' ? 'budget' : 'jobs'] = Number(text);
    a++;
  }
  // The probe and the survey take their own budgets; round 2 and the bounded calibration may be shortened for a look.
  if ((out.mode === 'probe' || out.mode === 'survey') && budgeted) {
    throw new Error(`--${out.mode} takes its own budget; usage: ${USAGE}`);
  }
  return out;
}

// What a run was: the settings a reader needs to interpret its units and scores.
export function settings(budget: number, mode: Mode = 'round 2'): Record<string, unknown> {
  const shared = { mapping: MAPPING, targets: TARGETS, errorCap: ERROR_CAP, calibration: CALIBRATION };
  if (mode === 'survey') {
    const form = SURVEY.form;
    return {
      model: 'track R, the bounded survey',
      form,
      survey: SURVEY,
      stage: { targets: SECOND_ROUND.crawl.targets, restart: SECOND_ROUND.restart },
      starts: SURVEY.seeds.map((_, j) => surveyStart(j, 0)),
      bounds: Object.fromEntries(CALIBRATED.map((id) => [id, bounds(id, form)])),
      ...shared,
    };
  }
  if (mode === 'bounded') {
    const form: Form = 'conductance';
    return {
      model: 'track R, bounded',
      form,
      budget,
      start: provisionalValues(form),
      bounds: Object.fromEntries(CALIBRATED.map((id) => [id, bounds(id, form)])),
      ...shared,
    };
  }
  return {
    model: 'track R, round 2',
    // The probe runs stage 1 alone, at its own budget.
    budget:
      mode === 'probe' ? { crawl: SECOND_ROUND.probe.budget } : { crawl: budget, noise: SECOND_ROUND.noise.budget },
    calibration: CALIBRATION,
    secondRound: SECOND_ROUND,
    // Round 2 runs the current form (PLAN §4.3).
    form: ROUND_FORM,
    start: provisionalValues(ROUND_FORM),
    bounds: Object.fromEntries(CALIBRATED.map((id) => [id, bounds(id, ROUND_FORM)])),
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
  const { mode } = options;
  const full = options.budget === CALIBRATION.budget;
  const name = {
    'round 2': full ? 'calibration-r3.json' : `calibration-r3-${options.budget}.json`,
    probe: 'calibration-r3-probe.json',
    survey: 'calibration-survey.json',
    bounded: full ? 'calibration-r4.json' : `calibration-r4-${options.budget}.json`,
  }[mode];
  const file = join(ROOT, 'harness-out', name);
  // A resumed run replays each stage's evaluations, and keeps every stage on disk until it is replayed; a resumed
  // probe or survey also keeps the runs it had graded.
  let resumed: { stages: Record<string, Partial<Fit>>; runs?: ProbeRun[] } = { stages: {} };
  if (options.resume) {
    if (!existsSync(file)) throw new Error(`there is no run to resume at ${file}`);
    resumed = JSON.parse(readFileSync(file, 'utf8')) as typeof resumed;
    const counts = Object.entries(resumed.stages).map(([k, v]) => `${k} ${v.evaluated?.length ?? 0}`);
    process.stderr.write(`resuming after ${counts.join(', ')} evaluations\n`);
  }
  const previous = (stage: string): Evaluated[] | undefined => resumed.stages[stage]?.evaluated;
  await readPostures(); // fetch once here, so the workers read the cache
  const head = {
    ...settings(options.budget, mode),
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
  // A scorer: the objective on its targets, for values in a form; round 2 and the survey score a worm without a bout
  // by its spectral frequency, and the refit's procedure, which the bounded calibration follows, doesn't.
  const scorer =
    (targets: readonly Target[], form: Form, spectral: boolean): Scorer =>
    async (values, seeds) => {
      const records = (await Promise.all(seeds.map((seed) => pool.run({ values, form, seed })))) as (KinematicRecord & {
        unconverged: number;
      })[];
      const measures = measure(records, { spectral });
      return { measures, ...objective(measures, targets), unconverged: records.reduce((n, r) => n + r.unconverged, 0) };
    };
  const stages: Record<string, Partial<Fit>> = { ...resumed.stages };
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
  // Stage 1 of R's second round, one search with its final check, then its pick graded by checkpoint 1's grading on
  // seeds of its own, as the probe and the survey run it.
  const gradedSearch = async (
    stage: string,
    form: Form,
    budget: number,
    seed: number,
    gradeSeeds: readonly number[],
    starts?: { start: readonly number[]; restartFrom: (restart: number) => readonly number[] },
  ): Promise<ProbeRun> => {
    const { crawl, restart } = SECOND_ROUND;
    const basis = await readPinned('eigenworms');
    const fit = await calibrate(scorer(crawl.targets, form, true), {
      form,
      budget,
      seed,
      restarts: restart,
      ...(starts ?? {}),
      previous: previous(stage),
      progress: report(stage, budget),
    });
    stages[stage] = fit;
    describe(fit, crawl.targets);
    const records = (await Promise.all(
      gradeSeeds.map((s) => pool.run({ values: fit.final.values, form, seed: s, whole: true })),
    )) as TrialRecord[];
    const graded = checkpoint1(records, basis);
    const clauses = graded.clauses.map((c) => ({ name: c.name, value: c.value, grade: c.grade }));
    process.stdout.write(
      `${stage}: ${graded.grade} on seeds ${gradeSeeds[0]} to ${gradeSeeds[gradeSeeds.length - 1]} (${clauses.map((c) => `${c.name} ${c.value === null ? '—' : c.value.toFixed(3)} ${c.grade}`).join('; ')})\n`,
    );
    return {
      seed,
      restarts: Math.max(...fit.generations.map((g) => g.restart)),
      final: { from: fit.final.from, values: fit.final.values, value: fit.final.value, measures: fit.final.measures },
      grade: graded.grade,
      clauses,
      ...(starts ? { diagnostics: graded.diagnostics } : {}),
    };
  };
  try {
    if (mode === 'probe') {
      const { probe } = SECOND_ROUND;
      const runs: ProbeRun[] = [...(resumed.runs ?? [])];
      for (const seed of probe.seeds) {
        // A run graded before a stop is kept, not searched again.
        if (runs.some((r) => r.seed === seed)) continue;
        runs.push(await gradedSearch(`probe ${seed}`, ROUND_FORM, probe.budget, seed, probe.gradeSeeds));
        // Saved as each is graded, so that a stop loses no grade.
        save(false, { runs });
      }
      const goAhead = runs.some((r) => r.grade !== 'fail');
      save(true, { runs, goAhead });
      // The committed record: each run's pick and grade, without the searches' evaluations.
      const record = { ...head, complete: true, seconds: elapsed(), runs, goAhead };
      writeFileSync(PROBE, await formatJson(JSON.stringify(record), PROBE));
      process.stdout.write(
        `The full run ${goAhead ? 'goes ahead' : 'does not go ahead: the round stops and reports'}.\n`,
      );
    } else if (mode === 'survey') {
      const runs: ProbeRun[] = [...(resumed.runs ?? [])];
      for (const [search, seed] of SURVEY.seeds.entries()) {
        if (runs.some((r) => r.seed === seed)) continue;
        const run = await gradedSearch(`survey ${seed}`, SURVEY.form, SURVEY.budget, seed, SURVEY.gradeSeeds, {
          start: surveyStart(search, 0),
          restartFrom: (r) => surveyStart(search, r),
        });
        runs.push({ ...run, search, start: surveyStart(search, 0) });
        save(false, { runs });
      }
      const partial = runs.some((r) => r.grade !== 'fail');
      save(true, { runs, partial });
      const record = { ...head, complete: true, seconds: elapsed(), runs, partial };
      writeFileSync(SURVEYED, await formatJson(JSON.stringify(record), SURVEYED));
      process.stdout.write(
        partial
          ? "A pick grades at least partial: R's third round runs on the bounded model, by rules of its own.\n"
          : "No pick grades partial: R ends, and the bounded model is calibrated once by the refit's procedure.\n",
      );
    } else if (mode === 'bounded') {
      const form: Form = 'conductance';
      const fit = await calibrate(scorer(ALL_TARGETS, form, false), {
        form,
        budget: options.budget,
        previous: previous('bounded'),
        progress: report('bounded', options.budget),
      });
      stages.bounded = fit;
      describe(fit, ALL_TARGETS);
      const run = { ...head, complete: true, seconds: elapsed(), stages, final: fit.final };
      writeFileSync(file, JSON.stringify(run) + '\n');
      if (full) writeFileSync(BOUNDED, await formatJson(JSON.stringify(summary(run)), BOUNDED));
      process.stdout.write(`Final, from ${fit.final.from}:\n`);
      for (const id of CALIBRATED) process.stdout.write(`  ${id}: ${String(fit.final.values[id])}\n`);
    } else {
      const { crawl, noise, restart } = SECOND_ROUND;
      const first = await calibrate(scorer(crawl.targets, ROUND_FORM, true), {
        form: ROUND_FORM,
        budget: options.budget,
        restarts: restart,
        previous: previous('crawl'),
        progress: report('crawl', options.budget),
      });
      stages.crawl = first;
      save(false);
      describe(first, crawl.targets);
      const second = await calibrate(scorer(noise.targets, ROUND_FORM, true), {
        form: ROUND_FORM,
        budget: noise.budget,
        ids: noise.ids,
        fixed: first.final.values,
        restarts: restart,
        extra: [{ from: "stage 1's final values", values: first.final.values }],
        previous: previous('noise'),
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
