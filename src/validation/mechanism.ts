// Checkpoint 4's mechanism (PLAN §7.4, "Checkpoint 4 mechanism"; DECISIONS.md, 2026-10-02): klinokinesis and
// weathervaning, reported and never gating. A sampler takes each worm's samples every 0.1 s as it runs and reduces
// them, in the worker, to what the statistics need: klinokinesis's reorientations and time at risk by the sign of
// dC/dt, and weathervaning's transitions from one 3.3 s block to the next. The statistics pool those over worms,
// resampled with replacement for their 80% intervals, each worm bringing both arms where they are compared.

import type { Body } from '../sim/body/body.ts';
import { hash, uniform } from '../sim/brain/rng.ts';
import { ODOUR_CELL } from '../sim/numerics.ts';
import type { Odour } from '../sim/sensing.ts';
import { EQUIVALENCE, percentileInterval } from './equivalence.ts';
import { MEASURE_FROM, MOTION_FLOOR, MOTION_SAMPLE, forwardVelocity, headAngle, reversals } from './motion.ts';

// The blocks: PLAN's undulation period, 3.3 s, 33 samples, from the measures' start.
export const BLOCK = 33;
const FROM = Math.round(MEASURE_FROM / MOTION_SAMPLE);
// Head swings (PLAN §7.1): the head angle's crossings (headAngle in motion.ts), at least 0.5 s apart with a peak
// above 10° between them.
const SWING_GAP = Math.round(0.5 / MOTION_SAMPLE);
const SWING_PEAK = (10 * Math.PI) / 180;
// An omega turn: the front, the line from the midline at 0.2 body lengths to the head, turning by more than 135°
// within one head swing (PLAN §7.4; Gray et al. 2005).
const FRONT = 0.2;
const OMEGA = (135 * Math.PI) / 180;
// Weathervaning's floor on a transition's stride, as a share of the set's median (nematode's Logbook 035).
export const STRIDE_FLOOR = 0.25;

// One worm's mechanism, reduced.
export interface MechanismRecord {
  // Klinokinesis: reorientations starting while dC/dt over the 3.3 s before was negative or positive, and the samples
  // at risk, those in no reorientation, by the same sign; and how many reversals and omega turns there were.
  reorientations: { down: number; up: number };
  atRisk: { down: number; up: number };
  reversals: number;
  omegas: number;
  // Its companion: the absolute change in heading from one block to the next, summed, and the transitions, by the
  // sign of dC/dt over the earlier block.
  turning: { down: number; up: number; downs: number; ups: number };
  // Weathervaning's transitions: the earlier block's bearing (rad), the curving rate (rad/mm), the later block's
  // stride (mm), and whether neither block holds a reorientation or a backward sample.
  transitions: { bearing: number[]; curving: number[]; stride: number[]; clean: boolean[] };
}

const wrap = (a: number): number => {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  if (x > Math.PI) x -= 2 * Math.PI;
  return x;
};

// Takes a worm's samples as it runs, from t = 0, every 0.1 s.
export class MechanismSampler {
  private readonly centroid: number[] = [];
  private readonly head: number[] = [];
  private readonly angle: number[] = [];
  private readonly front: number[] = [];
  private readonly smell: number[] = [];

  private readonly body: Body;
  private readonly field: Odour;
  private readonly nose: number;

  constructor(body: Body, field: Odour, nose: number) {
    this.body = body;
    this.field = field;
    this.nose = nose;
  }

  sample(): void {
    const { body } = this;
    let [x, y] = [0, 0];
    for (let i = 0; i < body.rods; i++) [x, y] = [x + body.x[i], y + body.y[i]];
    this.centroid.push(x / body.rods, y / body.rods);
    this.head.push(body.x[0], body.y[0]);
    this.angle.push(headAngle(body.x, body.y, body.params.segments));
    const [fx, fy] = body.at(FRONT);
    this.front.push(Math.atan2(body.y[0] - fy, body.x[0] - fx));
    const [nx, ny] = body.at(this.nose);
    this.smell.push(this.field.sample(nx, ny));
  }

  // The field's gradient's direction at (x, y), by central differences over one cell.
  private gradient(x: number, y: number): number {
    const h = ODOUR_CELL / 2;
    const gx = this.field.sample(x + h, y) - this.field.sample(x - h, y);
    const gy = this.field.sample(x, y + h) - this.field.sample(x, y - h);
    return Math.atan2(gy, gx);
  }

  reduce(length: number): MechanismRecord {
    const n = this.smell.length;
    const velocity = forwardVelocity(this.centroid, this.head, length);
    // Velocity sample i is the sample FROM + i's.
    const backward = new Uint8Array(n);
    for (let i = 0; i < velocity.length; i++) if (velocity[i] < -MOTION_FLOOR) backward[FROM + i] = 1;
    // Reorientations: reversals from their first backward sample, and omega turns between a swing's crossings.
    const inTurn = new Uint8Array(n);
    const starts: number[] = [];
    let reversalCount = 0;
    for (const r of reversals(velocity)) {
      reversalCount++;
      starts.push(FROM + r.start);
      for (let k = FROM + r.start; k < FROM + r.start + r.length; k++) inTurn[k] = 1;
    }
    const omegas = omegaTurns(this.angle, this.front, FROM);
    for (const [a, b] of omegas) {
      starts.push(a);
      for (let k = a; k <= b; k++) inTurn[k] = 1;
    }
    const omegaCount = omegas.length;
    // dC/dt's sign over the 3.3 s before sample k.
    const sign = (k: number): number => (k < BLOCK ? 0 : Math.sign(this.smell[k] - this.smell[k - BLOCK]));
    const reorientations = { down: 0, up: 0 };
    for (const k of starts) {
      const s = sign(k);
      if (s < 0) reorientations.down++;
      else if (s > 0) reorientations.up++;
    }
    const atRisk = { down: 0, up: 0 };
    for (let k = FROM; k < n; k++) {
      if (inTurn[k]) continue;
      const s = sign(k);
      if (s < 0) atRisk.down++;
      else if (s > 0) atRisk.up++;
    }
    // Blocks, tiled from the measures' start, a final part-block dropped: each one's heading, stride, dC/dt, bearing
    // at its start, and whether it holds a reorientation or a backward sample.
    const blocks: { heading: number; stride: number; dc: number; bearing: number; dirty: boolean }[] = [];
    for (let a = FROM; a + BLOCK < n; a += BLOCK) {
      const b = a + BLOCK;
      const [x0, y0] = [this.centroid[2 * a], this.centroid[2 * a + 1]];
      const [dx, dy] = [this.centroid[2 * b] - x0, this.centroid[2 * b + 1] - y0];
      const heading = Math.atan2(dy, dx);
      let dirty = false;
      for (let k = a; k <= b && !dirty; k++) dirty = inTurn[k] === 1 || backward[k] === 1;
      blocks.push({
        heading,
        stride: 1000 * Math.hypot(dx, dy),
        dc: this.smell[b] - this.smell[a],
        bearing: wrap(this.gradient(x0, y0) - heading),
        dirty,
      });
    }
    const turning = { down: 0, up: 0, downs: 0, ups: 0 };
    const transitions: MechanismRecord['transitions'] = { bearing: [], curving: [], stride: [], clean: [] };
    for (let i = 1; i < blocks.length; i++) {
      const [p, q] = [blocks[i - 1], blocks[i]];
      const change = wrap(q.heading - p.heading);
      if (p.dc < 0) {
        turning.down += Math.abs(change);
        turning.downs++;
      } else if (p.dc > 0) {
        turning.up += Math.abs(change);
        turning.ups++;
      }
      transitions.bearing.push(p.bearing);
      transitions.curving.push(q.stride > 0 ? change / q.stride : 0);
      transitions.stride.push(q.stride);
      transitions.clean.push(!p.dirty && !q.dirty);
    }
    return { reorientations, atRisk, reversals: reversalCount, omegas: omegaCount, turning, transitions };
  }
}

// The accepted crossings of the head angle from sample `from` (PLAN §7.1): a sign change, accepted at least 0.5 s
// after the last accepted one with the angle's peak between them above 10°, and otherwise skipped, the next measured
// from the last accepted one.
export function swings(angle: readonly number[], from: number): number[] {
  const accepted: number[] = [];
  let last = from;
  for (let k = from + 1; k < angle.length; k++) {
    if (Math.sign(angle[k]) === Math.sign(angle[k - 1]) || angle[k] === 0) continue;
    if (k - last < SWING_GAP && accepted.length > 0) continue;
    let peak = 0;
    for (let j = last; j < k; j++) peak = Math.max(peak, Math.abs(angle[j]));
    if (peak <= SWING_PEAK) continue;
    accepted.push(k);
    last = k;
  }
  return accepted;
}

// The omega turns among a worm's samples from `from`: each head swing, between two accepted crossings, over which the
// front's orientation turned, net and unwrapped, by more than 135°, as [first crossing, second crossing].
export function omegaTurns(angle: readonly number[], front: readonly number[], from: number): [number, number][] {
  const crossings = swings(angle, from);
  const turns: [number, number][] = [];
  for (let c = 1; c < crossings.length; c++) {
    const [a, b] = [crossings[c - 1], crossings[c]];
    let turned = 0;
    for (let k = a + 1; k <= b; k++) turned += wrap(front[k] - front[k - 1]);
    if (Math.abs(turned) > OMEGA) turns.push([a, b]);
  }
  return turns;
}

// Klinokinesis over a set of worms: the ratio of reorientation rates heading down the gradient to heading up it,
// undefined (null) with no reorientation or no time at risk on either side (DECISIONS.md, 2026-10-02).
export function klinokinesis(worms: readonly MechanismRecord[]): number | null {
  const sum = (f: (m: MechanismRecord) => number): number => worms.reduce((n, m) => n + f(m), 0);
  const [rd, ru] = [sum((m) => m.reorientations.down), sum((m) => m.reorientations.up)];
  const [td, tu] = [sum((m) => m.atRisk.down), sum((m) => m.atRisk.up)];
  if (td === 0 || tu === 0 || rd === 0 || ru === 0) return null;
  return rd / td / (ru / tu);
}

// Its companion: the mean absolute change in heading down the gradient over that up it.
export function turningRatio(worms: readonly MechanismRecord[]): number | null {
  const sum = (f: (m: MechanismRecord) => number): number => worms.reduce((n, m) => n + f(m), 0);
  const [d, u, ds, us] = [
    sum((m) => m.turning.down),
    sum((m) => m.turning.up),
    sum((m) => m.turning.downs),
    sum((m) => m.turning.ups),
  ];
  if (ds === 0 || us === 0 || u === 0) return null;
  return d / ds / (u / us);
}

// Weathervaning over a set of worms: the least-squares slope, with an intercept, of the curving rate on the bearing,
// over the transitions taken, `clean` alone or all of them, leaving out strides shorter than STRIDE_FLOOR of the
// median of those transitions, or none with `floor` false; null with fewer than two, or no spread in the bearing.
export function weathervaning(
  worms: readonly MechanismRecord[],
  { clean, floor }: { clean: boolean; floor: boolean },
): number | null {
  const pts: [number, number, number][] = [];
  for (const m of worms) {
    const t = m.transitions;
    for (let i = 0; i < t.bearing.length; i++) {
      if (clean && !t.clean[i]) continue;
      pts.push([t.bearing[i], t.curving[i], t.stride[i]]);
    }
  }
  let kept = pts;
  if (floor && pts.length > 0) {
    const strides = pts.map((p) => p[2]).sort((a, b) => a - b);
    const mid = strides.length >> 1;
    const median = strides.length % 2 === 1 ? strides[mid] : (strides[mid - 1] + strides[mid]) / 2;
    kept = pts.filter((p) => p[2] >= STRIDE_FLOOR * median);
  }
  if (kept.length < 2) return null;
  const mx = kept.reduce((s, p) => s + p[0], 0) / kept.length;
  const my = kept.reduce((s, p) => s + p[1], 0) / kept.length;
  let sxx = 0;
  let sxy = 0;
  for (const [x, y] of kept) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
  }
  return sxx > 0 ? sxy / sxx : null;
}

// The 80% interval PLAN names: the 101st to the 900th of 1,000 sorted resamples.
export const MECHANISM = { resamples: 1000, outside: 100 } as const;

export interface Resampled {
  value: number | null;
  interval: [number | null, number | null];
}

// A statistic over every worm, and its 80% interval over resamples of the worms with replacement, from §7.2's
// resampling seed, an undefined resample counting against both tails (percentileInterval).
export function resampled(
  worms: readonly MechanismRecord[],
  statistic: (set: readonly MechanismRecord[]) => number | null,
  resamples: number = MECHANISM.resamples,
): Resampled {
  const n = worms.length;
  const values: (number | null)[] = [];
  for (let s = 0; s < resamples; s++) {
    const picks = Array.from({ length: n }, (_, k) => Math.floor(uniform(hash(EQUIVALENCE.resamplingSeed, s, k)) * n));
    values.push(statistic(picks.map((k) => worms[k])));
  }
  return {
    value: statistic(worms),
    interval: percentileInterval(values, (MECHANISM.outside * resamples) / MECHANISM.resamples),
  };
}

// The intact-minus-control difference over paired resamples: each pick brings one worm's two arms, the same seed.
export function pairedDifference(
  intact: readonly MechanismRecord[],
  control: readonly MechanismRecord[],
  statistic: (set: readonly MechanismRecord[]) => number | null,
  resamples: number = MECHANISM.resamples,
): Resampled {
  if (intact.length !== control.length) throw new Error('the arms pair worm by worm, so they need as many worms');
  const n = intact.length;
  const diff = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a - b);
  const values: (number | null)[] = [];
  for (let s = 0; s < resamples; s++) {
    const picks = Array.from({ length: n }, (_, k) => Math.floor(uniform(hash(EQUIVALENCE.resamplingSeed, s, k)) * n));
    values.push(diff(statistic(picks.map((k) => intact[k])), statistic(picks.map((k) => control[k]))));
  }
  return {
    value: diff(statistic(intact), statistic(control)),
    interval: percentileInterval(values, (MECHANISM.outside * resamples) / MECHANISM.resamples),
  };
}

export type MechanismGrade = 'reproduced' | 'partial' | 'absent';

export interface MechanismResult {
  intact: Resampled;
  control: number | null;
  difference: Resampled;
  // Whether the intact interval clears the null in the right direction, above it, and the difference's excludes zero
  // on the predicted side, the intact stronger, above it.
  clears: boolean;
  differs: boolean;
  grade: MechanismGrade;
}

// A mechanism's grade (PLAN §7.4; DECISIONS.md, 2026-10-02): reproduced with both, partial with one, absent with
// neither, or with the statistic undefined over every intact worm.
export function mechanism(
  intact: readonly MechanismRecord[],
  control: readonly MechanismRecord[],
  statistic: (set: readonly MechanismRecord[]) => number | null,
  nullValue: number,
  resamples: number = MECHANISM.resamples,
): MechanismResult {
  const own = resampled(intact, statistic, resamples);
  const difference = pairedDifference(intact, control, statistic, resamples);
  const clears = own.value !== null && own.interval[0] !== null && own.interval[0] > nullValue;
  const differs = own.value !== null && difference.interval[0] !== null && difference.interval[0] > 0;
  const grade: MechanismGrade = clears && differs ? 'reproduced' : clears || differs ? 'partial' : 'absent';
  return { intact: own, control: statistic(control), difference, clears, differs, grade };
}
