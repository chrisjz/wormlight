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
// posterior (a process near the tail tip). The reconstruction's y axis runs from nose to tail.
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

// The reconstruction's axes are checked rather than assumed: most left/right pairs must have the left
// cell at larger x, and the ventral-cord somas must sit at smaller z than the somas overall.
export function checkAxes(morphologies: Map<string, Morphology>): { leftLarger: number; pairs: number } {
  let pairs = 0;
  let leftLarger = 0;
  for (const [name, { soma }] of morphologies) {
    const right = name.endsWith('L') ? morphologies.get(`${name.slice(0, -1)}R`) : undefined;
    if (!right) continue;
    pairs += 1;
    if (soma[0] > right.soma[0]) leftLarger += 1;
  }
  if (leftLarger < 0.9 * pairs) throw new Error(`only ${leftLarger} of ${pairs} left cells lie at larger x`);
  const median = (values: number[]): number => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const all = [...morphologies.values()].map((m) => m.soma[2]);
  const cord = [...morphologies].filter(([n]) => /^(AS|DA|DB|DD|VA|VB|VC|VD)\d+$/.test(n)).map(([, m]) => m.soma[2]);
  if (median(cord) >= median(all))
    throw new Error('ventral-cord somas do not lie at smaller z; the dorsal axis is not +z');
  return { leftLarger, pairs };
}

export function position(frame: BodyFrame, morphology: Morphology): Position {
  const [x, y, z] = morphology.soma;
  return { s: along(frame, y), lateralUm: round(x, 2), dorsalUm: round(z, 2), source: 'c302' };
}

// The neurons the model senses through. AWC senses butanone at its dendrite tip (Wes & Bargmann 2001);
// the touch receptor neurons sense along their processes (Chalfie et al. 1985). Every other neuron's
// sensory input is outside the model, so it has none here.
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

// Each quadrant's muscles, assumed evenly spaced from nose to tail (PLAN §4.4, level 0).
export function muscles(names: string[]): Muscle[] {
  const parsed = names.map((name) => {
    const match = /^([dv]BWM[LR])(\d+)$/.exec(name);
    if (!match) throw new Error(`unexpected muscle name ${name}`);
    return { name, quadrant: QUADRANTS[match[1]], index: Number(match[2]) };
  });
  const perQuadrant = new Map<Quadrant, number>();
  for (const m of parsed) perQuadrant.set(m.quadrant, Math.max(perQuadrant.get(m.quadrant) ?? 0, m.index));
  return parsed.map(({ name, quadrant, index }) => {
    const n = perQuadrant.get(quadrant) ?? 0;
    return { name, quadrant, index, s0: round((index - 1) / n, 4), s1: round(index / n, 4) };
  });
}
