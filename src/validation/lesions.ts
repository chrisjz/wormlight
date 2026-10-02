// Checkpoint 5's lesions (PLAN §7.4, "Checkpoint 5 lesions"; DECISIONS.md, 2026-10-02): each lesion against the
// intact worm, five primary rows graded and three secondary lesions reported. The spontaneous rows read 30 trials of
// 120 s on seeds 1 to 30, lesioned and intact on the same seeds, postures and noise; the touch rows read checkpoints 2
// and 3's protocol run on the lesioned worm against the intact worm's run. A row needs the effect and the test: its
// pooled measure moves the reported way by at least the stated amount, and its test is significant, two-sided at
// α = 0.05, the significant difference in the reported direction. A fall, or PVC's "stays", needs a measured, positive
// intact measure, checkpoint 3's response at least its 1% floor; otherwise the row is unmeasured, and fails. RIM's
// rise counts from zero.

import { fisherTwoSided, mannWhitneyTwoSided } from '../sim/stats.ts';
import { swings } from './mechanism.ts';
import { reversals, runKinematics, type Run } from './motion.ts';
import { CHECKPOINT_3, checkpoint2, checkpoint3, type TouchTrialRecord } from './touch.ts';
import type { TrialRecord } from './trial.ts';

export const LESION_TRIALS = 30;
export const LESION_SECONDS = 120;
const ALPHA = 0.05;
// A long reversal holds three head swings or more (PLAN §7.1); every other is short.
export const LONG_SWINGS = 3;

export interface Lesion {
  id: string;
  label: string;
  neurons: string[];
}

// The five primary lesions, graded, and the three secondary ones, reported (PLAN §7.4).
export const PRIMARY: readonly Lesion[] = [
  { id: 'ava-avd', label: 'AVA + AVD', neurons: ['AVAL', 'AVAR', 'AVDL', 'AVDR'] },
  { id: 'avb-pvc', label: 'AVB + PVC', neurons: ['AVBL', 'AVBR', 'PVCL', 'PVCR'] },
  { id: 'pvc', label: 'PVC', neurons: ['PVCL', 'PVCR'] },
  { id: 'ava', label: 'AVA', neurons: ['AVAL', 'AVAR'] },
  { id: 'rim', label: 'RIM', neurons: ['RIML', 'RIMR'] },
];
export const SECONDARY: readonly Lesion[] = [
  { id: 'aib', label: 'AIB', neurons: ['AIBL', 'AIBR'] },
  { id: 'aiy', label: 'AIY', neurons: ['AIYL', 'AIYR'] },
  { id: 'aiz', label: 'AIZ', neurons: ['AIZL', 'AIZR'] },
];
// The lesions whose rows read touches, besides the intact worm's run.
export const TOUCHED: readonly string[] = ['ava-avd', 'pvc'];
export const INTACT = 'intact';

export const lesionNeurons = (id: string): string[] | undefined => {
  if (id === INTACT) return undefined;
  const found = [...PRIMARY, ...SECONDARY].find((l) => l.id === id);
  if (!found) throw new Error(`there is no lesion ${id}`);
  return found.neurons;
};

// One trial's spontaneous measures, from its record with head angles: reversals a minute, short and long, its mean
// velocity towards the head over its measured samples, and checkpoint 1's speed over its forward bouts, null with none.
export interface Spontaneous {
  seed: number;
  finite: boolean;
  minutes: number;
  reversals: number;
  short: number;
  long: number;
  meanVelocity: number;
  boutSpeed: number | null;
}

// How many head swings lie within a reversal: those whose peak, the sample of the angle's largest magnitude between
// its two accepted crossings, lies among the reversal's backward samples.
export function swingsWithin(angle: readonly number[], reversal: Run): number {
  const crossings = swings(angle, 0);
  let count = 0;
  for (let c = 1; c < crossings.length; c++) {
    let peak = crossings[c - 1];
    for (let k = crossings[c - 1]; k <= crossings[c]; k++) if (Math.abs(angle[k]) > Math.abs(angle[peak])) peak = k;
    if (peak >= reversal.start && peak < reversal.start + reversal.length) count++;
  }
  return count;
}

export function spontaneous(r: TrialRecord): Spontaneous {
  if (!r.headAngle) throw new Error(`seed ${r.seed}'s trial recorded no head angles`);
  const minutes = (r.velocity.length * 0.1) / 60;
  const all = reversals(r.velocity);
  const long = all.filter((rev) => swingsWithin(r.headAngle as number[], rev) >= LONG_SWINGS).length;
  const n = r.velocity.length;
  return {
    seed: r.seed,
    finite: r.finite,
    minutes,
    reversals: minutes > 0 ? all.length / minutes : 0,
    short: minutes > 0 ? (all.length - long) / minutes : 0,
    long: minutes > 0 ? long / minutes : 0,
    meanVelocity: n > 0 ? r.velocity.reduce((a, b) => a + b, 0) / n : 0,
    boutSpeed: runKinematics(r).speed,
  };
}

// One clause of a row: what it measures, the intact and lesioned values, the change it asks for, its test, and
// whether it passes; unmeasured, with why, when its rule can't be applied.
export interface LesionClause {
  name: string;
  intact: number | null;
  lesioned: number | null;
  asks: string;
  // The test's p-value, and whether its significant difference lies in the reported direction; null with no test.
  p: number | null;
  direction: boolean | null;
  unmeasured: string | null;
  pass: boolean;
}

export interface LesionRow {
  id: string;
  label: string;
  clauses: LesionClause[];
  pass: boolean;
  // Whether the row reads reversals, so on track S's fit it is reported as fitted (DECISIONS.md, 2026-10-02).
  readsReversals: boolean;
}

const mean = (x: readonly number[]): number => (x.length > 0 ? x.reduce((a, b) => a + b, 0) / x.length : 0);

// A fall of `amount` in a measure per trial, tested by Mann–Whitney's test between the lesioned and intact trials.
function fall(
  name: string,
  intact: readonly number[],
  lesioned: readonly number[],
  amount: number,
  sound: string | null,
): LesionClause {
  const [i, l] = [mean(intact), mean(lesioned)];
  const asks = `falls by ${Math.round(100 * amount)}% or more`;
  const unmeasured = sound ?? (i > 0 ? null : `the intact measure is ${i === 0 ? 'zero' : 'not positive'}`);
  if (unmeasured) return { name, intact: i, lesioned: l, asks, p: null, direction: null, unmeasured, pass: false };
  const t = mannWhitneyTwoSided(lesioned, intact);
  const direction = t.z === 0 ? null : t.z < 0;
  return {
    name,
    intact: i,
    lesioned: l,
    asks,
    p: t.p,
    direction,
    unmeasured: null,
    pass: l <= (1 - amount) * i && t.p < ALPHA && direction === true,
  };
}

// A rise in a measure per trial, from zero too, by Mann–Whitney's test.
function rise(
  name: string,
  intact: readonly number[],
  lesioned: readonly number[],
  sound: string | null,
): LesionClause {
  const [i, l] = [mean(intact), mean(lesioned)];
  if (sound)
    return { name, intact: i, lesioned: l, asks: 'rises', p: null, direction: null, unmeasured: sound, pass: false };
  const t = mannWhitneyTwoSided(lesioned, intact);
  const direction = t.z === 0 ? null : t.z > 0;
  return {
    name,
    intact: i,
    lesioned: l,
    asks: 'rises',
    p: t.p,
    direction,
    unmeasured: null,
    pass: l > i && t.p < ALPHA && direction === true,
  };
}

export interface Checkpoint5 {
  grade: 'pass' | 'partial' | 'fail';
  rows: LesionRow[];
  // The secondary lesions, reported: each one's pooled measures beside the intact worm's, with Mann–Whitney's p.
  secondary: {
    id: string;
    label: string;
    measures: { name: string; intact: number; lesioned: number; p: number }[];
  }[];
  // The spontaneous measures of every trial, by lesion, for the report.
  trials: Record<string, Spontaneous[]>;
  // Reported beside AVB + PVC's row: checkpoint 1's speed over forward bouts, pooled over each arm's trials with one.
  boutSpeed: { intact: number | null; lesioned: number | null };
  unconverged: number;
}

// The grade from the spontaneous trials, by lesion id with INTACT among them, and the touch runs, by the same ids.
export function checkpoint5(
  spont: Record<string, readonly TrialRecord[]>,
  touches: Record<string, readonly TouchTrialRecord[]>,
): Checkpoint5 {
  const measures: Record<string, Spontaneous[]> = {};
  for (const [id, records] of Object.entries(spont)) {
    measures[id] = [...records].sort((a, b) => a.seed - b.seed).map(spontaneous);
  }
  const intact = measures[INTACT];
  if (!intact) throw new Error('checkpoint 5 needs the intact worm');
  const seeds = intact.map((t) => t.seed).join(',');
  // A trial that left the finite numbers, intact or lesioned, makes its arm's rows unmeasured.
  const broken = (id: string): string | null => {
    const arm = measures[id];
    if (!arm) return `no trials of ${id}`;
    if (arm.map((t) => t.seed).join(',') !== seeds)
      throw new Error(`${id}'s trials pair with the intact worm's seed by seed`);
    const bad = [...intact, ...arm].find((t) => !t.finite);
    return bad ? `seed ${bad.seed}'s trial left the finite numbers` : null;
  };
  const values = (id: string, key: 'reversals' | 'short' | 'long' | 'meanVelocity'): number[] =>
    (measures[id] ?? []).map((t) => t[key]);
  // The touch clauses: checkpoint 2's or 3's response, lesioned against intact.
  const touchSound = (id: string): string | null => {
    const [i, l] = [checkpoint2(touches[INTACT] ?? []), checkpoint2(touches[id] ?? [])];
    return i.unmeasured
      ? `the intact touches: ${i.unmeasured}`
      : l.unmeasured
        ? `the lesioned touches: ${l.unmeasured}`
        : null;
  };
  const touchFall = (id: string): LesionClause => {
    const name = "Touch-evoked reversals (checkpoint 2's response)";
    const [i, l] = [checkpoint2(touches[INTACT] ?? []), checkpoint2(touches[id] ?? [])];
    const asks = 'falls by 80% or more';
    const unmeasured =
      touchSound(id) ??
      (i.response > 0 ? null : `the intact response is ${i.response === 0 ? 'zero' : 'not positive'}`);
    if (unmeasured) {
      return {
        name,
        intact: i.response,
        lesioned: l.response,
        asks,
        p: null,
        direction: null,
        unmeasured,
        pass: false,
      };
    }
    const p = fisherTwoSided(l.touchedOnly, l.touches, i.touchedOnly, i.touches);
    const direction = l.touchedOnly / l.touches < i.touchedOnly / i.touches;
    return {
      name,
      intact: i.response,
      lesioned: l.response,
      asks,
      p,
      direction,
      unmeasured: null,
      pass: l.response <= 0.2 * i.response && p < ALPHA && direction,
    };
  };
  const speedFall = (id: string): LesionClause => {
    const name = "The posterior touch's speed-up (checkpoint 3's response)";
    const [i, l] = [checkpoint3(touches[INTACT] ?? []), checkpoint3(touches[id] ?? [])];
    const asks = 'falls by 80% or more';
    const unmeasured =
      (i.unmeasured ? `the intact touches: ${i.unmeasured}` : null) ??
      (l.unmeasured ? `the lesioned touches: ${l.unmeasured}` : null) ??
      (i.response !== null && i.response >= CHECKPOINT_3.partial
        ? null
        : `the intact response, ${i.response === null ? 'unmeasured' : `${i.response < 0 ? '−' : ''}${(100 * Math.abs(i.response)).toFixed(1)}%`}, is under checkpoint 3's 1% floor`);
    if (unmeasured || i.response === null || l.response === null) {
      return {
        name,
        intact: i.response,
        lesioned: l.response,
        asks,
        p: null,
        direction: null,
        unmeasured,
        pass: false,
      };
    }
    const differences = (r: typeof i): number[] => r.pairs.map((t) => t.after - t.shamAfter);
    const t = mannWhitneyTwoSided(differences(l), differences(i));
    const direction = t.z === 0 ? null : t.z < 0;
    return {
      name,
      intact: i.response,
      lesioned: l.response,
      asks,
      p: t.p,
      direction,
      unmeasured: null,
      pass: l.response <= 0.2 * i.response && t.p < ALPHA && direction === true,
    };
  };
  const stays = (id: string): LesionClause => {
    const name = "Touch-evoked reversals (checkpoint 2's response) stay";
    const [i, l] = [checkpoint2(touches[INTACT] ?? []), checkpoint2(touches[id] ?? [])];
    const asks = 'stays at 70% of intact or more';
    const unmeasured =
      touchSound(id) ??
      (i.response > 0 ? null : `the intact response is ${i.response === 0 ? 'zero' : 'not positive'}`);
    return {
      name,
      intact: i.response,
      lesioned: l.response,
      asks,
      p: null,
      direction: null,
      unmeasured,
      pass: unmeasured === null && l.response >= 0.7 * i.response,
    };
  };
  const row = (id: string, readsReversals: boolean, clauses: LesionClause[]): LesionRow => ({
    id,
    label: (PRIMARY.find((l) => l.id === id) as Lesion).label,
    clauses,
    pass: clauses.every((c) => c.pass),
    readsReversals,
  });
  const reversalRate = 'Spontaneous reversals a minute';
  const rows = [
    row('ava-avd', true, [
      touchFall('ava-avd'),
      fall(reversalRate, values(INTACT, 'reversals'), values('ava-avd', 'reversals'), 0.3, broken('ava-avd')),
    ]),
    row('avb-pvc', false, [
      fall(
        'Forward speed, mean velocity towards the head (body lengths/s)',
        values(INTACT, 'meanVelocity'),
        values('avb-pvc', 'meanVelocity'),
        0.8,
        broken('avb-pvc'),
      ),
    ]),
    row('pvc', true, [speedFall('pvc'), stays('pvc')]),
    row('ava', true, [
      fall('Long reversals a minute', values(INTACT, 'long'), values('ava', 'long'), 0.8, broken('ava')),
      fall(reversalRate, values(INTACT, 'reversals'), values('ava', 'reversals'), 0.3, broken('ava')),
    ]),
    row('rim', true, [
      rise('Short reversals a minute', values(INTACT, 'short'), values('rim', 'short'), broken('rim')),
    ]),
  ];
  const passed = rows.filter((r) => r.pass).length;
  const pooledBoutSpeed = (id: string): number | null => {
    const speeds = (measures[id] ?? []).flatMap((t) => (t.boutSpeed === null ? [] : [t.boutSpeed]));
    return speeds.length > 0 ? mean(speeds) : null;
  };
  return {
    grade: passed === PRIMARY.length ? 'pass' : passed >= 3 ? 'partial' : 'fail',
    rows,
    secondary: SECONDARY.filter((l) => measures[l.id]).map((l) => ({
      id: l.id,
      label: l.label,
      measures: (
        [
          ['Spontaneous reversals a minute', 'reversals'],
          ['Short reversals a minute', 'short'],
          ['Long reversals a minute', 'long'],
          ['Mean velocity towards the head (body lengths/s)', 'meanVelocity'],
        ] as const
      ).map(([name, key]) => ({
        name,
        intact: mean(values(INTACT, key)),
        lesioned: mean(values(l.id, key)),
        p: mannWhitneyTwoSided(values(l.id, key), values(INTACT, key)).p,
      })),
    })),
    trials: measures,
    boutSpeed: { intact: pooledBoutSpeed(INTACT), lesioned: pooledBoutSpeed('avb-pvc') },
    unconverged: Object.values(spont).reduce((n, rs) => n + rs.reduce((m, r) => m + r.unconverged, 0), 0),
  };
}
