// Proprioception and the head switch (PLAN §4.3). Both read the body's curvature and nothing else about it.
//
// Curvature is scaled by body length (K = κL) and signed so that bending towards the dorsal side is
// positive: in the body's frame the dorsal side is anticlockwise of head-to-tail, so a dorsal bend turns the
// midline anticlockwise from head to tail.

import type { WormlightData } from '../data/schema.ts';
import type { Body } from './body/body.ts';

// The scaled dorsal curvature at each interior rod; the two end rods have none and are left at 0.
export function curvature(body: Body, out: Float64Array): void {
  curvatureOf(body.x, body.y, body.params.segmentLength * body.params.segments, out);
}

// The same from rod centres, scaled by the body's length.
export function curvatureOf(x: ArrayLike<number>, y: ArrayLike<number>, scale: number, out: Float64Array): void {
  const rods = x.length;
  out[0] = 0;
  out[rods - 1] = 0;
  for (let i = 1; i < rods - 1; i++) {
    const ax = x[i] - x[i - 1];
    const ay = y[i] - y[i - 1];
    const bx = x[i + 1] - x[i];
    const by = y[i + 1] - y[i];
    const turn = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    const spacing = (Math.hypot(ax, ay) + Math.hypot(bx, by)) / 2;
    out[i] = (turn / spacing) * scale;
  }
}

// The mean curvature over body coordinates [from, to], read at the interior rods inside it, or at the
// interior rod nearest its middle if none is.
export function regionMean(k: Float64Array, from: number, to: number): number {
  const segments = k.length - 1;
  let sum = 0;
  let count = 0;
  for (let i = 1; i < segments; i++) {
    const s = i / segments;
    if (s >= from - 1e-12 && s <= to + 1e-12) {
      sum += k[i];
      count++;
    }
  }
  if (count > 0) return sum / count;
  const nearest = Math.min(segments - 1, Math.max(1, Math.round(((from + to) / 2) * segments)));
  return k[nearest];
}

// A motor neuron's proprioceptive field (Wen et al. 2012): B-types sense the `reach` of body in front of
// their muscles, A-types (a hypothesis) the same behind. Dorsal neurons sense dorsal curvature, ventral ones
// its opposite. Neurons with no field, such as an A-type whose muscles reach the tail, are left out.
export interface Field {
  neuron: number;
  // +1 for a dorsal neuron, −1 for a ventral one.
  side: number;
  from: number;
  to: number;
}

export function proprioceptiveFields(data: WormlightData, reach: number): Field[] {
  const muscles = new Map(data.muscles.map((m) => [m.name, m]));
  // Muscle edges lie on PLAN §4.4's grid of slots; the data file rounds them to four places, so snap them
  // back, or rounding alone would decide whether a field's edge rod counts.
  const slots = Math.max(...data.muscles.map((m) => m.index));
  const snap = (s: number): number => Math.round(s * slots) / slots;
  const fields: Field[] = [];
  data.neurons.forEach((neuron, i) => {
    if (neuron.oscillator !== 'A' && neuron.oscillator !== 'B') return;
    const targets = data.neuromuscular.filter((j) => j.pre === neuron.name).map((j) => muscles.get(j.muscle));
    if (targets.length === 0 || targets.some((m) => m === undefined)) return;
    const front = snap(Math.min(...targets.map((m) => m?.s0 ?? 1)));
    const back = snap(Math.max(...targets.map((m) => m?.s1 ?? 0)));
    const [from, to] =
      neuron.oscillator === 'B' ? [Math.max(0, front - reach), front] : [back, Math.min(1, back + reach)];
    if (to - from <= 0) return;
    fields.push({ neuron: i, side: neuron.name.startsWith('D') ? 1 : -1, from, to });
  });
  return fields;
}

// Ji et al. 2021's head switch: the active moment reverses when P = K + b·dK/dt reaches ±P_th. The state h is
// 1 while it drives the dorsal side and 0 while it drives the ventral side.
export class HeadSwitch {
  readonly derivativeWeight: number;
  readonly threshold: number;
  h: number;
  private previous: number | null = null;

  // b in seconds and P_th, dimensionless.
  constructor(derivativeWeight: number, threshold: number, initial = 1) {
    this.derivativeWeight = derivativeWeight;
    this.threshold = threshold;
    this.h = initial;
  }

  // The head's curvature at the last update, if there was one.
  get lastCurvature(): number | null {
    return this.previous;
  }

  // Set the state and the curvature the next update's derivative starts from.
  restore(h: number, lastCurvature: number | null): void {
    this.h = h;
    this.previous = lastCurvature;
  }

  // Update from the head's curvature K after a step of dt; while it isn't gated on, it only tracks K.
  // Returns whether it flipped.
  update(k: number, dt: number, gated: boolean): boolean {
    const p = k + (this.previous === null ? 0 : (this.derivativeWeight * (k - this.previous)) / dt);
    this.previous = k;
    if (!gated) return false;
    if (this.h === 1 && p >= this.threshold) this.h = 0;
    else if (this.h === 0 && p <= -this.threshold) this.h = 1;
    else return false;
    return true;
  }
}
