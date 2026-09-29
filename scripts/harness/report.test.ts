import { describe, expect, it } from 'vitest';
import type { ChemotaxisRecord } from '../../src/validation/chemotaxis.ts';
import { checkpoint0, checkpoint1, touchSchedule } from '../../src/validation/checkpoints.ts';
import { emptySums } from '../../src/validation/posture.ts';
import { PARAMS, type Param } from '../../src/science/params.ts';
import { CALIBRATED } from '../../src/sim/world.ts';
import type { TrialRecord } from '../../src/validation/trial.ts';
import { formatNumber } from '../docs/page.ts';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../data/sources.ts';
import { checkedValues, parseArgs as equivalenceArgs, valuesOf } from './equivalence.ts';
import { diagnosticsText } from './report.ts';
import {
  checkpoint0Section,
  checkpoint1Section,
  equivalenceSection,
  parameterText,
  replaceSection,
  scientific,
  shares,
  type EquivalenceRun,
} from './report.ts';
import { parseArgs } from './run.ts';

const info = { date: '2026-09-26', commit: 'abc1234', calibrated: false, trials: 1, seconds: 70 };

// The registry with its calibrated values unset, as before a fit, and one standing in for a fit's: each provisional
// value nudged off its three figures, so the report must round it.
const uncalibrated = { ...PARAMS, ...Object.fromEntries(CALIBRATED.map((id) => [id, { ...PARAMS[id], value: null }])) };
const fitted: Record<string, Param> = {
  ...PARAMS,
  ...Object.fromEntries(
    CALIBRATED.map((id) => [id, { ...PARAMS[id], value: (PARAMS[id].provisional as number) * (1 + 1e-4) + 1e-9 }]),
  ),
};
// A calibrated value as the report shows it, to three significant figures.
const shown = (id: (typeof CALIBRATED)[number]): string =>
  formatNumber(Number((fitted[id].value as number).toPrecision(3)));
// A trial that backs up for 2 s of its 60 measured, then lies still.
const velocity = [...Array<number>(20).fill(-0.05), ...Array<number>(580).fill(0)];
const zeros = velocity.map(() => 0);
const record: TrialRecord = {
  seed: 1,
  seconds: 70,
  posture: 41,
  turn: 1,
  finite: true,
  velocity,
  mid: zeros,
  front: zeros,
  rear: zeros,
  postures: emptySums(),
  selfIntersecting: 0,
  unconverged: 0,
  touches: [],
  switchFlips: [],
  ava: zeros,
};
// The same trial touched as the protocol says, at 20, 40 and 60 s, and still throughout.
const touched: TrialRecord = {
  ...record,
  velocity: Array<number>(600).fill(0),
  touches: touchSchedule(1, 70).map(({ time, s }) => ({
    time,
    s,
    reached: s < 0.5 ? ['ALML', 'ALMR', 'AVM'] : ['PLML', 'PLMR'],
  })),
};
const worm: ChemotaxisRecord = {
  seed: 1,
  posture: 6,
  turn: 0,
  awcSide: 'AWCR',
  finite: true,
  reached: null,
  time: null,
  seconds: 3600,
  closest: { odour: 0.04462, control: 0.04471 },
  start: [0, 0],
  end: [0, 0],
  farthest: 1.5e-5,
  unconverged: 0,
};

describe('the harness report', () => {
  it('replaces only the text between a checkpoint’s markers', () => {
    const page = [
      'Prose.',
      '<!-- harness:checkpoint-0 -->',
      'old 0',
      '<!-- /harness:checkpoint-0 -->',
      '<!-- harness:checkpoint-1 -->',
      'old 1',
      '<!-- /harness:checkpoint-1 -->',
    ].join('\n');
    const next = replaceSection(page, 1, 'new 1');
    expect(next).toContain('old 0');
    expect(next).not.toContain('old 1');
    expect(next).toContain('<!-- harness:checkpoint-1 -->\n\nnew 1\n\n<!-- /harness:checkpoint-1 -->');
    expect(() => replaceSection('Prose.', 0, 'x')).toThrow(/no markers/);
    const comparison = '<!-- harness:equivalence -->\nold\n<!-- /harness:equivalence -->';
    expect(replaceSection(comparison, 'equivalence', 'new')).toContain('new');
    expect(() => replaceSection('Prose.', 'equivalence', 'x')).toThrow(/the equivalence section/);
  });

  it('names the parameters it ran on: the calibrated, to three significant figures, or the provisional', () => {
    // Track R's model's provisional values, where its fit started (PLAN §9).
    expect(parameterText(false)).toContain('the provisional parameters, not calibrated (PLAN §6.2)');
    expect(parameterText(false)).toContain('g_osc = 2140 pS');
    expect(parameterText(false)).toContain('g_osc,B = 2140 pS');
    expect(parameterText(false)).toContain('κ_gap,B = 1, g_nmj = 22 per unit of relative drive');
    expect(parameterText(false)).toContain('σ_n = 0.148 pA·√s, τ_n = 0.0632 s');
    expect(() => parameterText(true, uncalibrated)).toThrow(/aren't calibrated/);
    // The registry's own, R's refit.
    expect(parameterText(true)).toContain(`τ_n = ${formatNumber(PARAMS.noiseCorrelation.value as number)} s`);
    // R's fit, to three significant figures.
    const calibrated = parameterText(true, fitted);
    expect(calibrated).toContain('the calibrated parameters (PLAN §7.3), here to three significant figures');
    expect(calibrated).toContain(
      `g_osc = ${shown('oscillatorExcitability')} pS, g_osc,B = ${shown('oscillatorExcitabilityB')} pS`,
    );
    expect(calibrated).toContain(`θ_nmj = ${shown('neuromuscularThreshold')} relative drive`);
  });

  it("writes checkpoint 0's verdict, each clause's, and its backward activity", () => {
    const section = checkpoint0Section(checkpoint0([record], [touched], [worm]), {
      ...info,
      worms: 1,
      wormSeconds: 3600,
    });
    expect(section).toContain('### Checkpoint 0: the silenced network — **Pass**');
    expect(section).toContain('1 trial of 70 s, seed 1, each run untouched and touched, and 1 worm in the assay');
    expect(section).toContain('| Crawling | 0 forward bouts of 10 s or more | None in any trial | **Pass** |');
    expect(section).toContain(
      'A reversal within 2 s after 0 of 2 touches (0%), and in 0 of the matched windows; p = 1.0',
    );
    expect(section).toContain(
      '| Chemotaxis | CI 0.00: 0 of 1 at the odour, 0 at the control | Within ±0.1 of zero | **Pass** |',
    );
    expect(section).toContain('1 reversal of 1 s or more, 1.00 a minute');
    expect(section).toContain('| 1 | 42 |');
    // −0.05 for 2 s of 60, then still: −0.0017.
    expect(section).toContain('| −0.0017 |');
    expect(section).toContain('each touched 3 times, 20 s apart from t = 20 s');
    expect(section).toContain('2 anterior touches and 1 posterior');
    expect(section).toContain('Each front touch reached ALML, ALMR, AVM; each back touch reached PLML, PLMR.');
    expect(section).toContain('rising after 0 of 1 touch by 0 on average; p = 1.0');
    expect(section).toContain('| 1 | F B F | 0 of 2 | 0 of 2 | 0.0000 → 0.0000 | 0 |');
    // The touched trial lies still where its twin backed up at 0.05 body lengths per second.
    expect(section).toContain("differs from its twin's by more than 5.0 × 10⁻² body lengths per second");
    expect(section).toContain('| 1 | 7 | AWCR | Neither | 44.62 | 44.71 | 0.015 |');
    // A figure that rounds to zero carries no minus sign.
    const still = { ...record, velocity: Array<number>(600).fill(-0.00001) };
    expect(checkpoint0Section(checkpoint0([still], [touched], [worm]), info)).toContain('| 0.0000 |');
    // On a fit, it gives the calibrated values the run used.
    const calibrated = checkpoint0Section(checkpoint0([record], [touched], [worm]), {
      ...info,
      calibrated: true,
      registry: fitted,
    });
    expect(calibrated).toContain('the calibrated parameters (PLAN §7.3), here to three significant figures');
    expect(calibrated).toContain(`σ_n = ${shown('noiseIntensity')} pA·√s`);
  });

  it("says why a reflex went unmeasured, and what a shortened run's single touch was", () => {
    // Trials of 30 s: one touch each, at 20 s, at the front on the odd seed.
    const once: TrialRecord = {
      ...touched,
      seconds: 30,
      touches: touchSchedule(1, 30).map(({ time, s }) => ({ time, s, reached: ['ALML', 'ALMR', 'AVM'] })),
    };
    const section = checkpoint0Section(checkpoint0([record], [once], [worm]), { ...info, seconds: 30 });
    expect(section).toContain('each touched once, at t = 20 s, at the front (F, s = 0.2) on odd seeds');
    expect(section).toContain('1 anterior touch and 0 posterior');
    expect(section).toContain('no back touch was made');
    expect(section).toContain('| Posterior touch | unmeasured: no posterior touch |');
    expect(section).toContain('| 1 | F | 0 of 1 | 0 of 1 | — | 0 |');
    // A trial and a worm that left the finite numbers.
    const broken = checkpoint0Section(
      checkpoint0([record], [{ ...touched, finite: false }], [{ ...worm, finite: false, end: null }]),
      info,
    );
    expect(broken).toContain('2 trials or worms left the finite numbers');
    expect(broken).toContain('| Anterior touch | unmeasured: no touched trials, or one left the finite numbers |');
    expect(broken).toContain('### Checkpoint 0: the silenced network — **Fail**');
  });

  it('writes small numbers with powers of ten', () => {
    expect(scientific(2.710003e-7)).toBe('2.7 × 10⁻⁷');
    expect(scientific(-0.05)).toBe('−5.0 × 10⁻²');
    expect(scientific(1234)).toBe('1.2 × 10³');
    expect(scientific(0)).toBe('0');
    expect(scientific(Number.NaN)).toBe('NaN');
  });

  it('gives shares that add up to 100%', () => {
    expect(shares([1, 1, 1])).toEqual(['34%', '33%', '33%']);
    expect(shares([0.125, 0.375, 0.5])).toEqual(['13%', '37%', '50%']);
    expect(shares([0, 0, 0])).toEqual(['0%', '0%', '0%']);
  });

  it("writes checkpoint 1's clauses, and says why one went unmeasured", () => {
    const zeros = Array<number>(300).fill(0);
    const section = checkpoint1Section(
      checkpoint1(
        [{ ...record, velocity: Array<number>(300).fill(0.02), mid: zeros, front: zeros, rear: zeros }],
        [[1]],
      ),
      info,
    );
    expect(section).toContain('### Checkpoint 1: crawling — **Fail**');
    expect(section).toContain('| Wavelength (body lengths) | unmeasured: no mid-body bending |');
    expect(section).toContain('| Speed (body lengths/s) | 0.020 |');
    expect(section).toContain('| Posture variance the four eigenworms capture | unmeasured: too few postures |');
    expect(section).toContain('crossed its mean 0 times, 0.0 a bout');
    expect(section).toContain('0 self-intersecting postures were left out');
    expect(section).toContain('but the parameters are provisional, not calibrated');
    expect(section).toContain('Diagnostics, reported and not graded (PLAN §7.4): ');
    expect(section).toContain(
      'the mid-body curvature has no spectrum to report; 0 of 0 reversals started within 3 s after a flip of the head switch',
    );
    const calibrated = checkpoint1Section(checkpoint1([record], [[1]]), {
      ...info,
      calibrated: true,
      registry: fitted,
    });
    expect(calibrated).toContain(
      'which the parameters were tuned against (PLAN §7.3), on seeds of their own, 1001 to 1020',
    );
  });

  it('refuses options that would run no trial', () => {
    expect(parseArgs(['--checkpoint', '1', '--jobs', '3'])).toMatchObject({ checkpoints: [1], jobs: 3, trials: 20 });
    expect(parseArgs(['--checkpoint', '1', '--checkpoint', '0']).checkpoints).toEqual([0, 1]);
    expect(parseArgs(['--checkpoint', '0', '--seconds', '24']).seconds).toBe(24);
    expect(parseArgs(['--checkpoint', '1', '--seconds', '11']).seconds).toBe(11);
    for (const args of [
      ['--checkpoint', '1', '--jobs', '0'],
      ['--checkpoint', '1', '--trials', ''],
      ['--checkpoint', '1', '--trials', '2.5'],
      ['--checkpoint', '1', '--seconds', '10'],
      // Checkpoint 0's first touch, at 20 s, needs 3.5 s after it.
      ['--checkpoint', '0', '--seconds', '23'],
      ['--checkpoint', '0x1'],
      ['--checkpoint', '2'],
      ['--checkpoint'],
      ['--help'],
      [],
    ]) {
      expect(() => parseArgs(args), args.join(' ')).toThrow();
    }
  });

  it("writes §7.2's comparison: each clause's values, interval and margin, and the fit's verdict", () => {
    const run: EquivalenceRun = {
      fit: 'refit',
      date: '2026-09-28',
      commit: 'abc1234',
      trials: 200,
      seconds: 120,
      steps: [0.0025, 0.00125],
      resamples: 1000,
      grades: ['partial', 'pass'],
      unconverged: [0, 2],
      comparison: {
        nonFinite: 0,
        pass: false,
        clauses: [
          {
            name: 'frequency',
            coarse: 0.3012,
            fine: 0.3,
            difference: 0.0012,
            interval: [-0.004, 0.0061],
            margin: 0.009,
            unmeasured: 0,
            pass: true,
          },
          {
            name: 'speed',
            coarse: 0.03,
            fine: 0.029,
            difference: 0.001,
            interval: [0.0005, null],
            margin: 0.00087,
            unmeasured: 40,
            pass: false,
          },
          {
            name: 'wavelength',
            coarse: 0.62,
            fine: null,
            difference: null,
            interval: null,
            margin: null,
            unmeasured: 1000,
            pass: false,
          },
        ],
      },
    };
    const section = equivalenceSection([run]);
    expect(section).toContain("#### R's refit — **Fail**");
    expect(section).toContain('200 trials of 120 s at each step, seeds 1 to 200, at dt = 2.5 ms and dt/2 = 1.25 ms');
    expect(section).toContain(
      '| Frequency (Hz) | 0.3012 | 0.3000 | +0.0012 | −0.0040 to +0.0061 | ±0.0090 | **Pass** |',
    );
    expect(section).toContain('| unmeasured | — | — | — | **Fail**, 1,000 resamples unmeasured |');
    expect(section).toContain('| +0.0005 to +∞ | ±0.0009 | **Fail**, 40 resamples unmeasured |');
    // An end unbounded by the unmeasured resamples comes back from the committed JSON the same.
    expect(equivalenceSection([JSON.parse(JSON.stringify(run)) as EquivalenceRun])).toBe(section);
    const both = { ...run.comparison.clauses[1], interval: [null, null] as [null, null] };
    expect(equivalenceSection([{ ...run, comparison: { ...run.comparison, clauses: [both] } }])).toContain(
      '| −∞ to +∞ | ±0.0009 |',
    );
    expect(section).toContain('**Partial** at dt and **Pass** at dt/2');
    expect(section).toContain("Solves that didn't converge: 0 at dt and 2 at dt/2");
    expect(equivalenceSection([])).toContain('Not yet run.');
  });

  it('takes a fit for the comparison, and a shortened run within its 200 trials', () => {
    expect(equivalenceArgs(['--fit', 'planned', '--jobs', '4'])).toEqual({ fit: 'planned', jobs: 4, trials: 200 });
    expect(equivalenceArgs(['--fit', 'refit', '--trials', '10']).trials).toBe(10);
    expect(() => equivalenceArgs([])).toThrow(/--fit/);
    expect(() => equivalenceArgs(['--fit', 'white'])).toThrow(/--fit/);
    expect(() => equivalenceArgs(['--fit', 'refit', '--trials', '201'])).toThrow(/--trials/);
    // A mistyped option must not run the full comparison.
    expect(() => equivalenceArgs(['--fit', 'refit', '--trials'])).toThrow(/needs a value/);
    expect(() => equivalenceArgs(['--fit', 'refit', '--trial', '10'])).toThrow(/unknown option/);
    expect(() => equivalenceArgs(['--fit', 'refit', '--jobs=4'])).toThrow(/unknown option/);
    expect(() => equivalenceArgs(['--fit', 'refit', '--seconds', '30'])).toThrow(/unknown option/);
    expect(() => equivalenceArgs(['--fit', 'refit', '--fit', 'planned'])).toThrow(/twice/);
    expect(() => equivalenceArgs(['--fit', 'refit', '--jobs', '0'])).toThrow(/--jobs/);
    expect(equivalenceArgs(['--fit', 'round-2']).fit).toBe('round-2');
  });

  it("takes R's fits from their committed records, whatever the registry holds", () => {
    const final = (file: string): unknown =>
      (JSON.parse(readFileSync(join(ROOT, 'data/calibration', file), 'utf8')) as { final: { values: unknown } }).final
        .values;
    expect(valuesOf('refit')).toEqual(final('r2.json'));
    expect(valuesOf('planned')).toBeNull();
    if (existsSync(join(ROOT, 'data/calibration/r3.json'))) expect(valuesOf('round-2')).toEqual(final('r3.json'));
    else expect(() => valuesOf('round-2')).toThrow(/no calibration yet/);
    // A record that isn't a whole fit of R's twelve, within their bounds, is refused.
    const good = JSON.parse(readFileSync(join(ROOT, 'data/calibration/r2.json'), 'utf8')) as {
      model: string;
      complete: boolean;
      final: { values: Record<string, number> };
    };
    expect(() => checkedValues({ ...good, complete: false }, 'x')).toThrow(/whole run/);
    expect(() => checkedValues({ ...good, model: 'planned' }, 'x')).toThrow(/track R/);
    const short = Object.fromEntries(Object.entries(good.final.values).filter(([id]) => id !== 'gapGainB'));
    expect(() => checkedValues({ ...good, final: { values: short } }, 'x')).toThrow(/calibrated parameters/);
    const outside = { ...good.final.values, gapGainB: 7 };
    expect(() => checkedValues({ ...good, final: { values: outside } }, 'x')).toThrow(/bounds/);
  });

  it("reports the voltage diagnostic when the trials carry it, and says nothing of it when they don't", () => {
    const base = { peak: 0.3, share: 0.5, reversals: 0, afterFlip: 0, avaChange: null, avaSpread: null };
    const outside = { mean: 16.04, max: 23, far: { mean: 4.26, max: 6 }, lowest: -217.84, highest: 203.16 };
    expect(diagnosticsText({ ...base, outside })).toContain(
      "16.0 neurons on average sat outside the model's reversal range, −48 to 0 mV, at each sample, and 23 at most; 4.3 on average, and 6 at most, sat more than 10 mV outside it; the voltages ran from −217.8 to 203.2 mV over every step of the measured windows.",
    );
    // Just inside the range, the extremes read as the bounds they don't pass, and never as −0.
    const inside = { ...outside, lowest: -47.96, highest: -0.04 };
    expect(diagnosticsText({ ...base, outside: inside })).toContain('the voltages ran from −48.0 to 0.0 mV');
    expect(diagnosticsText({ ...base, outside: null })).not.toContain('reversal range');
  });
});
