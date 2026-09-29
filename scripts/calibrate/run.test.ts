import { describe, expect, it } from 'vitest';
import { provisionalValues } from '../../src/validation/calibration.ts';
import { PROBE, SUMMARY, parseArgs, settings, summary } from './run.ts';

describe("the calibration's options", () => {
  it("default to PLAN §7.3's budget, and refuse anything but whole numbers", () => {
    expect(parseArgs([])).toMatchObject({ budget: 2000, resume: false, probe: false });
    expect(parseArgs(['--budget', '20', '--jobs', '4', '--resume'])).toEqual({
      budget: 20,
      jobs: 4,
      resume: true,
      probe: false,
    });
    expect(parseArgs(['--probe'])).toMatchObject({ probe: true, budget: 2000 });
    // The probe takes its own budget, and can resume.
    expect(parseArgs(['--probe', '--resume'])).toMatchObject({ probe: true, resume: true });
    expect(() => parseArgs(['--probe', '--budget', '20'])).toThrow(/--probe/);
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
    expect(settings(2000, true).budget).toEqual({ crawl: 400 });
    expect(s.start).toEqual(provisionalValues('current'));
    expect(SUMMARY.endsWith('data/calibration/r3.json')).toBe(true);
    expect(PROBE.endsWith('data/calibration/r3-probe.json')).toBe(true);
  });
});
