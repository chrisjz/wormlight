// The calibrated values against the committed records of the fits that set them (PLAN §7.3, §9): the planned
// model's, track R's first fit, and R's refit with the coloured noise; and R's second round's record, whose fit
// wasn't chosen (DECISIONS.md, 2026-09-29).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARAMS, type Param } from '../src/science/params.ts';
import { PLANNED } from '../src/science/planned.ts';
import { CALIBRATED, isCalibrated } from '../src/sim/world.ts';
import {
  CALIBRATION,
  ERROR_CAP,
  MAPPING,
  SECOND_ROUND,
  TARGETS,
  provisionalValues,
} from '../src/validation/calibration.ts';
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

describe("track R's first fit, with white noise", () => {
  it('is kept as its record: a whole run from a clean commit, on the eleven parameters it had', () => {
    const fit = readJson<Record>('data/calibration/r1.json');
    expect(fit.model).toBe('track R, round 1');
    expect(fit.complete).toBe(true);
    expect(fit.commit).not.toMatch(/uncommitted/);
    expect(Object.keys(fit.final.values)).toHaveLength(11);
    expect(fit.final.values).not.toHaveProperty('noiseCorrelation');
  });
});

describe("track R's calibrated values", () => {
  it("are its refit's final ones, unrounded, within the same bounds, once the refit has run", () => {
    const committed = existsSync(join(ROOT, 'data/calibration/r2.json'));
    expect(isCalibrated()).toBe(committed);
    if (!committed) return;
    const fit = readJson<Record>('data/calibration/r2.json');
    expect(fit.model).toBe('track R, round 1, refit with coloured noise');
    expect(Object.keys(fit.final.values).sort()).toEqual([...CALIBRATED].sort());
    for (const id of CALIBRATED) {
      const p: Param = PARAMS[id];
      expect(p.value, id).toBe(fit.final.values[id]);
      expect(p.bounds, id).toEqual(fit.bounds[id]);
    }
  });

  it('was a whole run from a clean commit, under the settings the code has now', () => {
    if (!isCalibrated()) return;
    const fit = readJson<Record>('data/calibration/r2.json');
    expect(fit.complete).toBe(true);
    expect(fit.budget).toBe(CALIBRATION.budget);
    expect(fit.commit).not.toMatch(/uncommitted/);
    // So the committed code keeps its procedure: the same settings, start, search space and objective, with round 1's
    // scoring measure()'s default. The runner for the nulls, which get this procedure, comes with checkpoint 6.
    expect(fit.calibration).toEqual(JSON.parse(JSON.stringify(CALIBRATION)));
    expect(fit.start).toEqual(provisionalValues());
    expect(fit.mapping).toEqual(MAPPING);
    expect(fit.targets).toEqual(TARGETS);
    expect(fit.errorCap).toBe(ERROR_CAP);
    // Its final pick is the lowest on the fresh seeds.
    expect(fit.final.value).toBe(Math.min(...fit.checked.map((c) => c.value)));
  });
});

describe("R's second round's record", () => {
  interface Stage {
    generations: { restart: number; evaluations: number }[];
    checked: { value: number; from: string }[];
    final: { values: { [id: string]: number }; value: number; from: string };
  }
  const round = readJson<
    Omit<Record, 'budget' | 'checked'> & {
      budget: { crawl: number; noise: number };
      secondRound: unknown;
      stages: { crawl: Stage; noise: Stage };
    }
  >('data/calibration/r3.json');

  it('was a whole run of both stages from a clean commit, under the settings the code has now', () => {
    expect(round.model).toBe('track R, round 2');
    expect(round.complete).toBe(true);
    expect(round.commit).not.toMatch(/uncommitted/);
    expect(round.budget).toEqual({ crawl: SECOND_ROUND.crawl.budget, noise: SECOND_ROUND.noise.budget });
    expect(round.calibration).toEqual(JSON.parse(JSON.stringify(CALIBRATION)));
    expect(round.secondRound).toEqual(JSON.parse(JSON.stringify(SECOND_ROUND)));
    expect(round.start).toEqual(provisionalValues());
    const { crawl, noise } = round.stages;
    expect(crawl.generations[crawl.generations.length - 1].evaluations).toBe(SECOND_ROUND.crawl.budget);
    expect(noise.generations[noise.generations.length - 1].evaluations).toBe(SECOND_ROUND.noise.budget);
    // Each stage's pick is the lowest on the fresh seeds; stage 2 held stage 1's other ten values.
    for (const stage of [crawl, noise]) expect(stage.final.value).toBe(Math.min(...stage.checked.map((c) => c.value)));
    expect(noise.checked.map((c) => c.from)).toContain("stage 1's final values");
    for (const id of CALIBRATED) {
      if (!SECOND_ROUND.noise.ids.includes(id)) expect(noise.final.values[id], id).toBe(crawl.final.values[id]);
    }
    expect(round.final).toEqual(noise.final);
  });

  it("isn't the registry's: the refit stays chosen", () => {
    expect(CALIBRATED.some((id) => PARAMS[id].value !== round.final.values[id])).toBe(true);
  });

  it('let the full run go ahead on one partial probe pick, graded on seeds of its own', () => {
    const probe = readJson<{
      commit: string;
      complete: boolean;
      runs: { seed: number; grade: string }[];
      goAhead: boolean;
    }>('data/calibration/r3-probe.json');
    expect(probe.complete).toBe(true);
    expect(probe.commit).not.toMatch(/uncommitted/);
    expect(probe.runs.map((r) => r.seed)).toEqual([...SECOND_ROUND.probe.seeds]);
    expect(probe.goAhead).toBe(probe.runs.some((r) => r.grade !== 'fail'));
    expect(probe.goAhead).toBe(true);
  });
});
