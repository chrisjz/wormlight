// Synapse signs (PLAN §2.4 and §4.4). Pure functions over parsed inputs, so the rules can be tested
// without any file.

import type { Chemical, MuscleSignSource, Sign, SignSource } from '../../src/data/schema.ts';
import type { Cell } from './xlsx.ts';

export type Prediction = '+' | '-' | 'complex' | 'no pred';
const PREDICTIONS: readonly string[] = ['+', '-', 'complex', 'no pred'];

// Cook writes ventral-cord motor neurons zero-padded (VB01); the export uses VB1.
export function unpad(name: string): string {
  const match = /^(AS|DA|DB|DD|VA|VB|VC|VD)0*(\d+)$/.exec(name.trim());
  return match ? `${match[1]}${Number(match[2])}` : name.trim();
}

export const edgeKey = (pre: string, post: string): string => `${pre}>${post}`;

export interface FenyvesSheet {
  label: string;
  // Predicted polarity by edge key, for the rows that are Cook edges.
  predictions: Map<string, Prediction>;
  // Rows naming an edge Cook does not have: counted, and otherwise ignored.
  ignoredRows: string[];
  // The export's neurons that no row of the sheet names.
  absentNeurons: string[];
}

// Read a Fenyves et al. 2020 "5. Sign prediction" sheet: rows from the third on, with the source neuron
// in column A, the target in column D, the edge type in column F and the predicted polarity in column Q.
export function readFenyves(rows: Cell[][], label: string, neurons: Set<string>, edges: Set<string>): FenyvesSheet {
  const predictions = new Map<string, Prediction>();
  const ignoredRows: string[] = [];
  const named = new Set<string>();
  for (const [i, row] of rows.entries()) {
    if (i < 2 || row[0] === null || row[0] === undefined) continue;
    const where = `${label} row ${i + 1}`;
    const pre = unpad(String(row[0]));
    const post = unpad(String(row[3]));
    for (const name of [pre, post]) {
      if (!neurons.has(name)) throw new Error(`${where}: unknown neuron ${name}`);
      named.add(name);
    }
    if (row[5] !== 'chemical') throw new Error(`${where}: edge type ${String(row[5])}, expected chemical`);
    const prediction = String(row[16]);
    if (!PREDICTIONS.includes(prediction)) throw new Error(`${where}: unknown prediction ${prediction}`);
    const key = edgeKey(pre, post);
    if (!edges.has(key)) {
      ignoredRows.push(key);
      continue;
    }
    if (predictions.has(key)) throw new Error(`${where}: ${key} listed twice`);
    predictions.set(key, prediction as Prediction);
  }
  const absentNeurons = [...neurons].filter((n) => !named.has(n)).sort();
  return { label, predictions, ignoredRows: ignoredRows.sort(), absentNeurons };
}

export interface Override {
  pre: string;
  post: string;
  sign: 1 | -1;
  citation: string;
  evidence: string;
}

// Parse data/sign-overrides.csv: a header, then one quoted-CSV row per overridden edge.
export function parseOverrides(csv: string): Override[] {
  const rows = csv
    .trim()
    .split('\n')
    .map((line) =>
      [...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)].map((m) => m[1].replace(/^"|"$/g, '').replaceAll('""', '"')),
    );
  const header = rows.shift()?.join(',');
  if (header !== 'pre,post,sign,citation,evidence') throw new Error(`sign-overrides.csv: unexpected header ${header}`);
  return rows.map(([pre, post, sign, citation, evidence], i) => {
    if (sign !== '1' && sign !== '-1') throw new Error(`sign-overrides.csv row ${i + 2}: sign ${sign}`);
    if (!citation || !evidence)
      throw new Error(`sign-overrides.csv row ${i + 2}: every override needs a citation and evidence`);
    return { pre, post, sign: Number(sign) as 1 | -1, citation, evidence };
  });
}

export interface SignInputs {
  // Each neuron's sign under the transmitter rule (ACh and Glu +, GABA −), or null.
  ruleSign: Map<string, 1 | -1 | null>;
  fenyves: FenyvesSheet[];
  overrides: Override[];
}

// The two files agree wherever both give a sign; a disagreement is an error, not a choice.
function fenyvesSign(key: string, sheets: FenyvesSheet[]): 1 | -1 | null {
  const signs = new Set(sheets.map((s) => s.predictions.get(key)).filter((p) => p === '+' || p === '-'));
  if (signs.size > 1) throw new Error(`Fenyves files disagree on ${key}`);
  const [sign] = signs;
  return sign === undefined ? null : sign === '+' ? 1 : -1;
}

// Sign every chemical connection from the first step that gives one: cited physiology, then Fenyves's
// expression-based prediction, then the transmitter rule, else no fast effect.
export function signChemical(edges: { pre: string; post: string; sections: number }[], inputs: SignInputs): Chemical[] {
  const overrides = new Map(inputs.overrides.map((o) => [edgeKey(o.pre, o.post), o]));
  const keys = new Set(edges.map((e) => edgeKey(e.pre, e.post)));
  for (const key of overrides.keys())
    if (!keys.has(key)) throw new Error(`sign override for ${key}, which Cook does not have`);
  if (overrides.size !== inputs.overrides.length) throw new Error('sign-overrides.csv lists an edge twice');

  return edges.map(({ pre, post, sections }) => {
    const key = edgeKey(pre, post);
    const override = overrides.get(key);
    if (override)
      return { pre, post, sections, sign: override.sign, signSource: 'physiology', citation: override.citation };
    const expression = fenyvesSign(key, inputs.fenyves);
    if (expression !== null) return { pre, post, sections, sign: expression, signSource: 'expression' };
    const rule = inputs.ruleSign.get(pre) ?? null;
    if (rule !== null) return { pre, post, sections, sign: rule, signSource: 'rule' };
    return { pre, post, sections, sign: 0, signSource: 'none' };
  });
}

// Body wall muscle responds through acetylcholine and GABA receptors (Richmond & Jorgensen 1999), so a
// cell's primary release identity decides: acetylcholine excites, GABA inhibits, anything else has no
// fast effect on muscle.
export function signNeuromuscular(primary: string | undefined): { sign: Sign; signSource: MuscleSignSource } {
  if (primary === 'ACh') return { sign: 1, signSource: 'receptor' };
  if (primary === 'GABA') return { sign: -1, signSource: 'receptor' };
  return { sign: 0, signSource: 'none' };
}

export function countBySource(chemical: Chemical[]): Record<SignSource, { connections: number; sections: number }> {
  const out = {
    physiology: { connections: 0, sections: 0 },
    expression: { connections: 0, sections: 0 },
    rule: { connections: 0, sections: 0 },
    none: { connections: 0, sections: 0 },
  };
  for (const c of chemical) {
    out[c.signSource].connections += 1;
    out[c.signSource].sections += c.sections;
  }
  return out;
}
