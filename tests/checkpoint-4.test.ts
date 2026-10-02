// Checkpoint 4, chemotaxis (PLAN §7.4; DECISIONS.md, 2026-10-02): the control with AWC-ON's input off, the grading,
// and the mechanism's measures, klinokinesis and weathervaning, with their intervals.

import { describe, expect, it } from 'vitest';
import { parseArgs } from '../scripts/harness/run.ts';
import { validateWormlightData } from '../src/data/schema.ts';
import { steadyField } from '../src/sim/env/dish.ts';
import { currentParams } from '../src/sim/world.ts';
import { checkpoint4, runChemotaxis, type ChemotaxisRecord } from '../src/validation/chemotaxis.ts';
import {
  klinokinesis,
  mechanism,
  swings,
  turningRatio,
  weathervaning,
  type MechanismRecord,
} from '../src/validation/mechanism.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const params = currentParams();
const postures = [Array.from({ length: 100 }, () => 0)];

describe('head swings (PLAN §7.1)', () => {
  const deg = Math.PI / 180;
  it('accepts crossings at least 0.5 s apart with a peak above 10° between them', () => {
    // A head bending ±20° every 4 s, sampled every 0.1 s: a crossing every 2 s.
    const angle = Array.from({ length: 200 }, (_, k) => 20 * deg * Math.sin((2 * Math.PI * (k + 0.5)) / 40));
    expect(swings(angle, 0)).toEqual([20, 40, 60, 80, 100, 120, 140, 160, 180]);
  });

  it('skips a shallow wiggle, and a crossing too soon after the last', () => {
    const shallow = Array.from({ length: 200 }, (_, k) => 5 * deg * Math.sin((2 * Math.PI * (k + 0.5)) / 40));
    expect(swings(shallow, 0)).toEqual([]);
    // A deep bend whose crossing at 2.0 s is followed by a flicker back 0.2 s later, then a deep bend the other way.
    const flicker = Array.from({ length: 100 }, (_, k) =>
      k < 20 ? 20 * deg : k < 22 ? -1 * deg : k < 24 ? 1 * deg : -20 * deg,
    );
    const accepted = swings(flicker, 0);
    expect(accepted[0]).toBe(20);
    expect(accepted).not.toContain(22);
  });
});

// A worm's mechanism record, made up.
const worm = (over: Partial<MechanismRecord> = {}): MechanismRecord => ({
  reorientations: { down: 4, up: 2 },
  atRisk: { down: 6000, up: 6000 },
  reversals: 6,
  omegas: 0,
  turning: { down: 1, up: 1, downs: 10, ups: 10 },
  transitions: { bearing: [], curving: [], stride: [], clean: [] },
  ...over,
});

describe('klinokinesis', () => {
  it('is the ratio of reorientation rates down the gradient to up it, undefined with none up', () => {
    expect(klinokinesis([worm()])).toBeCloseTo(2, 12);
    expect(klinokinesis([worm(), worm({ reorientations: { down: 0, up: 2 } })])).toBeCloseTo(1, 12);
    expect(klinokinesis([worm({ reorientations: { down: 3, up: 0 } })])).toBeNull();
    expect(klinokinesis([worm({ atRisk: { down: 0, up: 100 } })])).toBeNull();
    expect(turningRatio([worm({ turning: { down: 3, up: 1, downs: 10, ups: 10 } })])).toBeCloseTo(3, 12);
  });
});

describe('weathervaning', () => {
  // Transitions curving at half their bearing, every stride 1 mm but the short ones given.
  const transitions = (n: number, short = 0, dirty = 0): MechanismRecord['transitions'] => {
    const bearing = Array.from({ length: n }, (_, k) => -Math.PI + (2 * Math.PI * (k + 0.5)) / n);
    return {
      bearing,
      curving: bearing.map((b, k) => (k < short ? 5 : 0.5 * b)),
      stride: bearing.map((_, k) => (k < short ? 0.1 : 1)),
      clean: bearing.map((_, k) => k >= n - dirty),
    };
  };
  it('is the least-squares slope of the curving rate on the bearing, short strides left out', () => {
    const clean = transitions(100).clean.map(() => true);
    const w = worm({ transitions: { ...transitions(100, 10), clean } });
    expect(weathervaning([w], { clean: true, floor: true })).toBeCloseTo(0.5, 10);
    // With no floor the short strides' outliers pull it away.
    expect(Math.abs((weathervaning([w], { clean: true, floor: false }) ?? 0) - 0.5)).toBeGreaterThan(0.05);
  });

  it('takes the clean transitions alone unless asked for every one, and is undefined with fewer than two', () => {
    const w = worm({ transitions: transitions(100, 0, 1) });
    expect(weathervaning([w], { clean: true, floor: true })).toBeNull();
    expect(weathervaning([w], { clean: false, floor: true })).toBeCloseTo(0.5, 10);
  });
});

describe("the mechanism's grade", () => {
  it('reproduces a mechanism whose interval clears its null and that differs from the control above zero', () => {
    const intact = Array.from({ length: 40 }, (_, k) => worm({ reorientations: { down: 6 + (k % 3), up: 2 } }));
    const control = Array.from({ length: 40 }, (_, k) =>
      worm({ reorientations: { down: 2 + (k % 2), up: 2 + (k % 3) } }),
    );
    const r = mechanism(intact, control, klinokinesis, 1, 40);
    expect([r.clears, r.differs, r.grade]).toEqual([true, true, 'reproduced']);
    // A difference on the wrong side, the control the stronger, doesn't count (the maintainer's choice).
    const wrong = mechanism(control, intact, klinokinesis, 1, 40);
    expect(wrong.differs).toBe(false);
  });

  it('is absent when the statistic is undefined over every worm', () => {
    const none = Array.from({ length: 10 }, () => worm({ reorientations: { down: 0, up: 0 } }));
    expect(mechanism(none, none, klinokinesis, 1, 40).grade).toBe('absent');
  });
});

describe("checkpoint 4's grade", () => {
  const run = (seed: number, reached: 'odour' | 'control' | null, control = false): ChemotaxisRecord => ({
    seed,
    posture: 0,
    turn: 0,
    awcSide: 'AWCL',
    finite: true,
    reached,
    time: reached ? 600 : null,
    seconds: reached ? 600 : 3600,
    closest: { odour: 0.01, control: 0.01 },
    start: [0, 0],
    end: [0, 0],
    farthest: 0.01,
    unconverged: 0,
    ...(control ? { control: true } : {}),
    mechanism: worm(),
  });
  const arm = (odour: number, other: number, control = false): ChemotaxisRecord[] =>
    Array.from({ length: 100 }, (_, k) =>
      run(k + 1, k < odour ? 'odour' : k < odour + other ? 'control' : null, control),
    );

  it('passes at an index of 0.6 with more intact worms at the odour, partial from 0.2, fails below or level', () => {
    const fewer = (r: ReturnType<typeof checkpoint4>) => [r.intact.index, r.grade];
    expect(fewer(checkpoint4(arm(70, 5), arm(10, 10, true), 40))).toEqual([0.65, 'pass']);
    expect(fewer(checkpoint4(arm(40, 10), arm(10, 10, true), 40))).toEqual([0.3, 'partial']);
    expect(fewer(checkpoint4(arm(15, 5), arm(10, 10, true), 40))).toEqual([0.1, 'fail']);
    // A high index that the control matches isn't chemotaxis.
    expect(checkpoint4(arm(70, 5), arm(68, 5, true), 40).grade).toBe('fail');
  });

  it('pairs the arms seed by seed, and fails a run that left the finite numbers', () => {
    expect(() => checkpoint4(arm(70, 5), arm(10, 10, true).slice(1), 40)).toThrow(/pair seed by seed/);
    const broken = arm(70, 5);
    broken[5] = { ...broken[5], finite: false };
    expect(checkpoint4(broken, arm(10, 10, true), 40)).toMatchObject({
      grade: 'fail',
      unmeasured: "seed 6's run left the finite numbers",
    });
  });
});

describe('the assay runs', () => {
  const field = steadyField('assay');
  it(
    "take the mechanism's samples without changing the run, and the control senses nothing",
    { timeout: 60000 },
    () => {
      const plain = runChemotaxis(data, { seed: 2, seconds: 60, params, postures, odour: field });
      const sampled = runChemotaxis(data, { seed: 2, seconds: 60, params, postures, odour: field, mechanism: true });
      const { mechanism: m, ...rest } = sampled;
      expect(rest).toEqual(plain);
      // Blocks of 3.3 s from 10 s: 15 whole ones in the 50 s after, so 14 transitions.
      expect(m?.transitions.bearing.length).toBe(14);
      const control = runChemotaxis(data, { seed: 2, seconds: 60, params, postures, odour: field, control: true });
      expect(control.control).toBe(true);
      // With no odour AWC-ON's input is zero, and the run departs from the intact worm's within the minute: the odour's
      // current does reach the body, and the control takes it away.
      expect(control.end).not.toEqual(plain.end);
      expect(control.mechanism).toBeUndefined();
    },
  );
});

describe("the harness's checkpoint 4", () => {
  it('takes it', () => {
    expect(parseArgs(['--checkpoint', '4']).checkpoints).toEqual([4]);
  });
});
