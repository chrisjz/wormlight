// Checkpoint 6's tuning (DECISIONS.md, 2026-10-03): a null's brain, its box by the rules that set S's, the search in
// that box, the runner's null mode, a candidate whose trial can't be run, and the resume guard.

import { describe, expect, it } from 'vitest';
import {
  checkRan,
  parseArgs,
  procedure,
  ranKey,
  resumeRefused,
  scoreTrials,
  settings,
} from '../scripts/calibrate/run.ts';
import { validateWormlightData } from '../src/data/schema.ts';
import { partsOf } from '../src/sim/trackS.ts';
import { currentParams } from '../src/sim/world.ts';
import {
  boxOf,
  calibrate,
  fromUnit,
  surveyStart,
  toUnit,
  TRACK_S_ROUND,
  type Box,
  type Scorer,
} from '../src/validation/calibration.ts';
import { runTrial } from '../src/validation/trial.ts';
import { nullNetwork, NULLS, outward, ruleBox, ruleReading } from '../src/validation/wiringTest.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));

describe("a null's box, by the rules that set S's", () => {
  it("gives S's box on the real wiring, every bound of it", () => {
    const reading = ruleReading(data, 'track S');
    expect(reading).not.toBeNull();
    expect(reading?.unsolved).toEqual([]);
    expect(ruleBox(reading as NonNullable<typeof reading>, 'track S')).toEqual(boxOf('conductance', 'track S'));
  });

  // The ten boxes as the rules give them on the runtime data: a data build that changes the connections' list changes
  // every rewiring, and these with it.
  it("gives each rewiring its own, the rules' bounds rounded outward and every other bound the form's", () => {
    const boxes = NULLS.map((k) => {
      const reading = ruleReading(data, 'track S', nullNetwork(data, k));
      if (!reading) throw new Error(`rewiring ${k} has no solvable rest`);
      const b = ruleBox(reading, 'track S');
      return [k, b.headSwitchGain, b.proprioceptiveGain, b.oscillatorDriveThreshold[0]];
    });
    expect(boxes).toEqual([
      [1, [0.01, 50], [0.0001, 6], -26],
      [2, [0.02, 50], [0.0002, 7], -25],
      [3, [0.01, 50], [0.0002, 7], -25],
      [4, [0.01, 40], [0.0002, 7], -24],
      [5, [0.01, 40], [0.0002, 6], -25],
      [6, [0.01, 50], [0.0002, 8], -25],
      [7, [0.01, 60], [0.0001, 7], -27],
      [8, [0.01, 40], [0.0001, 9], -22],
      [9, [0.01, 40], [0.0002, 7], -26],
      [10, [0.02, 50], [0.0001, 8], -25],
    ]);
    const s = boxOf('conductance', 'track S');
    const b = ruleBox(
      ruleReading(data, 'track S', nullNetwork(data, 1)) as NonNullable<ReturnType<typeof ruleReading>>,
      'track S',
    );
    for (const id of Object.keys(s) as (keyof Box)[]) {
      if (id === 'headSwitchGain' || id === 'proprioceptiveGain') continue;
      expect(b[id][1], id).toBe(s[id][1]);
      if (id !== 'oscillatorDriveThreshold') expect(b[id][0], id).toBe(s[id][0]);
    }
  }, 60000);

  it('rounds outward to one significant figure', () => {
    expect(outward([0.0217, 47.5])).toEqual([0.02, 50]);
    expect(outward([0.000143, 6.35])).toEqual([0.0001, 7]);
    expect(outward([0.0184, 52.8])).toEqual([0.01, 60]);
  });
});

describe('a search in a box of its own', () => {
  const s = boxOf('conductance', 'track S');
  const own: Box = { ...s, headSwitchGain: [0.01, 60] };

  it('maps the unit box onto it, so a start lies at the same point of each box', () => {
    const start = surveyStart(0, 0);
    const a = fromUnit(start, 'conductance', undefined, undefined, 'track S');
    const b = fromUnit(start, 'conductance', undefined, undefined, 'track S', own);
    expect(b.headSwitchGain).not.toBe(a.headSwitchGain);
    expect(b.headSwitchGain).toBeGreaterThanOrEqual(0.01);
    expect(b.headSwitchGain).toBeLessThanOrEqual(60);
    expect(b.oscillatorExcitability).toBe(a.oscillatorExcitability);
    const back = toUnit(b, 'conductance', undefined, 'track S', own);
    back.forEach((u, i) => expect(u).toBeCloseTo(start[i], 12));
  });

  it("searches within it, and gives what the model's bounds give without one", async () => {
    const seen: number[] = [];
    const score: Scorer = (values) => {
      seen.push(values.headSwitchGain);
      const measures = { finite: true, bouts: 0, frequency: null, wavelength: null, speed: 0, reversalRate: 0 };
      return Promise.resolve({
        measures,
        value: (Math.log(values.headSwitchGain) - Math.log(55)) ** 2,
        errors: { frequency: 0, wavelength: 0, speed: 0, reversalRate: 0 },
        unconverged: 0,
      });
    };
    const options = { form: 'conductance' as const, model: 'track S' as const, budget: 60, start: surveyStart(0, 0) };
    await calibrate(score, { ...options, box: own });
    expect(Math.max(...seen)).toBeGreaterThan(50);
    expect(Math.max(...seen)).toBeLessThanOrEqual(60);
    const [a, b] = [await calibrate(score, options), await calibrate(score, { ...options, box: s })];
    expect(b.final).toEqual(a.final);
  });
});

describe("the runner's null mode", () => {
  it('takes a rewiring from 1 to 10, and no budget of its own', () => {
    expect(parseArgs(['--null', '3'])).toMatchObject({ mode: 'null', rewiring: 3 });
    expect(() => parseArgs(['--null', '0'])).toThrow(/1 to 10/);
    expect(() => parseArgs(['--null', '11'])).toThrow(/1 to 10/);
    expect(() => parseArgs(['--null', '1', '--budget', '10'])).toThrow(/own budget/);
    expect(() => parseArgs(['--null', '1', '--track-s'])).toThrow(/one mode/);
  });

  it("is track S's procedure, on S's model and round", () => {
    expect(procedure('null')).toEqual(procedure('track S'));
    const { model, round } = settings(0, 'null') as { model: string; round: unknown };
    expect(model).toMatch(/primary null/);
    expect(round).toEqual(TRACK_S_ROUND);
  });

  it('runs a trial on the rewired brain, and holds each to the rewiring it asked for', { timeout: 30000 }, () => {
    const params = currentParams();
    const options = { seed: 4001, seconds: 12, params, postures: [Array.from({ length: 100 }, () => 0)] };
    const real = runTrial(data, options);
    const rewired = runTrial(data, { ...options, network: nullNetwork(data, 1) });
    expect(rewired.finite).toBe(true);
    expect(rewired.velocity).not.toEqual(real.velocity);
    const asked = ranKey(partsOf('track S'), 1);
    expect(asked).toBe('measured, rectified; rewiring 1');
    expect(() => checkRan([{ ran: asked }], 'track S', 1)).not.toThrow();
    expect(() => checkRan([{ ran: ranKey(partsOf('track S')) }], 'track S', 1)).toThrow(/rewiring 1/);
  });

  it("ranks a candidate whose trial couldn't be run last, with why, and scores one whose trials ran", () => {
    const how = {
      targets: TRACK_S_ROUND.targets,
      spectral: false,
      goals: TRACK_S_ROUND.goals,
      model: 'track S' as const,
      rewiring: 2,
    };
    const failed = scoreTrials([{ failed: 'a worker exited (SIGKILL) on seed 1001' }], how);
    expect(failed.value).toBe(Infinity);
    expect(failed.failed).toMatch(/SIGKILL/);
    const still = {
      finite: true,
      velocity: new Float64Array(1100),
      mid: new Float64Array(1100),
      front: new Float64Array(1100),
      rear: new Float64Array(1100),
      unconverged: 0,
      ran: ranKey(partsOf('track S'), 2),
    };
    const ran = scoreTrials([still], how);
    expect(Number.isFinite(ran.value)).toBe(true);
    expect(ran.failed).toBeUndefined();
  });

  it('resumes only at the same commit and, for a null, the same Node', () => {
    const here = { commit: 'abc1234', node: 'v26.7.0' };
    expect(resumeRefused({ commit: 'abc1234', node: 'v26.7.0' }, here, 'null')).toBeNull();
    expect(resumeRefused({ commit: 'def5678', node: 'v26.7.0' }, here, 'null')).toMatch(/def5678/);
    expect(resumeRefused({ commit: 'abc1234', node: 'v24.1.0' }, here, 'null')).toMatch(/Node v24.1.0/);
    // Track S's own guard is the commit's alone, as it was.
    expect(resumeRefused({ commit: 'abc1234', node: 'v24.1.0' }, here, 'track S')).toBeNull();
  });
});
