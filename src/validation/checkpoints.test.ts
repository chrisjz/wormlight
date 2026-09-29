import { describe, expect, it } from 'vitest';
import type { ChemotaxisRecord } from './chemotaxis.ts';
import {
  CHECKPOINT_0_CHEMOTAXIS,
  CHECKPOINT_0_TOUCH,
  CHECKPOINT_1,
  SEEDS,
  TRIAL_SECONDS,
  checkpoint0,
  checkpoint1,
  chemotaxisClause,
  crawlingClause,
  diagnostics,
  periodogram,
  spectralPeak,
  gradeAtLeast,
  gradeRange,
  meanVelocity,
  outsideRange,
  overall,
  reversalFrom,
  shuntShare,
  summariseTrial,
  touchClause,
  touchSchedule,
} from './checkpoints.ts';
import { addPosture, emptySums } from './posture.ts';
import type { TrialRecord } from './trial.ts';

// A record whose velocity is given; the rest is still.
function record(velocity: number[], seed = 1): TrialRecord {
  const zeros = velocity.map(() => 0);
  return {
    seed,
    seconds: 10 + velocity.length / 10 + 0.4,
    posture: 0,
    turn: 0,
    finite: true,
    velocity,
    mid: zeros,
    front: zeros,
    rear: zeros,
    postures: emptySums(),
    selfIntersecting: 0,
    unconverged: 0,
    touches: [],
    switchFlips: [],
    ava: zeros,
  };
}

describe('the checkpoint bands', () => {
  it("are PLAN §7.4's", () => {
    expect(CHECKPOINT_1).toEqual({
      frequency: { pass: [0.2, 0.45], partial: [0.1, 0.6] },
      wavelength: { pass: [0.5, 0.8], partial: [0.4, 1.0] },
      speed: { pass: [0.12, 0.3], partial: [0.06, 0.5] },
      eigenworms: { pass: 0.85, partial: 0.7 },
      bout: { seconds: 20, pass: 0.8, partial: 0.5 },
    });
    expect(SEEDS).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('grade inclusive of their edges, and fail what was not measured', () => {
    expect(gradeRange(0.2, CHECKPOINT_1.frequency)).toBe('pass');
    expect(gradeRange(0.45, CHECKPOINT_1.frequency)).toBe('pass');
    expect(gradeRange(0.1, CHECKPOINT_1.frequency)).toBe('partial');
    expect(gradeRange(0.61, CHECKPOINT_1.frequency)).toBe('fail');
    expect(gradeRange(null, CHECKPOINT_1.frequency)).toBe('fail');
    expect(gradeRange(NaN, CHECKPOINT_1.frequency)).toBe('fail');
    expect(gradeAtLeast(0.85, CHECKPOINT_1.eigenworms)).toBe('pass');
    expect(gradeAtLeast(0.7, CHECKPOINT_1.eigenworms)).toBe('partial');
    expect(gradeAtLeast(0.69, CHECKPOINT_1.eigenworms)).toBe('fail');
  });

  it('pass a checkpoint only if every clause passes, and call it partial only if none fails', () => {
    expect(overall(['pass', 'pass'])).toBe('pass');
    expect(overall(['pass', 'partial'])).toBe('partial');
    expect(overall(['partial', 'fail'])).toBe('fail');
  });
});

describe("checkpoint 0's crawling clause", () => {
  it('passes with no forward bout of 10 s, and fails on one', () => {
    const creeping = record([...Array<number>(99).fill(0.02), 0, ...Array<number>(50).fill(-0.02)]);
    const result = crawlingClause([creeping]);
    expect(result).toMatchObject({ grade: 'pass', bouts: 0 });
    expect(result.trials[0]).toMatchObject({ longestBout: 9.9, reversals: 1 });
    expect(crawlingClause([creeping, record(Array<number>(100).fill(0.02), 2)])).toMatchObject({
      grade: 'fail',
      bouts: 1,
    });
  });

  it('fails a trial that left the finite numbers, and a run with no trials', () => {
    expect(crawlingClause([{ ...record([]), finite: false }]).grade).toBe('fail');
    expect(crawlingClause([]).grade).toBe('fail');
  });
});

// A full trial's velocity samples, 10.0 to 119.5 s, still but where `moves` sets them.
const SAMPLES = 1096;
function still(seed: number, moves: (t: number) => number = () => 0): TrialRecord {
  const velocity = Array.from({ length: SAMPLES }, (_, k) => moves(10 + k / 10));
  return { ...record(velocity, seed), seconds: TRIAL_SECONDS };
}
// The same trial touched as the protocol says, every touch reaching a receptor.
const touched = (r: TrialRecord): TrialRecord => ({
  ...r,
  touches: touchSchedule(r.seed).map(({ time, s }) => ({ time, s, reached: ['X'] })),
});

describe("checkpoint 0's touch clause", () => {
  it("is PLAN §7.4's protocol: 50 touches of each kind over the 20 trials, odd seeds starting at the front", () => {
    expect(CHECKPOINT_0_TOUCH).toEqual({
      touches: 5,
      first: 20,
      every: 20,
      front: 0.2,
      back: 0.8,
      window: 2,
      anteriorPartial: 0.4,
    });
    expect(touchSchedule(1).map((t) => [t.time, t.s, t.place])).toEqual([
      [20, 0.2, 'anterior'],
      [40, 0.8, 'posterior'],
      [60, 0.2, 'anterior'],
      [80, 0.8, 'posterior'],
      [100, 0.2, 'anterior'],
    ]);
    expect(touchSchedule(2).map((t) => t.place)).toEqual([
      'posterior',
      'anterior',
      'posterior',
      'anterior',
      'posterior',
    ]);
    const all = SEEDS.flatMap((seed) => touchSchedule(seed));
    expect(all.filter((t) => t.place === 'anterior').length).toBe(50);
    expect(all.filter((t) => t.place === 'posterior').length).toBe(50);
    // A shortened trial keeps only the touches whose windows fit: 3.5 s after each.
    expect(touchSchedule(1, 43.5).map((t) => t.time)).toEqual([20, 40]);
    expect(touchSchedule(1, 43.4).map((t) => t.time)).toEqual([20]);
  });

  it('counts a reversal whose first backward sample lies from the touch to 2 s after it', () => {
    const backing = (from: number) => (t: number) => (t >= from - 1e-9 && t < from + 1.5 ? -0.05 : 0);
    expect(reversalFrom(still(1, backing(20)).velocity, 20)).toBe(true);
    expect(reversalFrom(still(1, backing(22)).velocity, 20)).toBe(true);
    expect(reversalFrom(still(1, backing(22.1)).velocity, 20)).toBe(false);
    // One already under way at the touch doesn't follow it.
    expect(reversalFrom(still(1, backing(19.9)).velocity, 20)).toBe(false);
    // Nor does backing up for under 1 s.
    const brief = still(1, (t) => (t >= 20.5 && t < 21.3 ? -0.05 : 0));
    expect(reversalFrom(brief.velocity, 20)).toBe(false);
  });

  it('takes the speed before and after from the samples whose windows lie wholly on each side', () => {
    // Velocity equal to its sample's time: the samples from 18.5 to 19.5 s, and 20.5 to 21.5 s.
    const r = still(1, (t) => t);
    expect(meanVelocity(r.velocity, 18, 20)).toBeCloseTo(19, 12);
    expect(meanVelocity(r.velocity, 20, 22)).toBeCloseTo(21, 12);
    expect(() => meanVelocity(r.velocity, 118, 121)).toThrow(/no velocity samples/);
  });

  it('passes a network that ignores touch, and fails one that reverses or speeds up', () => {
    const untouched = SEEDS.map((seed) => still(seed));
    expect(touchClause(untouched.map(touched), untouched)).toMatchObject({
      grade: 'pass',
      anterior: { touches: 50, followed: 0, matched: 0, p: 1, grade: 'pass' },
      posterior: { touches: 50, pairs: 0, p: 1, grade: 'pass' },
    });
    // Reversing after every anterior touch, and never in the matched windows.
    const reversing = untouched.map((r) => {
      const at = touchSchedule(r.seed).filter((t) => t.place === 'anterior');
      return touched(still(r.seed, (t) => (at.some((a) => t >= a.time + 0.5 && t < a.time + 2) ? -0.05 : 0)));
    });
    const reversed = touchClause(reversing, untouched);
    expect(reversed.anterior).toMatchObject({ followed: 50, share: 1, reflex: true, grade: 'fail' });
    expect(reversed.grade).toBe('fail');
    // As often in the matched windows: no reflex, however often.
    expect(touchClause(reversing, reversing).anterior).toMatchObject({ followed: 50, matched: 50, reflex: false });
    // Speeding up after every posterior touch.
    const speeding = untouched.map((r) => {
      const at = touchSchedule(r.seed).filter((t) => t.place === 'posterior');
      return touched(still(r.seed, (t) => (at.some((a) => t > a.time && t < a.time + 2) ? 0.005 : 0)));
    });
    const sped = touchClause(speeding, untouched);
    expect(sped.posterior).toMatchObject({ pairs: 50, positive: 1275, reflex: true, grade: 'fail' });
    expect(sped.posterior.p).toBeCloseTo(2 ** -50, 20);
    expect(sped.grade).toBe('fail');
    // For context, the untouched twins over the same windows, and how far the touched trials moved from them.
    expect(sped.posterior.twin).toEqual({ n: 0, positive: 0, p: 1 });
    expect(sped.largestChange).toBe(0.005);
    expect(touchClause(speeding, speeding).posterior.twin).toMatchObject({ n: 50, positive: 1275 });
    expect(touchClause(speeding, speeding).largestChange).toBe(0);
  });

  it('fails touches not made as the protocol says, or reaching no receptor, or a broken trial', () => {
    const untouched = SEEDS.map((seed) => still(seed));
    const quiet = untouched.map(touched);
    expect(() => touchClause(untouched, untouched)).toThrow(/wasn't touched as the protocol says/);
    expect(() => touchClause(quiet, untouched.slice(1))).toThrow(/no untouched trial/);
    const numb = quiet.map((r) => ({ ...r, touches: r.touches.map((t) => ({ ...t, reached: [] })) }));
    expect(touchClause(numb, untouched).grade).toBe('fail');
    expect(touchClause([{ ...quiet[0], finite: false }, ...quiet.slice(1)], untouched).grade).toBe('fail');
    expect(touchClause([], untouched).grade).toBe('fail');
    // Trials too short for any touch leave both reflexes unmeasured; one kind alone leaves the other so.
    const short = untouched.map((r) => ({ ...r, seconds: 23 }));
    expect(touchClause(short, short)).toMatchObject({
      grade: 'fail',
      anterior: { measured: false, touches: 0, grade: 'fail' },
      posterior: { measured: false, touches: 0, grade: 'fail' },
    });
    const odd = untouched.filter((r) => r.seed % 2 === 1).map((r) => ({ ...r, seconds: 30 }));
    const once = touchClause(
      odd.map((r) => ({
        ...r,
        touches: touchSchedule(r.seed, 30).map(({ time, s }) => ({ time, s, reached: ['X'] })),
      })),
      odd,
    );
    expect(once.anterior).toMatchObject({ measured: true, touches: 10, grade: 'pass' });
    expect(once.posterior).toMatchObject({ measured: false, touches: 0, grade: 'fail' });
  });
});

// A worm that reached a spot, or neither.
const worm = (seed: number, reached: ChemotaxisRecord['reached']): ChemotaxisRecord => ({
  seed,
  posture: 0,
  turn: 0,
  awcSide: 'AWCL',
  finite: true,
  reached,
  time: reached === null ? null : 100,
  seconds: reached === null ? 3600 : 100,
  closest: { odour: 0.04, control: 0.04 },
  start: [0, 0],
  end: [0, 0],
  farthest: 0,
  unconverged: 0,
});

describe("checkpoint 0's chemotaxis clause", () => {
  it('counts every worm run, so none arriving gives 0, and passes within ±0.1', () => {
    expect(CHECKPOINT_0_CHEMOTAXIS).toEqual({ worms: 30, seconds: 3600, within: 0.1 });
    const none = Array.from({ length: 30 }, (_, i) => worm(i + 1, null));
    expect(chemotaxisClause(none)).toMatchObject({ grade: 'pass', odour: 0, control: 0, index: 0 });
    // 3 at the odour of 30: 0.1, on the edge.
    const three = none.map((w, i) => (i < 3 ? worm(w.seed, 'odour') : w));
    expect(chemotaxisClause(three)).toMatchObject({ grade: 'pass', index: 0.1 });
    const four = none.map((w, i) => (i < 4 ? worm(w.seed, 'odour') : w));
    expect(chemotaxisClause(four).grade).toBe('fail');
    // Drawn to the control as much fails too.
    const away = none.map((w, i) => (i < 4 ? worm(w.seed, 'control') : w));
    expect(chemotaxisClause(away)).toMatchObject({ grade: 'fail', control: 4 });
    expect(chemotaxisClause(away).index).toBeCloseTo(-4 / 30, 15);
  });

  it('fails a worm that left the finite numbers, and a run with no worms', () => {
    expect(chemotaxisClause([{ ...worm(1, null), finite: false }]).grade).toBe('fail');
    expect(chemotaxisClause([]).grade).toBe('fail');
  });
});

describe('checkpoint 0', () => {
  it('passes only if every clause passes', () => {
    const untouched = SEEDS.map((seed) => still(seed));
    const worms = Array.from({ length: 30 }, (_, i) => worm(i + 1, null));
    expect(checkpoint0(untouched, untouched.map(touched), worms).grade).toBe('pass');
    const drawn = worms.map((w, i) => (i < 4 ? worm(w.seed, 'odour') : w));
    const result = checkpoint0(untouched, untouched.map(touched), drawn);
    expect([result.crawling.grade, result.touch.grade, result.chemotaxis.grade]).toEqual(['pass', 'pass', 'fail']);
    expect(result.grade).toBe('fail');
  });
});

describe('checkpoint 1', () => {
  it('fails every kinematic clause, unmeasured, without a bout, and says why', () => {
    const result = checkpoint1([record(Array<number>(300).fill(0))], [[1]]);
    expect(result.grade).toBe('fail');
    expect(result.clauses.map((c) => [c.name, c.value, c.grade, c.reason])).toEqual([
      ['frequency', null, 'fail', 'no bout of 10 s'],
      ['wavelength', null, 'fail', 'no bout of 10 s'],
      ['speed', null, 'fail', 'no bout of 10 s'],
      ['eigenworms', null, 'fail', 'too few postures'],
      ['bout', 0, 'fail', null],
    ]);
    expect(checkpoint1([], [[1]]).clauses.every((c) => c.grade === 'fail')).toBe(true);
  });

  // Two checkpoint 1 runs over 20 trials, each with its spectrum: about 3 s on CI, so past the default's reach.
  it('passes a worm that crawls as the real one does', { timeout: 30000 }, () => {
    // 0.30 Hz, 0.65 body lengths and 0.22 body lengths per second, forward throughout, with postures along
    // the first two of an identity basis's modes.
    const lag = 0.125 / (0.3 * 0.65);
    const n = 1100;
    const t = Array.from({ length: n }, (_, k) => k * 0.1);
    const wave = (shift: number): number[] => t.map((s) => Math.sin(2 * Math.PI * 0.3 * (s - shift)));
    const postures = emptySums();
    for (let k = 0; k < 440; k++) {
      addPosture(
        postures,
        Array.from({ length: 100 }, (_, i) => (i === 0 ? Math.sin(k) : i === 1 ? Math.cos(k) : 0)),
      );
    }
    const crawler = (seed: number): TrialRecord => ({
      ...record(Array<number>(n).fill(0.22), seed),
      mid: wave(lag / 2),
      front: wave(0),
      rear: wave(lag),
      postures,
    });
    const identity = Array.from({ length: 100 }, (_, i) => Array.from({ length: 100 }, (_, j) => (i === j ? 1 : 0)));
    const result = checkpoint1(SEEDS.map(crawler), identity);
    expect(result.clauses.map((c) => [c.name, c.grade])).toEqual([
      ['frequency', 'pass'],
      ['wavelength', 'pass'],
      ['speed', 'pass'],
      ['eigenworms', 'pass'],
      ['bout', 'pass'],
    ]);
    expect(result.grade).toBe('pass');
    // One trial leaving the finite numbers fails every clause.
    const broken = checkpoint1([...SEEDS.map(crawler).slice(1), { ...crawler(1), finite: false }], identity);
    expect(broken.clauses.every((c) => c.grade === 'fail')).toBe(true);
  });

  it('counts the share of trials with a 20 s bout', () => {
    const long = record(Array<number>(200).fill(0.2));
    const short = record(Array<number>(199).fill(0.2));
    const result = checkpoint1([long, short, long, long], [[1]]);
    expect(result.clauses.find((c) => c.name === 'bout')).toEqual({
      name: 'bout',
      value: 0.75,
      grade: 'partial',
      reason: null,
    });
    expect(summariseTrial(short)).toMatchObject({ forward: 1, paused: 0, backward: 0, longestBout: 19.9 });
  });
});

describe("checkpoint 1's diagnostics", () => {
  it('count the neurons outside the reversal range, over every sample of every trial that carries them', () => {
    const quiet = record(new Array<number>(4).fill(0));
    const d = diagnostics([
      { ...quiet, outside: [0, 2, 4], far: [0, 1, 2], lowest: -60, highest: -1 },
      // A trial that left the finite numbers counts too.
      { ...quiet, finite: false, outside: [6], far: [3], lowest: -50, highest: 12 },
      quiet,
      // A record made before the far count carries none of it, and is left out.
      { ...quiet, outside: [100], lowest: -500, highest: 500 },
    ]);
    expect(d.outside).toEqual({ mean: 3, max: 6, far: { mean: 1.5, max: 3 }, lowest: -60, highest: 12 });
    expect(diagnostics([quiet]).outside).toBeNull();
  });

  it('average the shunt over every sample of every trial in the conductance form, and give none in the current form', () => {
    const quiet = record(new Array<number>(4).fill(0));
    const conducting = [
      { ...quiet, conductance: { samples: 2, switchShunt: 4, proprioShunt: 2, gateToggles: 3 } },
      { ...quiet, conductance: { samples: 2, switchShunt: null, proprioShunt: 2, gateToggles: 1 } },
      quiet,
    ];
    // The switch's mean over the samples of trials that have its targets; the gate's turns over all 0.4 s measured.
    const expected = { switch: 2, proprioception: 1, gateToggles: 10 };
    expect(shuntShare(conducting)).toEqual(expected);
    expect(diagnostics(conducting).shunt).toEqual(expected);
    expect(shuntShare([quiet])).toBeNull();
  });

  it("count 200 trials' samples, as §7.2's comparison grades, without spreading them as arguments", () => {
    const quiet = record(new Array<number>(4).fill(0));
    const samples = (k: number): number[] => Array.from({ length: 1096 }, (_, i) => (i + k) % 7);
    const records = Array.from({ length: 200 }, (_, k) => ({
      ...quiet,
      outside: samples(k),
      far: samples(k + 1).map((c) => c % 2),
      lowest: -48 - k,
      highest: k,
    }));
    const d = outsideRange(records);
    expect(d?.max).toBe(6);
    expect(d?.far.max).toBe(1);
    expect(d?.lowest).toBe(-247);
    expect(d?.highest).toBe(199);
  });

  it('find the spectral peak of the mid-body bend, and its share in 0.2–0.45 Hz', () => {
    // 0.3 Hz over 100 s of samples, 0.1 s apart: every bit of power in the band, at 0.3 Hz.
    const wave = Array.from({ length: 1000 }, (_, k) => Math.sin(2 * Math.PI * 0.3 * (k / 10)));
    const d = diagnostics([{ ...record(new Array<number>(1000).fill(0)), mid: wave }]);
    expect(d.peak).toBeCloseTo(0.3, 12);
    expect(d.share).toBeCloseTo(1, 6);
    // A slow bend at 0.07 Hz dominates: the peak moves there and the share falls.
    const slow = wave.map((v, k) => v + 3 * Math.sin(2 * Math.PI * 0.07 * (k / 10)));
    const e = diagnostics([{ ...record(new Array<number>(1000).fill(0)), mid: slow }]);
    expect(e.peak).toBeCloseTo(0.07, 12);
    expect(e.share).toBeCloseTo(1 / 10, 2);
    // A pure tone's periodogram peaks in its own frequency's bin, 0.3 Hz × 100 s.
    const p = periodogram(wave);
    expect(p.indexOf(Math.max(...p))).toBe(30);
  });

  it('count the reversals starting within 3 s after a flip of the head switch, and AVA over them', () => {
    // Backing up from 20 s and from 40 s; the head switch flipped at 18 s only.
    const velocity = Array.from({ length: 600 }, (_, k) => {
      const t = 10 + k / 10;
      return (t >= 20 && t < 22) || (t >= 40 && t < 42) ? -0.05 : 0.05;
    });
    const ava = velocity.map((_, k) => (10 + k / 10 >= 40 ? 0.2 : 0.1));
    const d = diagnostics([{ ...record(velocity), switchFlips: [5, 18], ava }]);
    expect(d).toMatchObject({ reversals: 2, afterFlip: 1 });
    // AVA rose by 0.1 across the second reversal only, which began at 40 s: a mean change of 0.05.
    expect(d.avaChange).toBeCloseTo(0.05, 12);
    expect(d.avaSpread).toBeGreaterThan(0);
  });

  it('say nothing when there is nothing to measure', () => {
    const d = diagnostics([{ ...record([]), finite: false }]);
    expect(d).toMatchObject({ peak: null, share: null, reversals: 0, afterFlip: 0, avaChange: null });
  });
});

describe("the mid-body spectrum's peak", () => {
  it('finds a bend at 0.25 Hz, summing the trials, and gives nothing without a finite trial', () => {
    const wave = Array.from({ length: 1000 }, (_, k) => Math.sin(2 * Math.PI * 0.25 * (k / 10)));
    expect(
      spectralPeak([
        { finite: true, mid: wave },
        { finite: true, mid: wave },
      ]).peak,
    ).toBeCloseTo(0.25, 12);
    expect(spectralPeak([{ finite: false, mid: wave }])).toEqual({ peak: null, share: null });
  });
});
