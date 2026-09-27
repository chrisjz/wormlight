import { describe, expect, it } from 'vitest';
import { parseArgs } from './run.ts';

describe("the calibration's options", () => {
  it("default to PLAN §7.3's budget, and refuse anything but whole numbers", () => {
    expect(parseArgs([]).budget).toBe(2000);
    expect(parseArgs(['--budget', '20', '--jobs', '4'])).toEqual({ budget: 20, jobs: 4 });
    for (const args of [['--budget'], ['--budget', '0'], ['--budget', '2.5'], ['--seeds', '3'], ['--jobs', 'x']]) {
      expect(() => parseArgs(args), args.join(' ')).toThrow(/usage/);
    }
  });
});
