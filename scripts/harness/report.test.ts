import { describe, expect, it } from 'vitest';
import type { ChemotaxisRecord } from '../../src/validation/chemotaxis.ts';
import {
  checkpoint0,
  checkpoint1,
  touchSchedule,
  type Checkpoint1,
  type Clause,
  type TrialSummary,
} from '../../src/validation/checkpoints.ts';
import { emptySums } from '../../src/validation/posture.ts';
import { PARAMS, type Param } from '../../src/science/params.ts';
import { CALIBRATED } from '../../src/sim/world.ts';
import type { Values } from '../../src/validation/calibration.ts';
import type { TrialRecord } from '../../src/validation/trial.ts';
import { formatNumber } from '../docs/page.ts';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../data/sources.ts';
import * as planned from '../../src/science/planned.ts';
import * as trackS from '../../src/sim/trackS.ts';
import * as world from '../../src/sim/world.ts';
import { provisionalValues } from '../../src/validation/calibration.ts';
import {
  checkedValues,
  formOf,
  manifestOf,
  mayTake,
  modelOf,
  nameOf,
  paramsOf,
  parseArgs as equivalenceArgs,
  picked,
  resultNames,
  valuesOf,
  variants,
} from './equivalence.ts';
import { checkpoint2, checkpoint3, type TouchTrialRecord } from '../../src/validation/touch.ts';
import { checkpoint2Section, checkpoint3Section, diagnosticsText } from './report.ts';
import {
  checkpoint0Section,
  checkpoint1Section,
  chosenSection,
  equivalenceSection,
  parameterText,
  replaceSection,
  scientific,
  sensitivitySection,
  shares,
  type EquivalenceRun,
  type RunInfo,
  type SensitivityRow,
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
// The same trial touched as the protocol says, at 20, 40 and 60 s, and still throughout, as are its sham twins.
const touched: TrialRecord = {
  ...record,
  velocity: Array<number>(600).fill(0),
  touches: touchSchedule(1, 70).map(({ time, s }) => ({
    time,
    s,
    reached: s < 0.5 ? ['ALML', 'ALMR', 'AVM'] : ['PLML', 'PLMR'],
  })),
  shams: touchSchedule(1, 70).map(({ time }) => ({
    time,
    finite: true,
    unconverged: 0,
    velocity: Array<number>(Math.round((time + 3 - 10) * 10) + 1).fill(0),
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
    // The registry's own, track S's fit, in the conductance form.
    const own = (x: number): string => formatNumber(Number(x.toPrecision(3)));
    expect(parameterText(true)).toContain(`τ_n = ${own(PARAMS.noiseCorrelation.value as number)} s`);
    expect(parameterText(true)).toContain('g_sw = 50 nS');
    // Track S's model says what it adds to track R's; a run before it names no model, and was R's.
    expect(parameterText(true, PARAMS, 'track S')).toMatch(
      /^track S's model, its measured signs, the D-types' offset and its rectifier, in the conductance form, with the calibrated parameters \(PLAN §7\.3\)/,
    );
    expect(parameterText(true)).toMatch(/^the calibrated parameters/);
    expect(parameterText(true, PARAMS, 'track R')).toBe(parameterText(true));
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
      "A reversal within 2 s after 0 of 2 touches (0%), and after 0 of their sham twins; 0 pairs with the touched copy's alone and 0 with the twin's alone, p = 1.0",
    );
    expect(section).toContain(
      '| Chemotaxis | 0 arrivals: 0 of 1 worm at the odour, 0 at the control (CI 0.00); p = 1.0 |',
    );
    expect(section).toContain('1 reversal of 1 s or more, 1.00 a minute');
    expect(section).toContain('| 1 | 42 |');
    // −0.05 for 2 s of 60, then still: −0.0017.
    expect(section).toContain('| −0.0017 |');
    expect(section).toContain('each touched 3 times, 20 s apart from t = 20 s');
    expect(section).toContain('2 anterior touches and 1 posterior');
    expect(section).toContain('Each front touch reached ALML, ALMR, AVM; each back touch reached PLML, PLMR.');
    expect(section).toContain(
      'Forward velocity over the 2 s after 1 touch: 0.0000 touched, 0.0000 in the sham twins (body lengths/s), a difference of 0 on average; p = 1.0',
    );
    expect(section).toContain('| 1 | F B F | 0 of 2 | 0 of 2 | 0.0000 / 0.0000 | 0 |');
    expect(section).toContain('At each touch the world forked a sham twin');
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
      shams: touched.shams?.slice(0, 1),
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
    expect(broken).toContain('2 trials, twins or worms left the finite numbers');
    expect(broken).toContain(
      '| Anterior touch | unmeasured: no touched trials, or one or its sham twin left the finite numbers |',
    );
    expect(broken).toContain('### Checkpoint 0: the silenced network — **Fail**');
    // A twin that left the finite numbers, or whose solves didn't converge, counts with the trials.
    const twinBroke: TrialRecord = {
      ...touched,
      shams: touched.shams?.map((s, k) => (k === 0 ? { ...s, finite: false, unconverged: 3 } : s)),
    };
    const twinned = checkpoint0Section(checkpoint0([record], [twinBroke], [worm]), info);
    expect(twinned).toContain('1 trial, twin or worm left the finite numbers, and 3 brain solves failed to converge');
    expect(twinned).toContain('unmeasured: no touched trials, or one or its sham twin left the finite numbers');
  });

  it('writes a failing touch and a single arrival as such', () => {
    // The touched line backs up after its first anterior touch, at 20 s, where its twin lies still.
    const backing: TrialRecord = {
      ...touched,
      velocity: touched.velocity.map((v, k) => (10 + k / 10 >= 20.5 && 10 + k / 10 < 22 ? -0.05 : v)),
    };
    const arrived = { ...worm, reached: 'odour' as const, time: 100 };
    const section = checkpoint0Section(checkpoint0([record], [backing], [arrived]), info);
    expect(section).toContain(
      "A reversal within 2 s after 1 of 2 touches (50%), and after 0 of their sham twins; 1 pair with the touched copy's alone and 0 with the twin's alone, p = 0.50",
    );
    expect(section).toContain(
      '| Chemotaxis | 1 arrival: 1 of 1 worm at the odour, 0 at the control (CI 1.00); p = 1.0 |',
    );
    expect(section).toContain('| 1 | F B F | 1 of 2 | 0 of 2 |');
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
    expect(section).toContain('| Wavelength (body lengths) | unmeasured: no mid-body bend past the band |');
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
      ['--checkpoint', '7'],
      ['--checkpoint', '6', '--checkpoint', '1'],
      ['--wiring', '11'],
      ['--wiring', 'real', '--trials', '2'],
      // Checkpoints 2 and 3's earliest touch, at 20 s, needs 3.5 s after it.
      ['--checkpoint', '2', '--seconds', '23'],
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
    // A run that names checkpoint 1's frequency band says so; the committed runs before it say nothing of one.
    expect(section).not.toContain('band');
    const banded = equivalenceSection([{ ...run, fit: 'track-s', pick: 2, frequencyBand: 0.31 }]);
    expect(banded).toContain('#### Track S, pick 2 — **Fail**');
    expect(banded).toContain('The frequency counts crossings past a band of ±0.31 κL (PLAN §7.4).');
  });

  it('takes a fit for the comparison, and a shortened run within its 200 trials', () => {
    expect(equivalenceArgs(['--fit', 'planned', '--jobs', '4'])).toEqual({
      fit: 'planned',
      pick: 1,
      jobs: 4,
      trials: 200,
    });
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
    // Round 3's picks, 1 to 4, and only round 3's.
    expect(equivalenceArgs(['--fit', 'round-3', '--pick', '3'])).toMatchObject({ fit: 'round-3', pick: 3 });
    expect(() => equivalenceArgs(['--fit', 'round-3', '--pick', '5'])).toThrow(/--pick/);
    expect(() => equivalenceArgs(['--fit', 'round-3', '--pick', '0'])).toThrow(/--pick/);
    expect(() => equivalenceArgs(['--fit', 'refit', '--pick', '2'])).toThrow(/picks alone/);
    // Track S's picks likewise, 1 to 4.
    expect(equivalenceArgs(['--fit', 'track-s', '--pick', '4'])).toMatchObject({ fit: 'track-s', pick: 4 });
    expect(() => equivalenceArgs(['--fit', 'track-s', '--pick', '5'])).toThrow(/--pick/);
    expect(picked('track-s') && picked('round-3') && !picked('refit')).toBe(true);
  });

  it("runs track S's picks on track S's model, and every other fit on track R's", () => {
    expect(nameOf('track-s', 3)).toBe('track-s-pick-3');
    expect([modelOf('track-s'), modelOf('round-3'), modelOf('refit')]).toEqual(['track S', 'track R', 'track R']);
    const values = provisionalValues('conductance');
    const manifest = {
      fit: 'track-s' as const,
      pick: 1,
      values,
      form: 'conductance' as const,
      source: '',
      step: 0.0025,
    };
    const r = paramsOf({ ...manifest, seconds: 120, node: '' }, world, planned, trackS);
    const s = paramsOf({ ...manifest, model: 'track S', seconds: 120, node: '' }, world, planned, trackS);
    expect(s).toEqual({ ...r, ...trackS.TRACK_S });
    expect(r).toEqual(world.loopParams(values, 'conductance'));
    // A manifest names track S's model and pick, and track R's manifests are as they were, so their sets are reused.
    const at = { values, form: 'conductance' as const, source: 's' };
    expect(manifestOf({ fit: 'track-s', pick: 2, ...at }, 0.0025)).toMatchObject({ pick: 2, model: 'track S' });
    expect(Object.keys(manifestOf({ fit: 'round-3', pick: 2, ...at }, 0.0025))).toEqual([
      'fit',
      'pick',
      'values',
      'form',
      'source',
      'step',
      'seconds',
      'node',
    ]);
    expect(manifestOf({ fit: 'refit', pick: 1, ...at, form: 'current' }, 0.0025)).not.toHaveProperty('pick');
    // Until its calibration is committed, track S has no picks to take.
    if (!existsSync(join(ROOT, 'data/calibration/s1.json')))
      expect(() => valuesOf('track-s')).toThrow(/no calibration yet/);
  });

  it("takes round 3's picks down the four, each only once those before it have failed at their recorded values", () => {
    const values = (k: number): Values => ({ ...(valuesOf('refit') as Values), gapGainB: 0.1 * k });
    const failed = (k: number) => ({ values: values(k), comparison: { pass: false } });
    expect(mayTake(1, () => null, values)).toBe(true);
    expect(mayTake(2, failed, values)).toBe(true);
    expect(mayTake(4, failed, values)).toBe(true);
    // Not before the pick ahead of it has run, nor after it passed, nor if its record's values have since changed.
    expect(mayTake(2, () => null, values)).toBe(false);
    expect(mayTake(3, (k) => (k === 1 ? failed(k) : { values: values(k), comparison: { pass: true } }), values)).toBe(
      false,
    );
    expect(mayTake(2, (k) => ({ ...failed(k), values: values(k + 1) }), values)).toBe(false);
    expect(nameOf('round-3', 2)).toBe('round-3-pick-2');
    expect(nameOf('refit', 2)).toBe('refit');
    // VALIDATION.md's section follows the runner's order, round 3's picks then track S's last.
    const picks = (fit: string): string[] => [1, 2, 3, 4].map((k) => `${fit}-pick-${k}`);
    const order = ['refit', 'round-2', 'planned', ...picks('round-3'), ...picks('track-s')];
    expect(resultNames()).toEqual(order.filter((n) => existsSync(join(ROOT, 'data/equivalence', `${n}.json`))));
  });

  it('runs the chosen pick again with the switch off and weakened, and with the classes lesioned (PLAN §7.4)', () => {
    const neurons = [
      { name: 'DB1', oscillator: 'B' },
      { name: 'VB1', oscillator: 'B' },
      { name: 'DA1', oscillator: 'A' },
      { name: 'SMDDL', oscillator: 'headSwitch' },
      { name: 'AVBL', oscillator: null },
    ];
    const values = { ...(valuesOf('refit') as Values), headSwitchGain: 3 };
    const runs = variants(neurons, values, 'conductance');
    expect(runs.map((r) => r.name)).toEqual([
      'The head switch off, g_sw at 0',
      'g_sw at its lower bound',
      'The 2 B-types lesioned',
      'The 1 A-types lesioned',
      'AVBL and AVBR lesioned',
    ]);
    expect(runs.map((r) => r.values.headSwitchGain)).toEqual([0, 0.02, 3, 3, 3]);
    expect(runs.map((r) => r.lesions)).toEqual([undefined, undefined, ['DB1', 'VB1'], ['DA1'], ['AVBL', 'AVBR']]);
  });

  it("takes R's fits from their committed records, whatever the registry holds", () => {
    const final = (file: string): unknown =>
      (JSON.parse(readFileSync(join(ROOT, 'data/calibration', file), 'utf8')) as { final: { values: unknown } }).final
        .values;
    expect(valuesOf('refit')).toEqual(final('r2.json'));
    expect(valuesOf('planned')).toBeNull();
    if (existsSync(join(ROOT, 'data/calibration/r3.json'))) expect(valuesOf('round-2')).toEqual(final('r3.json'));
    else expect(() => valuesOf('round-2')).toThrow(/no calibration yet/);
    // Round 3's picks, once its record exists, each in its order.
    if (existsSync(join(ROOT, 'data/calibration/r5.json'))) {
      const { picks } = JSON.parse(readFileSync(join(ROOT, 'data/calibration/r5.json'), 'utf8')) as {
        picks: { values: unknown }[];
      };
      picks.forEach((p, k) => expect(valuesOf('round-3', k + 1)).toEqual(p.values));
      expect(formOf('round-3')).toBe('conductance');
    } else expect(() => valuesOf('round-3')).toThrow(/no calibration yet/);
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
    // A record's form sets g_sw's and g_p's bounds: the refit's 312 pA lies outside the conductance form's 0.02–50 nS,
    // and 1 nS outside the current form's 20–400 pA. A record that names none is the current form.
    expect(formOf('refit')).toBe('current');
    const conducting = { ...good, form: 'conductance' as const };
    expect(() => checkedValues(conducting, 'x')).toThrow(/headSwitchGain lies outside/);
    const inBox = { ...good.final.values, headSwitchGain: 1, proprioceptiveGain: 0.028 };
    expect(checkedValues({ ...conducting, final: { values: inBox } }, 'x')).toEqual(inBox);
    expect(() => checkedValues({ ...good, final: { values: inBox } }, 'x')).toThrow(/headSwitchGain lies outside/);
    // A fit of track S's model is held to its model and its own bound on g_p, 7 where track R's is 8.
    const s = { ...conducting, model: 'track S', final: { values: { ...inBox, proprioceptiveGain: 7.5 } } };
    expect(() => checkedValues(s, 'x', 'track S')).toThrow(/proprioceptiveGain lies outside/);
    expect(() => checkedValues(s, 'x')).toThrow(/track R/);
    const sIn = { ...s, final: { values: { ...inBox, proprioceptiveGain: 6.5 } } };
    expect(checkedValues(sIn, 'x', 'track S')).toEqual(sIn.final.values);
    expect(() => checkedValues({ ...conducting, final: { values: inBox } }, 'x', 'track S')).toThrow(/track S's/);
  });

  it("reports the voltage diagnostic when the trials carry it, and says nothing of it when they don't", () => {
    const base = {
      peak: 0.3,
      share: 0.5,
      reversals: 0,
      afterFlip: 0,
      avaChange: null,
      avaSpread: null,
      shunt: null,
      pacing: null,
    };
    const outside = { mean: 16.04, max: 23, far: { mean: 4.26, max: 6 }, lowest: -217.84, highest: 203.16 };
    expect(diagnosticsText({ ...base, outside })).toContain(
      "16.0 neurons on average sat outside the model's reversal range, −48 to 0 mV, at each sample, and 23 at most; 4.3 on average, and 6 at most, sat more than 10 mV outside it; the voltages ran from −217.8 to 203.2 mV over every step of the measured windows.",
    );
    // Just inside the range, the extremes read as the bounds they don't pass, and never as −0.
    const inside = { ...outside, lowest: -47.96, highest: -0.04 };
    expect(diagnosticsText({ ...base, outside: inside })).toContain('the voltages ran from −48.0 to 0.0 mV');
    expect(diagnosticsText({ ...base, outside: null })).not.toContain('reversal range');
  });

  it('reports the shunt in the conductance form, and says nothing of it in the current form', () => {
    const base = {
      peak: 0.3,
      share: 0.5,
      reversals: 0,
      afterFlip: 0,
      avaChange: null,
      avaSpread: null,
      outside: null,
      pacing: null,
    };
    expect(diagnosticsText({ ...base, shunt: { switch: 1.234, proprioception: 0.0456, gateToggles: 0.25 } })).toContain(
      "in the conductance form, the head switch's conductance came to 123% of its targets' passive loads and proprioception's to 4.6%, each shunt the mean of per-target ratios, and the switch's gate turned on or off 0.3 times a second.",
    );
    expect(diagnosticsText({ ...base, shunt: { switch: null, proprioception: 0.5, gateToggles: 0 } })).toContain(
      "the head switch had no SMD left and proprioception's to 50%",
    );
    expect(diagnosticsText({ ...base, shunt: null })).not.toContain('conductance form');
  });

  it('reports what paces the crawl when the trials carry it (PLAN §7.4, added before round 3 ran)', () => {
    const base = {
      peak: 0.3,
      share: 0.5,
      reversals: 0,
      afterFlip: 0,
      avaChange: null,
      avaSpread: null,
      outside: null,
      shunt: null,
    };
    const pacing = { open: 0.987, margin: { mean: -1.234, sd: 0.5 }, cycleRate: 0.0612 };
    expect(diagnosticsText({ ...base, pacing })).toContain(
      "the head switch's gate was open on 98.7% of the measured steps, the head-switch drive sat 1.2 mV below θ_osc on average, with a standard deviation of 0.5 mV, and the switch cycled at 0.061 Hz, half its flips a second, beside the spectrum's peak at 0.300 Hz.",
    );
    expect(diagnosticsText({ ...base, pacing: { ...pacing, margin: { mean: 3, sd: 1 } } })).toContain(
      '3.0 mV above θ_osc',
    );
    expect(diagnosticsText({ ...base, pacing: null })).not.toContain('gate was open');
  });

  it("reports round 3's chosen pick: checkpoint 1, the speed's interval and floor, and the runs that show its pacing", () => {
    const graded = checkpoint1([record], []);
    const report = {
      pick: 2,
      seed: 18,
      from: 'generation 60, candidate 3',
      values: {},
      date: '2026-09-30',
      commit: 'abc1234',
      checkpoint1: { ...graded, grade: 'partial' as const },
      speed: {
        value: 0.0612,
        interval: [0.0598, 0.0631] as [number, number],
        unmeasured: 0,
        fine: 0.0605,
        atFloor: true,
      },
      variants: [
        {
          name: 'The head switch off, g_sw at 0',
          grade: 'fail' as const,
          clauses: graded.clauses,
          forward: 0.1,
          meanVelocity: 0.0012,
        },
      ],
    };
    const section = chosenSection(report);
    expect(section).toContain(
      "### R's third round: pick 2, from the search of CMA-ES seed 18 — **Partial**, at the speed floor",
    );
    expect(section).toContain('with a 95% interval from 0.0598 to 0.0631 over 1,000 resamples of the 20 trials');
    expect(section).toContain('So the partial is reported as partial at the speed floor');
    expect(section).toContain('| The head switch off, g_sw at 0 | **Fail** |');
    expect(section).toContain('10%');
    const clear = chosenSection({
      ...report,
      speed: { ...report.speed, interval: [0.061, 0.07], fine: 0.062, atFloor: false },
    });
    expect(clear).toContain('the partial is not at the speed floor');
    expect(clear).not.toContain(', at the speed floor');
    // With no bout in some resamples, the interval's lower end reads as such.
    const bare = chosenSection({ ...report, speed: { ...report.speed, interval: [null, 0.07], unmeasured: 40 } });
    expect(bare).toContain(
      'from below every measured speed to 0.0700 over 1,000 resamples of the 20 trials, 40 of them with no bout',
    );
    // A fit that isn't partial carries no floor label, and its report says nothing of one.
    const failed = chosenSection({
      ...report,
      checkpoint1: { ...report.checkpoint1, grade: 'fail' },
      speed: { ...report.speed, atFloor: null },
    });
    expect(failed).not.toContain('speed floor');
    // Round 3's record, written before track S, names neither; track S's names its model, its record and its band.
    expect(section).toContain(
      'from data/calibration/r5.json (generation 60, candidate 3), in the conductance form (PLAN §9).',
    );
    const s = chosenSection({ ...report, fit: 'track-s', frequencyBand: 0.31 });
    expect(s).toContain('### Track S: pick 2, from the search of CMA-ES seed 18 — **Partial**, at the speed floor');
    expect(s).toContain(
      "from data/calibration/s1.json (generation 60, candidate 3), on track S's model, its measured signs, the D-types' offset and its rectifier, in the conductance form (PLAN §9), its frequency counting crossings past ±0.31 κL.",
    );
  });

  it("lesions the rules' classes by name in the runtime data: 18 B-types, 21 A-types, AVBL and AVBR", () => {
    const data = JSON.parse(readFileSync(join(ROOT, 'public/data/wormlight.v1.json'), 'utf8')) as {
      neurons: { name: string; oscillator: string | null }[];
    };
    const runs = variants(data.neurons, valuesOf('refit') as Values, 'conductance');
    expect(runs.map((r) => r.lesions?.length ?? 0)).toEqual([0, 0, 18, 21, 2]);
    const names = new Set(data.neurons.map((n) => n.name));
    for (const r of runs) for (const name of r.lesions ?? []) expect(names.has(name), name).toBe(true);
    expect(runs[2].lesions?.every((n) => /^[DV]B\d+$/.test(n))).toBe(true);
    expect(runs[3].lesions?.every((n) => /^[DV]A\d+$/.test(n))).toBe(true);
  });
});

describe("the sensitivity runs' section", () => {
  // Shares of the measured time, as summariseTrial gives them.
  const trial = (forward: number, backward = 0, unconverged = 0, finite = true): TrialSummary => ({
    seed: 1,
    posture: 0,
    finite,
    measured: 110,
    forward,
    paused: 1 - forward - backward,
    backward,
    longestBout: 0,
    reversals: 0,
    meanVelocity: 0.02,
    selfIntersecting: 0,
    unconverged,
  });
  const clause = (name: string, value: number | null): Clause => ({ name, value, grade: 'fail', reason: null });
  const row = (label: string, frequency: number | null, bouts: number, silenced: TrialSummary): SensitivityRow => ({
    label,
    checkpoint1: {
      grade: 'fail',
      clauses: [
        clause('frequency', frequency),
        clause('wavelength', frequency === null ? null : 0.71),
        clause('speed', frequency === null ? null : 0.029),
        clause('eigenworms', 0.984),
        clause('bout', 0),
      ],
      trials: [trial(0.8)],
    } as unknown as Checkpoint1,
    silenced: { grade: bouts === 0 ? 'pass' : 'fail', bouts, trials: [silenced] },
    silencedPacing: { open: 1, margin: { mean: 8.47, sd: 0 }, cycleRate: 0.0125 },
    silencedVoltages: { mean: 0, max: 0, far: { mean: 0, max: 0 }, lowest: -15650.4, highest: 15575 },
  });
  const info: RunInfo = { date: '2026-09-30', commit: 'abc1234', calibrated: false, trials: 20, seconds: 120 };

  it("gives checkpoint 1's row and the silenced network's for each setting, a dash where a measure has no bout", () => {
    const section = sensitivitySection(
      [row('By the rule', 0.099, 0, trial(0)), row('Random draw 5', null, 2, trial(0.0079, 0.02))],
      info,
    );
    expect(section).toContain('### Sensitivity: the uncertain signs, the scales and the rest offsets');
    expect(section).toContain('Run on 2026-09-30 at `abc1234`');
    expect(section).toContain('| By the rule | 80% | 0.020 | 0.099 | 0.71 | 0.029 | 98.4% | 0% | **Fail** |');
    expect(section).toContain('| Random draw 5 | 80% | 0.020 | – | – | – | 98.4% | 0% | **Fail** |');
    expect(section).toContain('| Random draw 5 | 0.79% | 2.0% | 8.47 | 1.50 | −15650 to 15575 | 2 |');
    expect(section).toContain('Every trial stayed finite, and no brain solve failed to converge.');
  });

  it('says when a trial left the finite numbers or a solve failed to converge', () => {
    const section = sensitivitySection([row('Bad', null, 0, trial(0, 0, 2, false))], info);
    expect(section).toContain('1 trial left the finite numbers, and 2 brain solves failed to converge.');
  });
});

describe("checkpoints 2 and 3's sections", () => {
  const copy = (reversal: boolean, after: number) => ({
    reached: ['ALML'],
    finite: true,
    unconverged: 0,
    reversal,
    latency: reversal ? 0.6 : null,
    after,
  });
  const records = (n: number): TouchTrialRecord[] =>
    Array.from({ length: n }, (_, k) => ({
      seed: k + 1,
      posture: k,
      turn: 0,
      earliest: 25,
      time: 30.2,
      finite: true,
      unconverged: 0,
      before: 0.06,
      front: copy(false, 0.07),
      back: copy(false, 0.0705),
      frontSham: copy(false, 0.07),
      backSham: copy(false, 0.07),
      sharedSham: true,
    }));
  const info: RunInfo = {
    date: '2026-10-02',
    commit: 'abc1234',
    calibrated: true,
    model: 'track S',
    trials: 20,
    seconds: 120,
  };

  it("grades each, labels checkpoint 2 fitted on track S's fit, and names the previews", () => {
    const two = checkpoint2Section(checkpoint2(records(50)), info);
    expect(two).toContain('### Checkpoint 2: anterior touch — **Fail**, reported as fitted');
    expect(two).toContain('50 touches from 50 seeds');
    expect(two).toContain('| Touches followed by a reversal within 2 s | 0 of 50 (0%) | ≥ 70% | 40%–70% |');
    expect(two).toContain('Previewed outside the protocol (PLAN §10)');
    expect(checkpoint2Section(checkpoint2(records(50)), { ...info, model: 'track R' })).not.toContain('fitted');
    const three = checkpoint3Section(checkpoint3(records(50)), info);
    expect(three).toContain('### Checkpoint 3: posterior touch — **Fail**');
    expect(three).not.toContain('fitted');
    expect(three).toContain('0.0705 touched, 0.0700 in the twins (body lengths/s): +0.7%');
    expect(three).toContain('| 1 | 1 | 30.2 | ALML | No / No | 0.0600 | 0.0705 / 0.0700 |');
  });

  it('says why a run was unmeasured', () => {
    expect(checkpoint2Section(checkpoint2(records(12)), info)).toContain(
      'Unmeasured: 12 touches in 12 seeds, fewer than 50, so the checkpoint fails.',
    );
  });
});
