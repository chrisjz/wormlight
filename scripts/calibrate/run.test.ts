import { describe, expect, it } from 'vitest';
import {
  ALL_TARGETS,
  provisionalValues,
  SECOND_ROUND,
  SURVEY,
  surveyStart,
  THIRD_ROUND,
  TRACK_S_ROUND,
  provisionalValues as provisional,
  type Evaluated,
} from '../../src/validation/calibration.ts';
import { TRACK_S } from '../../src/sim/trackS.ts';
import { FREQUENCY_BAND } from '../../src/validation/motion.ts';
import {
  BOUNDED,
  boundedAllowed,
  committedRecord,
  continuedFrom,
  jobParams,
  mayStartAfresh,
  parseArgs,
  PROBE,
  procedure,
  ROUND_3,
  roundThreeAllowed,
  settings,
  SUMMARY,
  summary,
  SURVEYED,
  TRACK_S_RECORD,
  trackSAllowed,
} from './run.ts';

describe("the calibration's options", () => {
  it("default to PLAN §7.3's budget and R's second round, and refuse anything but whole numbers", () => {
    expect(parseArgs([])).toMatchObject({ budget: 2000, resume: false, mode: 'round 2' });
    expect(parseArgs(['--budget', '20', '--jobs', '4', '--resume'])).toEqual({
      budget: 20,
      jobs: 4,
      resume: true,
      mode: 'round 2',
    });
    expect(parseArgs(['--probe'])).toMatchObject({ mode: 'probe', budget: 2000 });
    expect(parseArgs(['--survey', '--resume'])).toMatchObject({ mode: 'survey', resume: true });
    // The bounded calibration may be shortened for a look; the probe and the survey take their own budgets.
    expect(parseArgs(['--bounded', '--budget', '40'])).toMatchObject({ mode: 'bounded', budget: 40 });
    expect(() => parseArgs(['--probe', '--budget', '20'])).toThrow(/--probe/);
    expect(() => parseArgs(['--survey', '--budget', '20'])).toThrow(/--survey/);
    expect(parseArgs(['--round-3', '--resume'])).toMatchObject({ mode: 'round 3', resume: true });
    expect(() => parseArgs(['--round-3', '--budget', '20'])).toThrow(/--round-3 takes its own budget/);
    expect(() => parseArgs(['--round-3', '--survey'])).toThrow(/one mode/);
    expect(parseArgs(['--track-s', '--jobs', '6'])).toMatchObject({ mode: 'track S', jobs: 6 });
    expect(() => parseArgs(['--track-s', '--budget', '20'])).toThrow(/--track-s takes its own budget/);
    expect(() => parseArgs(['--track-s', '--round-3'])).toThrow(/one mode/);
    expect(() => parseArgs(['--probe', '--survey'])).toThrow(/one mode/);
    for (const args of [
      ['--budget'],
      ['--budget', '0'],
      ['--budget', '2.5'],
      ['--seeds', '3'],
      ['--jobs', 'x'],
      ['constructor'],
      ['toString'],
    ]) {
      expect(() => parseArgs(args), args.join(' ')).toThrow(/usage/);
    }
  });

  it("commit a summary without the evaluations, its stages' included", () => {
    expect(summary({ model: 'planned', evaluated: [1, 2], final: { value: 1 } })).toEqual({
      model: 'planned',
      final: { value: 1 },
    });
    const run = { stages: { crawl: { evaluated: [1], final: { value: 2 } }, noise: { evaluated: [3], checked: [] } } };
    expect(summary(run)).toEqual({ stages: { crawl: { final: { value: 2 } }, noise: { checked: [] } } });
  });
});

describe("each mode's procedure (PLAN §7.3, §9)", () => {
  it("searches the survey as round 2's stage 1 in the conductance form, and the bounded model by the refit's procedure", () => {
    expect(procedure('survey')).toEqual({
      form: 'conductance',
      targets: SECOND_ROUND.crawl.targets,
      spectral: true,
      restarts: SECOND_ROUND.restart,
    });
    // The refit's: all four targets, without the spectral frequency or restarts.
    expect(procedure('bounded')).toEqual({ form: 'conductance', targets: ALL_TARGETS, spectral: false });
    expect(procedure('probe')).toEqual({ ...procedure('round 2'), form: 'current' });
    // Round 3's: the crawl alone against its own targets, without the spectral frequency, restarting only in phase 1.
    expect(procedure('round 3')).toEqual({
      form: 'conductance',
      targets: ['frequency', 'wavelength', 'speed'],
      goals: THIRD_ROUND.goals,
      spectral: false,
      restarts: { sigma: 0.01, stall: 20, until: 250 },
    });
  });

  it('runs the bounded calibration only once a whole survey has found no partial pick', () => {
    expect(boundedAllowed({ complete: true, partial: false })).toBe(true);
    expect(boundedAllowed({ complete: true, partial: true })).toBe(false);
    expect(boundedAllowed({ complete: false, partial: false })).toBe(false);
    expect(boundedAllowed(null)).toBe(false);
  });

  it('runs round 3 once, only after a whole survey found a partial pick', () => {
    expect(roundThreeAllowed({ complete: true, partial: true }, false)).toBe(true);
    expect(roundThreeAllowed({ complete: true, partial: true }, true)).toBe(false);
    expect(roundThreeAllowed({ complete: true, partial: false }, false)).toBe(false);
    expect(roundThreeAllowed({ complete: false, partial: true }, false)).toBe(false);
    expect(roundThreeAllowed(null, false)).toBe(false);
  });

  it("searches track S's model by round 3's procedure, once (DECISIONS.md, 2026-10-01)", () => {
    expect(procedure('track S')).toEqual({ ...procedure('round 3'), model: 'track S' });
    expect(TRACK_S_ROUND).toEqual({ ...THIRD_ROUND, model: 'track S' });
    expect(trackSAllowed(false)).toBe(true);
    expect(trackSAllowed(true)).toBe(false);
  });

  it("switches track S's parts on in every trial of its jobs, and none in track R's", () => {
    const values = provisional('conductance');
    const r = jobParams({ values, form: 'conductance', seed: 1 });
    const s = jobParams({ values, form: 'conductance', seed: 1, model: 'track S' });
    expect(s).toEqual({ ...r, ...TRACK_S });
    expect(r).not.toHaveProperty('measuredSigns');
    expect(r).not.toHaveProperty('rectified');
    expect(TRACK_S).toEqual({ measuredSigns: true, restOffsets: 'measured', rectified: true });
  });

  it('never starts afresh over a stopped run, which only --resume takes up', () => {
    expect(mayStartAfresh(null)).toBe(true);
    expect(mayStartAfresh({ complete: true })).toBe(true);
    expect(mayStartAfresh({ complete: false })).toBe(false);
    expect(mayStartAfresh({})).toBe(false);
  });

  it("replays phase 1's record in phase 2 until phase 2's own is longer", () => {
    const evaluations = (n: number) => Array.from({ length: n }, (_, k) => ({ candidate: k }) as unknown as Evaluated);
    const first = evaluations(250);
    // A stop in the generation that crosses the 250th evaluation leaves phase 2's own record at 242.
    expect(continuedFrom(evaluations(242), first)).toBe(first);
    expect(continuedFrom(undefined, first)).toBe(first);
    const own = evaluations(253);
    expect(continuedFrom(own, first)).toBe(own);
    expect(continuedFrom(own, undefined)).toBe(own);
  });
});

describe("the calibration's record", () => {
  it("names R's second round, starts from the provisional values, and is committed as r3.json", () => {
    const s = settings(20);
    expect(s.model).toBe('track R, round 2');
    expect(s.budget).toEqual({ crawl: 20, noise: 200 });
    // The probe records its own budget, stage 1 alone.
    expect(settings(2000, 'probe').budget).toEqual({ crawl: 400 });
    expect(s.start).toEqual(provisionalValues('current'));
    expect(SUMMARY.endsWith('data/calibration/r3.json')).toBe(true);
    expect(PROBE.endsWith('data/calibration/r3-probe.json')).toBe(true);
  });

  it("names the survey's form, its starts and bounds, and is committed as survey.json", () => {
    const s = settings(2000, 'survey');
    expect(s).toMatchObject({ model: 'track R, the bounded survey', form: 'conductance', survey: SURVEY });
    expect(s.starts).toEqual(SURVEY.seeds.map((_, j) => surveyStart(j, 0)));
    expect((s.bounds as Record<string, unknown>).headSwitchGain).toEqual([0.02, 50]);
    expect(SURVEYED.endsWith('data/calibration/survey.json')).toBe(true);
  });

  it("names round 3's form, its settings, the survey's starts and its own targets, and is committed as r5.json", () => {
    const s = settings(2000, 'round 3');
    expect(s).toMatchObject({
      model: 'track R, round 3',
      form: 'conductance',
      thirdRound: THIRD_ROUND,
      survey: SURVEY,
    });
    expect(s.starts).toEqual(SURVEY.seeds.map((_, j) => surveyStart(j, 0)));
    expect((s.targets as Record<string, number>).speed).toBe(0.15);
    expect((s.bounds as Record<string, unknown>).proprioceptiveGain).toEqual([0.0001, 8]);
    expect(ROUND_3.endsWith('data/calibration/r5.json')).toBe(true);
  });

  it("names track S's model, its parts, the band it scores on and its own bound on g_p, and is committed as s1.json", () => {
    const s = settings(2000, 'track S');
    expect(s).toMatchObject({
      model: 'track S',
      parts: TRACK_S,
      frequencyBand: FREQUENCY_BAND,
      form: 'conductance',
      round: TRACK_S_ROUND,
      survey: SURVEY,
    });
    expect(s.starts).toEqual(SURVEY.seeds.map((_, j) => surveyStart(j, 0)));
    expect((s.targets as Record<string, number>).speed).toBe(0.15);
    // S's own bound on g_p, and every other the conductance form's (DECISIONS.md, 2026-10-02).
    const b = s.bounds as Record<string, unknown>;
    expect(b.proprioceptiveGain).toEqual([0.0001, 7]);
    expect(b.headSwitchGain).toEqual([0.02, 50]);
    expect({ ...b, proprioceptiveGain: null }).toEqual({
      ...(settings(2000, 'round 3').bounds as Record<string, unknown>),
      proprioceptiveGain: null,
    });
    expect(TRACK_S_RECORD.endsWith('data/calibration/s1.json')).toBe(true);
  });

  it("names the bounded calibration's form and start, the conductance form's, and is committed as r4.json", () => {
    const s = settings(2000, 'bounded');
    expect(s).toMatchObject({ model: 'track R, bounded', form: 'conductance', budget: 2000 });
    expect(s.start).toEqual(provisionalValues('conductance'));
    expect(BOUNDED.endsWith('data/calibration/r4.json')).toBe(true);
  });
});

describe("the calibration's committed records (DECISIONS.md, 2026-10-01)", () => {
  // Every committed record exists, so each mode that would replace one names it and refuses.
  const all = (): boolean => true;
  it("names the record that round 2's full run, the probe and the survey would replace", () => {
    expect(committedRecord('round 2', true, all)).toBe(SUMMARY);
    expect(committedRecord('probe', true, all)).toBe(PROBE);
    expect(committedRecord('survey', true, all)).toBe(SURVEYED);
  });
  it('lets a shortened round 2, which writes no committed record, run', () => {
    expect(committedRecord('round 2', false, all)).toBeNull();
  });
  it('leaves round 3 and the bounded calibration to their own rules, and lets a run with no record go ahead', () => {
    expect(committedRecord('round 3', true, all)).toBeNull();
    expect(committedRecord('bounded', true, all)).toBeNull();
    expect(committedRecord('probe', true, () => false)).toBeNull();
  });
});
