import { describe, expect, it } from 'vitest';
import {
  CHECKPOINT_1,
  SEEDS,
  checkpoint0,
  checkpoint1,
  gradeAtLeast,
  gradeRange,
  overall,
  summariseTrial,
} from './checkpoints.ts';
import { addPosture, emptySums } from './posture.ts';
import type { TrialRecord } from './trial.ts';

// A record whose velocity is given; the rest is still.
function record(velocity: number[], seed = 1): TrialRecord {
  const zeros = velocity.map(() => 0);
  return {
    seed,
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

describe('checkpoint 0', () => {
  it('passes with no forward bout of 10 s, and fails on one', () => {
    const creeping = record([...Array<number>(99).fill(0.02), 0, ...Array<number>(50).fill(-0.02)]);
    const result = checkpoint0([creeping]);
    expect(result).toMatchObject({ grade: 'pass', bouts: 0 });
    expect(result.trials[0]).toMatchObject({ longestBout: 9.9, reversals: 1 });
    expect(checkpoint0([creeping, record(Array<number>(100).fill(0.02), 2)])).toMatchObject({
      grade: 'fail',
      bouts: 1,
    });
  });

  it('fails a trial that left the finite numbers, and a run with no trials', () => {
    expect(checkpoint0([{ ...record([]), finite: false }]).grade).toBe('fail');
    expect(checkpoint0([]).grade).toBe('fail');
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

  it('passes a worm that crawls as the real one does', () => {
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
