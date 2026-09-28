import { describe, expect, it } from 'vitest';
import { checkpoint1 } from './checkpoints.ts';
import { compareSteps, EQUIVALENCE, measures } from './equivalence.ts';
import { emptySums } from './posture.ts';
import type { TrialRecord } from './trial.ts';

// A worm crawling forward throughout its 110 measured seconds, its body bending at `frequency` and the rear rod
// following the front `lag` seconds later; `reverse` backs it up for 2 s at 30 s.
function crawler(seed: number, frequency: number, lag: number, options: { reverse?: boolean } = {}): TrialRecord {
  const n = 1100;
  const wave = (shift: number): number[] =>
    Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * frequency * (i / 10 - shift)));
  const velocity = Array.from({ length: n }, (_, i) => (options.reverse && i >= 300 && i < 320 ? -0.1 : 0.1));
  return {
    seed,
    seconds: 120,
    posture: 0,
    turn: 0,
    finite: true,
    velocity,
    mid: wave(0),
    front: wave(0),
    rear: wave(lag),
    postures: emptySums(),
    selfIntersecting: 0,
    unconverged: 0,
    touches: [],
    switchFlips: [],
    ava: Array<number>(n).fill(0),
  };
}
// Twenty trials whose frequencies spread around `centre`, a few of them reversing once.
const set = (centre: number): TrialRecord[] =>
  Array.from({ length: 20 }, (_, k) =>
    crawler(k + 1, centre * (1 + 0.02 * ((k % 5) - 2)), 1.2, { reverse: k % 4 === 0 }),
  );

describe("§7.2's comparison with the noise on", () => {
  it('measures the kinematics and the bout share as checkpoint 1 does, and reversals per minute', () => {
    const trials = set(0.3);
    const m = measures(trials);
    const c = checkpoint1(trials, []);
    for (const name of ['frequency', 'wavelength', 'speed', 'bout'] as const) {
      expect(m[name]).toBe(c.clauses.find((k) => k.name === name)?.value);
    }
    // Five reversals over 20 trials of 110 s.
    expect(m.reversals).toBeCloseTo(5 / ((20 * 110) / 60), 12);
  });

  it('passes the same trials at both steps, every interval at zero', () => {
    const r = compareSteps(set(0.3), set(0.3), 100);
    expect(r.pass).toBe(true);
    for (const c of r.clauses) expect(c.interval).toEqual([0, 0]);
  });

  it('fails a frequency 5% off at dt/2, and passes one 0.5% off', () => {
    const off = compareSteps(set(0.3), set(0.3 * 1.05), 100);
    const frequency = off.clauses.find((c) => c.name === 'frequency');
    expect(frequency?.pass).toBe(false);
    expect(frequency?.margin).toBeCloseTo(0.03 * (off.clauses.find((c) => c.name === 'frequency')?.fine ?? 0), 12);
    expect(off.clauses.find((c) => c.name === 'speed')?.pass).toBe(true);
    expect(off.pass).toBe(false);
    expect(compareSteps(set(0.3), set(0.3 * 1.005), 100).pass).toBe(true);
  });

  it('fails a clause unmeasured at either step, and a trial that left the finite numbers', () => {
    const still = set(0.3).map((r) => ({ ...r, velocity: r.velocity.map(() => 0) }));
    const r = compareSteps(set(0.3), still, 100);
    const frequency = r.clauses.find((c) => c.name === 'frequency');
    expect(frequency).toMatchObject({ fine: null, interval: null, pass: false });
    expect(frequency?.unmeasured).toBe(100);
    const broken = set(0.3).map((t, k) => (k === 3 ? { ...t, finite: false } : t));
    expect(compareSteps(set(0.3), broken, 100)).toMatchObject({ nonFinite: 1, pass: false });
  });

  it('pairs the steps seed by seed, and resamples the same way every run', () => {
    const shuffled = set(0.3).reverse();
    expect(() => compareSteps(set(0.3), shuffled, 10)).toThrow(/same seeds/);
    const a = compareSteps(set(0.3), set(0.301), 100);
    const b = compareSteps(set(0.3), set(0.301), 100);
    expect(a.clauses.map((c) => c.interval)).toEqual(b.clauses.map((c) => c.interval));
    expect(EQUIVALENCE.resamples).toBe(1000);
  });
});
