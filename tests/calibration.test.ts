// The calibrated values against the committed records of the fits that set them (PLAN §7.3, §9): the planned
// model's, and track R's once its fit has run.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARAMS, type Param } from '../src/science/params.ts';
import { PLANNED } from '../src/science/planned.ts';
import { CALIBRATED, isCalibrated } from '../src/sim/world.ts';
import { CALIBRATION, ERROR_CAP, MAPPING, TARGETS, provisionalValues } from '../src/validation/calibration.ts';
import { ROOT } from '../scripts/data/sources.ts';
import { readJson } from './checks.ts';

interface Record {
  model: string;
  commit: string;
  complete: boolean;
  budget: number;
  calibration: unknown;
  start: { [id: string]: number };
  mapping: unknown;
  targets: unknown;
  errorCap: number;
  bounds: { [id: string]: [number, number] };
  checked: { value: number; from: string }[];
  final: { values: { [id: string]: number }; value: number; from: string };
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

  it('was a whole run from a clean commit, under the settings the code has now', () => {
    if (!isCalibrated()) return;
    const fit = readJson<Record>('data/calibration/r1.json');
    expect(fit.complete).toBe(true);
    expect(fit.budget).toBe(CALIBRATION.budget);
    expect(fit.commit).not.toMatch(/uncommitted/);
    // So the committed code can run it again: the same procedure, start, search space and objective.
    expect(fit.calibration).toEqual(JSON.parse(JSON.stringify(CALIBRATION)));
    expect(fit.start).toEqual(provisionalValues());
    expect(fit.mapping).toEqual(MAPPING);
    expect(fit.targets).toEqual(TARGETS);
    expect(fit.errorCap).toBe(ERROR_CAP);
    // Its final pick is the lowest on the fresh seeds.
    expect(fit.final.value).toBe(Math.min(...fit.checked.map((c) => c.value)));
  });
});
