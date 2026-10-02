// Checkpoints 2 and 3's touches (PLAN §7.4; DECISIONS.md, 2026-10-02): when a worm is touched, how the world forks,
// and how the two checkpoints grade the touches.

import { describe, expect, it } from 'vitest';
import { parseArgs } from '../scripts/harness/run.ts';
import { validateWormlightData } from '../src/data/schema.ts';
import { hash, uniform } from '../src/sim/brain/rng.ts';
import { BACK, FRONT } from '../src/sim/touch.ts';
import { currentParams, World } from '../src/sim/world.ts';
import { meanVelocity } from '../src/validation/checkpoints.ts';
import {
  checkpoint2,
  checkpoint3,
  earliestTouch,
  forwardBefore,
  runTouchTrial,
  TOUCH_LANE,
  type CopyOutcome,
  type TouchTrialRecord,
} from '../src/validation/touch.ts';
import { runTrial } from '../src/validation/trial.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const params = currentParams();
const postures = [Array.from({ length: 100 }, () => 0)];

describe("the touch's moment", () => {
  it('is drawn for each seed between 20 and 100 s, on a lane of its own', () => {
    expect(TOUCH_LANE).toBe(0xfffffffa);
    for (let seed = 1; seed <= 200; seed++) {
      const t = earliestTouch(seed);
      expect(t).toBeGreaterThanOrEqual(20);
      expect(t).toBeLessThan(100);
      expect(t).toBe(20 + 80 * uniform(hash(seed, 0, TOUCH_LANE)));
    }
  });

  it('needs every velocity sample whose window lies within the 2 s before to be forward', () => {
    // Samples from 10 s, 0.1 s apart: the touch at 30 s reads those centred from 28.5 to 29.5 s.
    const velocity = Array.from({ length: 400 }, () => 0.05);
    expect(forwardBefore(velocity, 30)).toBe(true);
    const at = (t: number): number => Math.round((t - 10) / 0.1);
    for (const t of [28.5, 29.5]) {
      const v = [...velocity];
      v[at(t)] = 0.01;
      expect(forwardBefore(v, 30), `${t} s`).toBe(false);
    }
    const outside = [...velocity];
    outside[at(28.4)] = -0.1;
    outside[at(29.6)] = -0.1;
    expect(forwardBefore(outside, 30)).toBe(true);
  });

  it(
    "touches at the first sample from the seed's earliest at which the 2 s before were forward",
    { timeout: 30000 },
    () => {
      const seed = 4;
      const r = runTouchTrial(data, { seed, seconds: 120, params, postures });
      expect(r.time).not.toBeNull();
      const t = r.time as number;
      // The same worm untouched, as checkpoint 1 runs it.
      const { velocity } = runTrial(data, { seed, seconds: 120, params, postures });
      expect(forwardBefore(velocity, t)).toBe(true);
      for (let s = Math.ceil(r.earliest * 10 - 1e-9) / 10; s < t - 1e-9; s += 0.1) {
        expect(forwardBefore(velocity, Number(s.toFixed(1))), `${s.toFixed(1)} s`).toBe(false);
      }
      expect(t).toBeGreaterThanOrEqual(r.earliest - 1e-9);
      expect(r.before).toBeCloseTo(meanVelocity(velocity, t - 2, t), 12);
    },
  );
});

describe('a trial with no moment, and one that waits', () => {
  it(
    'touches nothing where the worm never crawls forward for 2 s, as a silenced one never does',
    { timeout: 30000 },
    () => {
      const r = runTouchTrial(data, { seed: 1, seconds: 120, params, postures, silenced: true });
      expect(r).toMatchObject({ time: null, before: null, front: null, back: null, frontSham: null, backSham: null });
    },
  );

  it('waits past its earliest until the 2 s before were forward', { timeout: 30000 }, () => {
    // With AVB lesioned, seed 3's worm isn't crawling forward at its earliest time, and waits 4.7 s.
    const lesions = ['AVBL', 'AVBR'];
    const r = runTouchTrial(data, { seed: 3, seconds: 120, params, postures, lesions });
    const t = r.time as number;
    expect(t - r.earliest).toBeGreaterThan(1);
    const { velocity } = runTrial(data, { seed: 3, seconds: 120, params, postures, lesions });
    expect(forwardBefore(velocity, t)).toBe(true);
    for (let s = Math.ceil(r.earliest * 10 - 1e-9) / 10; s < t - 1e-9; s += 0.1) {
      expect(forwardBefore(velocity, Number(s.toFixed(1))), `${s.toFixed(1)} s`).toBe(false);
    }
  });
});

describe('the fork', () => {
  it(
    'touches the front and the back, and gives both one sham twin when both restart the integrator',
    { timeout: 30000 },
    () => {
      const r = runTouchTrial(data, { seed: 1, seconds: 120, params, postures });
      expect(r.front?.reached).toEqual(['ALML', 'ALMR', 'AVM']);
      expect(r.back?.reached).toEqual(['PLML', 'PLMR']);
      expect(r.frontSham?.reached).toEqual([]);
      expect(r.sharedSham).toBe(true);
      expect(r.backSham).toBe(r.frontSham);
      for (const c of [r.front, r.back, r.frontSham]) {
        expect(c?.finite).toBe(true);
        expect(Number.isFinite(c?.after)).toBe(true);
      }
    },
  );

  it('pairs a touch that reaches no receptor with a sham of its own that does nothing', { timeout: 30000 }, () => {
    const lesions = ['PLML', 'PLMR'];
    const r = runTouchTrial(data, { seed: 1, seconds: 120, params, postures, lesions });
    expect(r.back?.reached).toEqual([]);
    expect(r.front?.reached).toEqual(['ALML', 'ALMR', 'AVM']);
    expect(r.sharedSham).toBe(false);
    expect(r.backSham).not.toBe(r.frontSham);
    // With no current and no restart, the back copy and its twin are the worm untouched, bit for bit: the copies' samples
    // line up with the trial's, and they draw its noise.
    const t = r.time as number;
    const { velocity } = runTrial(data, { seed: 1, seconds: 120, params, postures, lesions });
    expect(r.back?.after).toBe(meanVelocity(velocity, t, t + 2));
    expect(r.backSham?.after).toBe(r.back?.after);
    expect(r.before).toBe(meanVelocity(velocity, t - 2, t));
  });

  it('asks the world whether a touch restarts the integrator, which changes nothing', () => {
    const intact = new World(data, params, { seed: 1 });
    const before = intact.snapshot();
    expect([intact.touchRestarts(FRONT), intact.touchRestarts(BACK)]).toEqual([true, true]);
    expect(intact.snapshot()).toEqual(before);
    const cut = new World(data, params, { seed: 1, lesions: ['PLML', 'PLMR'] });
    expect([cut.touchRestarts(FRONT), cut.touchRestarts(BACK)]).toEqual([true, false]);
  });
});

describe("checkpoints 2 and 3's grading", () => {
  const copy = (reversal: boolean, after: number): CopyOutcome => ({
    reached: ['X'],
    finite: true,
    unconverged: 0,
    reversal,
    latency: reversal ? 0.8 : null,
    after,
  });
  // A trial touched at 30 s whose front copy reversed or not, as did its twin, and whose back copy and twin moved at
  // the given speeds.
  const trial = (
    seed: number,
    front: boolean,
    sham: boolean,
    after = 0.07,
    shamAfter = 0.07,
    touched = true,
  ): TouchTrialRecord => ({
    seed,
    posture: 0,
    turn: 0,
    earliest: 25,
    time: touched ? 30 : null,
    finite: true,
    unconverged: 0,
    before: 0.06,
    front: touched ? copy(front, 0.07) : null,
    back: touched ? copy(false, after) : null,
    frontSham: touched ? copy(sham, shamAfter) : null,
    backSham: touched ? copy(sham, shamAfter) : null,
    sharedSham: true,
  });
  const seeds = (n: number, f: (seed: number) => TouchTrialRecord): TouchTrialRecord[] =>
    Array.from({ length: n }, (_, k) => f(k + 1));

  it('passes checkpoint 2 at 70% and three times the twins, partial from 40%, and fails below or unpaired', () => {
    // 40 of 50 reversed, 2 twins: 80%, significant and 20 times the twins'.
    expect(checkpoint2(seeds(50, (s) => trial(s, s <= 40, s <= 2))).grade).toBe('pass');
    // 80%, significant, but the twins reversed after 30%: under three times, so partial.
    const close = checkpoint2(seeds(50, (s) => trial(s, s <= 40, s > 35)));
    expect([close.share, close.shamShare, close.grade]).toEqual([0.8, 0.3, 'partial']);
    expect(checkpoint2(seeds(50, (s) => trial(s, s <= 25, false))).grade).toBe('partial');
    expect(checkpoint2(seeds(50, (s) => trial(s, s <= 15, false))).grade).toBe('fail');
    // As often as the twins: no reflex, whatever the share.
    expect(checkpoint2(seeds(50, (s) => trial(s, s <= 40, s <= 40))).grade).toBe('fail');
    const r = checkpoint2(seeds(50, (s) => trial(s, s <= 40, s <= 2)));
    expect(r.response).toBeCloseTo(0.76, 12);
    expect(r.latency?.mean).toBeCloseTo(0.8, 12);
    expect(r.latency?.median).toBeCloseTo(0.8, 12);
  });

  it('takes the first 50 touches by seed, from up to 100 seeds, and fails both checkpoints with fewer', () => {
    // Every third seed found no moment: the 50th touch comes from seed 74, and later seeds are left.
    const sparse = seeds(100, (s) => trial(s, true, false, 0.07, 0.07, s % 3 !== 0));
    expect(checkpoint2(sparse)).toMatchObject({ touches: 50, seeds: 74, unmeasured: null });
    const few = seeds(100, (s) => trial(s, true, false, 0.07, 0.07, s % 3 === 0));
    expect(checkpoint2(few)).toMatchObject({ touches: 33, grade: 'fail' });
    expect(checkpoint2(few).unmeasured).toMatch(/fewer than 50/);
    expect(checkpoint3(few).grade).toBe('fail');
  });

  it('fails both on a trial, a touched copy or a twin that left the finite numbers, whichever it was', () => {
    const broken = (field: 'front' | 'back' | 'frontSham'): TouchTrialRecord[] => {
      const records = seeds(60, (s) => trial(s, true, false));
      records[3] = { ...records[3], [field]: { ...copy(false, 0.07), finite: false, after: null } };
      return records;
    };
    for (const field of ['front', 'back', 'frontSham'] as const) {
      for (const grade of [checkpoint2, checkpoint3]) {
        const r = grade(broken(field));
        expect(r.grade, `${field}, checkpoint ${grade === checkpoint2 ? 2 : 3}`).toBe('fail');
        expect(r.unmeasured).toMatch(/seed 4's touch left the finite numbers/);
      }
    }
    const gone = seeds(60, (s) => trial(s, true, false));
    gone[0] = { ...gone[0], finite: false };
    expect(checkpoint2(gone).grade).toBe('fail');
    expect(checkpoint3(gone).grade).toBe('fail');
  });

  it("counts every copy's unconverged solves in both, a shared sham once", () => {
    const records = seeds(50, (s) => trial(s, true, false));
    records[0] = {
      ...records[0],
      front: { ...copy(true, 0.07), unconverged: 1 },
      back: { ...copy(false, 0.07), unconverged: 2 },
      frontSham: { ...copy(false, 0.07), unconverged: 4 },
    };
    records[0].backSham = records[0].frontSham;
    expect(checkpoint2(records).unconverged).toBe(7);
    expect(checkpoint3(records).unconverged).toBe(7);
    records[1] = { ...records[1], sharedSham: false, backSham: { ...copy(false, 0.07), unconverged: 8 } };
    expect(checkpoint3(records).unconverged).toBe(15);
  });

  it('takes no seed past 100', () => {
    // Touches only from seed 61, so 40 within the cap and the rest past it.
    const late = seeds(120, (s) => trial(s, true, false, 0.07, 0.07, s > 60));
    expect(checkpoint2(late)).toMatchObject({ touches: 40, seeds: 100, grade: 'fail' });
  });

  it('passes checkpoint 3 at 10% above the twins, partial from 1%, and leaves it unmeasured where the twins stall', () => {
    expect(checkpoint3(seeds(50, (s) => trial(s, false, false, 0.08 + s * 1e-5, 0.07))).grade).toBe('pass');
    const partial = checkpoint3(seeds(50, (s) => trial(s, false, false, 0.0721 + s * 1e-6, 0.07)));
    expect(partial.grade).toBe('partial');
    expect(partial.response).toBeGreaterThan(0.01);
    expect(checkpoint3(seeds(50, (s) => trial(s, false, false, 0.0705, 0.07))).grade).toBe('fail');
    const stalled = checkpoint3(seeds(50, (s) => trial(s, false, false, 0.008, 0.005)));
    expect([stalled.response, stalled.grade]).toEqual([null, 'fail']);
    expect(stalled.unmeasured).toMatch(/isn't forward/);
  });
});

describe("the harness's checkpoints 2 and 3", () => {
  it('takes them, together or apart', () => {
    expect(parseArgs(['--checkpoint', '2', '--checkpoint', '3']).checkpoints).toEqual([2, 3]);
    expect(parseArgs(['--checkpoint', '3']).checkpoints).toEqual([3]);
    expect(() => parseArgs(['--checkpoint', '5'])).toThrow(/runs checkpoints 0, 1, 2, 3 and 4/);
  });
});
