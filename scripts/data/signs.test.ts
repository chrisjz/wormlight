import { describe, expect, it } from 'vitest';
import type { Cell } from './xlsx.ts';
import {
  edgeKey,
  parseOverrides,
  readFenyves,
  signChemical,
  signNeuromuscular,
  unpad,
  type FenyvesSheet,
} from './signs.ts';

const neurons = new Set(['AWCL', 'AIYL', 'AIBL', 'VB1', 'DD1', 'RIML']);
const edges = new Set([
  edgeKey('AWCL', 'AIYL'),
  edgeKey('AWCL', 'AIBL'),
  edgeKey('VB1', 'DD1'),
  edgeKey('RIML', 'AIBL'),
]);

// A Fenyves sheet: two header rows, then source in A, target in D, edge type in F, prediction in Q.
function sheet(rows: [string, string, string][]): Cell[][] {
  const row = ([pre, post, prediction]: [string, string, string]): Cell[] => {
    const cells = Array.from({ length: 17 }, (): Cell => null);
    cells[0] = pre;
    cells[3] = post;
    cells[5] = 'chemical';
    cells[16] = prediction;
    return cells;
  };
  return [['Source'], ['Neuron'], ...rows.map(row)];
}

describe('unpad', () => {
  it('strips the zero-padding Cook uses for ventral-cord motor neurons, and nothing else', () => {
    expect(unpad('VB01')).toBe('VB1');
    expect(unpad('VD13')).toBe('VD13');
    expect(unpad(' AS09 ')).toBe('AS9');
    expect(unpad('AIYL')).toBe('AIYL');
  });
});

describe('readFenyves', () => {
  it('keys predictions by Cook edge, counts rows that are not Cook edges, and lists absent neurons', () => {
    const read = readFenyves(
      sheet([
        ['AWCL', 'AIYL', '-'],
        ['VB01', 'DD01', 'complex'],
        ['AIYL', 'AWCL', '+'],
      ]),
      'S1',
      neurons,
      edges,
    );
    expect(read.predictions).toEqual(
      new Map([
        [edgeKey('AWCL', 'AIYL'), '-'],
        [edgeKey('VB1', 'DD1'), 'complex'],
      ]),
    );
    expect(read.ignoredRows).toEqual([edgeKey('AIYL', 'AWCL')]);
    expect(read.absentNeurons).toEqual(['AIBL', 'RIML']);
  });

  it('refuses an unknown neuron, an unknown label and a repeated edge', () => {
    expect(() => readFenyves(sheet([['XYZ', 'AIYL', '+']]), 'S1', neurons, edges)).toThrow(/unknown neuron XYZ/);
    expect(() => readFenyves(sheet([['AWCL', 'AIYL', 'maybe']]), 'S1', neurons, edges)).toThrow(/unknown prediction/);
    expect(() =>
      readFenyves(
        sheet([
          ['AWCL', 'AIYL', '+'],
          ['AWCL', 'AIYL', '+'],
        ]),
        'S1',
        neurons,
        edges,
      ),
    ).toThrow(/listed twice/);
  });
});

describe('parseOverrides', () => {
  it('reads quoted evidence with commas and doubled quotes', () => {
    const [override] = parseOverrides(
      'pre,post,sign,citation,evidence\nAWCL,AIYL,-1,chalasani2007,"""inhibits AIY"", through chloride channels"\n',
    );
    expect(override).toEqual({
      pre: 'AWCL',
      post: 'AIYL',
      sign: -1,
      citation: 'chalasani2007',
      evidence: '"inhibits AIY", through chloride channels',
    });
  });

  it('refuses an override without a citation', () => {
    expect(() => parseOverrides('pre,post,sign,citation,evidence\nAWCL,AIYL,-1,,why\n')).toThrow(/citation/);
  });
});

describe('signChemical', () => {
  const fenyves = (predictions: [string, string][]): FenyvesSheet => ({
    label: 'test',
    predictions: new Map(predictions.map(([key, p]) => [key, p as '+' | '-' | 'complex' | 'no pred'])),
    ignoredRows: [],
    absentNeurons: [],
  });
  const ruleSign = new Map<string, 1 | -1 | null>([
    ['AWCL', 1],
    ['VB1', 1],
    ['RIML', 1],
    ['DD1', -1],
  ]);
  const chemical = [
    { pre: 'AWCL', post: 'AIYL', sections: 22 },
    { pre: 'AWCL', post: 'AIBL', sections: 12 },
    { pre: 'VB1', post: 'DD1', sections: 3 },
    { pre: 'RIML', post: 'AIBL', sections: 1 },
  ];

  it('takes physiology first, then expression, then the transmitter rule', () => {
    const signed = signChemical(chemical, {
      ruleSign,
      fenyves: [
        fenyves([
          [edgeKey('AWCL', 'AIYL'), '-'],
          [edgeKey('AWCL', 'AIBL'), '+'],
        ]),
      ],
      overrides: [{ pre: 'AWCL', post: 'AIYL', sign: -1, citation: 'chalasani2007', evidence: 'x' }],
    });
    expect(signed.map((c) => [c.sign, c.signSource, c.citation])).toEqual([
      [-1, 'physiology', 'chalasani2007'],
      [1, 'expression', undefined],
      [1, 'rule', undefined],
      [1, 'rule', undefined],
    ]);
  });

  it('gives no sign where no step does', () => {
    const [signed] = signChemical([{ pre: 'AIYL', post: 'AWCL', sections: 1 }], {
      ruleSign,
      fenyves: [],
      overrides: [],
    });
    expect(signed).toMatchObject({ sign: 0, signSource: 'none' });
  });

  it('refuses files that disagree, and an override on an edge Cook lacks', () => {
    const disagreeing = [fenyves([[edgeKey('VB1', 'DD1'), '+']]), fenyves([[edgeKey('VB1', 'DD1'), '-']])];
    expect(() => signChemical(chemical, { ruleSign, fenyves: disagreeing, overrides: [] })).toThrow(/disagree/);
    const stray = [{ pre: 'AIYL', post: 'AWCL', sign: 1 as const, citation: 'c', evidence: 'e' }];
    expect(() => signChemical(chemical, { ruleSign, fenyves: [], overrides: stray })).toThrow(/does not have/);
  });
});

describe('signNeuromuscular', () => {
  it('lets acetylcholine excite and GABA inhibit, and anything else do nothing', () => {
    expect(signNeuromuscular('ACh')).toEqual({ sign: 1, signSource: 'receptor' });
    expect(signNeuromuscular('GABA')).toEqual({ sign: -1, signSource: 'receptor' });
    expect(signNeuromuscular('Glu')).toEqual({ sign: 0, signSource: 'none' });
    expect(signNeuromuscular(undefined)).toEqual({ sign: 0, signSource: 'none' });
  });
});
