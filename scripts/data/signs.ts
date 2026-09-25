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
  // The primary transmitter Fenyves assigns each presynaptic neuron (column B), or null for none.
  transmitters: Map<string, string | null>;
  // Rows naming an edge Cook does not have: counted, and otherwise ignored.
  ignoredRows: string[];
  // The export's neurons that no row of the sheet names.
  absentNeurons: string[];
}

const isBlank = (cell: Cell | undefined): boolean => cell === null || cell === undefined || cell === '';

// Read a Fenyves et al. 2020 "5. Sign prediction" sheet: rows from the third on, with the source neuron
// in column A, its primary transmitter in column B, the target in column D, the edge type in column F and
// the predicted polarity in column Q. Wholly blank rows are skipped; a row with cells but no source is an
// error, and so is a sheet that yields no prediction at all.
export function readFenyves(rows: Cell[][], label: string, neurons: Set<string>, edges: Set<string>): FenyvesSheet {
  const predictions = new Map<string, Prediction>();
  const transmitters = new Map<string, string | null>();
  const ignoredRows: string[] = [];
  const named = new Set<string>();
  for (const [i, row] of rows.entries()) {
    if (i < 2) continue;
    const where = `${label} row ${i + 1}`;
    if (isBlank(row[0])) {
      if (row.some((cell) => !isBlank(cell))) throw new Error(`${where}: cells without a source neuron`);
      continue;
    }
    const pre = unpad(String(row[0]));
    const post = unpad(String(row[3]));
    for (const name of [pre, post]) {
      if (!neurons.has(name)) throw new Error(`${where}: unknown neuron ${name}`);
      named.add(name);
    }
    const transmitter = row[1] === 0 || isBlank(row[1]) ? null : String(row[1]);
    if (transmitters.has(pre) && transmitters.get(pre) !== transmitter) {
      throw new Error(`${where}: ${pre}'s transmitter changes from ${transmitters.get(pre)} to ${transmitter}`);
    }
    transmitters.set(pre, transmitter);
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
  if (predictions.size === 0) throw new Error(`${label}: no predictions read`);
  const absentNeurons = [...neurons].filter((n) => !named.has(n)).sort();
  return { label, predictions, transmitters, ignoredRows: ignoredRows.sort(), absentNeurons };
}

export interface Override {
  pre: string;
  post: string;
  sign: 1 | -1;
  citation: string;
  evidence: string;
}

// Split one CSV line into fields, honouring quoted fields with doubled quotes. Text after a closing
// quote, or an unclosed quote, is an error rather than a silently shortened field.
export function csvFields(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  for (;;) {
    let field = '';
    if (line[i] === '"') {
      i += 1;
      for (;;) {
        if (i >= line.length) throw new Error(`unclosed quote in "${line}"`);
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        field += line[i];
        i += 1;
      }
      if (i < line.length && line[i] !== ',') throw new Error(`text after a closing quote in "${line}"`);
    } else {
      const end = line.indexOf(',', i);
      field = line.slice(i, end < 0 ? line.length : end);
      if (field.includes('"')) throw new Error(`a quote inside an unquoted field in "${line}"`);
      i = end < 0 ? line.length : end;
    }
    fields.push(field);
    if (i >= line.length) return fields;
    i += 1;
  }
}

const OVERRIDE_HEADER = ['pre', 'post', 'sign', 'citation', 'evidence'];

// Parse data/sign-overrides.csv: a header, then one row of exactly five fields per overridden edge.
export function parseOverrides(csv: string): Override[] {
  const [header, ...lines] = csv.replaceAll('\r\n', '\n').trim().split('\n');
  if (csvFields(header).join(',') !== OVERRIDE_HEADER.join(',')) {
    throw new Error(`sign-overrides.csv: the header must be ${OVERRIDE_HEADER.join(',')}`);
  }
  return lines.map((line, i) => {
    const where = `sign-overrides.csv row ${i + 2}`;
    const fields = csvFields(line);
    if (fields.length !== OVERRIDE_HEADER.length) throw new Error(`${where}: ${fields.length} fields, expected 5`);
    const [pre, post, sign, citation, evidence] = fields;
    if (sign !== '1' && sign !== '-1') throw new Error(`${where}: sign ${sign}`);
    if (!citation || !evidence) throw new Error(`${where}: every override needs a citation and evidence`);
    return { pre, post, sign: Number(sign) as 1 | -1, citation, evidence };
  });
}

export interface SignInputs {
  // Each neuron's release identities (Wang et al. 2024), and its sign under the transmitter rule
  // (ACh and Glu +, GABA −), or null.
  identities: Map<string, string[]>;
  ruleSign: Map<string, 1 | -1 | null>;
  fenyves: FenyvesSheet[];
  overrides: Override[];
}

// A Fenyves sign that the build did not use, because the transmitter it rests on is not one of the
// presynaptic cell's identities in Wang et al. 2024.
export interface SetAside {
  pre: string;
  post: string;
  sections: number;
  sign: 1 | -1;
  transmitter: string | null;
}

// The two files agree wherever both give a sign; a disagreement is an error, not a choice.
function fenyvesSign(key: string, sheets: FenyvesSheet[]): 1 | -1 | null {
  const signs = new Set(sheets.map((s) => s.predictions.get(key)).filter((p) => p === '+' || p === '-'));
  if (signs.size > 1) throw new Error(`Fenyves files disagree on ${key}`);
  const [sign] = signs;
  return sign === undefined ? null : sign === '+' ? 1 : -1;
}

// Fenyves's transmitter for a presynaptic cell; the two files must agree on it too.
function fenyvesTransmitter(pre: string, sheets: FenyvesSheet[]): string | null {
  const named = new Set(sheets.filter((s) => s.transmitters.has(pre)).map((s) => s.transmitters.get(pre) ?? null));
  if (named.size > 1) throw new Error(`Fenyves files disagree on ${pre}'s transmitter`);
  const [transmitter] = named;
  return transmitter ?? null;
}

// Sign every chemical connection from the first step that gives one: cited physiology; Fenyves's
// expression-based prediction, where the transmitter it rests on is one of the cell's Wang identities;
// the transmitter rule; else no fast effect.
export function signChemical(
  edges: { pre: string; post: string; sections: number }[],
  inputs: SignInputs,
): { chemical: Chemical[]; setAside: SetAside[] } {
  const overrides = new Map(inputs.overrides.map((o) => [edgeKey(o.pre, o.post), o]));
  const keys = new Set(edges.map((e) => edgeKey(e.pre, e.post)));
  for (const key of overrides.keys()) {
    if (!keys.has(key)) throw new Error(`sign override for ${key}, which Cook does not have`);
  }
  if (overrides.size !== inputs.overrides.length) throw new Error('sign-overrides.csv lists an edge twice');

  const setAside: SetAside[] = [];
  const chemical = edges.map(({ pre, post, sections }): Chemical => {
    const key = edgeKey(pre, post);
    // Checked on every edge, overridden or not, so that the files' agreement is enforced everywhere.
    const expression = fenyvesSign(key, inputs.fenyves);
    const override = overrides.get(key);
    if (override) {
      return { pre, post, sections, sign: override.sign, signSource: 'physiology', citation: override.citation };
    }
    if (expression !== null) {
      const transmitter = fenyvesTransmitter(pre, inputs.fenyves);
      if (transmitter !== null && (inputs.identities.get(pre) ?? []).includes(transmitter)) {
        return { pre, post, sections, sign: expression, signSource: 'expression' };
      }
      setAside.push({ pre, post, sections, sign: expression, transmitter });
    }
    const rule = inputs.ruleSign.get(pre) ?? null;
    if (rule !== null) return { pre, post, sections, sign: rule, signSource: 'rule' };
    return { pre, post, sections, sign: 0, signSource: 'none' };
  });
  return { chemical, setAside };
}

// Body wall muscle responds through acetylcholine and GABA receptors (Richmond & Jorgensen 1999), so the
// presynaptic cell's first-listed release identity decides: acetylcholine excites, GABA inhibits, anything
// else has no fast effect on muscle. The first-listed identity is the one the transmitter rule reads.
export function signNeuromuscular(first: string | undefined): { sign: Sign; signSource: MuscleSignSource } {
  if (first === 'ACh') return { sign: 1, signSource: 'receptor' };
  if (first === 'GABA') return { sign: -1, signSource: 'receptor' };
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
