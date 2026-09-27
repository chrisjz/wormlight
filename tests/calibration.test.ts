// The planned model's calibrated values against the committed record of the fit that set them (PLAN §7.3, §9).

import { describe, expect, it } from 'vitest';
import { PLANNED } from '../src/science/planned.ts';
import { readJson } from './checks.ts';

describe("the planned model's calibrated values", () => {
  it("are its fit's final ones, unrounded", () => {
    const fit = readJson<{ model: string; final: { values: Record<string, number> } }>('data/calibration/planned.json');
    expect(fit.model).toBe('planned');
    expect(PLANNED.calibrated).toEqual(fit.final.values);
  });
});
