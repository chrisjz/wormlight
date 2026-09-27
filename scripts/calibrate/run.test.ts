import { describe, expect, it } from 'vitest';
import { parseArgs, summary } from './run.ts';

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
