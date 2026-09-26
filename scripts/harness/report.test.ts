import { describe, expect, it } from 'vitest';
import { checkpoint0 } from '../../src/validation/checkpoints.ts';
import { emptySums } from '../../src/validation/posture.ts';
import { checkpoint0Section, parameterText, replaceSection } from './report.ts';

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

  it("writes checkpoint 0's verdict and its backward activity", () => {
    const velocity = [...Array<number>(20).fill(-0.05), ...Array<number>(580).fill(0)];
    const zeros = velocity.map(() => 0);
    const record = {
      seed: 1,
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
    };
    const section = checkpoint0Section(checkpoint0([record]), {
      date: '2026-09-26',
      commit: 'abc1234',
      trials: 1,
      seconds: 70,
    });
    expect(section).toContain('**Pass**');
    expect(section).toContain('1 trial of 70 s, seed 1, on');
    expect(section).toContain('1 reversal of 1 s or more, 1.00 a minute');
    expect(section).toContain('| 1 | 42 |');
    // −0.05 for 2 s of 60, then still: −0.0017, and no minus on a figure that rounds to zero.
    expect(section).toContain('| −0.0017 |');
  });
});
