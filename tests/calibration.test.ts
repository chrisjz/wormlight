// The calibrated values against the committed records of the fits that set them (PLAN §7.3, §9): the planned
// model's, track R's first fit, and R's refit with the coloured noise; the records of R's second round, the survey
// and R's third round, none of whose fits was chosen (DECISIONS.md, 2026-09-29); and track S's calibration, whose
// first pick passed §7.2's comparison and is S's fit (DECISIONS.md, 2026-10-02).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARAMS, type Param } from '../src/science/params.ts';
import { PLANNED } from '../src/science/planned.ts';
import { CALIBRATED, currentParams, isCalibrated, loopParams, type RValues } from '../src/sim/world.ts';
import { EQUIVALENCE } from '../src/validation/equivalence.ts';
import {
  CALIBRATION,
  ERROR_CAP,
  MAPPING,
  SECOND_ROUND,
  SURVEY,
  TARGETS,
  THIRD_ROUND,
  TRACK_S_ROUND,
  provisionalValues,
  ranked,
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

describe("R's third round's record (PLAN §7.3, §9)", () => {
  interface Pick {
    seed: number;
    value: number;
    values: { [id: string]: number };
  }
  const round = readJson<{
    model: string;
    form: string;
    commit: string;
    complete: boolean;
    phase1: { seed: number; final: { value: number; from: string } }[];
    ranking: { seed: number; value: number; from: string }[];
    continued: number[];
    picks: Pick[];
    stages: { [stage: string]: { generations: { evaluations: number; restart: number }[]; final: object } };
  }>('data/calibration/r5.json');

  it('ran as its rules set, from a clean commit, its picks the continued searches in their order', () => {
    expect(round).toMatchObject({ model: 'track R, round 3', form: 'conductance', complete: true });
    expect(round.commit).not.toMatch(/uncommitted/);
    const recorded = round as unknown as { [key: string]: unknown };
    for (const [key, value] of Object.entries(settings(CALIBRATION.budget, 'round 3'))) {
      expect(recorded[key], key).toEqual(JSON.parse(JSON.stringify(value)));
    }
    // Phase 1 ranked its sixteen by their final checks, and phase 2 continued the best four to 750 each.
    const order = ranked(round.phase1.map((p) => ({ seed: p.seed, value: p.final.value })));
    expect(round.ranking.map((r) => r.seed)).toEqual(order.map((r) => r.seed));
    expect(round.continued).toEqual(order.slice(0, THIRD_ROUND.phase2.continued).map((r) => r.seed));
    for (const seed of THIRD_ROUND.seeds) {
      expect(round.stages[`phase 1 ${seed}`].generations.at(-1)?.evaluations).toBe(THIRD_ROUND.phase1.budget);
    }
    for (const seed of round.continued) {
      expect(round.stages[`phase 2 ${seed}`].generations.at(-1)?.evaluations).toBe(THIRD_ROUND.phase2.budget);
    }
    expect([...round.picks.map((p) => p.seed)].sort()).toEqual([...round.continued].sort());
    expect(round.picks.map((p) => p.seed)).toEqual(ranked(round.picks).map((p) => p.seed));
    // Each pick is its continued search's own final pick, each phase 1 pick its search's, and the ranking theirs.
    for (const pick of round.picks)
      expect(pick).toEqual({ seed: pick.seed, ...round.stages[`phase 2 ${pick.seed}`].final });
    for (const p of round.phase1) expect(p.final).toEqual(round.stages[`phase 1 ${p.seed}`].final);
    const finals = new Map(round.phase1.map((p) => [p.seed, p.final]));
    for (const r of round.ranking) {
      expect({ seed: r.seed, value: r.value, from: r.from }).toEqual({
        seed: r.seed,
        value: finals.get(r.seed)?.value,
        from: finals.get(r.seed)?.from,
      });
    }
  });

  it("chose no fit: each pick failed §7.2's comparison in turn, at its recorded values, so the refit stays", () => {
    const sources = new Set<string>();
    round.picks.forEach((pick, k) => {
      const run = readJson<{
        pick: number;
        values: unknown;
        trials: number;
        commit: string;
        source: string;
        comparison: { pass: boolean };
      }>(`data/equivalence/round-3-pick-${k + 1}.json`);
      expect(run.pick).toBe(k + 1);
      expect(run.values).toEqual(pick.values);
      expect(run.trials).toBe(EQUIVALENCE.trials);
      expect(run.commit).not.toMatch(/uncommitted/);
      expect(run.comparison.pass).toBe(false);
      sources.add(run.source);
    });
    // Every pick ran at the same sources.
    expect(sources.size).toBe(1);
    expect(existsSync(join(ROOT, 'data/calibration/r5-chosen.json'))).toBe(false);
    // The app and the harness run the refit, in the current form.
    const refit = readJson<Record>('data/calibration/r2.json').final.values;
    expect(currentParams()).toEqual(loopParams(refit as unknown as RValues, 'current'));
  });
});

describe("track S's calibration (PLAN §7.3, §9; DECISIONS.md, 2026-10-01)", () => {
  interface Pick {
    seed: number;
    value: number;
    from: string;
    values: { [id: string]: number };
  }
  const round = readJson<{
    model: string;
    form: string;
    commit: string;
    complete: boolean;
    phase1: { seed: number; final: { value: number; from: string } }[];
    ranking: { seed: number; value: number; from: string }[];
    continued: number[];
    picks: Pick[];
    stages: { [stage: string]: { generations: { evaluations: number }[]; final: object } };
  }>('data/calibration/s1.json');

  it('ran as its rules set, from a clean commit, its picks the continued searches in their order', () => {
    expect(round).toMatchObject({ model: 'track S', form: 'conductance', complete: true });
    expect(round.commit).not.toMatch(/uncommitted/);
    const recorded = round as unknown as { [key: string]: unknown };
    for (const [key, value] of Object.entries(settings(CALIBRATION.budget, 'track S'))) {
      expect(recorded[key], key).toEqual(JSON.parse(JSON.stringify(value)));
    }
    const order = ranked(round.phase1.map((p) => ({ seed: p.seed, value: p.final.value })));
    expect(round.ranking.map((r) => r.seed)).toEqual(order.map((r) => r.seed));
    expect(round.continued).toEqual(order.slice(0, TRACK_S_ROUND.phase2.continued).map((r) => r.seed));
    for (const seed of TRACK_S_ROUND.seeds) {
      expect(round.stages[`phase 1 ${seed}`].generations.at(-1)?.evaluations).toBe(TRACK_S_ROUND.phase1.budget);
    }
    for (const seed of round.continued) {
      expect(round.stages[`phase 2 ${seed}`].generations.at(-1)?.evaluations).toBe(TRACK_S_ROUND.phase2.budget);
    }
    expect(round.picks.map((p) => p.seed)).toEqual(ranked(round.picks).map((p) => p.seed));
    for (const pick of round.picks)
      expect(pick).toEqual({ seed: pick.seed, ...round.stages[`phase 2 ${pick.seed}`].final });
    for (const p of round.phase1) expect(p.final).toEqual(round.stages[`phase 1 ${p.seed}`].final);
  });

  it("chose its first pick, which passed §7.2's comparison at its recorded values, so no later pick ran", () => {
    const run = readJson<{
      fit: string;
      pick: number;
      values: unknown;
      trials: number;
      commit: string;
      frequencyBand: number;
      comparison: { pass: boolean };
    }>('data/equivalence/track-s-pick-1.json');
    expect(run).toMatchObject({ fit: 'track-s', pick: 1, trials: EQUIVALENCE.trials, frequencyBand: 0.31 });
    expect(run.values).toEqual(round.picks[0].values);
    expect(run.commit).not.toMatch(/uncommitted/);
    expect(run.comparison.pass).toBe(true);
    for (const k of [2, 3, 4]) expect(existsSync(join(ROOT, `data/equivalence/track-s-pick-${k}.json`))).toBe(false);
    // The chosen record: pick 1, from its search, at its values and the comparison's commit.
    const chosen = readJson<{
      fit: string;
      pick: number;
      seed: number;
      from: string;
      values: unknown;
      commit: string;
      frequencyBand: number;
      checkpoint1: { grade: string };
    }>('data/calibration/s1-chosen.json');
    expect(chosen).toMatchObject({ fit: 'track-s', pick: 1, frequencyBand: 0.31 });
    expect({ seed: chosen.seed, from: chosen.from }).toEqual({ seed: round.picks[0].seed, from: round.picks[0].from });
    expect(chosen.values).toEqual(round.picks[0].values);
    expect(chosen.commit).toBe(run.commit);
    expect(chosen.checkpoint1.grade).toBe('partial');
  });
});
