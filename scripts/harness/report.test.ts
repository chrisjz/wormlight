import { describe, expect, it } from 'vitest';
import type { ChemotaxisRecord } from '../../src/validation/chemotaxis.ts';
import { checkpoint0, checkpoint1, touchSchedule } from '../../src/validation/checkpoints.ts';
import { emptySums } from '../../src/validation/posture.ts';
import type { TrialRecord } from '../../src/validation/trial.ts';
import { checkpoint0Section, checkpoint1Section, parameterText, replaceSection, shares } from './report.ts';
import { parseArgs } from './run.ts';

const info = { date: '2026-09-26', commit: 'abc1234', trials: 1, seconds: 70 };
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
  });

  it('names the provisional parameters it ran on', () => {
    expect(parameterText()).toContain('g_osc = 798 pS');
    expect(parameterText()).toContain('θ_osc = −11.5 mV');
    expect(parameterText()).toContain('σ_n = 0 pA·√s');
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
    expect(section).toContain('Each front touch reached ALML, ALMR, AVM; each back touch PLML, PLMR.');
    expect(section).toContain('| 1 | F B F | 0 of 2 | 0 of 2 | 0.0000 → 0.0000 | 0 |');
    expect(section).toContain('| 1 | 7 | AWCR | Neither | 44.62 | 44.71 | 0.015 |');
    // A figure that rounds to zero carries no minus sign.
    const still = { ...record, velocity: Array<number>(600).fill(-0.00001) };
    expect(checkpoint0Section(checkpoint0([still], [touched], [worm]), info)).toContain('| 0.0000 |');
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
  });

  it('refuses options that would run no trial', () => {
    expect(parseArgs(['--checkpoint', '1', '--jobs', '3'])).toMatchObject({ checkpoints: [1], jobs: 3, trials: 20 });
    expect(parseArgs(['--checkpoint', '1', '--checkpoint', '0']).checkpoints).toEqual([0, 1]);
    for (const args of [
      ['--checkpoint', '1', '--jobs', '0'],
      ['--checkpoint', '1', '--trials', ''],
      ['--checkpoint', '1', '--trials', '2.5'],
      ['--checkpoint', '1', '--seconds', '10'],
      ['--checkpoint', '0x1'],
      ['--checkpoint', '2'],
      ['--checkpoint'],
      ['--help'],
      [],
    ]) {
      expect(() => parseArgs(args), args.join(' ')).toThrow();
    }
  });
});
