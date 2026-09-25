import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../../src/data/schema.ts';
import { countFacts } from '../../src/science/facts.ts';
import { ROOT } from '../data/sources.ts';
import { fidelityPage, formatNumber, testedByText } from './page.ts';

const facts = countFacts(
  validateWormlightData(JSON.parse(readFileSync(join(ROOT, 'public/data/wormlight.v1.json'), 'utf8'))),
);

describe('formatNumber', () => {
  it('writes the shortest exact digits, never rounding', () => {
    expect(formatNumber(0.3444)).toBe('0.3444');
    expect(formatNumber(1234567)).toBe('1.234567 × 10⁶');
    expect(formatNumber(1000001)).toBe('1.000001 × 10⁶');
    expect(formatNumber(0.0099996)).toBe('9.9996 × 10⁻³');
    expect(formatNumber(3.2e-3)).toBe('3.2 × 10⁻³');
    expect(formatNumber(1e21)).toBe('1 × 10²¹');
  });

  it('uses a true minus sign everywhere', () => {
    expect(formatNumber(-48)).toBe('−48');
    expect(formatNumber(-0.005)).toBe('−5 × 10⁻³');
    expect(formatNumber(0)).toBe('0');
  });
});

describe('testedByText', () => {
  it('folds plain checkpoints into ranges and keeps details beside their checks', () => {
    expect(testedByText([{ check: 'checkpoint2' }, { check: 'checkpoint3' }])).toBe('Checkpoints 2 and 3');
    expect(
      testedByText(
        ['checkpoint2', 'checkpoint3', 'checkpoint4', 'checkpoint5'].map((c) => ({ check: c as 'checkpoint2' })),
      ),
    ).toBe('Checkpoints 2–5');
    expect(testedByText([{ check: 'checkpoint1' }, { check: 'checkpoint4' }])).toBe('Checkpoints 1 and 4');
    expect(
      testedByText([
        { check: 'passiveBend' },
        { check: 'checkpoint1' },
        { check: 'checkpoint5', detail: 'AVB + PVC row' },
      ]),
    ).toBe('Passive-bend relaxation test; Checkpoint 1; Checkpoint 5 (AVB + PVC row)');
    expect(testedByText([])).toBe('');
  });
});

describe('countFacts on the committed runtime file', () => {
  it('counts the figures the ledger quotes', () => {
    expect([facts.neurons, facts.muscles, facts.chemical, facts.autapses, facts.gapPairs]).toEqual([
      302, 95, 3709, 38, 1095,
    ]);
    expect(facts.signs.expression).toMatchObject({ count: 1716, percent: '46.3%' });
    expect(facts.signs.rule).toMatchObject({ count: 1453, percentWhole: '39%' });
    expect(facts.signs.none).toMatchObject({ count: 533, percentWhole: '14%' });
    expect(facts.silentMuscleInputs).toBe(32);
    expect(facts.largestGap).toEqual({ name: 'ALA', sections: 1314 });
  });
});

describe('fidelityPage', () => {
  const page = fidelityPage(facts);

  it('quotes the counted figures, not typed ones', () => {
    expect(page).toContain('expression-based signs for 46.3% of chemical edges');
    expect(page).toContain("ALA's 1,314 gap-junction sections");
    const moved = fidelityPage({ ...facts, largestGap: { name: 'AVAL', sections: 999 } });
    expect(moved).toContain("AVAL's 999 gap-junction sections");
  });

  it('lists the reference data and every source the registry uses, eigenworms included', () => {
    expect(page).toContain('## Reference data for validation');
    expect(page).toContain('Stephens et al. 2008');
    expect(page).toContain('Hebert et al. 2021');
  });

  it('states the free-parameter count against the budget', () => {
    expect(page).toContain('There are 14 free parameters, 8 calibrated and 6 fixed in advance, against a budget of 14');
  });
});
