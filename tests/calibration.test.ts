// The calibrated values against the committed records of the fits that set them (PLAN §7.3, §9): the planned
// model's, and track R's once its fit has run.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARAMS, type Param } from '../src/science/params.ts';
import { PLANNED } from '../src/science/planned.ts';
import { CALIBRATED, isCalibrated } from '../src/sim/world.ts';
import { ROOT } from '../scripts/data/sources.ts';
import { readJson } from './checks.ts';

interface Record {
  model: string;
  bounds: { [id: string]: [number, number] };
  final: { values: { [id: string]: number } };
}

describe("the planned model's calibrated values", () => {
  it("are its fit's final ones, unrounded", () => {
    const fit = readJson<Record>('data/calibration/planned.json');
    expect(fit.model).toBe('planned');
    expect(PLANNED.calibrated).toEqual(fit.final.values);
  });
});

describe("track R's calibrated values", () => {
  it("are its fit's final ones, unrounded, within the same bounds, once the fit has run", () => {
    const committed = existsSync(join(ROOT, 'data/calibration/r1.json'));
    expect(isCalibrated()).toBe(committed);
    if (!committed) return;
    const fit = readJson<Record>('data/calibration/r1.json');
    expect(fit.model).toBe('track R, round 1');
    expect(Object.keys(fit.final.values).sort()).toEqual([...CALIBRATED].sort());
    for (const id of CALIBRATED) {
      const p: Param = PARAMS[id];
      expect(p.value, id).toBe(fit.final.values[id]);
      expect(p.bounds, id).toEqual(fit.bounds[id]);
    }
  });
});
