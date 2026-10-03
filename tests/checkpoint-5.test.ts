// Checkpoint 5, lesions (PLAN §7.4; DECISIONS.md, 2026-10-02): reversals long and short by their head swings, each
// row's effect and test, the zero rule, RIM's rise from zero, the touch rows, and the checkpoint's grade.

import { describe, expect, it } from 'vitest';
import { checkpoint5Section, type RunInfo } from '../scripts/harness/report.ts';
import { parseArgs } from '../scripts/harness/run.ts';
import { validateWormlightData } from '../src/data/schema.ts';
import { currentParams } from '../src/sim/world.ts';
import {
  checkpoint5,
  INTACT,
  lesionNeurons,
  PRIMARY,
  SECONDARY,
  spontaneous,
  swingsWithin,
} from '../src/validation/lesions.ts';
import type { CopyOutcome, TouchTrialRecord } from '../src/validation/touch.ts';
import { runTrial, type TrialRecord } from '../src/validation/trial.ts';
import { readJson } from './checks.ts';

const deg = Math.PI / 180;
// A trial's measured 110 s, 1,100 samples: forward at `speed`, with reversals of the given lengths (samples) every
// 200 samples, and a head swinging ±20° every 4 s, a swing's peak every 20 samples.
const trial = (seed: number, speed: number, reversalLengths: number[] = []): TrialRecord => {
  const velocity = Array.from({ length: 1100 }, () => speed);
  reversalLengths.forEach((n, k) => {
    for (let i = 0; i < n; i++) velocity[100 + 200 * k + i] = -0.05;
  });
  const headAngle = velocity.map((_, i) => 20 * deg * Math.sin((2 * Math.PI * (i + 0.5)) / 40));
  const zeros = velocity.map(() => 0);
  return {
    seed,
    finite: true,
    velocity,
    headAngle,
    mid: zeros,
    front: zeros,
    rear: zeros,
    unconverged: 0,
  } as unknown as TrialRecord;
};
const arm = (f: (seed: number) => TrialRecord): TrialRecord[] => Array.from({ length: 30 }, (_, k) => f(k + 1));

describe('reversals, long and short', () => {
  it('count the head swings whose peaks lie within a reversal', () => {
    const angle = Array.from({ length: 400 }, (_, i) => 20 * deg * Math.sin((2 * Math.PI * (i + 0.5)) / 40));
    // Peaks at 10, 30, 50, …: a reversal over samples 100 to 169 holds those at 110, 130 and 150.
    expect(swingsWithin(angle, { start: 100, length: 70 })).toBe(3);
    expect(swingsWithin(angle, { start: 100, length: 15 })).toBe(1);
    expect(swingsWithin(angle, { start: 112, length: 15 })).toBe(0);
  });

  it('class a reversal with three swings or more as long, every other as short, a minute over the measured time', () => {
    const t = spontaneous(trial(1, 0.07, [70, 15, 15]));
    expect(t.minutes).toBeCloseTo(110 / 60, 12);
    expect(t.reversals).toBeCloseTo(3 / (110 / 60), 12);
    expect(t.long).toBeCloseTo(1 / (110 / 60), 12);
    expect(t.short).toBeCloseTo(2 / (110 / 60), 12);
  });
});

// The touch trials: 50 touches, the front copy reversing on the first `followed` seeds and the twin on the first
// `shams`, the back copy at `after` against its twin's `shamAfter`, varied a little by seed.
const touches = (followed: number, shams: number, after: number, shamAfter: number): TouchTrialRecord[] =>
  Array.from({ length: 50 }, (_, k) => {
    const seed = k + 1;
    const copy = (reversal: boolean, v: number): CopyOutcome => ({
      reached: ['X'],
      finite: true,
      unconverged: 0,
      reversal,
      latency: null,
      after: v,
    });
    return {
      seed,
      posture: 0,
      turn: 0,
      earliest: 25,
      time: 30,
      finite: true,
      unconverged: 0,
      before: 0.06,
      front: copy(seed <= followed, 0.07),
      back: copy(false, after + seed * 1e-5),
      frontSham: copy(seed <= shams, shamAfter),
      backSham: copy(seed <= shams, shamAfter),
      sharedSham: true,
    };
  });

describe("the rows' effect and test", () => {
  // An intact worm reversing twice a trial, long and short, and lesioned arms as each row asks.
  const intact = arm((s) => trial(s, 0.07, [70, 15]));
  const passing = {
    [INTACT]: intact,
    'ava-avd': arm((s) => trial(s, 0.07)),
    'avb-pvc': arm((s) => trial(s, 0.005)),
    pvc: arm((s) => trial(s, 0.07, [70, 15])),
    ava: arm((s) => trial(s, 0.07, s % 3 === 0 ? [15] : [])),
    rim: arm((s) => trial(s, 0.07, [70, 15, 15, 15])),
    aib: intact,
    aiy: intact,
    aiz: intact,
  };
  const touched = {
    [INTACT]: touches(40, 2, 0.08, 0.07),
    'ava-avd': touches(2, 2, 0.08, 0.07),
    pvc: touches(40, 2, 0.0701, 0.07),
  };

  it('pass every row where each lesion moves its measure the way, by the amount, and significantly', () => {
    const r = checkpoint5(passing, touched);
    expect(r.rows.map((row) => [row.id, row.pass])).toEqual([
      ['ava-avd', true],
      ['avb-pvc', true],
      ['pvc', true],
      ['ava', true],
      ['rim', true],
    ]);
    expect(r.grade).toBe('pass');
    expect(r.secondary.map((l) => l.id)).toEqual(['aib', 'aiy', 'aiz']);
  });

  it('leave a fall unmeasured, and failing, where the intact worm has none to fall from; but count a rise from zero', () => {
    const still = arm((s) => trial(s, 0.07));
    const r = checkpoint5({ ...passing, [INTACT]: still }, touched);
    const ava = r.rows.find((row) => row.id === 'ava');
    expect(ava?.pass).toBe(false);
    expect(ava?.clauses.every((c) => c.unmeasured === 'the intact measure is zero')).toBe(true);
    // RIM's lesion makes short reversals from none: a rise, measured and significant.
    expect(r.rows.find((row) => row.id === 'rim')?.pass).toBe(true);
  });

  it('fail a fall short of its amount, or one that goes the other way', () => {
    const r = checkpoint5(
      { ...passing, 'avb-pvc': arm((s) => trial(s, 0.03)), ava: arm((s) => trial(s, 0.07, [70, 70, 15])) },
      touched,
    );
    const [avb, ava] = ['avb-pvc', 'ava'].map((id) => r.rows.find((row) => row.id === id));
    // 0.03 against 0.07 is a fall of 57%, under 80%, though significant.
    expect(avb?.clauses[0]).toMatchObject({ pass: false, direction: true });
    expect(avb?.clauses[0].p).toBeLessThan(0.05);
    // More long reversals, not fewer: significant the other way.
    expect(ava?.clauses[0]).toMatchObject({ pass: false, direction: false });
    expect(r.grade).toBe('partial');
  });

  it('read the touch rows from checkpoints 2 and 3, and leave them unmeasured with too few touches or no intact reflex', () => {
    const r = checkpoint5(passing, touched);
    const pvc = r.rows.find((row) => row.id === 'pvc');
    expect(pvc?.clauses.map((c) => c.pass)).toEqual([true, true]);
    // The intact response, (0.08 + …) / 0.07 − 1, about 14%, falls to about 0.2%.
    expect(pvc?.clauses[0].intact).toBeGreaterThan(0.14);
    expect(pvc?.clauses[0].lesioned).toBeLessThan(0.01);
    // An intact worm with no touch-evoked reversals leaves AVA + AVD's touch clause and PVC's "stays" unmeasured.
    const flat = checkpoint5(passing, { ...touched, [INTACT]: touches(0, 0, 0.08, 0.07) });
    const avaAvd = flat.rows.find((row) => row.id === 'ava-avd');
    expect(avaAvd?.clauses[0].unmeasured).toBe('the intact response is zero');
    expect(flat.rows.find((row) => row.id === 'pvc')?.clauses[1].unmeasured).toBe('the intact response is zero');
    // An intact speed-up under checkpoint 3's floor, here a slowing, leaves PVC's fall unmeasured, with a true minus.
    const slow = checkpoint5(passing, { ...touched, [INTACT]: touches(40, 2, 0.069, 0.07) });
    expect(slow.rows.find((row) => row.id === 'pvc')?.clauses[0].unmeasured).toBe(
      "the intact response, −1.1%, is under checkpoint 3's 1% floor",
    );
    // And with fewer than 50 touches.
    const few = checkpoint5(passing, { ...touched, pvc: touches(40, 2, 0.0701, 0.07).slice(0, 30) });
    expect(few.rows.find((row) => row.id === 'pvc')?.clauses[0].unmeasured).toMatch(/fewer than 50/);
  });

  it("mark as fitted the clauses that read reversals, PVC's on checkpoint 2 alone in its row", () => {
    const r = checkpoint5(passing, touched);
    expect(r.rows.map((row) => [row.id, row.readsReversals, row.clauses.map((c) => c.readsReversals)])).toEqual([
      ['ava-avd', true, [true, true]],
      ['avb-pvc', false, [false]],
      ['pvc', false, [false, true]],
      ['ava', true, [true, true]],
      ['rim', true, [true]],
    ]);
  });

  it('fail a touch clause that moves the other way, and give no direction to a tie', () => {
    // Intact, 10 of 50 touches reversing in the touched copy alone; lesioned, 40: significant, the wrong way.
    const more = checkpoint5(passing, {
      ...touched,
      [INTACT]: touches(12, 2, 0.08, 0.07),
      'ava-avd': touches(42, 2, 0.08, 0.07),
    });
    expect(more.rows.find((row) => row.id === 'ava-avd')?.clauses[0]).toMatchObject({ pass: false, direction: false });
    expect(more.rows.find((row) => row.id === 'ava-avd')?.clauses[0].p).toBeLessThan(0.05);
    const same = checkpoint5(passing, { ...touched, 'ava-avd': touched[INTACT] });
    const tie = same.rows.find((row) => row.id === 'ava-avd')?.clauses[0];
    expect(tie?.direction).toBeNull();
    expect(tie?.p).toBeCloseTo(1, 12);
    // PVC's lesion making the posterior touch's speed-up larger, not smaller.
    const faster = checkpoint5(passing, { ...touched, pvc: touches(40, 2, 0.1, 0.07) });
    expect(faster.rows.find((row) => row.id === 'pvc')?.clauses[0]).toMatchObject({ pass: false, direction: false });
  });

  it("report every lesion's measures, and check the reported arms as the graded ones", () => {
    const r = checkpoint5(passing, touched);
    expect(r.primaryMeasures.map((l) => l.id)).toEqual(['ava-avd', 'avb-pvc', 'pvc', 'ava', 'rim']);
    const avb = r.primaryMeasures.find((l) => l.id === 'avb-pvc');
    // The same pooled measures the row grades.
    const speed = avb?.measures.find((m) => m.name.startsWith('Mean velocity'));
    const row = r.rows.find((x) => x.id === 'avb-pvc')?.clauses[0];
    expect([speed?.intact, speed?.lesioned]).toEqual([row?.intact, row?.lesioned]);
    expect(speed?.lesioned).toBeCloseTo(0.005, 12);
    const broken = arm((s) => trial(s, 0.07));
    broken[2] = { ...broken[2], finite: false };
    const aiy = checkpoint5({ ...passing, aiy: broken }, touched).secondary.find((l) => l.id === 'aiy');
    expect(aiy?.unmeasured).toBe("seed 3's trial left the finite numbers");
    expect(aiy?.measures.every((m) => m.p === null)).toBe(true);
    expect(() => checkpoint5({ ...passing, aiz: passing.aiz.slice(1) }, touched)).toThrow(/seed by seed/);
  });

  it("report checkpoint 1's speed beside AVB + PVC's row, its bouts' samples pooled as checkpoint 1 pools them", () => {
    // Odd seeds forward at 0.05 throughout, a bout of 110 s; even seeds at 0.02 for 15 s, then paused.
    const mixed = arm((s) => {
      const t = trial(s, 0.05);
      return s % 2 ? t : { ...t, velocity: t.velocity.map((_, i) => (i < 150 ? 0.02 : 0)) };
    });
    const r = checkpoint5({ ...passing, 'avb-pvc': mixed }, touched);
    expect(r.boutSpeed.lesioned).toBeCloseTo((15 * 1100 * 0.05 + 15 * 150 * 0.02) / (15 * 1250), 12);
    expect(r.boutSpeed).toMatchObject({ intactTrials: 30, lesionedTrials: 30 });
    const still = checkpoint5({ ...passing, 'avb-pvc': arm((s) => trial(s, 0.005)) }, touched);
    expect(still.boutSpeed).toMatchObject({ lesioned: null, lesionedTrials: 0 });
  });

  it("fail a row whose arm left the finite numbers, and refuse arms that don't pair by seed", () => {
    const broken = arm((s) => trial(s, 0.005));
    broken[4] = { ...broken[4], finite: false };
    const r = checkpoint5({ ...passing, 'avb-pvc': broken }, touched);
    expect(r.rows.find((row) => row.id === 'avb-pvc')?.clauses[0].unmeasured).toBe(
      "seed 5's trial left the finite numbers",
    );
    expect(() => checkpoint5({ ...passing, rim: passing.rim.slice(1) }, touched)).toThrow(/seed by seed/);
  });
});

describe("checkpoint 5's section", () => {
  const info: RunInfo = {
    date: '2026-10-02',
    commit: 'abc1234',
    calibrated: true,
    model: 'track S',
    trials: 30,
    seconds: 120,
  };
  const passing = {
    [INTACT]: arm((s) => trial(s, 0.07, [70, 15])),
    'ava-avd': arm((s) => trial(s, 0.07)),
    'avb-pvc': arm((s) => trial(s, 0.005)),
    pvc: arm((s) => trial(s, 0.07, [70, 15])),
    ava: arm((s) => trial(s, 0.07, s % 3 === 0 ? [15] : [])),
    rim: arm((s) => trial(s, 0.07, [70, 15, 15, 15])),
    aib: arm((s) => trial(s, 0.07, [70, 15])),
    aiy: arm((s) => trial(s, 0.07, [70, 15])),
    aiz: arm((s) => trial(s, 0.07, [70, 15])),
  };
  const touched = {
    [INTACT]: touches(40, 2, 0.08, 0.07),
    'ava-avd': touches(2, 2, 0.08, 0.07),
    pvc: touches(40, 2, 0.0701, 0.07),
  };

  it('grades the rows, marks the clauses that read reversals as fitted, and reports every lesion', () => {
    const section = checkpoint5Section(checkpoint5(passing, touched), info);
    expect(section).toContain('### Checkpoint 5: lesions — **Pass**, reported as fitted');
    expect(section).toContain(
      "Every spontaneous trial stayed finite; no brain solve failed to converge in them or in the touch runs' graded touches.",
    );
    expect(section).toContain('5 of the five primary rows pass');
    expect(section).toMatch(/\| AVA \(fitted\) +\| Long reversals a minute /);
    expect(section).toMatch(/\| PVC +\| The posterior touch's speed-up \(checkpoint 3's response\) +\|/);
    expect(section).toContain("| Touch-evoked reversals (checkpoint 2's response) stay (fitted) |");
    expect(section).toMatch(/\| AVB \+ PVC +\| Forward speed/);
    expect(section).toContain(
      'in body lengths per second: 0.0700 intact, over the 30 trials with a bout, and unmeasured lesioned, with no bout.',
    );
    expect(section).toContain("Every primary lesion's spontaneous measures, reported beside the rows");
    expect(section).toMatch(/\| AIZ +\| Spontaneous reversals a minute/);
    const planned = checkpoint5Section(checkpoint5(passing, touched), { ...info, model: 'track R' });
    expect(planned).not.toContain('fitted');
  });
});

describe('the lesions', () => {
  it('cut both of each pair, five graded and three reported, and nothing for the intact worm', () => {
    expect(PRIMARY.map((l) => [l.label, l.neurons])).toEqual([
      ['AVA + AVD', ['AVAL', 'AVAR', 'AVDL', 'AVDR']],
      ['AVB + PVC', ['AVBL', 'AVBR', 'PVCL', 'PVCR']],
      ['PVC', ['PVCL', 'PVCR']],
      ['AVA', ['AVAL', 'AVAR']],
      ['RIM', ['RIML', 'RIMR']],
    ]);
    expect(SECONDARY.map((l) => l.label)).toEqual(['AIB', 'AIY', 'AIZ']);
    expect(lesionNeurons(INTACT)).toBeUndefined();
    expect(() => lesionNeurons('ala')).toThrow(/no lesion ala/);
  });

  it('record head angles in a trial only when asked, changing nothing else', { timeout: 30000 }, () => {
    const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
    const options = { seed: 3, seconds: 15, params: currentParams(), postures: [Array.from({ length: 100 }, () => 0)] };
    const plain = runTrial(data, options);
    const { headAngle, ...rest } = runTrial(data, { ...options, headAngles: true });
    expect(plain.headAngle).toBeUndefined();
    expect(rest).toEqual(plain);
    expect(headAngle?.length).toBe(plain.velocity.length);
  });
});

describe("the harness's checkpoint 5", () => {
  it('takes it, and no checkpoint beyond 6', () => {
    expect(parseArgs(['--checkpoint', '5']).checkpoints).toEqual([5]);
    expect(() => parseArgs(['--checkpoint', '7'])).toThrow(/runs checkpoints 0, 1, 2, 3, 4, 5 and 6/);
  });
});
