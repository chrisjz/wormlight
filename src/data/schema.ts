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
  // Fraction of body length from the nose (0) to the tail tip (1), measured along the reconstruction's
  // anteroposterior (y) axis. The reconstruction is posed with a bend, so this is a projection.
  s: number;
  // The soma in the WormBase Virtual Worm's own frame, in µm: x is positive to the animal's left and y runs
  // from nose to tail. z is dorsal at the nose, but the posed bend turns it along the body, so it is not a
  // dorsoventral coordinate away from the head.
  reconstructionUm: [x: number, y: number, z: number];
  source: 'c302';
}

// Where a neuron senses: at its dendrite tip, along its process, or not at all.
export type Sensing = { kind: 'tip'; s: number } | { kind: 'field'; s0: number; s1: number } | { kind: 'none' };

export interface Neuron {
  name: string;
  class: CellClass;
  // Release identities from Wang et al. 2024, in the order Quantum Nematode reads the atlas's columns.
  // The transmitter rule and the muscle rule read the first.
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
  // The source each sign rule draws on: Fenyves's predictions; the Wang identities to which Wormlight
  // applies its own transmitter rule; the muscle receptors that set neuromuscular signs.
  signBasis: { expression: string; ruleIdentities: string; receptor: string };
  // Every quadrant on one grid of 24 slots, the 23-cell ventral-left quadrant's last cell covering two.
  muscleSpacing: 'shared-grid';
  // A reference for every citation id used in this file.
  citations: Record<string, string>;
  // The licence of each dataset this file draws on, as an SPDX id; the attributions are in `notice`.
  licences: { dataset: string; spdx: string }[];
  notice: 'NOTICE.md';
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

function text(value: unknown, where: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fail(`${where} is not a non-empty string`);
}

function fraction(value: unknown, where: string): number {
  return typeof value === 'number' && value >= 0 && value <= 1 ? value : fail(`${where} is not a fraction in [0, 1]`);
}

function count(value: unknown, where: string): number {
  return Number.isInteger(value) && (value as number) > 0
    ? (value as number)
    : fail(`${where} is not a positive count`);
}

function unique(seen: Set<string>, key: string, where: string): void {
  if (seen.has(key)) fail(`${where} repeats ${key}`);
  seen.add(key);
}

function validateMeta(meta: unknown): Set<string> {
  if (!isRecord(meta) || meta.schema !== SCHEMA) fail(`meta.schema is not ${SCHEMA}`);
  const citations = meta.citations;
  if (!isRecord(citations)) fail('meta.citations is missing');
  for (const [id, reference] of Object.entries(citations)) text(reference, `meta.citations.${id}`);
  const cited = new Set(Object.keys(citations));
  const basis = meta.signBasis;
  if (!isRecord(basis)) fail('meta.signBasis is missing');
  for (const key of ['expression', 'ruleIdentities', 'receptor']) {
    if (!cited.has(text(basis[key], `meta.signBasis.${key}`))) fail(`meta.signBasis.${key} cites an unknown id`);
  }
  if (meta.muscleSpacing !== 'shared-grid') fail('meta.muscleSpacing is not shared-grid');
  if (meta.notice !== 'NOTICE.md') fail('meta.notice does not point to NOTICE.md');
  for (const [i, licence] of list(meta.licences, 'meta.licences').entries()) {
    if (!isRecord(licence)) fail(`meta.licences[${i}] is malformed`);
    text(licence.dataset, `meta.licences[${i}].dataset`);
    text(licence.spdx, `meta.licences[${i}].spdx`);
  }
  if (list(meta.licences, 'meta.licences').length === 0) fail('meta.licences is empty');
  for (const [i, source] of list(meta.sources, 'meta.sources').entries()) {
    if (!isRecord(source) || typeof source.id !== 'string' || !/^[0-9a-f]{64}$/.test(String(source.sha256))) {
      fail(`meta.sources[${i}] needs an id and a SHA-256`);
    }
  }
  return cited;
}

// Check that `value` is a well-formed runtime file and return it typed. Throws a DataError naming the
// first problem: a missing field, a value out of range, a repeated element, a citation that resolves to
// nothing, or a connection to an unknown cell.
export function validateWormlightData(value: unknown): WormlightData {
  if (!isRecord(value)) fail('the data file is not an object');
  const cited = validateMeta(value.meta);

  const neurons = new Set<string>();
  for (const [i, n] of list(value.neurons, 'neurons').entries()) {
    const where = `neurons[${i}]`;
    if (!isRecord(n)) fail(`${where} is malformed`);
    unique(neurons, text(n.name, `${where}.name`), 'neurons');
    if (!CLASSES.includes(n.class as string)) fail(`${where} has class ${String(n.class)}`);
    if (!list(n.transmitters, `${where}.transmitters`).every((t) => typeof t === 'string')) {
      fail(`${where}.transmitters holds a non-string`);
    }
    const p = n.position;
    const coordinates = isRecord(p) ? p.reconstructionUm : undefined;
    if (
      !isRecord(p) ||
      p.source !== 'c302' ||
      !Array.isArray(coordinates) ||
      coordinates.length !== 3 ||
      !coordinates.every((c) => typeof c === 'number' && Number.isFinite(c))
    ) {
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
  const slots = new Set<string>();
  for (const [i, m] of list(value.muscles, 'muscles').entries()) {
    const where = `muscles[${i}]`;
    if (!isRecord(m)) fail(`${where} is malformed`);
    unique(muscles, text(m.name, `${where}.name`), 'muscles');
    if (!QUADRANTS.includes(m.quadrant as string)) fail(`${where} has quadrant ${String(m.quadrant)}`);
    unique(slots, `${String(m.quadrant)}${count(m.index, `${where}.index`)}`, 'muscle positions');
    if (fraction(m.s0, `${where}.s0`) >= fraction(m.s1, `${where}.s1`)) fail(`${where} covers no body`);
  }

  const chemical = new Set<string>();
  for (const [i, c] of list(value.chemical, 'chemical').entries()) {
    const where = `chemical[${i}]`;
    if (!isRecord(c) || !neurons.has(c.pre as string) || !neurons.has(c.post as string)) {
      fail(`${where} joins unknown neurons`);
    }
    unique(chemical, `${String(c.pre)}>${String(c.post)}`, 'chemical');
    count(c.sections, `${where}.sections`);
    if (!SIGNS.includes(c.sign) || !SIGN_SOURCES.includes(c.signSource as string)) fail(`${where} has a bad sign`);
    if ((c.signSource === 'none') !== (c.sign === 0)) {
      fail(`${where} has sign ${String(c.sign)} from ${String(c.signSource)}`);
    }
    if (c.signSource === 'physiology') {
      if (!cited.has(text(c.citation, `${where}.citation`))) fail(`${where} cites an unknown id`);
    } else if (c.citation !== undefined) fail(`${where} must cite a source only when its sign comes from physiology`);
  }

  const gap = new Set<string>();
  for (const [i, g] of list(value.gap, 'gap').entries()) {
    const where = `gap[${i}]`;
    if (!isRecord(g) || !neurons.has(g.a as string) || !neurons.has(g.b as string)) {
      fail(`${where} joins unknown neurons`);
    }
    if ((g.a as string) >= (g.b as string)) fail(`${where} is not in canonical order`);
    unique(gap, `${String(g.a)}|${String(g.b)}`, 'gap');
    count(g.sections, `${where}.sections`);
  }

  const neuromuscular = new Set<string>();
  for (const [i, j] of list(value.neuromuscular, 'neuromuscular').entries()) {
    const where = `neuromuscular[${i}]`;
    if (!isRecord(j) || !neurons.has(j.pre as string) || !muscles.has(j.muscle as string)) {
      fail(`${where} joins an unknown neuron or muscle`);
    }
    unique(neuromuscular, `${String(j.pre)}>${String(j.muscle)}`, 'neuromuscular');
    count(j.sections, `${where}.sections`);
    if (!SIGNS.includes(j.sign) || !MUSCLE_SIGN_SOURCES.includes(j.signSource as string)) {
      fail(`${where} has a bad sign`);
    }
    if ((j.signSource === 'none') !== (j.sign === 0)) {
      fail(`${where} has sign ${String(j.sign)} from ${String(j.signSource)}`);
    }
  }

  return value as unknown as WormlightData;
}
