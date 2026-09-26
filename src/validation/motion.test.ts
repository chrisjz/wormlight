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
  // Curvature at the mid-body, front and rear rods over bouts of the given lengths, 2 s apart. `rear` gives
  // the rear rod's curvature from the front's time course.
  function trial(f: number, rear: (at: (t: number) => number, t: number) => number, lengths: number[]): BoutSamples {
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
      velocity: t.map(() => 0.22),
      mid: t.map((s) => at(s) + 0.3),
      front: t.map(at),
      rear: t.map((s) => rear(at, s)),
      bouts: found,
    };
  }
  // A wave travelling from head to tail at 0.30 Hz and 0.65 body lengths reaches the rear rod, 0.125 body
  // lengths on, 0.125 / (0.30 × 0.65) = 0.641 s after the front.
  const LAG = 0.125 / (0.3 * 0.65);
  const forward = (at: (t: number) => number, t: number): number => at(t - LAG);

  it("measures a crawling worm's frequency, wavelength and speed", () => {
    const k = kinematics([trial(0.3, forward, [300, 150]), trial(0.3, forward, [400])], 0.125);
    expect(k.bouts).toBe(3);
    expect(k.duration).toBeCloseTo(85, 9);
    expect(k.speed).toBeCloseTo(0.22, 12);
    // Crossings counted within whole bouts fall a little short of 0.30 Hz: 0.288 here.
    expect(k.frequency).toBeGreaterThan(0.285);
    expect(k.frequency).toBeLessThan(0.315);
    // The lag comes out within 1%; the wavelength takes the frequency's shortfall with it.
    expect(Math.abs((k.lag ?? 0) / LAG - 1)).toBeLessThan(0.01);
    expect(k.wavelength).toBeGreaterThan(0.62);
    expect(k.wavelength).toBeLessThan(0.69);
    expect(k.unmeasured).toBeNull();
    expect(k.correlation).toBeGreaterThan(0.99);
  });

  it("measures the partial band's edges", () => {
    for (const [f, lambda] of [
      [0.1, 0.4],
      [0.6, 0.4],
      [0.1, 1.0],
      [0.6, 1.0],
    ]) {
      const lag = 0.125 / (f * lambda);
      const k = kinematics([trial(f, (at, t) => at(t - lag), [1000])], 0.125);
      expect(k.wavelength, `${f} Hz, ${lambda}`).toBeGreaterThan(lambda * 0.93);
      expect(k.wavelength, `${f} Hz, ${lambda}`).toBeLessThan(lambda * 1.07);
    }
  });

  it('finds no head-to-tail wave in a backward wave or a standing one', () => {
    const cases: [string, (at: (t: number) => number, t: number) => number][] = [
      ['backward', (at, t) => at(t + LAG)],
      ['standing, in phase', (at, t) => 0.5 * at(t)],
      ['standing, in antiphase', (at, t) => -at(t)],
    ];
    for (const [name, rear] of cases) {
      const k = kinematics([trial(0.3, rear, [400])], 0.125);
      expect(k.wavelength, name).toBeNull();
      expect(k.unmeasured, name).toBe('no head-to-tail wave');
      expect(k.frequency, name).toBeGreaterThan(0.285);
    }
    expect(kinematics([trial(0.3, (at, t) => at(t + LAG), [400])], 0.125).lag).toBeLessThan(0);
  });

  it('keeps its search within half a period and 5 s', () => {
    // At 0.05 Hz a head-to-tail lag of 7 s lies beyond 5 s, so the search can't reach it.
    const k = kinematics([trial(0.05, (at, t) => at(t - 7), [400])], 0.125);
    expect(k.wavelength).toBeNull();
    expect(Math.abs(k.lag ?? 0)).toBeLessThanOrEqual(5);
  });

  it('measures nothing without a bout, and no wave without crossings', () => {
    const k = kinematics([{ velocity: [], mid: [], front: [], rear: [], bouts: [] }], 0.125);
    expect(k).toEqual({
      bouts: 0,
      duration: 0,
      crossings: 0,
      speed: null,
      frequency: null,
      wavelength: null,
      unmeasured: 'no bout of 10 s',
      lag: null,
      correlation: null,
    });
    const flat = Array<number>(100).fill(1);
    const still = kinematics(
      [
        {
          velocity: Array<number>(100).fill(0.05),
          mid: flat,
          front: flat,
          rear: flat,
          bouts: [{ start: 0, length: 100 }],
        },
      ],
      0.125,
    );
    expect(still.speed).toBeCloseTo(0.05, 12);
    expect([still.frequency, still.wavelength, still.unmeasured]).toEqual([0, null, 'no mid-body bending']);
  });
});
