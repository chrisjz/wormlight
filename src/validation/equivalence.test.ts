import { describe, expect, it } from 'vitest';
import { checkpoint1 } from './checkpoints.ts';
import { atSpeedFloor, compareSteps, EQUIVALENCE, measures, percentileInterval, speedInterval } from './equivalence.ts';
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
// The frequency's interval for set(0.3) against set(0.301) over 80 resamples, from the model's hash. Re-pinned when
// checkpoint 1's count took its band (PLAN §7.4, changed after results 2026-10-01), which moves where a crossing near
// a bout's edge is counted; under the plain count it was [-0.002732240437158473, 0.0002293577981651307].
const PINNED = [-0.0015981735159817378, -0.00022831050228311334];
// Twenty trials whose frequencies spread around `centre`, a few of them reversing once.
const set = (centre: number): TrialRecord[] =>
  Array.from({ length: 20 }, (_, k) =>
    crawler(k + 1, centre * (1 + 0.02 * ((k % 5) - 2)), 1.2, { reverse: k % 4 === 0 }),
  );

describe("§7.2's comparison with the noise on", () => {
  it(
    'measures the kinematics and the bout share as checkpoint 1 does, and reversals per minute',
    { timeout: 30000 },
    () => {
      const trials = set(0.3);
      const m = measures(trials);
      const c = checkpoint1(trials, []);
      for (const name of ['frequency', 'wavelength', 'speed', 'bout'] as const) {
        expect(m[name]).toBe(c.clauses.find((k) => k.name === name)?.value);
      }
      // Five reversals over 20 trials of 110 s.
      expect(m.reversals).toBeCloseTo(5 / ((20 * 110) / 60), 12);
    },
  );

  it('passes the same trials at both steps, every interval at zero', { timeout: 30000 }, () => {
    const r = compareSteps(set(0.3), set(0.3), 80);
    expect(r.pass).toBe(true);
    for (const c of r.clauses) expect(c.interval).toEqual([0, 0]);
  });

  it('fails a frequency 5% off at dt/2, and passes one 0.5% off', { timeout: 30000 }, () => {
    const off = compareSteps(set(0.3), set(0.3 * 1.05), 80);
    const frequency = off.clauses.find((c) => c.name === 'frequency');
    expect(frequency?.pass).toBe(false);
    expect(frequency?.margin).toBeCloseTo(0.03 * (off.clauses.find((c) => c.name === 'frequency')?.fine ?? 0), 12);
    expect(off.clauses.find((c) => c.name === 'speed')?.pass).toBe(true);
    expect(off.pass).toBe(false);
    expect(compareSteps(set(0.3), set(0.3 * 1.005), 80).pass).toBe(true);
  });

  it('fails a clause unmeasured at either step, and a trial that left the finite numbers', { timeout: 30000 }, () => {
    const still = set(0.3).map((r) => ({ ...r, velocity: r.velocity.map(() => 0) }));
    const r = compareSteps(set(0.3), still, 80);
    const frequency = r.clauses.find((c) => c.name === 'frequency');
    expect(frequency).toMatchObject({ fine: null, interval: null, pass: false });
    expect(frequency?.unmeasured).toBe(80);
    const broken = set(0.3).map((t, k) => (k === 3 ? { ...t, finite: false } : t));
    expect(compareSteps(set(0.3), broken, 80)).toMatchObject({ nonFinite: 1, pass: false });
  });

  it('pairs the steps seed by seed, and resamples the same way every run', { timeout: 30000 }, () => {
    const shuffled = set(0.3).reverse();
    expect(() => compareSteps(set(0.3), shuffled, 10)).toThrow(/same seeds/);
    const a = compareSteps(set(0.3), set(0.301), 80);
    const b = compareSteps(set(0.3), set(0.301), 80);
    expect(a.clauses.map((c) => c.interval)).toEqual(b.clauses.map((c) => c.interval));
    expect(EQUIVALENCE.resamples).toBe(1000);
    // The draws themselves, pinned: the frequency's interval for these sets.
    expect(a.clauses[0].interval).toEqual(PINNED);
  });

  it('refuses resamples that leave no whole number outside each end', () => {
    expect(() => compareSteps(set(0.3), set(0.3), 100)).toThrow(/multiple of 40/);
    expect(() => compareSteps(set(0.3), set(0.3), 0)).toThrow(/multiple of 40/);
  });

  it('counts an unmeasured resample against both tails', () => {
    // 1,000 differences: 20 unmeasured, 10 far below the margin, the rest at 0.
    const differences = [...Array<null>(20).fill(null), ...Array<number>(10).fill(-5), ...Array<number>(970).fill(0)];
    // Against the lower tail too, the unmeasured leave 5 below it, so the lower end reaches −5.
    expect(percentileInterval(differences, 25)).toEqual([-5, 0]);
    // With more unmeasured than a tail holds, both ends are unbounded.
    expect(percentileInterval([...Array<null>(26).fill(null), ...Array<number>(974).fill(0)], 25)).toEqual([
      null,
      null,
    ]);
    expect(
      percentileInterval(
        Array.from({ length: 1000 }, (_, k) => k),
        25,
      ),
    ).toEqual([25, 974]);
  });

  it('fails a clause measured over the trials but unmeasured in many resamples, its interval unbounded', () => {
    // Only the first two trials crawl, so many resamples draw neither.
    const few = set(0.3).map((r, k) => (k < 2 ? r : { ...r, velocity: r.velocity.map(() => 0) }));
    const frequency = compareSteps(few, few, 80).clauses.find((c) => c.name === 'frequency');
    expect(frequency?.fine).not.toBeNull();
    expect(frequency?.unmeasured).toBeGreaterThan(2);
    expect(frequency).toMatchObject({ interval: [null, null], pass: false });
  });

  it('measures trials cut short, and ones that left the finite numbers, as checkpoint 1 does', () => {
    const trials = set(0.3).map((r, k) =>
      k === 1
        ? {
            ...r,
            finite: false,
            velocity: r.velocity.slice(0, 400),
            mid: r.mid.slice(0, 400),
            front: r.front.slice(0, 400),
            rear: r.rear.slice(0, 400),
          }
        : r,
    );
    const m = measures(trials);
    const c = checkpoint1(trials, []);
    for (const name of ['frequency', 'wavelength', 'speed', 'bout'] as const) {
      expect(m[name]).toBe(c.clauses.find((k) => k.name === name)?.value);
    }
  });
});

describe("round 3's speed interval (PLAN §7.4, added 2026-09-29 before round 3 ran)", () => {
  // Twenty crawlers at speeds spread from 0.05 to 0.088 body lengths per second.
  const spread = set(0.3).map((r, k) => ({ ...r, velocity: r.velocity.map((v) => (v > 0 ? 0.05 + 0.002 * k : v)) }));

  it("resamples the trials as the comparison does, its speed checkpoint 1's", { timeout: 30000 }, () => {
    const s = speedInterval(spread, 40);
    expect(s.speed).toBe(checkpoint1(spread, []).clauses.find((c) => c.name === 'speed')?.value);
    expect(s.unmeasured).toBe(0);
    const [lower, upper] = s.interval as [number, number];
    expect(lower).toBeLessThan(s.speed as number);
    expect(upper).toBeGreaterThan(s.speed as number);
    expect(speedInterval(spread, 40)).toEqual(s);
    expect(() => speedInterval(spread, 100)).toThrow(/multiple of 40/);
  });

  it('counts a resample with no bout below every value', { timeout: 30000 }, () => {
    // Only the first two trials crawl, so many resamples draw neither.
    const few = spread.map((r, k) => (k < 2 ? r : { ...r, velocity: r.velocity.map(() => 0) }));
    const s = speedInterval(few, 40);
    expect(s.unmeasured).toBeGreaterThan(1);
    expect(s.interval[0]).toBeNull();
    expect(s.interval[1]).not.toBeNull();
  });

  it('reports a partial at the speed floor when its interval, or its speed at dt/2, reaches below 0.06', () => {
    expect(atSpeedFloor([0.061, 0.07], 0.062)).toBe(false);
    expect(atSpeedFloor([0.061, 0.07], null)).toBe(false);
    expect(atSpeedFloor([0.0599, 0.07], 0.062)).toBe(true);
    expect(atSpeedFloor([null, 0.07], 0.062)).toBe(true);
    expect(atSpeedFloor([0.061, 0.07], 0.0599)).toBe(true);
  });
});
