// The calibrated values against the committed record of the fit that set them (PLAN §7.3).

import { describe, expect, it } from 'vitest';
import { PARAMS, type Param } from '../src/science/params.ts';
import { CALIBRATED } from '../src/sim/world.ts';
import { readJson } from './checks.ts';

describe('the calibrated values', () => {
  it("are the committed fit's final ones, unrounded, within the same bounds", () => {
    const fit = readJson<{ bounds: Record<string, [number, number]>; final: { values: Record<string, number> } }>(
      'data/calibration/planned.json',
    );
    expect(Object.keys(fit.final.values).sort()).toEqual([...CALIBRATED].sort());
    for (const id of CALIBRATED) {
      const p: Param = PARAMS[id];
      expect(p.value, id).toBe(fit.final.values[id]);
      expect(p.bounds, id).toEqual(fit.bounds[id]);
    }
  });
});
