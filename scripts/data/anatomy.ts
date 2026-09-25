// Where each neuron sits, where it senses, which rhythm generator it carries, and which stretch of body
// each muscle covers.

import type { Muscle, OscillatorClass, Position, Quadrant, Sensing } from '../../src/data/schema.ts';
import type { Morphology } from './nml.ts';

const round = (value: number, places: number): number => Number(value.toFixed(places));

export interface BodyFrame {
  // The reconstruction's y coordinate of the nose and of the tail tip, in µm.
  noseUm: number;
  tailUm: number;
}

// The body runs from the most anterior point of any neuron (a dendrite tip at the nose) to the most
// posterior (a process near the tail tip), measured along the reconstruction's y axis. The Virtual Worm is
// posed with a dorsoventral bend, so y is a projection: the midline itself is about 5% longer.
export function bodyFrame(morphologies: Map<string, Morphology>): BodyFrame {
  let noseUm = Infinity;
  let tailUm = -Infinity;
  for (const { points } of morphologies.values()) {
    for (const [, y] of points) {
      noseUm = Math.min(noseUm, y);
      tailUm = Math.max(tailUm, y);
    }
  }
  return { noseUm, tailUm };
}

const along = (frame: BodyFrame, y: number): number => round((y - frame.noseUm) / (frame.tailUm - frame.noseUm), 4);

// The reconstruction's axes are checked rather than assumed. Left cells must lie at larger x in most
// left/right pairs. For the dorsoventral axis, raw z is only meaningful locally, because the model is posed
// with a bend, so the check uses the one place where named dorsal and ventral cells meet: the nose. Each
// dorsal sensory dendrite (CEP, IL1, IL2, OLQ, URA, URY) must end at larger z than its ventral partner.
const NOSE_PAIRS = ['CEP', 'IL1', 'IL2', 'OLQ', 'URA', 'URY'].flatMap((base) =>
  ['L', 'R'].map((side) => [`${base}D${side}`, `${base}V${side}`] as const),
);

export function checkAxes(morphologies: Map<string, Morphology>): {
  leftLarger: number;
  pairs: number;
  nosePairs: number;
} {
  let pairs = 0;
  let leftLarger = 0;
  for (const [name, { soma }] of morphologies) {
    const right = name.endsWith('L') ? morphologies.get(`${name.slice(0, -1)}R`) : undefined;
    if (!right) continue;
    pairs += 1;
    if (soma[0] > right.soma[0]) leftLarger += 1;
  }
  if (leftLarger < 0.9 * pairs) throw new Error(`only ${leftLarger} of ${pairs} left cells lie at larger x`);
  const tip = (name: string): number => {
    const points = morphologies.get(name)?.points;
    if (!points) throw new Error(`axis check: no morphology for ${name}`);
    return points.reduce((a, b) => (b[1] < a[1] ? b : a))[2];
  };
  for (const [dorsal, ventral] of NOSE_PAIRS) {
    if (tip(dorsal) <= tip(ventral))
      throw new Error(`${dorsal} ends no higher than ${ventral}; the dorsal axis is not +z`);
  }
  return { leftLarger, pairs, nosePairs: NOSE_PAIRS.length };
}

export function position(frame: BodyFrame, morphology: Morphology): Position {
  const [x, y, z] = morphology.soma;
  return { s: along(frame, y), reconstructionUm: [round(x, 2), round(y, 2), round(z, 2)], source: 'c302' };
}

// The neurons the model senses through. Butanone is sensed by AWC-ON (Wes & Bargmann 2001), and like the
// other amphid neurons AWC senses at its dendrite ending at the nose; each worm's AWC-ON side is drawn at
// run time, so both AWCs carry the site. The touch receptor neurons sense along their processes (Chalfie
// et al. 1985). Every other neuron's stimulus is outside the model, so it has no site here.
const TIP_SENSORS = new Set(['AWCL', 'AWCR']);
const FIELD_SENSORS = new Set(['ALML', 'ALMR', 'AVM', 'PVM', 'PLML', 'PLMR']);

export function sensing(frame: BodyFrame, name: string, morphology: Morphology): Sensing {
  const ys = morphology.points.map(([, y]) => y);
  if (TIP_SENSORS.has(name)) return { kind: 'tip', s: along(frame, Math.min(...ys)) };
  if (FIELD_SENSORS.has(name))
    return { kind: 'field', s0: along(frame, Math.min(...ys)), s1: along(frame, Math.max(...ys)) };
  return { kind: 'none' };
}

// The rhythm generators of PLAN §4.3: A-type (VA, DA) and B-type (VB, DB) motor-neuron oscillators, and
// the head switch in the SMD neurons.
export function oscillator(name: string): OscillatorClass | null {
  if (/^(VA|DA)\d+$/.test(name)) return 'A';
  if (/^(VB|DB)\d+$/.test(name)) return 'B';
  if (/^SMD[DV][LR]$/.test(name)) return 'headSwitch';
  return null;
}

const QUADRANTS: Record<string, Quadrant> = { dBWML: 'DL', dBWMR: 'DR', vBWML: 'VL', vBWMR: 'VR' };

// Every quadrant's muscles sit on one grid of 24 slots from nose to tail, so the four quadrants line up:
// muscle i covers slot i. The ventral-left quadrant has 23 cells, and Cook's innervation puts its missing
// one at the tail (vBWMLi's inputs match vBWMRi's best for most i up to 21, and vBWML23's match vBWMR24's),
// so its last cell covers the last two slots. The placement is an assumption (PLAN §4.4, level 0).
export function muscles(names: string[]): Muscle[] {
  const parsed = names.map((name) => {
    const match = /^([dv]BWM[LR])(\d+)$/.exec(name);
    if (!match) throw new Error(`unexpected muscle name ${name}`);
    return { name, quadrant: QUADRANTS[match[1]], index: Number(match[2]) };
  });
  const perQuadrant = new Map<Quadrant, number>();
  for (const m of parsed) perQuadrant.set(m.quadrant, Math.max(perQuadrant.get(m.quadrant) ?? 0, m.index));
  const slots = Math.max(...perQuadrant.values());
  return parsed.map(({ name, quadrant, index }) => {
    const last = index === perQuadrant.get(quadrant);
    return { name, quadrant, index, s0: round((index - 1) / slots, 4), s1: last ? 1 : round(index / slots, 4) };
  });
}
