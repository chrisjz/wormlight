// Touch (PLAN §4.2). A tap at body coordinate s stimulates every touch receptor whose process covers s, and the
// receptors are coupled, so the currents are computed per covered set: for each set of receptors a tap can
// reach, the currents that hold every one of them 10 mV above rest together, computed once in the intact real
// wiring and the same for every brain and lesion (DECISIONS.md, 2026-09-27). A receptor's stimulus is on or
// off, never stronger: a tap turns it on for the next 500 ms at its set's current, restarting a pulse already
// on at the new tap's.

import type { WormlightData } from '../data/schema.ts';
import { PARAMS } from '../science/params.ts';
import { midpointActivation, responses, restOf, type Held } from './brain/brain.ts';
import { cookNetwork, type Network } from './brain/network.ts';
import { NEURAL_STEP } from './numerics.ts';
import { rectify, type RestModel } from './trackS.ts';

export interface TouchReceptor {
  // Its place among all the data's touch receptors, its neuron and name, and its field in body coordinates
  // from the nose (0) to the tail tip (1).
  index: number;
  neuron: number;
  name: string;
  from: number;
  to: number;
}

// Every touch receptor, and the currents (pA) each set a tap can reach gives, keyed by the set as a bitmask of
// receptor indices, each array over every receptor with 0 outside the set.
export interface Touch {
  receptors: readonly TouchReceptor[];
  sets: ReadonlyMap<number, Float64Array>;
}

// A pulse's length in steps: 500 ms at the neural step.
export const TOUCH_STEPS = Math.round(PARAMS.touchDuration.value / 1000 / NEURAL_STEP);

// Where the app's buttons tap: inside the ALM and PLM fields, clear of PVM's (DECISIONS.md, 2026-09-27).
export const FRONT = 0.2;
export const BACK = 0.8;

// Whether a receptor's field covers a body coordinate.
export const covers = (receptor: { from: number; to: number }, s: number): boolean =>
  s >= receptor.from && s <= receptor.to;

// The receptors a tap at s reaches, as a bitmask of their indices.
export function covered(receptors: readonly TouchReceptor[], s: number): number {
  let mask = 0;
  for (const r of receptors) if (covers(r, s)) mask |= 1 << r.index;
  return mask;
}

// Every set a tap on the body can reach: those covering each field's ends and the stretches between them.
function reachable(receptors: readonly TouchReceptor[]): number[] {
  const points = [...new Set([0, 1, ...receptors.flatMap((r) => [r.from, r.to])])].sort((a, b) => a - b);
  const probes = points.flatMap((p, k) => (k + 1 < points.length ? [p, (p + points[k + 1]) / 2] : [p]));
  return [...new Set(probes.map((s) => covered(receptors, s)))].filter((mask) => mask !== 0);
}

// Solve A x = b by Gaussian elimination with partial pivoting; A is small and well conditioned.
function solve(a: number[][], b: number[]): number[] {
  const m = a.map((row, i) => [...row, b[i]]);
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
    [m[c], m[pivot]] = [m[pivot], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let q = c; q <= n; q++) m[r][q] -= f * m[c][q];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

const touchOf = new WeakMap<WormlightData, Map<string, Touch>>();

// The data's touch receptors, each neuron that senses along its process, and every reachable set's currents:
// with activations held at rest, the currents whose responses together raise every receptor in the set by
// the touch amplitude. Rest is every activation at the midpoint, or under track S's model (DECISIONS.md, 2026-10-02)
// each neuron's own at its offset, with each rectified junction's gate as the rest sets it.
export function touchData(data: WormlightData, model: RestModel = {}): Touch {
  let byRest = touchOf.get(data);
  if (!byRest) touchOf.set(data, (byRest = new Map<string, Touch>()));
  const key = `${model.offset ? Array.from(model.offset).join(',') : ''}${model.rectified ? ' rectified' : ''}`;
  let touch = byRest.get(key);
  if (!touch) {
    const receptors = data.neurons
      .flatMap((n, neuron) =>
        n.sensing.kind === 'field' ? [{ neuron, name: n.name, from: n.sensing.s0, to: n.sensing.s1 }] : [],
      )
      .map((r, index) => ({ index, ...r }));
    if (receptors.length > 31) throw new Error('a touch set is a 31-bit mask');
    const built = cookNetwork(data);
    let [network, held]: [Network, Held] = [built, midpointActivation(built)];
    if (model.offset || model.rectified) {
      const rest = restOf(
        model.rectified ? rectify(built) : built,
        model.offset ?? new Float64Array(built.names.length),
      );
      [network, held] = [rest.network, rest.activation];
    }
    const response = responses(
      network,
      held,
      receptors.map((r) => r.neuron),
    );
    const sets = new Map<number, Float64Array>();
    for (const mask of reachable(receptors)) {
      const members = receptors.filter((r) => mask & (1 << r.index));
      const amplitude = PARAMS.touchAmplitude.value;
      const held = solve(
        members.map((ri) => members.map((rj) => response[rj.index][ri.index])),
        members.map(() => amplitude),
      );
      const currents = new Float64Array(receptors.length);
      members.forEach((r, q) => {
        currents[r.index] = held[q];
      });
      sets.set(mask, currents);
    }
    touch = { receptors, sets };
    byRest.set(key, touch);
  }
  return touch;
}

// A tap at s: which receptors it reaches, as a bitmask, and the current each takes, over every receptor.
export function tap(touch: Touch, s: number): { mask: number; currents: Float64Array } {
  const mask = covered(touch.receptors, s);
  if (mask === 0) return { mask, currents: new Float64Array(touch.receptors.length) };
  const currents = touch.sets.get(mask);
  if (!currents) throw new Error(`no touch set was computed for the receptors at ${s}`);
  return { mask, currents };
}
