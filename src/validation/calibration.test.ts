import { describe, expect, it } from 'vitest';
import { hash, uniform } from '../sim/brain/rng.ts';
import { PARAMS } from '../science/params.ts';
import { CALIBRATED } from '../sim/world.ts';
import { emptySums } from './posture.ts';
import {
  ALL_TARGETS,
  CALIBRATION,
  ERROR_CAP,
  MAPPING,
  SECOND_ROUND,
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
  SURVEY,
  surveyStart,
  THIRD_ROUND,
  ranked,
} from './calibration.ts';

describe("the calibration's settings", () => {
  it('start from the provisional values, the connection gains at their upper bound', () => {
    const values = provisionalValues('current');
    for (const id of CALIBRATED) expect(values[id], id).toBe(PARAMS[id].provisional);
    const unit = toUnit(values, 'current');
    expect(unit.every((u) => u >= 0 && u <= 1)).toBe(true);
    expect([unit[CALIBRATED.indexOf('gapGainB')], unit[CALIBRATED.indexOf('smdGain')]]).toEqual([1, 1]);
    const back = fromUnit(unit, 'current');
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
    expect(Object.fromEntries(CALIBRATED.map((id) => [id, [...bounds(id, 'current'), MAPPING[id]]]))).toEqual({
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
    const lo = fromUnit(new Array<number>(CALIBRATED.length).fill(0), 'current');
    const hi = fromUnit(new Array<number>(CALIBRATED.length).fill(1), 'current');
    const mid = fromUnit(new Array<number>(CALIBRATED.length).fill(0.5), 'current');
    for (const id of CALIBRATED) {
      expect(lo[id]).toBeCloseTo(bounds(id, 'current')[0], 12);
      expect(hi[id]).toBeCloseTo(bounds(id, 'current')[1], 12);
      const [a, b] = bounds(id, 'current');
      expect(mid[id]).toBeCloseTo(MAPPING[id] === 'log' ? Math.sqrt(a * b) : (a + b) / 2, 12);
    }
    const u = [0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.8, 0.4, 0.6, 0.35, 0.55, 0.45];
    toUnit(fromUnit(u, 'current'), 'current').forEach((x, i) => expect(x).toBeCloseTo(u[i], 12));
  });

  it('takes a candidate outside at the nearest point inside, and charges it the squared distance', () => {
    const u = [-0.5, 1.2, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    expect(fromUnit(u, 'current').oscillatorExcitability).toBe(300);
    expect(fromUnit(u, 'current').oscillatorExcitabilityB).toBe(5000);
    expect(outside(u)).toBeCloseTo(0.25 + 0.04, 15);
    expect(outside(new Array<number>(CALIBRATED.length).fill(0.5))).toBe(0);
    expect(() => fromUnit([0.5], 'current')).toThrow(/coordinates/);
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

  it("score a bout-less worm that moves forward by its spectrum's peak, from R's second round on", () => {
    // Forward at 0.05 body lengths per second, but pausing each 9 s, so no bout reaches 10 s.
    const r = crawling(60, 0.05);
    const paused = { ...r, velocity: Array.from(r.velocity, (v, k) => (k % 90 === 0 ? 0 : v)) };
    const m = measure([paused, paused], { spectral: true });
    expect(m.bouts).toBe(0);
    expect(m.frequency).toBeCloseTo(0.3, 12);
    expect(m.wavelength).toBeNull();
    // Below the motion floor, the spectrum doesn't count; and round 1's scoring, for the refit's procedure, caps it.
    const slow = { ...paused, velocity: paused.velocity.map((v) => v / 10) };
    expect(measure([slow], { spectral: true }).frequency).toBeNull();
    expect(measure([paused, paused]).frequency).toBeNull();
  });

  it("sum a stage's targets alone, keeping every error", () => {
    const m = { finite: true, bouts: 3, frequency: 0.3, wavelength: 0.65, speed: 0.22, reversalRate: 0 };
    expect(objective(m).value).toBe(1);
    const crawl = objective(m, SECOND_ROUND.crawl.targets);
    expect(crawl.value).toBe(0);
    expect(crawl.errors.reversalRate).toBe(1);
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
    const v = (x: number): Values => fromUnit(new Array<number>(CALIBRATED.length).fill(x), 'current');
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
    const u = toUnit(values, 'current');
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

describe('the survey of the bounded model (PLAN §9, set after review before any of it ran)', () => {
  it('is sixteen searches of 250 in the conductance form, with CMA-ES seeds 11 to 26, graded on 3001 to 3020', () => {
    expect(SURVEY).toMatchObject({ form: 'conductance', budget: 250, hashSeed: 0x53555256 });
    expect(SURVEY.seeds).toEqual(Array.from({ length: 16 }, (_, i) => 11 + i));
    expect(SURVEY.gradeSeeds).toEqual(Array.from({ length: 20 }, (_, i) => 3001 + i));
  });

  it('starts from a Latin hypercube strictly inside the box, and restarts from fresh points of the same hash', () => {
    const S = SURVEY.hashSeed;
    const n = SURVEY.seeds.length;
    const starts = SURVEY.seeds.map((_, j) => surveyStart(j, 0));
    for (let k = 0; k < CALIBRATED.length; k++) {
      // Each parameter's sixteen starts fill its sixteen cells, one each.
      const cells = starts.map((u) => Math.floor(u[k] * n)).sort((a, b) => a - b);
      expect(cells).toEqual(Array.from({ length: n }, (_, i) => i));
      // By the rules' formula: search j's cell is the rank of uniform(hash(S, j, 64 + k)) among the sixteen, and its
      // place within the cell uniform(hash(S, j, k)).
      const b = Array.from({ length: n }, (_, j) => uniform(hash(S, j, 64 + k)));
      starts.forEach((u, j) => {
        expect(Math.floor(u[k] * n)).toBe(b.filter((x) => x < b[j]).length);
        expect(u[k] * n - Math.floor(u[k] * n)).toBeCloseTo(uniform(hash(S, j, k)), 12);
        expect(u[k] > 0 && u[k] < 1).toBe(true);
      });
    }
    // Restart r of search j starts at uniform(hash(S, 16r + j, k)).
    for (const r of [1, 2, 3]) {
      expect(surveyStart(3, r)).toEqual(CALIBRATED.map((_, k) => uniform(hash(S, n * r + 3, k))));
    }
    expect(() => surveyStart(16, 0)).toThrow(/no search 16/);
  });

  it("restarts a search from restartFrom's point for each restart, and replays such a search bit for bit", async () => {
    const points = [0.25, 0.5, 0.75].map((x) => CALIBRATED.map(() => x));
    // A step below 10 restarts it after each generation.
    const options = {
      form: 'current' as const,
      budget: 120,
      restarts: { sigma: 10, stall: 20 },
      restartFrom: (r: number) => points[r % 3],
    };
    const fit = await calibrate(synthetic(), options);
    expect(fit.generations[0].mean).toEqual(toUnit(provisionalValues('current'), 'current'));
    for (const r of [1, 2]) expect(fit.generations.find((g) => g.restart === r)?.mean).toEqual(points[r]);
    // Resumed from its evaluations, it comes out the same; resumed with other restart points, it is caught.
    const again = await calibrate(synthetic(), { ...options, previous: fit.evaluated });
    expect(again.evaluated).toEqual(fit.evaluated);
    const moved = { ...options, previous: fit.evaluated, restartFrom: (r: number) => points[(r + 1) % 3] };
    await expect(calibrate(synthetic(), moved)).rejects.toThrow(/parts from/);
  });
});

describe("R's second round", () => {
  it("is PLAN §7.3's: the crawl, then the noise, with restarts and a probe", () => {
    expect(SECOND_ROUND.crawl).toEqual({ targets: ['frequency', 'wavelength', 'speed'], budget: 2000 });
    expect(SECOND_ROUND.noise).toEqual({
      ids: ['noiseIntensity', 'noiseCorrelation'],
      targets: ALL_TARGETS,
      budget: 200,
    });
    expect(SECOND_ROUND.restart).toEqual({ sigma: 0.01, stall: 20 });
    expect(SECOND_ROUND.probe.budget).toBe(400);
    expect(SECOND_ROUND.probe.seeds).toEqual([11, 12, 13, 14]);
    expect(SECOND_ROUND.probe.gradeSeeds).toEqual(Array.from({ length: 20 }, (_, i) => 2001 + i));
  });

  it('restarts a stalled search from the same start, its population doubled and its stream continued', async () => {
    // A flat objective: nothing ever improves on the first generation.
    const flat: Scorer = () =>
      Promise.resolve({
        value: 1,
        errors: { frequency: 0, wavelength: 0, speed: 0, reversalRate: 0 },
        measures: { finite: true, bouts: 1, frequency: 0.3, wavelength: 0.65, speed: 0.22, reversalRate: 1.8 },
        unconverged: 0,
      });
    const budget = 21 * 11 + 22 + 5;
    const fit = await calibrate(flat, { form: 'current', budget, restarts: SECOND_ROUND.restart });
    const first = fit.generations.filter((g) => g.restart === 0);
    // The first generation sets the best; after 20 more without a fall, the search restarts.
    expect(first).toHaveLength(21);
    expect(first.every((g) => g.lambda === 11)).toBe(true);
    const second = fit.generations.filter((g) => g.restart === 1);
    expect(second[0]).toMatchObject({ generation: 0, lambda: 22 });
    expect(second[0].mean).toEqual(toUnit(provisionalValues('current'), 'current'));
    // Its draws continue the seed's stream rather than repeat its start.
    const a = fit.evaluated.find((e) => e.restart === 0 && e.generation === 0 && e.candidate === 0);
    const b = fit.evaluated.find((e) => e.restart === 1 && e.generation === 0 && e.candidate === 0);
    expect(b?.unit).not.toEqual(a?.unit);
    expect(fit.evaluated).toHaveLength(budget);
    expect(fit.checked[0].from).toMatch(/^restart 0, generation 0, candidate 0$/);
    // And a resumed run with restarts replays exactly.
    const partial = await calibrate(flat, { form: 'current', budget: 240, restarts: SECOND_ROUND.restart });
    const resumed = await calibrate(flat, {
      form: 'current',
      budget,
      restarts: SECOND_ROUND.restart,
      previous: partial.evaluated,
    });
    expect(resumed.evaluated.map((e) => e.unit)).toEqual(fit.evaluated.map((e) => e.unit));
  });

  it("searches the noise alone, the rest held, and checks stage 1's values beside its own", async () => {
    const fixed = { ...provisionalValues('current'), gapGainB: 0.25 };
    const calls: { seeds: readonly number[] }[] = [];
    const fit = await calibrate(synthetic(calls), {
      form: 'current',
      budget: 12,
      ids: SECOND_ROUND.noise.ids,
      fixed,
      extra: [{ from: "stage 1's final values", values: fixed }],
    });
    // Two parameters: generations of 4 + ⌊3 ln 2⌋ = 6, from the held values' noise.
    expect(fit.generations.map((g) => g.evaluations)).toEqual([6, 12]);
    expect(fit.generations[0].mean).toEqual(toUnit(fixed, 'current', SECOND_ROUND.noise.ids));
    for (const e of fit.evaluated) {
      expect(e.unit).toHaveLength(2);
      for (const id of CALIBRATED) {
        if (!SECOND_ROUND.noise.ids.includes(id)) expect(e.values[id]).toBe(fixed[id]);
      }
    }
    // Stage 1's values first, so that the noise changes only if it scores better, not on a tie.
    expect(fit.checked[0].from).toBe("stage 1's final values");
    expect(fit.checked[fit.checked.length - 1].from).toBe('the final mean');
    const tie = await calibrate(synthetic(), {
      form: 'current',
      budget: 6,
      ids: SECOND_ROUND.noise.ids,
      fixed,
      extra: [{ from: "stage 1's final values", values: fixed }],
    });
    expect(tie.checked.filter((c) => c.from === "stage 1's final values")).toHaveLength(1);
    expect(() => fromUnit([0.5, 0.5], 'current', SECOND_ROUND.noise.ids)).toThrow(/needs the rest/);
  });
});

describe('the search, as fixed after review', () => {
  // A bowl around the start: CMA-ES converges on it, its step shrinking below the restart's 0.01.
  const bowl: Scorer = (values) => {
    const u = toUnit(values, 'current');
    const start = toUnit(provisionalValues('current'), 'current');
    return Promise.resolve({
      value: u.reduce((s, x, i) => s + (x - start[i]) ** 2, 0),
      errors: { frequency: 0, wavelength: 0, speed: 0, reversalRate: 0 },
      measures: { finite: true, bouts: 1, frequency: 0.3, wavelength: 0.65, speed: 0.22, reversalRate: 1.8 },
      unconverged: 0,
    });
  };

  it('restarts when its step falls below 0.01, and offers the last told mean, not a fresh start', async () => {
    const fit = await calibrate(bowl, { form: 'current', budget: 1500, restarts: { sigma: 0.01, stall: 1000 } });
    const first = fit.generations.filter((g) => g.restart === 0);
    // With the stall out of reach, the restart can only be the step's: a generation records its step before its
    // update, so the last recorded one sits just above 0.01.
    expect(fit.generations.some((g) => g.restart === 1)).toBe(true);
    expect(first.length).toBeLessThan(1000);
    expect(first[first.length - 1].sigma).toBeLessThan(0.02);
    // A budget that ends as a restart begins: its final mean is the previous restart's, near the bowl's floor.
    const ended = await calibrate(bowl, {
      form: 'current',
      budget: first.length * 11 + 3,
      restarts: { sigma: 0.01, stall: 1000 },
    });
    expect(ended.generations[ended.generations.length - 1].restart).toBe(1);
    const mean = ended.checked.find((c) => c.from === 'the final mean');
    expect(mean?.value).toBeLessThan(1e-3);
  });

  it('ranks a candidate that left the finite numbers last when resumed through JSON', async () => {
    let calls = 0;
    const broken: Scorer = (values, seeds) => {
      calls++;
      return calls === 3 && seeds[0] === 1001
        ? Promise.resolve({
            value: Infinity,
            errors: { frequency: 2, wavelength: 2, speed: 2, reversalRate: 2 },
            measures: { finite: false, bouts: 0, frequency: null, wavelength: null, speed: 0, reversalRate: 0 },
            unconverged: 0,
          })
        : synthetic()(values, seeds);
    };
    const whole = await calibrate(broken, { form: 'current', budget: 33 });
    calls = 0;
    const partial = await calibrate(broken, { form: 'current', budget: 11 });
    const saved = JSON.parse(JSON.stringify(partial.evaluated)) as Evaluated[];
    expect(saved.some((e) => (e.value as number | null) === null)).toBe(true);
    calls = 100;
    const resumed = await calibrate(broken, { form: 'current', budget: 33, previous: saved });
    expect(resumed.evaluated.map((e) => e.unit)).toEqual(whole.evaluated.map((e) => e.unit));
    expect(resumed.generations[0].best).toBe(whole.generations[0].best);
  });
});

describe('the search', () => {
  it('spends its budget, a last generation cut short included, then checks the best on fresh seeds', async () => {
    const calls: { seeds: readonly number[] }[] = [];
    const fit = await calibrate(synthetic(calls), { form: 'current', budget: 25 });
    expect(fit.evaluated).toHaveLength(25);
    // From the provisional values, unless told otherwise.
    expect(fit.generations[0].mean).toEqual(toUnit(provisionalValues('current'), 'current'));
    const centre = new Array<number>(CALIBRATED.length).fill(0.5);
    expect((await calibrate(synthetic(), { form: 'current', budget: 11, start: centre })).generations[0].mean).toEqual(
      centre,
    );
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
    const whole = await calibrate(synthetic(), { form: 'current', budget: 30 });
    const partial = await calibrate(synthetic(), { form: 'current', budget: 20 });
    const calls: { seeds: readonly number[] }[] = [];
    const resumed = await calibrate(synthetic(calls), { form: 'current', budget: 30, previous: partial.evaluated });
    expect(resumed.evaluated).toEqual(whole.evaluated);
    expect(resumed.final).toEqual(whole.final);
    // Only the 10 new candidates, and the final check, were scored.
    expect(calls.filter((c) => c.seeds[0] === 1001)).toHaveLength(10);
    const tampered: Evaluated[] = partial.evaluated.map((e, k) =>
      k === 12 ? { ...e, unit: e.unit.map((x) => x + 1e-12) } : e,
    );
    await expect(calibrate(synthetic(), { form: 'current', budget: 30, previous: tampered })).rejects.toThrow(
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

describe("R's third round (PLAN §7.3, §9; set before any of it ran, revised after review)", () => {
  it("is the survey's design on the crawl alone, the speed's target 0.15, then four searches continued to 750", () => {
    expect(THIRD_ROUND).toMatchObject({
      form: 'conductance',
      phase1: { budget: 250 },
      phase2: { budget: 750, continued: 4 },
    });
    expect(THIRD_ROUND.seeds).toEqual(SURVEY.seeds);
    expect(THIRD_ROUND.targets).toEqual(['frequency', 'wavelength', 'speed']);
    expect(THIRD_ROUND.goals).toEqual({ ...TARGETS, speed: 0.15 });
    // The survey's restart rule, and none after the 250th evaluation.
    expect(THIRD_ROUND.restart).toEqual({ ...SECOND_ROUND.restart, until: 250 });
    // 6,000 evaluations a wiring: sixteen of 250, and four continued by 500 each.
    const { phase1, phase2 } = THIRD_ROUND;
    expect(THIRD_ROUND.seeds.length * phase1.budget + phase2.continued * (phase2.budget - phase1.budget)).toBe(6000);
    // Checkpoint 1's targets stay, which the committed records pin.
    expect(TARGETS.speed).toBe(0.22);
  });

  it('scores the speed against its own target, the other targets as before', () => {
    const m = { finite: true, bouts: 3, frequency: 0.3, wavelength: 0.65, speed: 0.15, reversalRate: 0 };
    expect(objective(m, THIRD_ROUND.targets, THIRD_ROUND.goals).value).toBe(0);
    expect(objective(m, THIRD_ROUND.targets).errors.speed).toBeCloseTo(0.07 / 0.22, 12);
    // A worm without a bout: its frequency and wavelength at the cap, its speed by its mean forward velocity.
    const still = measure([{ finite: true, velocity: [0.03, 0.03], mid: [0, 0], front: [0, 0], rear: [0, 0] }]);
    const score = objective(still, THIRD_ROUND.targets, THIRD_ROUND.goals);
    expect(score.errors).toMatchObject({ frequency: ERROR_CAP, wavelength: ERROR_CAP });
    expect(score.errors.speed).toBeCloseTo(0.8, 12);
  });

  it('ranks searches by their objective, the lower seed first on a tie, the infinite last', () => {
    const runs = [
      { seed: 14, value: 1 },
      { seed: 12, value: 1 },
      { seed: 11, value: Infinity },
      { seed: 13, value: null },
      { seed: 15, value: 0.5 },
    ];
    expect(ranked(runs).map((r) => r.seed)).toEqual([15, 12, 14, 11, 13]);
  });

  it('continues a search to 750 evaluations exactly as a fresh one of 750 runs', async () => {
    const options = {
      form: 'conductance' as const,
      restarts: THIRD_ROUND.restart,
      seed: 26,
      start: surveyStart(15, 0),
      restartFrom: (r: number) => surveyStart(15, r),
    };
    const first = await calibrate(synthetic(), { ...options, budget: THIRD_ROUND.phase1.budget });
    const continued = await calibrate(synthetic(), {
      ...options,
      budget: THIRD_ROUND.phase2.budget,
      previous: first.evaluated,
    });
    const fresh = await calibrate(synthetic(), { ...options, budget: THIRD_ROUND.phase2.budget });
    expect(continued.evaluated.slice(0, 250)).toEqual(first.evaluated);
    expect(continued.evaluated).toEqual(fresh.evaluated);
    expect(continued.final).toEqual(fresh.final);
    // The generation phase 1 cut short is whole in phase 2: 22 generations of 11, then 8 of the 23rd.
    expect(first.generations.at(-1)).toMatchObject({ generation: 22, evaluations: 250 });
    expect(continued.generations[22]).toMatchObject({ generation: 22, evaluations: 253 });
  });

  it('continues a search that restarted in phase 1 exactly, and scores none of its evaluations again', async () => {
    // A flat objective restarts the search at the top of generation 21, after 231 evaluations, at λ = 22.
    let scored = 0;
    const flat: Scorer = (_, seeds) => {
      if (seeds === CALIBRATION.fitSeeds) scored++;
      return Promise.resolve({
        value: 1,
        errors: { frequency: 0, wavelength: 0, speed: 0, reversalRate: 0 },
        measures: { finite: true, bouts: 1, frequency: 0.3, wavelength: 0.65, speed: 0.15, reversalRate: 0 },
        unconverged: 0,
      });
    };
    const options = {
      form: 'conductance' as const,
      restarts: THIRD_ROUND.restart,
      seed: 11,
      start: surveyStart(0, 0),
      restartFrom: (r: number) => surveyStart(0, r),
    };
    const first = await calibrate(flat, { ...options, budget: 250 });
    // Phase 1 ends 19 candidates into the restart's first generation.
    expect(first.generations.at(-1)).toMatchObject({ restart: 1, generation: 0, lambda: 22, evaluations: 250 });
    const fresh = await calibrate(flat, { ...options, budget: 750 });
    // Continued from phase 1's record, as the runner does when phase 2's own is shorter, it scores only the 500 new.
    scored = 0;
    const continued = await calibrate(flat, { ...options, budget: 750, previous: first.evaluated });
    expect(scored).toBe(500);
    expect(continued.evaluated).toEqual(fresh.evaluated);
    expect(continued.final).toEqual(fresh.final);
  });

  it('restarts a stalled search before the 250th evaluation, and never after', async () => {
    // A flat objective: nothing ever improves on a restart's first generation.
    const flat: Scorer = () =>
      Promise.resolve({
        value: 1,
        errors: { frequency: 0, wavelength: 0, speed: 0, reversalRate: 0 },
        measures: { finite: true, bouts: 1, frequency: 0.3, wavelength: 0.65, speed: 0.15, reversalRate: 0 },
        unconverged: 0,
      });
    // It restarts at the top of generation 21, after 231 evaluations; its second restart would come after 693.
    const fit = await calibrate(flat, { form: 'conductance', budget: 750, restarts: THIRD_ROUND.restart });
    expect(new Set(fit.generations.map((g) => g.restart))).toEqual(new Set([0, 1]));
    expect(fit.generations.find((g) => g.restart === 1)).toMatchObject({ generation: 0, lambda: 22, evaluations: 253 });
    const unlimited = await calibrate(flat, { form: 'conductance', budget: 750, restarts: SECOND_ROUND.restart });
    expect(Math.max(...unlimited.generations.map((g) => g.restart))).toBe(2);
  });
});
