// The runtime data file, public/data/wormlight.v1.json: its types and a validator.
// The data build writes it; the app and the tests read it through validateWormlightData.

export const SCHEMA = 'wormlight/1';

export type CellClass = 'sensory' | 'interneuron' | 'motor' | 'pharyngeal';
export type Sign = 1 | -1 | 0;

// Where a chemical connection's sign comes from, in the order the build tries them (PLAN §2.4).
export type SignSource = 'physiology' | 'expression' | 'rule' | 'none';
// Where a neuromuscular connection's sign comes from (PLAN §4.4).
export type MuscleSignSource = 'receptor' | 'none';
export type OscillatorClass = 'A' | 'B' | 'headSwitch';
export type Quadrant = 'DL' | 'DR' | 'VL' | 'VR';

export interface Position {
  // Fraction of body length: 0 at the nose, 1 at the tail tip.
  s: number;
  // Soma coordinates in µm in the reconstruction's frame: positive to the animal's left, and dorsal.
  lateralUm: number;
  dorsalUm: number;
  source: 'c302';
}

// Where a neuron senses: at its dendrite tip, along its process, or not at all.
export type Sensing = { kind: 'tip'; s: number } | { kind: 'field'; s0: number; s1: number } | { kind: 'none' };

export interface Neuron {
  name: string;
  class: CellClass;
  // Release identities, primary first (Wang et al. 2024).
  transmitters: string[];
  position: Position;
  sensing: Sensing;
  oscillator: OscillatorClass | null;
}

export interface Muscle {
  name: string;
  quadrant: Quadrant;
  // Position in its quadrant, counted from the head.
  index: number;
  // The stretch of body it covers, as fractions of body length.
  s0: number;
  s1: number;
}

export interface Chemical {
  pre: string;
  post: string;
  sections: number;
  sign: Sign;
  signSource: SignSource;
  // Present only for physiology signs, which come from individual papers.
  citation?: string;
}

export interface Gap {
  a: string;
  b: string;
  sections: number;
}

export interface Neuromuscular {
  pre: string;
  muscle: string;
  sections: number;
  sign: Sign;
  signSource: MuscleSignSource;
}

export interface Meta {
  schema: typeof SCHEMA;
  // The citation behind each sign source that has a single one.
  signCitations: { expression: string; rule: string; receptor: string };
  muscleSpacing: 'even';
  // Every pinned input, by digest.
  sources: { id: string; sha256: string }[];
}

export interface WormlightData {
  meta: Meta;
  neurons: Neuron[];
  muscles: Muscle[];
  chemical: Chemical[];
  gap: Gap[];
  neuromuscular: Neuromuscular[];
}

const CLASSES: readonly string[] = ['sensory', 'interneuron', 'motor', 'pharyngeal'];
const SIGNS: readonly unknown[] = [1, -1, 0];
const SIGN_SOURCES: readonly string[] = ['physiology', 'expression', 'rule', 'none'];
const MUSCLE_SIGN_SOURCES: readonly string[] = ['receptor', 'none'];
const OSCILLATORS: readonly unknown[] = ['A', 'B', 'headSwitch', null];
const QUADRANTS: readonly string[] = ['DL', 'DR', 'VL', 'VR'];

class DataError extends Error {
  override name = 'DataError';
}

function fail(message: string): never {
  throw new DataError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function list(value: unknown, where: string): unknown[] {
  return Array.isArray(value) ? value : fail(`${where} is not a list`);
}

function fraction(value: unknown, where: string): number {
  return typeof value === 'number' && value >= 0 && value <= 1 ? value : fail(`${where} is not a fraction in [0, 1]`);
}

function count(value: unknown, where: string): number {
  return Number.isInteger(value) && (value as number) > 0
    ? (value as number)
    : fail(`${where} is not a positive count`);
}

// Check that `value` is a well-formed runtime file and return it typed. Throws a DataError naming
// the first problem: a missing field, a value out of range, or a connection to an unknown cell.
export function validateWormlightData(value: unknown): WormlightData {
  if (!isRecord(value)) fail('the data file is not an object');
  const meta = value.meta;
  if (!isRecord(meta) || meta.schema !== SCHEMA) fail(`meta.schema is not ${SCHEMA}`);

  const neurons = new Set<string>();
  for (const [i, n] of list(value.neurons, 'neurons').entries()) {
    const where = `neurons[${i}]`;
    if (!isRecord(n) || typeof n.name !== 'string') fail(`${where} has no name`);
    if (neurons.has(n.name)) fail(`${where} repeats ${n.name}`);
    neurons.add(n.name);
    if (!CLASSES.includes(n.class as string)) fail(`${where} has class ${String(n.class)}`);
    if (!list(n.transmitters, `${where}.transmitters`).every((t) => typeof t === 'string')) {
      fail(`${where}.transmitters holds a non-string`);
    }
    const p = n.position;
    if (!isRecord(p) || typeof p.lateralUm !== 'number' || typeof p.dorsalUm !== 'number' || p.source !== 'c302') {
      fail(`${where}.position is malformed`);
    }
    fraction(p.s, `${where}.position.s`);
    const sensing = n.sensing;
    if (!isRecord(sensing)) fail(`${where}.sensing is missing`);
    if (sensing.kind === 'tip') fraction(sensing.s, `${where}.sensing.s`);
    else if (sensing.kind === 'field') {
      if (fraction(sensing.s0, `${where}.sensing.s0`) > fraction(sensing.s1, `${where}.sensing.s1`)) {
        fail(`${where}.sensing runs backwards`);
      }
    } else if (sensing.kind !== 'none') fail(`${where}.sensing.kind is ${String(sensing.kind)}`);
    if (!OSCILLATORS.includes(n.oscillator)) fail(`${where}.oscillator is ${String(n.oscillator)}`);
  }

  const muscles = new Set<string>();
  for (const [i, m] of list(value.muscles, 'muscles').entries()) {
    const where = `muscles[${i}]`;
    if (!isRecord(m) || typeof m.name !== 'string') fail(`${where} has no name`);
    if (muscles.has(m.name)) fail(`${where} repeats ${m.name}`);
    muscles.add(m.name);
    if (!QUADRANTS.includes(m.quadrant as string)) fail(`${where} has quadrant ${String(m.quadrant)}`);
    count(m.index, `${where}.index`);
    if (fraction(m.s0, `${where}.s0`) >= fraction(m.s1, `${where}.s1`)) fail(`${where} covers no body`);
  }

  for (const [i, c] of list(value.chemical, 'chemical').entries()) {
    const where = `chemical[${i}]`;
    if (!isRecord(c) || !neurons.has(c.pre as string) || !neurons.has(c.post as string)) {
      fail(`${where} joins unknown neurons`);
    }
    count(c.sections, `${where}.sections`);
    if (!SIGNS.includes(c.sign) || !SIGN_SOURCES.includes(c.signSource as string)) fail(`${where} has a bad sign`);
    if ((c.signSource === 'none') !== (c.sign === 0))
      fail(`${where} has sign ${String(c.sign)} from ${String(c.signSource)}`);
    if ((c.signSource === 'physiology') !== (typeof c.citation === 'string')) {
      fail(`${where} must cite a source exactly when its sign comes from physiology`);
    }
  }

  for (const [i, g] of list(value.gap, 'gap').entries()) {
    const where = `gap[${i}]`;
    if (!isRecord(g) || !neurons.has(g.a as string) || !neurons.has(g.b as string))
      fail(`${where} joins unknown neurons`);
    if ((g.a as string) >= (g.b as string)) fail(`${where} is not in canonical order`);
    count(g.sections, `${where}.sections`);
  }

  for (const [i, j] of list(value.neuromuscular, 'neuromuscular').entries()) {
    const where = `neuromuscular[${i}]`;
    if (!isRecord(j) || !neurons.has(j.pre as string) || !muscles.has(j.muscle as string)) {
      fail(`${where} joins an unknown neuron or muscle`);
    }
    count(j.sections, `${where}.sections`);
    if (!SIGNS.includes(j.sign) || !MUSCLE_SIGN_SOURCES.includes(j.signSource as string))
      fail(`${where} has a bad sign`);
    if ((j.signSource === 'none') !== (j.sign === 0))
      fail(`${where} has sign ${String(j.sign)} from ${String(j.signSource)}`);
  }

  return value as unknown as WormlightData;
}
