import { describe, expect, it } from 'vitest';
import { provisionalValues, SURVEY, surveyStart } from '../../src/validation/calibration.ts';
import { BOUNDED, parseArgs, PROBE, settings, SUMMARY, summary, SURVEYED } from './run.ts';

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
    expect(() => parseArgs(['--probe', '--survey'])).toThrow(/one mode/);
    for (const args of [['--budget'], ['--budget', '0'], ['--budget', '2.5'], ['--seeds', '3'], ['--jobs', 'x']]) {
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

  it("names the bounded calibration's form and start, the conductance form's, and is committed as r4.json", () => {
    const s = settings(2000, 'bounded');
    expect(s).toMatchObject({ model: 'track R, bounded', form: 'conductance', budget: 2000 });
    expect(s.start).toEqual(provisionalValues('conductance'));
    expect(BOUNDED.endsWith('data/calibration/r4.json')).toBe(true);
  });
});
