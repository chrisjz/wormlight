import { describe, expect, it } from 'vitest';
import { PARAMS } from '../science/params.ts';
import { CALIBRATED } from '../sim/world.ts';
import { emptySums } from './posture.ts';
import {
  CALIBRATION,
  ERROR_CAP,
  MAPPING,
  TARGETS,
  best,
  bounds,
  calibrate,
  fromUnit,
  measure,
  objective,
  outside,
  provisionalValues,
  toUnit,
  type Evaluated,
  type KinematicRecord,
  type Scorer,
  type Values,
} from './calibration.ts';

describe("the calibration's settings", () => {
  it('start from the provisional values, the connection gains at their upper bound', () => {
    const values = provisionalValues();
    for (const id of CALIBRATED) expect(values[id], id).toBe(PARAMS[id].provisional);
    const unit = toUnit(values);
    expect(unit.every((u) => u >= 0 && u <= 1)).toBe(true);
    expect([unit[CALIBRATED.indexOf('gapGainB')], unit[CALIBRATED.indexOf('smdGain')]]).toEqual([1, 1]);
    const back = fromUnit(unit);
    for (const id of CALIBRATED) expect(back[id], id).toBeCloseTo(values[id], 9);
  });

  it("are PLAN §7.3's", () => {
    expect(CALIBRATION).toMatchObject({
      budget: 2000,
      trialSeconds: 120,
      rechecked: 10,
      start: 'provisional',
      sigma: 0.3,
      seed: 1,
    });
    expect(CALIBRATION.fitSeeds).toEqual([1001, 1002, 1003, 1004]);
    expect(CALIBRATION.checkSeeds).toEqual(Array.from({ length: 16 }, (_, i) => 1005 + i));
    expect(TARGETS).toEqual({ frequency: 0.3, wavelength: 0.65, speed: 0.22, reversalRate: 1.8 });
    expect(ERROR_CAP).toBe(2);
    // Track R's bounds (PLAN §7.3, §9), in the registry's units: g_osc in pS, g_nmj and θ_nmj in relative drive.
    expect(Object.fromEntries(CALIBRATED.map((id) => [id, [...bounds(id), MAPPING[id]]]))).toEqual({
      oscillatorExcitability: [300, 5000, 'log'],
      oscillatorExcitabilityB: [0, 5000, 'linear'],
      oscillatorRecoveryTime: [0.2, 3, 'log'],
      oscillatorDriveThreshold: [-28, 5, 'linear'],
      headSwitchGain: [20, 400, 'log'],
      proprioceptiveGain: [0.1, 30, 'log'],
      gapGainB: [0.1, 1, 'log'],
      neuromuscularGain: [2, 40, 'log'],
      neuromuscularThreshold: [-0.3, 0.8, 'linear'],
      smdGain: [0.1, 1, 'log'],
      noiseIntensity: [0, 0.169, 'linear'],
      noiseCorrelation: [0.02, 0.2, 'log'],
    });
  });
});

describe('the search space', () => {
  it('maps [0, 1] onto each range, logarithmically or linearly, and back', () => {
    const lo = fromUnit(new Array<number>(CALIBRATED.length).fill(0));
    const hi = fromUnit(new Array<number>(CALIBRATED.length).fill(1));
    const mid = fromUnit(new Array<number>(CALIBRATED.length).fill(0.5));
    for (const id of CALIBRATED) {
      expect(lo[id]).toBeCloseTo(bounds(id)[0], 12);
      expect(hi[id]).toBeCloseTo(bounds(id)[1], 12);
      const [a, b] = bounds(id);
      expect(mid[id]).toBeCloseTo(MAPPING[id] === 'log' ? Math.sqrt(a * b) : (a + b) / 2, 12);
    }
    const u = [0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.8, 0.4, 0.6, 0.35, 0.55, 0.45];
    toUnit(fromUnit(u)).forEach((x, i) => expect(x).toBeCloseTo(u[i], 12));
  });

  it('takes a candidate outside at the nearest point inside, and charges it the squared distance', () => {
    const u = [-0.5, 1.2, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    expect(fromUnit(u).oscillatorExcitability).toBe(300);
    expect(fromUnit(u).oscillatorExcitabilityB).toBe(5000);
    expect(outside(u)).toBeCloseTo(0.25 + 0.04, 15);
    expect(outside(new Array<number>(CALIBRATED.length).fill(0.5))).toBe(0);
    expect(() => fromUnit([0.5])).toThrow(/coordinates/);
  });
});

// A trial's records from 10 s, the curvature at three rods a travelling wave of 0.3 Hz and wavelength 0.65.
function crawling(seconds: number, speed: number): KinematicRecord {
  const n = Math.round(seconds * 10);
  const lag = 0.125 / (0.3 * 0.65);
  const wave = (shift: number): number[] =>
    Array.from({ length: n }, (_, k) => Math.sin(2 * Math.PI * 0.3 * (k / 10 - shift)));
  return {
    finite: true,
    velocity: new Array<number>(n).fill(speed),
    mid: wave(lag / 2),
    front: wave(0),
    rear: wave(lag),
  };
}

describe('the measures and the objective', () => {
  it('score a worm that crawls as the real one does at zero, but for the reversals it lacks', () => {
    const m = measure([crawling(110, 0.22), crawling(110, 0.22)]);
    expect(m.bouts).toBe(2);
    expect(m.frequency).toBeCloseTo(0.3, 2);
    expect(m.wavelength).toBeCloseTo(0.65, 1);
    expect(m.speed).toBeCloseTo(0.22, 12);
    expect(m.reversalRate).toBe(0);
    const score = objective(m);
    expect(score.errors.reversalRate).toBe(1);
    expect(score.value).toBeLessThan(1.01);
  });

  it('count reversals per minute over the measured windows', () => {
    // 20 s backing up in each of 2 trials of 60 s measured: 2 reversals in 2 minutes.
    const trial = (): KinematicRecord => {
      const r = crawling(60, 0);
      return { ...r, velocity: Array.from({ length: 600 }, (_, k) => (k < 200 ? -0.05 : 0)) };
    };
    expect(measure([trial(), trial()]).reversalRate).toBeCloseTo(1, 12);
  });

  it('give a worm with no bout its mean speed, and cap its frequency and wavelength', () => {
    const still = { ...crawling(60, 0.005) };
    const m = measure([still]);
    expect(m).toMatchObject({ bouts: 0, frequency: null, wavelength: null });
    expect(m.speed).toBeCloseTo(0.005, 12);
    const score = objective(m);
    expect(score.errors).toMatchObject({ frequency: ERROR_CAP, wavelength: ERROR_CAP });
    expect(score.errors.speed).toBeCloseTo(1 - 0.005 / 0.22, 12);
  });

  it('cap every error, so no measured wave scores worse than none', () => {
    const score = objective({ finite: true, bouts: 3, frequency: 0.3, wavelength: 4.2, speed: 0.9, reversalRate: 1.8 });
    expect(score.errors).toEqual({ frequency: 0, wavelength: ERROR_CAP, speed: ERROR_CAP, reversalRate: 0 });
    expect(score.value).toBe(8);
  });

  it('rank a candidate whose trial left the finite numbers below every other', () => {
    const broken = measure([{ ...crawling(60, 0.22), finite: false }]);
    expect(objective(broken).value).toBe(Infinity);
    expect(measure([]).finite).toBe(false);
  });
});

describe('the final check', () => {
  it('takes the best distinct candidates, the earlier first on a tie', () => {
    const v = (x: number): Values => fromUnit(new Array<number>(CALIBRATED.length).fill(x));
    const evaluated = [
      { values: v(0.1), value: 3 },
      { values: v(0.2), value: 1 },
      { values: v(0.2), value: 1 },
      { values: v(0.3), value: Infinity },
      { values: v(0.4), value: 1 },
      { values: v(0.5), value: 0.5 },
    ];
    expect(best(evaluated, 3).map((e) => e.values)).toEqual([v(0.5), v(0.2), v(0.4)]);
    expect(best(evaluated, 10)).toHaveLength(5);
  });
});

// A synthetic scorer: the objective is the distance from a point, the same on every seed, so the search's
// bookkeeping can be checked without a trial.
// One coordinate a parameter.
const target = [0.2, 0.8, 0.5, 0.6, 0.4, 0.7, 0.3, 0.5, 0.45, 0.65, 0.35, 0.55];
const synthetic = (calls: { seeds: readonly number[] }[] = []): Scorer => {
  return (values, seeds) => {
    calls.push({ seeds });
    const u = toUnit(values);
    const value = u.reduce((s, x, i) => s + (x - target[i]) ** 2, 0);
    const measures = { finite: true, bouts: 1, frequency: 0.3, wavelength: 0.65, speed: 0.22, reversalRate: 1.8 };
    return Promise.resolve({
      value,
      errors: { frequency: 0, wavelength: 0, speed: 0, reversalRate: 0 },
      measures,
      unconverged: 0,
    });
  };
};

describe('the search', () => {
  it('spends its budget, a last generation cut short included, then checks the best on fresh seeds', async () => {
    const calls: { seeds: readonly number[] }[] = [];
    const fit = await calibrate(synthetic(calls), { budget: 25 });
    expect(fit.evaluated).toHaveLength(25);
    // From the provisional values, unless told otherwise.
    expect(fit.generations[0].mean).toEqual(toUnit(provisionalValues()));
    const centre = new Array<number>(CALIBRATED.length).fill(0.5);
    expect((await calibrate(synthetic(), { budget: 11, start: centre })).generations[0].mean).toEqual(centre);
    // Twelve parameters: generations of 4 + ⌊3 ln 12⌋ = 11.
    expect(fit.generations.map((g) => g.evaluations)).toEqual([11, 22, 25]);
    expect(fit.evaluated.map((e) => e.generation)).toEqual([
      ...new Array<number>(11).fill(0),
      ...new Array<number>(11).fill(1),
      ...new Array<number>(3).fill(2),
    ]);
    expect(fit.evaluated.slice(22).map((e) => e.candidate)).toEqual([0, 1, 2]);
    // The ten best and the final mean, on the 16 fresh seeds.
    expect(fit.checked).toHaveLength(11);
    expect(fit.checked[10].from).toBe('the final mean');
    expect(calls.filter((c) => c.seeds[0] === 1005)).toHaveLength(11);
    expect(calls.filter((c) => c.seeds[0] === 1001)).toHaveLength(25);
    expect(fit.final.value).toBe(Math.min(...fit.checked.map((c) => c.value)));
    expect(fit.checked.slice(0, 10).map((c) => c.fit)).toEqual(
      [...fit.checked.slice(0, 10).map((c) => c.fit)].sort((a, b) => (a ?? 0) - (b ?? 0)),
    );
  });

  it('resumes a stopped run exactly, and refuses one that parts from the record', async () => {
    const whole = await calibrate(synthetic(), { budget: 30 });
    const partial = await calibrate(synthetic(), { budget: 20 });
    const calls: { seeds: readonly number[] }[] = [];
    const resumed = await calibrate(synthetic(calls), { budget: 30, previous: partial.evaluated });
    expect(resumed.evaluated).toEqual(whole.evaluated);
    expect(resumed.final).toEqual(whole.final);
    // Only the 10 new candidates, and the final check, were scored.
    expect(calls.filter((c) => c.seeds[0] === 1001)).toHaveLength(10);
    const tampered: Evaluated[] = partial.evaluated.map((e, k) =>
      k === 12 ? { ...e, unit: e.unit.map((x) => x + 1e-12) } : e,
    );
    await expect(calibrate(synthetic(), { budget: 30, previous: tampered })).rejects.toThrow(
      /parts from the recorded one/,
    );
  });

  it('measures as checkpoint 1 does', async () => {
    const { checkpoint1 } = await import('./checkpoints.ts');
    const r = crawling(110, 0.2);
    const trial = {
      ...r,
      seed: 1,
      seconds: 120,
      posture: 0,
      turn: 0,
      velocity: Array.from(r.velocity),
      mid: Array.from(r.mid),
      front: Array.from(r.front),
      rear: Array.from(r.rear),
      postures: emptySums(),
      selfIntersecting: 0,
      unconverged: 0,
      touches: [],
      switchFlips: [],
      ava: [],
    };
    const k = checkpoint1([trial, { ...trial, seed: 2 }], [[1]]).kinematics;
    const m = measure([trial, trial]);
    expect([m.frequency, m.wavelength, m.speed]).toEqual([k.frequency, k.wavelength, k.speed]);
  });
});
