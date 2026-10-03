// npm run calibrate -- [--probe | --survey | --round-3 | --bounded | --track-s] [--budget N] [--jobs N] [--resume]
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
// 3001 to 3020. It writes harness-out/calibration-survey.json and data/calibration/survey.json; if any pick grades at
// least partial, R's third round follows. It ran on 2026-09-29 and found a crawl.
//
// --round-3 runs R's third round, its last (PLAN §7.3, §9; THIRD_ROUND): phase 1, sixteen searches of 250 evaluations in
// the conductance form from the survey's starts, on the crawl alone with a speed target of 0.15; then phase 2, the four
// whose final checks score lowest continued to 750 each, their first 250 replayed from phase 1's record. It grades
// nothing: its four picks, in the order of their objective, take §7.2's comparison (npm run equivalence -- --fit
// round-3). It writes harness-out/calibration-r5.json and data/calibration/r5.json; a resumed run keeps every search it
// had finished. It runs once, only after a survey that found a crawl.
//
// --track-s runs track S's calibration (PLAN §9; TRACK_S_ROUND): R's third round's procedure on track S's model, its
// measured signs, the D-types' offset and its rectifier, with its own bound on g_p. It writes harness-out/calibration-s1.json and
// data/calibration/s1.json, its four picks in the order they take §7.2's comparison (npm run equivalence -- --fit
// track-s), and names checkpoint 1's frequency band, on which it scores. It runs once: it refuses while s1.json exists.
//
// --null N tunes the primary null's rewiring N, 1 to 10, for checkpoint 6 (spec §8; PLAN §7.4; DECISIONS.md,
// 2026-10-03): track S's procedure on the rewired brain, in the box its own rest gives by the rules that set S's
// (src/validation/wiringTest.ts). A candidate whose trial can't be run, its brain's rest unsolvable or its worker
// stopped or stuck, scores as one that left the finite numbers, and the run carries on. Its fit is its first pick. It
// writes harness-out/calibration-null-N.json and data/calibration/null-N.json, which name the machine and Node's
// version; it runs once a null, and resumes only at the same commit and Node.
//
// --bounded calibrates the bounded model once by the refit's procedure, should the survey find no crawl (PLAN §9): one
// search of 2,000 evaluations on all four targets in the conductance form, from its provisional values, without
// restarts. It writes harness-out/calibration-r4.json and data/calibration/r4.json. It refuses to run while the
// survey's record holds a partial pick, as it does, unless a later rule calls for it; the speed target is decided
// before it runs (PLAN §7.3).
//
// Every record is written whole or not at all; a trial past TRIAL_TIMEOUT is killed, and each worker's heap is capped.
// No run starts afresh over a stopped one: --resume takes it up.

import { fork, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import type { Network } from '../../src/sim/brain/network.ts';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWormlightData, type WormlightData } from '../../src/data/schema.ts';
import { partsOf, TRACK_S, trackSKey, type Model, type TrackSParts } from '../../src/sim/trackS.ts';
import { CALIBRATED, loopParams, type Form, type LoopParams } from '../../src/sim/world.ts';
import {
  ALL_TARGETS,
  CALIBRATION,
  ERROR_CAP,
  MAPPING,
  SECOND_ROUND,
  SURVEY,
  TARGETS,
  THIRD_ROUND,
  TRACK_S_ROUND,
  bounds,
  calibrate,
  measure,
  objective,
  provisionalValues,
  ranked,
  surveyStart,
  type Evaluated,
  type Fit,
  type KinematicRecord,
  type Scorer,
  type Target,
  type Values,
  type Box,
} from '../../src/validation/calibration.ts';
import { nullNetwork, NULLS, ruleBox, ruleReading } from '../../src/validation/wiringTest.ts';
import { checkpoint1, type Diagnostics } from '../../src/validation/checkpoints.ts';
import { FREQUENCY_BAND } from '../../src/validation/motion.ts';
import { runTrial, type TrialRecord } from '../../src/validation/trial.ts';
import { formatJson } from '../data/render.ts';
import { ROOT } from '../data/sources.ts';
import { commit } from '../harness/commit.ts';
import { machine } from './machine.ts';
import { writeWhole } from '../experiments/trees.ts';
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

export interface Job {
  values: Values;
  // The form the values are in (PLAN §4.3).
  form: Form;
  seed: number;
  // The whole record, for grading by checkpoint 1, not only what the objective reads.
  whole?: boolean;
  // The model, named only when it isn't track R's (track S's).
  model?: Model;
  // The primary null's rewiring the trial's brain is, for checkpoint 6; the real wiring without it.
  rewiring?: number;
}

// What a trial gives the objective, its brain solves that didn't converge and the model it ran, as trackSKey names it;
// or, for grading, the whole record.
type TrialResult = (KinematicRecord & { unconverged: number; ran: string }) | TrialRecord;

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
export const ROUND_3 = join(ROOT, 'data/calibration/r5.json');
export const TRACK_S_RECORD = join(ROOT, 'data/calibration/s1.json');

let cached: { data: WormlightData; postures: number[][] } | undefined;
// Each null's brain, built once a worker.
const networks = new Map<number, Network>();

// What a trial ran, as the scorer holds it to the run's: the model's parts as trackSKey names them, and the rewiring.
export const ranKey = (params: TrackSParts, rewiring?: number): string =>
  `${trackSKey(params)}${rewiring === undefined ? '' : `; rewiring ${rewiring}`}`;

// A job's loop parameters: its values in its form, on its model.
export const jobParams = (job: Job): LoopParams => ({
  ...loopParams(job.values, job.form),
  ...partsOf(job.model ?? 'track R'),
});

async function runJob(job: Job): Promise<TrialResult> {
  cached ??= { data: validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8'))), postures: await readPostures() };
  const params = jobParams(job);
  const { rewiring } = job;
  let network: Network | undefined;
  if (rewiring !== undefined) {
    network = networks.get(rewiring) ?? nullNetwork(cached.data, rewiring);
    networks.set(rewiring, network);
  }
  const r = runTrial(cached.data, {
    seed: job.seed,
    seconds: CALIBRATION.trialSeconds,
    params,
    postures: cached.postures,
    ...(network ? { network } : {}),
  });
  if (job.whole) return r;
  // Only what the objective reads, and the model the trial ran, which the scorer holds to the one it asked for.
  return {
    finite: r.finite,
    velocity: r.velocity,
    mid: r.mid,
    front: r.front,
    rear: r.rear,
    unconverged: r.unconverged,
    ran: ranKey(params, rewiring),
  };
}

// Every trial ran the model a run asked for, as trackSKey names it, or the run stops (DECISIONS.md, 2026-10-02): the
// record names its model from the run's settings, and this ties it to what ran.
export function checkRan(records: readonly { ran: string }[], model: Model = 'track R', rewiring?: number): void {
  const asked = ranKey(partsOf(model), rewiring);
  const other = records.find((r) => r.ran !== asked);
  if (other) throw new Error(`a trial ran the model "${other.ran}", not the "${asked}" the run asked for`);
}

// A trial of 120 s takes seconds, about 4 on an M5 Max and 12 on the older PC; one still running after this is stuck.
const TRIAL_TIMEOUT = 300_000; // ms
// Each worker's heap, so that a worker gone wrong fails alone rather than taking the machine's memory.
const WORKER_HEAP = '--max-old-space-size=2048';

// How a trial failed: it threw, as on a rest that can't be solved, or ran past the timeout, both the candidate's (the
// rules' failures, DECISIONS.md, 2026-10-03); or its worker stopped or couldn't be reached, which may be the machine's.
export type FailureKind = 'threw' | 'timeout' | 'stopped';
export class TrialFailure extends Error {
  readonly kind: FailureKind;
  constructor(kind: FailureKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

// A pool of worker processes, each taking one trial at a time. A worker that dies, or runs a trial past the timeout
// and is killed, fails the job it held, and is never handed another; with `respawn`, as a null's run has it, a fresh
// worker takes its place, so that a run that carries on past a stuck trial keeps its workers. A pool left with no
// worker fails the jobs still waiting.
export class Pool {
  private readonly idle: ChildProcess[] = [];
  private readonly all: ChildProcess[] = [];
  private readonly waiting: { job: Job; resolve: (r: TrialResult) => void; reject: (e: Error) => void }[] = [];
  private alive = 0;
  private stopped = false;
  private readonly spawn: () => ChildProcess;
  private readonly respawn: boolean;
  private readonly timeout: number;
  constructor(count: number, spawn: () => ChildProcess, respawn = false, timeout = TRIAL_TIMEOUT) {
    this.spawn = spawn;
    this.respawn = respawn;
    this.timeout = timeout;
    for (let k = 0; k < count; k++) this.add();
  }
  private add(): void {
    const worker = this.spawn();
    this.all.push(worker);
    this.idle.push(worker);
    this.alive++;
    let gone = false;
    const leave = (): void => {
      if (gone) return;
      gone = true;
      this.alive--;
      const k = this.idle.indexOf(worker);
      if (k >= 0) this.idle.splice(k, 1);
      if (this.respawn && !this.stopped) this.add();
      this.next();
    };
    // A worker that couldn't be started reports an error and may never exit; a send to a dead one reports through its
    // callback below.
    worker.on('error', () => {
      if (worker.pid === undefined) leave();
    });
    worker.once('exit', leave);
  }
  stop(): void {
    this.stopped = true;
    for (const worker of this.all) worker.kill();
  }
  run(job: Job): Promise<TrialResult> {
    return new Promise((resolve, reject) => {
      this.waiting.push({ job, resolve, reject });
      this.next();
    });
  }
  private next(): void {
    if (this.alive === 0) {
      for (const { job, reject } of this.waiting.splice(0)) {
        reject(new TrialFailure('stopped', `no worker was left for seed ${job.seed}`));
      }
      return;
    }
    while (this.idle.length > 0 && this.waiting.length > 0) {
      const worker = this.idle.pop() as ChildProcess;
      const { job, resolve, reject } = this.waiting.shift() as (typeof this.waiting)[number];
      let late = false;
      const timer = setTimeout(() => {
        late = true;
        worker.kill();
      }, this.timeout);
      const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
        clearTimeout(timer);
        reject(
          late
            ? new TrialFailure(
                'timeout',
                `a trial ran past ${this.timeout / 1000} s and was killed, on seed ${job.seed}`,
              )
            : new TrialFailure('stopped', `a worker exited (${signal ?? code}) on seed ${job.seed}`),
        );
      };
      worker.once('exit', onExit);
      worker.once('message', (r: Result) => {
        clearTimeout(timer);
        worker.off('exit', onExit);
        // A worker whose answer crossed its timeout is being killed, so it isn't handed another job.
        if (!late) this.idle.push(worker);
        if (r.error || !r.record) reject(new TrialFailure('threw', `seed ${job.seed}: ${r.error ?? 'no record'}`));
        else resolve(r.record);
        this.next();
      });
      worker.send(job, (e) => {
        if (e) reject(new TrialFailure('stopped', `seed ${job.seed} couldn't reach its worker: ${e.message}`));
      });
    }
  }
}

// A null's fit is its first pick (PLAN §9; DECISIONS.md, 2026-10-03), none if that one couldn't be run: its objective
// infinite, or null as JSON writes it.
export const nullFit = <T extends { value: number | null }>(picks: readonly T[]): T | null =>
  picks.length > 0 && picks[0].value !== null && Number.isFinite(picks[0].value) ? picks[0] : null;

// A null's run stops, to be looked into and resumed, when every candidate of a generation failed: that says more about
// the machine or the setup than the candidates (DECISIONS.md, 2026-10-03).
export const allFailed = (generation: readonly { failed?: string }[]): string | null =>
  generation.length > 0 && generation.every((e) => e.failed)
    ? `every candidate of a generation failed, the first because ${generation[0].failed}: look into the setup, then resume`
    : null;

// Whether a trial's failure is the candidate's, by the rules (DECISIONS.md, 2026-10-03): it threw, as on a rest that
// can't be solved, or ran past the timeout. A worker that stopped, which the machine may cause, isn't.
export const candidateFailure = (e: unknown): e is TrialFailure =>
  e instanceof TrialFailure && (e.kind === 'threw' || e.kind === 'timeout');

// A trial as the objective takes it, or why it couldn't be run.
type Ran = KinematicRecord & { unconverged: number; ran: string };

// A candidate's score from its trials: the objective on its targets, every trial held to the model and rewiring it
// asked for; with a trial that couldn't be run, as only a null's run tolerates, an infinite objective with the first
// reason, so that the search ranks it last and carries on (DECISIONS.md, 2026-10-03).
export function scoreTrials(
  results: readonly (Ran | { failed: string })[],
  how: {
    targets: readonly Target[];
    spectral: boolean;
    goals?: Readonly<Record<Target, number>>;
    model?: Model;
    rewiring?: number;
  },
): Awaited<ReturnType<Scorer>> {
  const failed = results.find((r): r is { failed: string } => 'failed' in r);
  if (failed) {
    const measures = measure([], { spectral: how.spectral });
    return { measures, ...objective(measures, how.targets, how.goals), unconverged: 0, failed: failed.failed };
  }
  const ran = results as Ran[];
  checkRan(ran, how.model, how.rewiring);
  const measures = measure(ran, { spectral: how.spectral });
  return {
    measures,
    ...objective(measures, how.targets, how.goals),
    unconverged: ran.reduce((n, r) => n + r.unconverged, 0),
  };
}

// What a run is: R's second round, whole or shortened for a look; its probe; the survey of the bounded model; R's third
// round; the bounded model's calibration by the refit's procedure (PLAN §9); or track S's calibration.
export type Mode = 'round 2' | 'probe' | 'survey' | 'round 3' | 'bounded' | 'track S' | 'null';
const MODES: Record<string, Mode> = {
  '--probe': 'probe',
  '--survey': 'survey',
  '--round-3': 'round 3',
  '--bounded': 'bounded',
  '--track-s': 'track S',
};
const USAGE =
  'npm run calibrate -- [--probe | --survey | --round-3 | --bounded | --track-s | --null N] [--budget N] [--jobs N] [--resume]';

export function parseArgs(args: readonly string[]): {
  budget: number;
  jobs: number;
  resume: boolean;
  mode: Mode;
  rewiring?: number;
} {
  const out: { budget: number; jobs: number; resume: boolean; mode: Mode; rewiring?: number } = {
    budget: CALIBRATION.budget,
    jobs: availableParallelism(),
    resume: false,
    mode: 'round 2',
  };
  let budgeted = false;
  for (let a = 0; a < args.length; a++) {
    if (args[a] === '--resume') {
      out.resume = true;
      continue;
    }
    if (args[a] === '--null') {
      if (out.mode !== 'round 2') throw new Error(`one mode at a time; usage: ${USAGE}`);
      const k = Number(args[a + 1]);
      if (!NULLS.includes(k)) throw new Error(`--null takes a rewiring from 1 to ${NULLS.length}; usage: ${USAGE}`);
      out.mode = 'null';
      out.rewiring = k;
      a++;
      continue;
    }
    if (Object.hasOwn(MODES, args[a])) {
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
  // The probe, the survey, round 3 and track S take their own budgets; round 2 and the bounded calibration may be
  // shortened for a look.
  if (['probe', 'survey', 'round 3', 'track S', 'null'].includes(out.mode) && budgeted) {
    throw new Error(`--${out.mode.toLowerCase().replace(' ', '-')} takes its own budget; usage: ${USAGE}`);
  }
  return out;
}

// What a run was: the settings a reader needs to interpret its units and scores.
export function settings(budget: number, mode: Mode = 'round 2'): Record<string, unknown> {
  const shared = { mapping: MAPPING, targets: TARGETS, errorCap: ERROR_CAP, calibration: CALIBRATION };
  // Every record that can still be written names checkpoint 1's frequency band, on which its measures count crossings
  // (PLAN §7.4). The probe's, the survey's and round 3's were made under the plain count, and none of them runs again.
  const band = { frequencyBand: FREQUENCY_BAND };
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
  if (mode === 'round 3') {
    const form = THIRD_ROUND.form;
    return {
      model: 'track R, round 3',
      form,
      thirdRound: THIRD_ROUND,
      survey: SURVEY,
      starts: THIRD_ROUND.seeds.map((_, j) => surveyStart(j, 0)),
      bounds: Object.fromEntries(CALIBRATED.map((id) => [id, bounds(id, form)])),
      ...shared,
      // Round 3's own targets, the speed's 0.15.
      targets: THIRD_ROUND.goals,
    };
  }
  if (mode === 'track S' || mode === 'null') {
    const { form } = TRACK_S_ROUND;
    return {
      // A null's record adds its rewiring, its box and the machine where it runs.
      model: mode === 'null' ? "track S, the primary null's rewiring" : 'track S',
      // The model's parts, as the loop's parameters take them.
      parts: TRACK_S,
      ...band,
      form,
      round: TRACK_S_ROUND,
      survey: SURVEY,
      starts: TRACK_S_ROUND.seeds.map((_, j) => surveyStart(j, 0)),
      // A null's are its own box, which its record sets.
      ...(mode === 'null'
        ? {}
        : { bounds: Object.fromEntries(CALIBRATED.map((id) => [id, bounds(id, form, 'track S')])) }),
      ...shared,
      targets: TRACK_S_ROUND.goals,
    };
  }
  if (mode === 'bounded') {
    const form: Form = 'conductance';
    return {
      model: 'track R, bounded',
      ...band,
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
    // The probe ran under the plain count; round 2's full run and its looks would run under the band.
    ...(mode === 'probe' ? {} : band),
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

// How a mode searches (PLAN §7.3, §9): its model, track R's unless named; its form; the targets its objective reads,
// and their values when a round sets its own; whether a worm without a bout of 10 s is scored by its spectral
// frequency; and its restart rule, if any. Round 2's is its first stage's, which its probe runs; its second stage, the
// noise, is set where it runs.
export interface Procedure {
  model?: Model;
  form: Form;
  targets: readonly Target[];
  goals?: Readonly<Record<Target, number>>;
  spectral: boolean;
  restarts?: { sigma: number; stall: number; until?: number };
}
export function procedure(mode: Mode): Procedure {
  const { crawl, restart } = SECOND_ROUND;
  if (mode === 'survey') return { form: SURVEY.form, targets: crawl.targets, spectral: true, restarts: restart };
  if (mode === 'round 3') {
    const { form, targets, goals, spectral } = THIRD_ROUND;
    return { form, targets, goals, spectral, restarts: THIRD_ROUND.restart };
  }
  // A null is tuned by track S's procedure (checkpoint 6; DECISIONS.md, 2026-10-03).
  if (mode === 'track S' || mode === 'null') {
    const { model, form, targets, goals, spectral } = TRACK_S_ROUND;
    return { model, form, targets, goals, spectral, restarts: TRACK_S_ROUND.restart };
  }
  // The refit's: all four targets, without the spectral frequency or restarts, in the conductance form.
  if (mode === 'bounded') return { form: 'conductance', targets: ALL_TARGETS, spectral: false };
  return { form: ROUND_FORM, targets: crawl.targets, spectral: true, restarts: restart };
}

// What the bounded calibration's guard reads of the survey's record.
export interface SurveyVerdict {
  complete?: boolean;
  partial?: boolean;
}

// Whether the bounded calibration may run: only once the survey has run to its end and found no pick at least partial
// (PLAN §9). A later rule that calls for it changes this.
export const boundedAllowed = (survey: SurveyVerdict | null): boolean =>
  survey !== null && survey.complete === true && survey.partial === false;

// Whether round 3 may run on the real wiring: only once the survey has run to its end and found a pick at least
// partial, and only once, before its record is committed (PLAN §9).
// The committed record a run would replace, if it exists: round 2's full run, the probe and the survey have run, under
// checkpoint 1's plain count of crossings, and none runs again under the band that replaced it (PLAN §7.4, changed after
// results 2026-10-01, DECISIONS.md). Round 3 and the bounded calibration have rules of their own. Moving the record
// aside is a decision to rerun.
export function committedRecord(mode: Mode, full: boolean, exists: (path: string) => boolean): string | null {
  const path = mode === 'probe' ? PROBE : mode === 'survey' ? SURVEYED : mode === 'round 2' && full ? SUMMARY : null;
  return path !== null && exists(path) ? path : null;
}

export const roundThreeAllowed = (survey: SurveyVerdict | null, recorded: boolean): boolean =>
  survey !== null && survey.complete === true && survey.partial === true && !recorded;

// Whether track S's calibration may run: once, before its record is committed (PLAN §9). A null's tuning likewise runs
// once, before its own record is committed.
export const trackSAllowed = (recorded: boolean): boolean => !recorded;
export const nullRecord = (rewiring: number): string => join(ROOT, `data/calibration/null-${rewiring}.json`);

// Whether a stopped run may be resumed here: only at the commit it ran at and, for a null's, on the same version of
// Node, since a V8 change can move a search's path (DECISIONS.md, 2026-10-03); null with the reason it may not.
export function resumeRefused(
  resumed: { commit?: string; node?: string; machine?: Record<string, unknown> },
  here: { commit: string; node: string; machine?: Record<string, unknown> },
  mode: Mode,
): string | null {
  if (resumed.commit !== here.commit) return `it ran at ${resumed.commit ?? 'no commit'}, not ${here.commit}`;
  if (mode !== 'null') return null;
  if (resumed.node !== here.node) return `it ran on Node ${resumed.node ?? '?'}, not ${here.node}`;
  // The same machine: everything machine() names but its memory, which WSL can be given more or less of.
  const same = (m?: Record<string, unknown>): string =>
    JSON.stringify(Object.entries(m ?? {}).filter(([key]) => key !== 'memoryGB'));
  if (same(resumed.machine) !== same(here.machine)) {
    const { cpu, platform } = resumed.machine ?? {};
    return `it ran on ${typeof cpu === 'string' ? cpu : 'another machine'}${typeof platform === 'string' ? ` (${platform})` : ''}, not this one`;
  }
  return null;
}

// Whether a run may start afresh where another left its file: only if there is none, or that run finished. A stopped
// run is resumed with --resume, or moved aside by hand, never overwritten.
export const mayStartAfresh = (existing: { complete?: boolean } | null): boolean =>
  existing === null || existing.complete === true;

// What phase 2 replays of a search (PLAN §7.3): phase 1's record, or, resumed, its own so far, whichever is longer.
// Each is the start of the other, and phase 1's evaluations are never scored again.
export const continuedFrom = (
  own: readonly Evaluated[] | undefined,
  first: readonly Evaluated[] | undefined,
): readonly Evaluated[] | undefined => ((own?.length ?? 0) >= (first?.length ?? 0) ? own : first);

// The committed summary: the run without its evaluations, its stages' included.
// A stage keeps the candidates that couldn't be run, each where it lay and why, which a null's record reports
// (DECISIONS.md, 2026-10-03); records without any are as they were.
export function summary(run: Record<string, unknown>): Record<string, unknown> {
  const failures = (o: Record<string, unknown>): Record<string, unknown> => {
    const failed = ((o.evaluated ?? []) as Evaluated[]).filter((e) => e.failed);
    return failed.length > 0
      ? {
          failures: failed.map(({ restart, generation, candidate, failed: why }) => ({
            restart,
            generation,
            candidate,
            failed: why,
          })),
        }
      : {};
  };
  const without = (o: Record<string, unknown>): Record<string, unknown> => ({
    ...Object.fromEntries(
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
    ),
    ...failures(o),
  });
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
    'round 3': 'calibration-r5.json',
    bounded: full ? 'calibration-r4.json' : `calibration-r4-${options.budget}.json`,
    'track S': 'calibration-s1.json',
    null: `calibration-null-${options.rewiring}.json`,
  }[mode];
  const file = join(ROOT, 'harness-out', name);
  // A resumed run replays each stage's evaluations, and keeps every stage on disk until it is replayed; a resumed
  // probe or survey also keeps the runs it had graded.
  let resumed: {
    stages: Record<string, Partial<Fit>>;
    runs?: ProbeRun[];
    commit?: string;
    node?: string;
    machine?: Record<string, unknown>;
    date?: string;
    complete?: boolean;
    seconds?: number;
  } = { stages: {} };
  const committed = commit();
  // Track S's calibration and a null's run, and resume, only at a commit, so that their evaluations all come from one
  // code.
  if ((mode === 'track S' || mode === 'null') && /uncommitted/.test(committed)) {
    throw new Error('commit first: this calibration records the commit it runs at, and resumes only there');
  }
  if (
    !options.resume &&
    !mayStartAfresh(existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as object) : null)
  ) {
    throw new Error(`${file} holds a stopped run: take it up with --resume, or move it aside first`);
  }
  if (options.resume) {
    if (!existsSync(file)) throw new Error(`there is no run to resume at ${file}`);
    resumed = JSON.parse(readFileSync(file, 'utf8')) as typeof resumed & { node?: string };
    // A run resumes only at the commit it ran at, and only if it hasn't finished.
    if (resumed.complete) throw new Error(`${file} holds a finished run: there is nothing to resume`);
    const refused = resumeRefused(
      resumed,
      { commit: committed, node: process.version, ...(mode === 'null' ? { machine: machine() } : {}) },
      mode,
    );
    if (refused) throw new Error(`${file} can't be resumed here: ${refused}`);
    const counts = Object.entries(resumed.stages).map(([k, v]) => `${k} ${v.evaluated?.length ?? 0}`);
    process.stderr.write(`resuming after ${counts.join(', ')} evaluations\n`);
  }
  const previous = (stage: string): Evaluated[] | undefined => resumed.stages[stage]?.evaluated;
  await readPostures(); // fetch once here, so the workers read the cache
  // The bounded calibration runs only if the survey found no crawl, unless a later rule allows it (PLAN §9).
  if (mode === 'bounded') {
    const survey = existsSync(SURVEYED) ? (JSON.parse(readFileSync(SURVEYED, 'utf8')) as SurveyVerdict) : null;
    if (!boundedAllowed(survey)) {
      throw new Error(
        "the survey found a crawl (data/calibration/survey.json), so the bounded calibration doesn't run (PLAN §9)",
      );
    }
  }
  // Round 3 runs once, and only because the survey found a crawl (PLAN §9).
  if (mode === 'round 3') {
    const survey = existsSync(SURVEYED) ? (JSON.parse(readFileSync(SURVEYED, 'utf8')) as SurveyVerdict) : null;
    if (!roundThreeAllowed(survey, existsSync(ROUND_3))) {
      throw new Error(
        'round 3 runs once, after a survey that found a crawl: data/calibration/survey.json says otherwise, or data/calibration/r5.json is already committed',
      );
    }
  }
  // Track S's calibration runs once (PLAN §9).
  if (mode === 'track S' && !trackSAllowed(existsSync(TRACK_S_RECORD))) {
    throw new Error("track S's calibration runs once: data/calibration/s1.json is already committed");
  }
  // A null's tuning runs once (DECISIONS.md, 2026-10-03).
  const { rewiring } = options;
  if (mode === 'null' && existsSync(nullRecord(rewiring as number))) {
    throw new Error(
      `the primary null's rewiring ${rewiring} is tuned once: ${relative(ROOT, nullRecord(rewiring as number))} is already committed`,
    );
  }
  // A null's box, by the rules that set S's on its own rest; a null whose rest can't be solved can't be built, and has no
  // fit (DECISIONS.md, 2026-10-03).
  let box: Box | undefined;
  let own: Record<string, unknown> = {};
  if (mode === 'null') {
    const data = validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8')));
    const reading = ruleReading(data, 'track S', nullNetwork(data, rewiring as number));
    box = 'unbuilt' in reading ? undefined : ruleBox(reading, 'track S');
    own = { rewiring, data: data.meta.version, machine: machine(), rule: reading, box: box ?? null };
  }
  const replaces = committedRecord(mode, full, existsSync);
  if (replaces) {
    throw new Error(
      `${relative(ROOT, replaces)} already records this run, under checkpoint 1's plain count of crossings; none runs again under the band (DECISIONS.md, 2026-10-01). Move it aside to rerun on purpose.`,
    );
  }
  const head = {
    ...settings(options.budget, mode),
    ...own,
    ...(mode === 'null' ? { bounds: box ?? null } : {}),
    commit: committed,
    // A resumed run keeps the date it started.
    date: resumed.date ?? new Date().toISOString(),
    node: process.version,
    jobs: options.jobs,
  };
  const self = fileURLToPath(import.meta.url);
  // A null's run carries on past a failed trial, so it replaces a worker that stops.
  const pool = new Pool(
    options.jobs,
    () => fork(self, ['--worker'], { execArgv: [...process.execArgv, WORKER_HEAP] }),
    mode === 'null',
  );
  // A resumed run's time carries on from the time it had run.
  const started = Date.now() - 1000 * (resumed.seconds ?? 0);
  const elapsed = (): number => (Date.now() - started) / 1000;
  mkdirSync(dirname(file), { recursive: true });
  // A scorer: the objective on its targets, for values in a form on a model; round 2 and the survey score a worm
  // without a bout by its spectral frequency, and the refit's procedure, which the bounded calibration follows, round 3
  // and track S don't. On a null's rewiring, a trial that can't be run makes the candidate's objective infinite, with
  // why, and the run carries on (DECISIONS.md, 2026-10-03).
  const scorer =
    (
      targets: readonly Target[],
      form: Form,
      spectral: boolean,
      goals?: Readonly<Record<Target, number>>,
      model?: Model,
      rewiring?: number,
    ): Scorer =>
    async (values, seeds) => {
      const named = { ...(model && model !== 'track R' ? { model } : {}), ...(rewiring ? { rewiring } : {}) };
      const results = await Promise.all(
        seeds.map((seed) =>
          rewiring
            ? pool.run({ values, form, seed, ...named }).then(
                (r) => r as Ran,
                (e: unknown) => {
                  // Only the candidate's own failures rank it last; a worker that stopped stops the run, to be resumed.
                  if (!candidateFailure(e)) throw e;
                  return { failed: e.message };
                },
              )
            : (pool.run({ values, form, seed, ...named }) as Promise<Ran>),
        ),
      );
      const score = scoreTrials(results, { targets, spectral, goals, model, rewiring });
      if (score.failed) process.stderr.write(`a candidate couldn't be run, ranked last: ${score.failed}\n`);
      return score;
    };
  const stages: Record<string, Partial<Fit>> = { ...resumed.stages };
  // The probe's and the survey's graded runs, kept through every save, so a resumed run doesn't grade them again.
  const runs: ProbeRun[] = [...(resumed.runs ?? [])];
  const keepsRuns = mode === 'probe' || mode === 'survey';
  // Written whole or not at all, so that a stop mid-write leaves the last save to resume from.
  const save = (complete: boolean, extra: Record<string, unknown> = {}): void =>
    writeWhole(
      file,
      JSON.stringify({ ...head, complete, seconds: elapsed(), stages, ...(keepsRuns ? { runs } : {}), ...extra }) +
        '\n',
    );
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
        `  ${(c.value as number | null)?.toFixed(4) ?? '∞'} (fit ${c.fit === null ? '—' : c.fit.toFixed(4)})  ${c.from}: bouts ${c.measures.bouts}, f ${c.measures.frequency?.toFixed(3) ?? '—'} Hz, λ ${c.measures.wavelength?.toFixed(2) ?? '—'}, v ${c.measures.speed.toFixed(3)}, reversals ${c.measures.reversalRate.toFixed(2)}/min\n`,
      );
    }
  };
  // Stage 1 of R's second round, one search with its final check, then its pick graded by checkpoint 1's grading on
  // seeds of its own, as the probe and the survey run it.
  const gradedSearch = async (
    stage: string,
    mode: 'probe' | 'survey',
    budget: number,
    seed: number,
    gradeSeeds: readonly number[],
    starts?: { start: readonly number[]; restartFrom: (restart: number) => readonly number[] },
  ): Promise<ProbeRun> => {
    const { form, targets, spectral, restarts } = procedure(mode);
    const basis = await readPinned('eigenworms');
    const fit = await calibrate(scorer(targets, form, spectral), {
      form,
      budget,
      seed,
      restarts,
      ...(starts ?? {}),
      previous: previous(stage),
      progress: report(stage, budget),
    });
    stages[stage] = fit;
    describe(fit, targets);
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
      for (const seed of probe.seeds) {
        // A run graded before a stop is kept, not searched again.
        if (runs.some((r) => r.seed === seed)) continue;
        runs.push(await gradedSearch(`probe ${seed}`, 'probe', probe.budget, seed, probe.gradeSeeds));
        // Saved as each is graded, so that a stop loses no grade.
        save(false);
      }
      const goAhead = runs.some((r) => r.grade !== 'fail');
      save(true, { goAhead });
      // The committed record: each run's pick and grade, without the searches' evaluations.
      const record = { ...head, complete: true, seconds: elapsed(), runs, goAhead };
      writeWhole(PROBE, await formatJson(JSON.stringify(record), PROBE));
      process.stdout.write(
        `The full run ${goAhead ? 'goes ahead' : 'does not go ahead: the round stops and reports'}.\n`,
      );
    } else if (mode === 'survey') {
      for (const [search, seed] of SURVEY.seeds.entries()) {
        if (runs.some((r) => r.seed === seed)) continue;
        const run = await gradedSearch(`survey ${seed}`, 'survey', SURVEY.budget, seed, SURVEY.gradeSeeds, {
          start: surveyStart(search, 0),
          restartFrom: (r) => surveyStart(search, r),
        });
        runs.push({ ...run, search, start: surveyStart(search, 0) });
        save(false);
      }
      const partial = runs.some((r) => r.grade !== 'fail');
      save(true, { partial });
      const record = { ...head, complete: true, seconds: elapsed(), runs, partial };
      writeWhole(SURVEYED, await formatJson(JSON.stringify(record), SURVEYED));
      process.stdout.write(
        partial
          ? "A pick grades at least partial: R's third round runs on the bounded model, by rules of its own.\n"
          : "No pick grades partial: R ends, and the bounded model is calibrated once by the refit's procedure.\n",
      );
    } else if (mode === 'null' && !box) {
      // A null whose rest can't be solved can't be built: it has no fit, and doesn't crawl (DECISIONS.md, 2026-10-03).
      const run = { ...head, complete: true, seconds: elapsed(), built: false, fit: null };
      const record = nullRecord(rewiring as number);
      writeWhole(record, await formatJson(JSON.stringify(run), record));
      writeWhole(file, JSON.stringify(run) + '\n');
      process.stdout.write(`The rewiring ${rewiring}'s rest can't be solved: it can't be built, and has no fit.\n`);
    } else if (mode === 'round 3' || mode === 'track S' || mode === 'null') {
      // Track S's calibration is round 3's procedure on its own model (TRACK_S_ROUND), and a null's is S's on its own
      // rewiring, in its own box.
      const { form, targets, spectral, restarts, goals, model } = procedure(mode);
      const round = mode === 'round 3' ? THIRD_ROUND : TRACK_S_ROUND;
      const score = scorer(targets, form, spectral, goals, model, mode === 'null' ? rewiring : undefined);
      // A search a resumed run had finished, its final check included, isn't run again.
      const finished = (stage: string): Fit | null => {
        const s = resumed.stages[stage];
        return s?.evaluated && s.generations && s.checked && s.final ? (s as Fit) : null;
      };
      const search = async (stage: string, j: number, budget: number, before?: Fit): Promise<Fit> => {
        const done = finished(stage);
        if (done) return done;
        return calibrate(score, {
          form,
          model,
          ...(box ? { box } : {}),
          budget,
          seed: round.seeds[j],
          restarts,
          start: surveyStart(j, 0),
          restartFrom: (r) => surveyStart(j, r),
          // Phase 2 continues phase 1's search, replaying its evaluations, or its own so far once it has more.
          previous: continuedFrom(previous(stage), before?.evaluated),
          ...(before ? { extra: [{ from: `phase 1's pick, ${before.final.from}`, values: before.final.values }] } : {}),
          progress: report(stage, budget),
          ...(mode === 'null' ? { refuse: allFailed } : {}),
        });
      };
      const pick = (seed: number, fit: Fit) => ({ seed, ...fit.final });
      // An infinite objective, which JSON writes as null once a resumed run reads it back.
      const shown = (x: number | null): string => (x === null || !Number.isFinite(x) ? '∞' : x.toFixed(4));
      // Phase 1: the survey's design, with round 3's objective.
      const first = new Map<number, Fit>();
      for (const [j, seed] of round.seeds.entries()) {
        const stage = `phase 1 ${seed}`;
        const fit = await search(stage, j, round.phase1.budget);
        stages[stage] = fit;
        first.set(seed, fit);
        save(false);
        describe(fit, targets);
      }
      const order = ranked([...first].map(([seed, fit]) => pick(seed, fit)));
      const continued = order.slice(0, round.phase2.continued).map((p) => p.seed);
      process.stdout.write(
        `Phase 1's picks in order: ${order.map((p) => `${p.seed} (${shown(p.value)})`).join(', ')}; phase 2 continues ${continued.join(', ')}.\n`,
      );
      // Phase 2: the same searches, continued.
      const second = new Map<number, Fit>();
      for (const seed of continued) {
        const stage = `phase 2 ${seed}`;
        const fit = await search(stage, round.seeds.indexOf(seed), round.phase2.budget, first.get(seed));
        stages[stage] = fit;
        second.set(seed, fit);
        save(false);
        describe(fit, targets);
      }
      // The picks in the order they take §7.2's comparison.
      const picks = ranked([...second].map(([seed, fit]) => pick(seed, fit)));
      const phase1 = [...first].map(([seed, fit]) => ({
        seed,
        search: round.seeds.indexOf(seed),
        restarts: Math.max(...fit.generations.map((g) => g.restart)),
        final: fit.final,
      }));
      // Phase 1's ranking, which chose the searches phase 2 continues.
      const ranking = order.map(({ seed, value, from }) => ({ seed, value, from }));
      const fit = mode === 'null' ? { fit: nullFit(picks) } : {};
      const run = { ...head, complete: true, seconds: elapsed(), stages, phase1, ranking, continued, picks, ...fit };
      // The committed record first, whole, so that a stop between the two writes still leaves the run's result; once it
      // exists the round won't run again.
      const record = mode === 'null' ? nullRecord(rewiring as number) : mode === 'track S' ? TRACK_S_RECORD : ROUND_3;
      writeWhole(record, await formatJson(JSON.stringify(summary(run)), record));
      writeWhole(file, JSON.stringify(run) + '\n');
      process.stdout.write(
        mode === 'null'
          ? `The picks, in order; the first is rewiring ${rewiring}'s fit:\n`
          : "The picks, in the order they take §7.2's comparison:\n",
      );
      for (const p of picks) {
        process.stdout.write(`  seed ${p.seed}, ${p.from}: ${shown(p.value)}\n`);
        for (const id of CALIBRATED) process.stdout.write(`    ${id}: ${String(p.values[id])}\n`);
      }
    } else if (mode === 'bounded') {
      const { form, targets, spectral } = procedure('bounded');
      const fit = await calibrate(scorer(targets, form, spectral), {
        form,
        budget: options.budget,
        previous: previous('bounded'),
        progress: report('bounded', options.budget),
      });
      stages.bounded = fit;
      describe(fit, targets);
      const run = { ...head, complete: true, seconds: elapsed(), stages, final: fit.final };
      writeWhole(file, JSON.stringify(run) + '\n');
      if (full) writeWhole(BOUNDED, await formatJson(JSON.stringify(summary(run)), BOUNDED));
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
      writeWhole(file, JSON.stringify(run) + '\n');
      if (full) {
        mkdirSync(dirname(SUMMARY), { recursive: true });
        writeWhole(SUMMARY, await formatJson(JSON.stringify(summary(run)), SUMMARY));
      }
      process.stderr.write(`both stages and their final checks in ${elapsed().toFixed(0)} s; wrote ${file}\n`);
      // Unrounded, as the registry takes them.
      process.stdout.write(`Final, from ${second.final.from}:\n`);
      for (const id of CALIBRATED) process.stdout.write(`  ${id}: ${String(second.final.values[id])}\n`);
    }
  } finally {
    pool.stop();
  }
}
