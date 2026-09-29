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
  SURVEY,
  TARGETS,
  THIRD_ROUND,
  provisionalValues,
  surveyStart,
} from '../src/validation/calibration.ts';
import { CALIBRATION_TARGETS } from '../src/science/validation.ts';
import { settings } from '../scripts/calibrate/run.ts';
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
    expect(fit.start).toEqual(provisionalValues('current'));
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
    expect(round.start).toEqual(provisionalValues('current'));
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

describe("the bounded model's survey (PLAN §9)", () => {
  it('ran as its rules set, from a clean commit, and its verdict follows from its grades', () => {
    const survey = readJson<{
      model: string;
      form: string;
      commit: string;
      complete: boolean;
      starts: number[][];
      survey: unknown;
      runs: { seed: number; search: number; start: number[]; grade: string; clauses: { grade: string }[] }[];
      partial: boolean;
    }>('data/calibration/survey.json');
    expect(survey).toMatchObject({ model: 'track R, the bounded survey', form: 'conductance', complete: true });
    expect(survey.commit).not.toMatch(/uncommitted/);
    expect(survey.survey).toEqual(JSON.parse(JSON.stringify(SURVEY)));
    // Each search started from its point of the Latin hypercube, in order.
    expect(survey.starts).toEqual(SURVEY.seeds.map((_, j) => surveyStart(j, 0)));
    expect(survey.runs.map((r) => r.seed)).toEqual([...SURVEY.seeds]);
    survey.runs.forEach((r, j) => {
      expect(r.search).toBe(j);
      expect(r.start).toEqual(surveyStart(r.search, 0));
      // Each grade follows from its clauses: pass if every clause passes, partial if each is at least partial.
      const grades = r.clauses.map((c) => c.grade);
      const expected = grades.every((g) => g === 'pass') ? 'pass' : grades.includes('fail') ? 'fail' : 'partial';
      expect(r.grade, `search ${j}`).toBe(expected);
    });
    // The record's settings are the survey's as the code holds them.
    const recorded = survey as unknown as { [key: string]: unknown };
    for (const [key, value] of Object.entries(settings(CALIBRATION.budget, 'survey'))) {
      expect(recorded[key], key).toEqual(JSON.parse(JSON.stringify(value)));
    }
    expect(survey.partial).toBe(survey.runs.some((r) => r.grade !== 'fail'));
    // Two picks graded partial, so R's third round runs (DECISIONS.md, 2026-09-29).
    expect(survey.runs.filter((r) => r.grade === 'partial').map((r) => r.seed)).toEqual([18, 26]);
  });
});

describe("the calibration's targets in the registry (PLAN §7.3)", () => {
  it('give the values the calibration takes, each with its source', () => {
    const uses = CALIBRATION_TARGETS.map((t) => t.use);
    const [kinematics, speed, third, reversals] = uses;
    expect(kinematics).toMatch(
      new RegExp(`^${TARGETS.frequency.toFixed(2)} Hz and ${TARGETS.wavelength} body lengths`),
    );
    expect(speed).toMatch(new RegExp(`^${TARGETS.speed} body lengths per second`));
    expect(third).toMatch(new RegExp(`^${THIRD_ROUND.goals.speed} body lengths per second`));
    expect(reversals).toMatch(new RegExp(`^${TARGETS.reversalRate} a minute`));
    // Round 3's speed is the other targets' wave speed times Karbowski et al.'s ratio, to two figures.
    expect(0.79 * TARGETS.frequency * TARGETS.wavelength).toBeCloseTo(THIRD_ROUND.goals.speed, 2);
  });
});
