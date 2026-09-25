import { describe, expect, it } from 'vitest';
import type { Cell } from './xlsx.ts';
import {
  csvFields,
  edgeKey,
  parseOverrides,
  readFenyves,
  signChemical,
  signNeuromuscular,
  unpad,
  type FenyvesSheet,
  type Prediction,
  type SignInputs,
} from './signs.ts';

const neurons = new Set(['AWCL', 'AIYL', 'AIBL', 'VB1', 'DD1', 'RIML', 'AVFL']);
const edges = new Set([
  edgeKey('AWCL', 'AIYL'),
  edgeKey('AWCL', 'AIBL'),
  edgeKey('VB1', 'DD1'),
  edgeKey('RIML', 'AIBL'),
  edgeKey('AVFL', 'AIBL'),
]);

// A Fenyves sheet: two header rows, then source in A, its transmitter in B, target in D, edge type in F
// and prediction in Q.
function sheet(rows: [string, string, string, string][]): Cell[][] {
  const row = ([pre, transmitter, post, prediction]: [string, string, string, string]): Cell[] => {
    const cells = Array.from({ length: 17 }, (): Cell => null);
    cells[0] = pre;
    cells[1] = transmitter === '0' ? 0 : transmitter;
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
  it('keys predictions by Cook edge, keeps each source transmitter, and counts what it ignores', () => {
    const read = readFenyves(
      sheet([
        ['AWCL', 'Glu', 'AIYL', '-'],
        ['VB01', 'ACh', 'DD01', 'complex'],
        ['AIYL', 'ACh', 'AWCL', '+'],
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
    expect(read.transmitters).toEqual(
      new Map([
        ['AWCL', 'Glu'],
        ['VB1', 'ACh'],
        ['AIYL', 'ACh'],
      ]),
    );
    expect(read.ignoredRows).toEqual([edgeKey('AIYL', 'AWCL')]);
    expect(read.absentNeurons).toEqual(['AIBL', 'AVFL', 'RIML']);
  });

  it('skips wholly blank rows but refuses a row with cells and no source', () => {
    const rows = sheet([['AWCL', 'Glu', 'AIYL', '-']]);
    expect(readFenyves([...rows, [], [null, null]], 'S1', neurons, edges).predictions.size).toBe(1);
    expect(() => readFenyves([...rows, [null, 'Glu', null, 'AIYL']], 'S1', neurons, edges)).toThrow(/without a source/);
  });

  it('refuses unknown neurons and labels, repeated edges, shifting transmitters and an empty sheet', () => {
    const refuse = (rows: [string, string, string, string][], message: RegExp) =>
      expect(() => readFenyves(sheet(rows), 'S1', neurons, edges)).toThrow(message);
    refuse([['XYZ', 'Glu', 'AIYL', '+']], /unknown neuron XYZ/);
    refuse([['AWCL', 'Glu', 'AIYL', 'maybe']], /unknown prediction/);
    refuse(
      [
        ['AWCL', 'Glu', 'AIYL', '+'],
        ['AWCL', 'Glu', 'AIYL', '+'],
      ],
      /listed twice/,
    );
    refuse(
      [
        ['AWCL', 'Glu', 'AIYL', '+'],
        ['AWCL', 'ACh', 'AIBL', '+'],
      ],
      /transmitter changes/,
    );
    refuse([['AIYL', 'ACh', 'AWCL', '+']], /no predictions/);
  });
});

describe('csvFields and parseOverrides', () => {
  it('splits quoted fields with commas and doubled quotes', () => {
    expect(csvFields('a,"b, ""c""",,d')).toEqual(['a', 'b, "c"', '', 'd']);
  });

  it('refuses text after a closing quote, an unclosed quote and a stray quote', () => {
    expect(() => csvFields('a,"b"c')).toThrow(/after a closing quote/);
    expect(() => csvFields('a,"b')).toThrow(/unclosed/);
    expect(() => csvFields('a,b"c')).toThrow(/quote inside/);
  });

  const header = 'pre,post,sign,citation,evidence';
  it('reads a row with quoted evidence, whatever the line endings', () => {
    const [override] = parseOverrides(`${header}\r\nAWCL,AIYL,-1,chalasani2007,"""inhibits AIY"", via chloride"\r\n`);
    expect(override).toEqual({
      pre: 'AWCL',
      post: 'AIYL',
      sign: -1,
      citation: 'chalasani2007',
      evidence: '"inhibits AIY", via chloride',
    });
  });

  it('refuses unquoted commas in the evidence, an override without a citation and a wrong header', () => {
    expect(() => parseOverrides(`${header}\nAWCL,AIBL,1,chalasani2007,activates AIB, via AMPA\n`)).toThrow(/6 fields/);
    expect(() => parseOverrides(`${header}\nAWCL,AIYL,-1,,why\n`)).toThrow(/citation/);
    expect(() => parseOverrides('pre,post,sign\n')).toThrow(/header/);
  });
});

describe('signChemical', () => {
  const fenyves = (predictions: [string, Prediction][], transmitters: [string, string | null][]): FenyvesSheet => ({
    label: 'test',
    predictions: new Map(predictions),
    transmitters: new Map(transmitters),
    ignoredRows: [],
    absentNeurons: [],
  });
  const identities = new Map([
    ['AWCL', ['Glu']],
    ['VB1', ['ACh']],
    ['RIML', ['Glu', 'tyramine']],
    ['DD1', ['GABA']],
    ['AVFL', []],
    ['AIYL', ['ACh']],
  ]);
  const ruleSign = new Map<string, 1 | -1 | null>([
    ['AWCL', 1],
    ['VB1', 1],
    ['RIML', 1],
    ['DD1', -1],
    ['AVFL', null],
    ['AIYL', 1],
  ]);
  const chemical = [
    { pre: 'AWCL', post: 'AIYL', sections: 22 },
    { pre: 'AWCL', post: 'AIBL', sections: 12 },
    { pre: 'VB1', post: 'DD1', sections: 3 },
    { pre: 'RIML', post: 'AIBL', sections: 1 },
    { pre: 'AVFL', post: 'AIBL', sections: 2 },
  ];
  const inputs = (sheets: FenyvesSheet[], overrides: SignInputs['overrides'] = []): SignInputs => ({
    identities,
    ruleSign,
    fenyves: sheets,
    overrides,
  });
  const summary = (signed: ReturnType<typeof signChemical>) =>
    signed.chemical.map((c) => [`${c.pre}>${c.post}`, c.sign, c.signSource]);

  it('takes physiology first, then expression, then the rule, then nothing', () => {
    const sheets = [
      fenyves(
        [
          [edgeKey('AWCL', 'AIYL'), '+'],
          [edgeKey('AWCL', 'AIBL'), '+'],
          [edgeKey('VB1', 'DD1'), 'complex'],
          [edgeKey('RIML', 'AIBL'), 'no pred'],
        ],
        [
          ['AWCL', 'Glu'],
          ['VB1', 'ACh'],
          ['RIML', 'Glu'],
        ],
      ),
    ];
    // The override contradicts Fenyves, so only the physiology step can give −1 here.
    const override = { pre: 'AWCL', post: 'AIYL', sign: -1 as const, citation: 'chalasani2007', evidence: 'x' };
    const signed = signChemical(chemical, inputs(sheets, [override]));
    expect(summary(signed)).toEqual([
      ['AWCL>AIYL', -1, 'physiology'],
      ['AWCL>AIBL', 1, 'expression'],
      ['VB1>DD1', 1, 'rule'],
      ['RIML>AIBL', 1, 'rule'],
      ['AVFL>AIBL', 0, 'none'],
    ]);
    expect(signed.chemical[0].citation).toBe('chalasani2007');
  });

  it("sets aside a Fenyves sign whose transmitter is not one of the cell's Wang identities", () => {
    const sheets = [
      fenyves(
        [
          [edgeKey('AVFL', 'AIBL'), '-'],
          [edgeKey('RIML', 'AIBL'), '+'],
        ],
        [
          ['AVFL', 'GABA'],
          ['RIML', 'Glu'],
        ],
      ),
    ];
    const signed = signChemical(chemical, inputs(sheets));
    expect(signed.setAside).toEqual([{ pre: 'AVFL', post: 'AIBL', sections: 2, sign: -1, transmitter: 'GABA' }]);
    expect(summary(signed).slice(3)).toEqual([
      ['RIML>AIBL', 1, 'expression'],
      ['AVFL>AIBL', 0, 'none'],
    ]);
  });

  it('refuses files that disagree, even on an overridden edge', () => {
    const disagreeing = [
      fenyves([[edgeKey('AWCL', 'AIYL'), '+']], [['AWCL', 'Glu']]),
      fenyves([[edgeKey('AWCL', 'AIYL'), '-']], [['AWCL', 'Glu']]),
    ];
    const override = { pre: 'AWCL', post: 'AIYL', sign: -1 as const, citation: 'c', evidence: 'e' };
    expect(() => signChemical(chemical, inputs(disagreeing, [override]))).toThrow(/disagree/);
  });

  it('refuses an override on an edge Cook lacks, and an edge overridden twice', () => {
    const stray = { pre: 'AIYL', post: 'AWCL', sign: 1 as const, citation: 'c', evidence: 'e' };
    expect(() => signChemical(chemical, inputs([], [stray]))).toThrow(/does not have/);
    const twice = { pre: 'AWCL', post: 'AIYL', sign: -1 as const, citation: 'c', evidence: 'e' };
    expect(() => signChemical(chemical, inputs([], [twice, twice]))).toThrow(/twice/);
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
