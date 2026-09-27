import { describe, expect, it } from 'vitest';
import { provisionalValues } from '../../src/validation/calibration.ts';
import { SUMMARY, parseArgs, settings, summary } from './run.ts';

describe("the calibration's options", () => {
  it("default to PLAN §7.3's budget, and refuse anything but whole numbers", () => {
    expect(parseArgs([])).toMatchObject({ budget: 2000, resume: false });
    expect(parseArgs(['--budget', '20', '--jobs', '4', '--resume'])).toEqual({ budget: 20, jobs: 4, resume: true });
    for (const args of [['--budget'], ['--budget', '0'], ['--budget', '2.5'], ['--seeds', '3'], ['--jobs', 'x']]) {
      expect(() => parseArgs(args), args.join(' ')).toThrow(/usage/);
    }
  });

  it('commit a summary without the evaluations', () => {
    expect(summary({ model: 'planned', evaluated: [1, 2], final: { value: 1 } })).toEqual({
      model: 'planned',
      final: { value: 1 },
    });
  });
});

describe("the calibration's record", () => {
  it("names track R's round 1, starts from the provisional values, and is committed as r1.json", () => {
    const s = settings(20);
    expect(s.model).toBe('track R, round 1');
    expect(s.start).toEqual(provisionalValues());
    expect(SUMMARY.endsWith('data/calibration/r1.json')).toBe(true);
  });
});
