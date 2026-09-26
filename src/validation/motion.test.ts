import { describe, expect, it } from 'vitest';
import { bouts, forwardVelocity, kinematics, reversals, runs, type BoutSamples } from './motion.ts';

// Samples every 0.1 s of a centroid moving along x at `speed` body lengths per second, with the head a
// quarter of a body length ahead of it (or behind, for a worm backing up).
function track(speed: (t: number) => number, samples: number, headAhead = 1): { centroid: number[]; head: number[] } {
  const centroid: number[] = [];
  const head: number[] = [];
  let x = 0;
  for (let k = 0; k < samples; k++) {
    if (k > 0) x += speed((k - 0.5) * 0.1) * 0.1;
    centroid.push(x, 0);
    head.push(x + 0.25 * headAhead, 0);
  }
  return { centroid, head };
}

describe('motion', () => {
  it('takes velocity over the centred second, towards the head, from 10 s on', () => {
    const { centroid, head } = track(() => 0.2, 201);
    const v = forwardVelocity(centroid, head, 1);
    // Samples 100 to 195, the last whose window ends by sample 200.
    expect(v.length).toBe(96);
    for (const x of v) expect(x).toBeCloseTo(0.2, 12);
    const back = track(() => 0.2, 201, -1);
    for (const x of forwardVelocity(back.centroid, back.head, 1)) expect(x).toBeCloseTo(-0.2, 12);
    // In metres, over a 1 mm body.
    const mm = track(() => 0.0002, 201);
    for (const x of forwardVelocity(mm.centroid, mm.head, 0.001)) expect(x).toBeCloseTo(0.2, 12);
  });

  it('splits motion at ±0.01 body lengths per second, a pause ending a run', () => {
    const v = [...Array<number>(5).fill(0.02), 0.005, ...Array<number>(12).fill(-0.02), 0.011, -0.011];
    expect(runs(v, 1)).toEqual([
      { start: 0, length: 5 },
      { start: 18, length: 1 },
    ]);
    expect(runs(v, -1)).toEqual([
      { start: 6, length: 12 },
      { start: 19, length: 1 },
    ]);
    // A reversal lasts at least 1 s, ten samples.
    expect(reversals(v)).toEqual([{ start: 6, length: 12 }]);
    // Exactly at the floor is a pause.
    expect(runs([0.01, -0.01], 1)).toEqual([]);
    expect(runs([0.01, -0.01], -1)).toEqual([]);
  });

  it('counts a forward bout from 10 s', () => {
    const v = [...Array<number>(99).fill(0.1), 0, ...Array<number>(100).fill(0.1)];
    expect(bouts(v)).toEqual([{ start: 100, length: 100 }]);
    expect(bouts(v, 20)).toEqual([]);
  });
});

describe('kinematics', () => {
  // A travelling wave at f Hz whose rear rod lags the front by `lag` seconds, over bouts of the given lengths.
  function waveTrial(f: number, lag: number, speed: number, lengths: number[]): BoutSamples {
    const n = lengths.reduce((a, b) => a + b + 20, 0);
    const at = (t: number): number => Math.sin(2 * Math.PI * f * t);
    const t = Array.from({ length: n }, (_, k) => k * 0.1);
    let start = 0;
    const found = lengths.map((length) => {
      const r = { start, length };
      start += length + 20;
      return r;
    });
    return {
      velocity: t.map(() => speed),
      mid: t.map((s) => at(s - lag / 2) + 0.3),
      front: t.map(at),
      rear: t.map((s) => at(s - lag)),
      bouts: found,
    };
  }

  it("measures a crawling worm's frequency, wavelength and speed", () => {
    // 0.30 Hz at 0.65 body lengths: the rods 0.3125 body lengths apart lag by 0.3125 / (0.30 × 0.65) = 1.603 s.
    const lag = 0.3125 / (0.3 * 0.65);
    const k = kinematics([waveTrial(0.3, lag, 0.22, [300, 150]), waveTrial(0.3, lag, 0.22, [400])], 0.3125);
    expect(k.bouts).toBe(3);
    expect(k.duration).toBeCloseTo(85, 9);
    expect(k.speed).toBeCloseTo(0.22, 12);
    expect(k.frequency).toBeGreaterThan(0.29);
    expect(k.frequency).toBeLessThan(0.31);
    expect(k.lag).toBeCloseTo(lag, 1);
    expect(k.wavelength).toBeGreaterThan(0.62);
    expect(k.wavelength).toBeLessThan(0.68);
    expect(k.correlation).toBeGreaterThan(0.99);
  });

  it('reads a backward wave as one lagging by most of a period', () => {
    // The rear rod leads by 1 s, so it lags by the period less 1 s, and the "wavelength" comes out long.
    const k = kinematics([waveTrial(0.25, -1, 0.1, [400])], 0.3125);
    expect(k.lag).toBeCloseTo(3, 1);
  });

  it('measures nothing without a bout, and no wave without crossings', () => {
    const k = kinematics([{ velocity: [], mid: [], front: [], rear: [], bouts: [] }], 0.3125);
    expect(k).toEqual({
      bouts: 0,
      duration: 0,
      speed: null,
      frequency: null,
      wavelength: null,
      lag: null,
      correlation: null,
    });
    const still = kinematics(
      [
        {
          velocity: Array(100).fill(0.05),
          mid: Array(100).fill(1),
          front: Array(100).fill(1),
          rear: Array(100).fill(1),
          bouts: [{ start: 0, length: 100 }],
        },
      ],
      0.3125,
    );
    expect(still.speed).toBeCloseTo(0.05, 12);
    expect([still.frequency, still.wavelength]).toEqual([0, null]);
  });
});
