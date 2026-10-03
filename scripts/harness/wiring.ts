// Checkpoint 6's grading of a wiring (spec §8; PLAN §7.4; DECISIONS.md, 2026-10-03): the real wiring at the registry's
// values, or the primary null's rewiring N at its record's first pick, graded on the machine and Node its search ran
// on. Checkpoint 1 on seeds 1 to 20, with the runs that show what paces it, gates it; a wiring that crawls then runs
// checkpoints 0 and 2 to 5 by their own protocols, checkpoint 0 reported and graded by nothing. Its summary, written
// to data/checkpoint-6/, is what the verdict reads. The full records go to harness-out/checkpoint-6/, a stage at a
// time, and a stage recorded at the same commit on the same machine is read back rather than run again.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WormlightData } from '../../src/data/schema.ts';
import { CHOSEN_FORM, inForm, PARAMS } from '../../src/science/params.ts';
import { CHOSEN_MODEL, partsOf } from '../../src/sim/trackS.ts';
import { CALIBRATED, loopParams, World } from '../../src/sim/world.ts';
import { boxOf, variants, type Box, type Values } from '../../src/validation/calibration.ts';
import { checkpoint4, type ChemotaxisRecord } from '../../src/validation/chemotaxis.ts';
import {
  checkpoint0,
  checkpoint1,
  summariseTrial,
  type Checkpoint1,
  type Diagnostics,
} from '../../src/validation/checkpoints.ts';
import { atSpeedFloor, speedInterval } from '../../src/validation/equivalence.ts';
import { checkpoint5, INTACT } from '../../src/validation/lesions.ts';
import { voltageSpread, widest } from '../../src/validation/noiseSpread.ts';
import { checkpoint2, checkpoint3, type TouchTrialRecord } from '../../src/validation/touch.ts';
import type { TrialRecord } from '../../src/validation/trial.ts';
import {
  crawls,
  nullNetwork,
  NULLS,
  verdicts,
  type Grade,
  type Verdicts,
  type WiringGrades,
} from '../../src/validation/wiringTest.ts';
import { machine, machineDiffers } from '../calibrate/machine.ts';
import { formatJson } from '../data/render.ts';
import { writeWhole } from '../experiments/trees.ts';
import { ROOT } from '../data/sources.ts';

export type Wiring = 'real' | number;
export const wiringName = (w: Wiring): string => (w === 'real' ? 'real' : `null-${w}`);
export const SUMMARIES = join(ROOT, 'data/checkpoint-6');
export const summaryPath = (w: Wiring): string => join(SUMMARIES, `${wiringName(w)}.json`);
const STAGES = join(ROOT, 'harness-out/checkpoint-6');
// Track S's calibration record, whose first pick is the real wiring's fit.
const TRACK_S_RECORD = join(ROOT, 'data/calibration/s1.json');
// A null's tuning record, as `npm run calibrate -- --null N` writes it (scripts/calibrate/run.ts).
export const nullRecordPath = (k: number): string => join(ROOT, `data/calibration/null-${k}.json`);

// What a null's tuning record holds that its grading reads.
export interface NullRecord {
  complete?: boolean;
  rewiring: number;
  data: string;
  node: string;
  commit: string;
  machine: Record<string, unknown>;
  bounds: Box | null;
  built?: boolean;
  fit: { seed: number; from: string; values: Values; value: number } | null;
  picks?: { seed: number; value: number | null }[];
  rule?: unknown;
  stages?: Record<string, { failures?: Failure[] }>;
}

// Why a null's record can't be graded here, if it can't: its search must be finished, on this data, and graded on the
// machine and Node it ran on (DECISIONS.md, 2026-10-03).
export function gradingRefused(
  record: NullRecord,
  here: { data: string; node: string; machine: Record<string, unknown> },
): string | null {
  if (record.complete !== true) return 'its search has not finished';
  if (record.data !== here.data) return `it was tuned on the data ${record.data}, not ${here.data}`;
  if (record.node !== here.node) return `it was tuned on Node ${record.node}, not ${here.node}`;
  const differs = machineDiffers(record.machine, here.machine);
  if (differs) return `it was tuned on another machine: ${differs}`;
  return null;
}

// The registry's calibrated values in the chosen form: the real wiring's fit, track S's.
export function registryValues(): Values {
  return Object.fromEntries(
    CALIBRATED.map((id) => {
      const v = inForm(id, PARAMS[id], CHOSEN_FORM).value;
      if (v === null) throw new Error(`${id} has no calibrated value`);
      return [id, v];
    }),
  ) as Values;
}

// A wiring's summary: what the verdict reads, and what the report gives of it.
export interface WiringSummary {
  wiring: string;
  rewiring?: number;
  date: string;
  commit: string;
  data: string;
  machine: Record<string, unknown>;
  // Its fit, its box and the candidates its search couldn't run; a null without a fit has no grades.
  fit: { values: Values; value?: number; seed?: number; from?: string } | null;
  box: Box | null;
  failures: number;
  // Its search's picks, each its seed and objective, the first its fit; the parameters at a bound of its box; and,
  // for a null, its tuning record's commit and hash, and what the box's rules read, the values of κ_gap,B where its
  // rest couldn't be solved among them.
  picks: { seed: number; value: number | null }[];
  onBound: string[];
  tuning?: { commit: string; sha256: string; rule: unknown };
  checkpoint1: { grade: Grade; clauses: { name: string; value: number | null; grade: string }[] } | null;
  crawls: boolean;
  // Reported for every wiring with a fit (PLAN §7.4, §9).
  // Its speed with its 95% interval; a partial is labelled at the speed floor when the interval reaches below it.
  speed?: {
    value: number | null;
    interval: [number | null, number | null];
    unmeasured: number;
    atFloor: boolean | null;
  };
  pacing?: Diagnostics['pacing'];
  variants?: { name: string; grade: Grade; forward: number; meanVelocity: number }[];
  spread?: { neuron: string; spread: number; sigma: number; tau: number };
  // If it crawls: checkpoint 0, reported, and checkpoints 2 to 5, graded.
  later?: {
    0: Grade;
    2: Grade;
    3: Grade;
    4: { grade: Grade; klinokinesis: string | null; weathervaning: string | null };
    5: { grade: Grade; rows: { id: string; pass: boolean }[] };
  };
}

// Where the replayed evaluations of a continued search lie: phase 2's first 250 are phase 1's (THIRD_ROUND), so a
// failed candidate is counted once, where it was run (DECISIONS.md, 2026-10-03).
type Failure = { restart: number; generation: number; candidate: number };
export function countFailures(stages: Readonly<Record<string, { failures?: readonly Failure[] }>>): number {
  let n = 0;
  for (const [name, stage] of Object.entries(stages)) {
    const failures = stage.failures ?? [];
    const continued = /^phase 2 (\d+)$/.exec(name);
    if (!continued) {
      n += failures.length;
      continue;
    }
    const before = new Set(
      (stages[`phase 1 ${continued[1]}`]?.failures ?? []).map((f) => `${f.restart} ${f.generation} ${f.candidate}`),
    );
    n += failures.filter((f) => !before.has(`${f.restart} ${f.generation} ${f.candidate}`)).length;
  }
  return n;
}

// The calibrated parameters a fit holds at a bound of its box, within a relative 10⁻⁹.
export function atBounds(values: Values, box: Box): string[] {
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1e-12);
  return CALIBRATED.filter((id) => near(values[id], box[id][0]) || near(values[id], box[id][1]));
}

// What the verdict map reads of a summary.
export const gradesOf = (s: WiringSummary): WiringGrades => ({
  fit: s.fit !== null,
  checkpoint1: s.checkpoint1?.grade ?? null,
  crawls: s.crawls,
  later: s.later ? { 2: s.later[2], 3: s.later[3], 4: s.later[4].grade, 5: s.later[5].grade } : {},
});

// What the harness lends the grading: its queue of a checkpoint's jobs, its pool of workers, and checkpoint 1's basis.
export interface Harness<J, R> {
  queueFor: (checkpoints: readonly (0 | 1 | 2 | 3 | 4 | 5)[]) => J[];
  runAll: (jobs: J[]) => Promise<R[]>;
  basis: readonly (readonly number[])[];
  commit: string;
}
type Kinded = {
  job: { checkpoint: number; kind: string; seed: number; lesion?: string; lesions?: string[]; variant?: number };
  record?: unknown;
};

// A stage's results, read back if it was recorded at the same commit, on the same machine, for the same brain, or run
// and recorded, whole or not at all; a file that can't be read is run again.
async function stage<J, R extends Kinded>(
  name: string,
  harness: Harness<J, R>,
  brain: object,
  jobs: () => J[],
): Promise<R[]> {
  const file = join(STAGES, `${name}.json`);
  const here = machine();
  if (existsSync(file)) {
    try {
      const kept = JSON.parse(readFileSync(file, 'utf8')) as {
        commit: string;
        machine: Record<string, unknown>;
        brain: string;
        results: R[];
      };
      if (
        kept.commit === harness.commit &&
        machineDiffers(kept.machine, here) === null &&
        kept.brain === JSON.stringify(brain)
      ) {
        return kept.results;
      }
    } catch {
      // A file cut short, as a stop mid-write can leave it on a filesystem without atomic renames: run it again.
    }
  }
  const results = await harness.runAll(jobs());
  mkdirSync(STAGES, { recursive: true });
  writeWhole(
    file,
    JSON.stringify({ commit: harness.commit, machine: here, brain: JSON.stringify(brain), results }) + '\n',
  );
  return results;
}

// A stage's records of a checkpoint and kind, by seed: checkpoint 1's own trials, or one variant's.
const records = <T>(results: readonly Kinded[], checkpoint: number, kind: string, variant?: number): T[] =>
  results
    .filter((r) => r.job.checkpoint === checkpoint && r.job.kind === kind && r.job.variant === variant)
    .map((r) => r.record as T & { seed: number })
    .sort((a, b) => a.seed - b.seed);

// Grade a wiring, write its summary, and give it.
export async function gradeWiring<J extends object, R extends Kinded>(
  wiring: Wiring,
  data: WormlightData,
  harness: Harness<J, R>,
): Promise<WiringSummary> {
  const name = wiringName(wiring);
  const here = machine();
  let values: Values;
  let box: Box;
  let fit: WiringSummary['fit'];
  let failures = 0;
  let picks: WiringSummary['picks'];
  let tuning: WiringSummary['tuning'];
  const rewiring = wiring === 'real' ? undefined : wiring;
  if (rewiring === undefined) {
    // The real wiring's fit is track S's first pick, which the registry holds (DECISIONS.md, 2026-10-02).
    values = registryValues();
    box = boxOf(CHOSEN_FORM, CHOSEN_MODEL);
    const s1 = JSON.parse(readFileSync(TRACK_S_RECORD, 'utf8')) as {
      picks: { seed: number; from: string; value: number; values: Values }[];
    };
    const first = s1.picks[0];
    if (CALIBRATED.some((id) => first.values[id] !== values[id])) {
      throw new Error("the registry's values aren't track S's first pick");
    }
    picks = s1.picks.map((p) => ({ seed: p.seed, value: p.value }));
    fit = { values, value: first.value, seed: first.seed, from: first.from };
  } else {
    const path = nullRecordPath(rewiring);
    if (!existsSync(path)) throw new Error(`there is no record of the rewiring ${rewiring}'s tuning at ${path}`);
    const text = readFileSync(path, 'utf8');
    const record = JSON.parse(text) as NullRecord;
    const refused = gradingRefused(record, { data: data.meta.version, node: process.version, machine: here });
    if (refused) throw new Error(`the rewiring ${rewiring} can't be graded here: ${refused}`);
    failures = countFailures(record.stages ?? {});
    picks = (record.picks ?? []).map((p) => ({ seed: p.seed, value: p.value }));
    tuning = {
      commit: record.commit,
      sha256: createHash('sha256').update(text).digest('hex'),
      rule: record.rule ?? null,
    };
    if (!record.fit || !record.bounds) {
      const summary: WiringSummary = {
        wiring: name,
        rewiring,
        date: new Date().toISOString().slice(0, 10),
        commit: harness.commit,
        data: data.meta.version,
        machine: here,
        fit: null,
        box: record.bounds,
        failures,
        picks,
        onBound: [],
        tuning,
        checkpoint1: null,
        crawls: false,
      };
      await write(wiring, summary);
      return summary;
    }
    values = record.fit.values;
    box = record.bounds;
    fit = { values, value: record.fit.value, seed: record.fit.seed, from: record.fit.from };
  }
  const brain = { values, ...(rewiring === undefined ? {} : { rewiring }) };
  const runs = variants(data.neurons, values, CHOSEN_FORM, CHOSEN_MODEL, box);
  // Checkpoint 1 and the runs that show what paces it: the gate.
  const first = await stage(`${name}-checkpoint-1`, harness, brain, () => [
    ...harness.queueFor([1]).map((j) => ({ ...j, ...brain })),
    ...runs.flatMap((v, variant) =>
      harness.queueFor([1]).map((j) => ({
        ...j,
        ...brain,
        values: v.values,
        variant,
        ...(v.lesions ? { lesions: v.lesions } : {}),
      })),
    ),
  ]);
  const own = records<TrialRecord>(first, 1, 'trial');
  const graded: Checkpoint1 = checkpoint1(own, harness.basis);
  const speed = speedInterval(own);
  const mean = (x: readonly number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
  const shown = runs.map((v, k) => {
    const rs = records<TrialRecord>(first, 1, 'trial', k);
    const trials = rs.map(summariseTrial);
    return {
      name: v.name,
      grade: checkpoint1(rs, harness.basis).grade,
      forward: mean(trials.map((t) => t.forward)),
      meanVelocity: mean(trials.map((t) => t.meanVelocity)),
    };
  });
  // The widest neuron's spread at the fit's noise, by §7.3's linear analysis, at the brain's own rest.
  const world = new World(
    data,
    { ...loopParams(values, CHOSEN_FORM), ...partsOf(CHOSEN_MODEL) },
    rewiring === undefined ? {} : { network: nullNetwork(data, rewiring) },
  );
  const sigma = world.params.noise;
  const tau = world.params.noiseCorrelation ?? 0;
  const net = world.brain.restNetwork();
  const spread = { ...widest(net, voltageSpread(net, world.brain.restActivations(), sigma, tau)), sigma, tau };
  const summary: WiringSummary = {
    wiring: name,
    ...(rewiring === undefined ? {} : { rewiring }),
    date: new Date().toISOString().slice(0, 10),
    commit: harness.commit,
    data: data.meta.version,
    machine: here,
    fit,
    box,
    failures,
    picks,
    onBound: atBounds(values, box),
    ...(tuning ? { tuning } : {}),
    checkpoint1: {
      grade: graded.grade,
      clauses: graded.clauses.map((c) => ({ name: c.name, value: c.value, grade: c.grade })),
    },
    crawls: crawls(graded.grade),
    speed: {
      value: speed.speed,
      interval: speed.interval,
      unmeasured: speed.unmeasured,
      // The label reads a partial alone (PLAN §7.4); a null took no comparison, so its interval alone sets it.
      atFloor: graded.grade === 'partial' ? atSpeedFloor(speed.interval, null) : null,
    },
    pacing: graded.diagnostics.pacing,
    variants: shown,
    spread,
  };
  if (summary.crawls) {
    const later = await stage(`${name}-checkpoints-0-to-5`, harness, brain, () =>
      harness.queueFor([0, 2, 4, 5]).map((j) => ({ ...j, ...brain })),
    );
    const touches = records<TouchTrialRecord>(later, 2, 'touch');
    const c4 = checkpoint4(
      records<ChemotaxisRecord>(later, 4, 'chemotaxis'),
      records<ChemotaxisRecord>(later, 4, 'control'),
    );
    const arms = (kind: 'lesion' | 'lesionTouch'): Record<string, (TrialRecord | TouchTrialRecord)[]> => {
      const out: Record<string, (TrialRecord | TouchTrialRecord)[]> = {};
      for (const r of later.filter((x) => x.job.checkpoint === 5 && x.job.kind === kind)) {
        (out[r.job.lesion ?? INTACT] ??= []).push(r.record as TrialRecord | TouchTrialRecord);
      }
      for (const list of Object.values(out)) list.sort((a, b) => a.seed - b.seed);
      return out;
    };
    const c5 = checkpoint5(
      arms('lesion') as Record<string, TrialRecord[]>,
      arms('lesionTouch') as Record<string, TouchTrialRecord[]>,
    );
    summary.later = {
      0: checkpoint0(
        records<TrialRecord>(later, 0, 'trial'),
        records<TrialRecord>(later, 0, 'touched'),
        records<ChemotaxisRecord>(later, 0, 'assay'),
      ).grade,
      2: checkpoint2(touches).grade,
      3: checkpoint3(touches).grade,
      4: {
        grade: c4.grade,
        klinokinesis: c4.klinokinesis?.grade ?? null,
        weathervaning: c4.weathervaning?.grade ?? null,
      },
      5: { grade: c5.grade, rows: c5.rows.map((r) => ({ id: r.id, pass: r.pass })) },
    };
  }
  await write(wiring, summary);
  return summary;
}

async function write(wiring: Wiring, summary: WiringSummary): Promise<void> {
  mkdirSync(SUMMARIES, { recursive: true });
  const path = summaryPath(wiring);
  writeFileSync(path, await formatJson(JSON.stringify(summary), path));
}

// The eleven summaries, the real wiring's first, and the verdicts they give; every one must be there.
export function readSummaries(): { real: WiringSummary; nulls: WiringSummary[]; verdicts: Verdicts } {
  const wirings: Wiring[] = ['real', ...NULLS];
  const missing = wirings.filter((w) => !existsSync(summaryPath(w))).map(wiringName);
  if (missing.length > 0) throw new Error(`checkpoint 6 needs every wiring's summary; missing: ${missing.join(', ')}`);
  const [real, ...nulls] = wirings.map((w) => JSON.parse(readFileSync(summaryPath(w), 'utf8')) as WiringSummary);
  return { real, nulls, verdicts: verdicts(gradesOf(real), nulls.map(gradesOf)) };
}
