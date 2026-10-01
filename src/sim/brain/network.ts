// A neural network in the form the integrator reads (PLAN §3.1): uniform membrane constants, symmetric
// gap junctions, and chemical synapses grouped by their postsynaptic neuron, each with its own reversal
// potential. The production network is Cook's wiring in nF, nS, mV, s and pA; Neural Interactome mode
// builds one from its own matrices and units (ni.ts).

import type { WormlightData } from '../../data/schema.ts';
import { PARAMS } from '../../science/params.ts';

// Compressed rows: row i holds index[start[i]] … index[start[i + 1] − 1] with their weights.
export interface Rows {
  start: Int32Array;
  index: Int32Array;
  weight: Float64Array;
}

export interface Network {
  names: readonly string[];
  capacitance: number;
  leak: number;
  leakPotential: number;
  rise: number;
  decay: number;
  // β, the sigmoid's slope per unit of V − V_th.
  slope: number;
  // Gap junctions in both directions, without self-pairs: row i lists each partner j and g_ij.
  gap: Rows;
  // Chemical synapses onto each neuron: row i lists each presynaptic j (itself, for an autapse) and g_ji,
  // with the connection's reversal potential E_ji in `reversal`.
  chemical: Rows & { reversal: Float64Array };
  // Gap junctions that pass current one way (PLAN §3.4): each pair [from, to] conducts only while `from` is the more
  // depolarised, so current crosses it only from `from` into `to`. Track S's AVA–A-type junctions are the only ones
  // (DECISIONS.md, 2026-10-01). Left out or empty, every junction conducts both ways. A lesion or a gain keeps the
  // list, and a pair whose junction is gone rectifies nothing.
  rectified?: readonly (readonly [from: number, to: number])[];
}

// Where each entry lands when entries are grouped by row, keeping their order within a row.
function layout(n: number, rowOf: readonly number[]): { start: Int32Array; slot: Int32Array } {
  const start = new Int32Array(n + 1);
  for (const r of rowOf) start[r + 1]++;
  for (let i = 0; i < n; i++) start[i + 1] += start[i];
  const next = start.slice(0, n);
  return { start, slot: Int32Array.from(rowOf, (r) => next[r]++) };
}

// Build rows from (row, column, weight) entries.
export function rows(n: number, entries: readonly (readonly [number, number, number])[]): Rows {
  const { start, slot } = layout(
    n,
    entries.map(([r]) => r),
  );
  const index = new Int32Array(entries.length);
  const weight = new Float64Array(entries.length);
  entries.forEach(([, c, w], k) => {
    index[slot[k]] = c;
    weight[slot[k]] = w;
  });
  return { start, index, weight };
}

// Chemical rows, from (post, pre, weight, reversal) entries.
export function chemicalRows(
  n: number,
  entries: readonly (readonly [post: number, pre: number, weight: number, reversal: number])[],
): Network['chemical'] {
  const { start, slot } = layout(
    n,
    entries.map(([post]) => post),
  );
  const index = new Int32Array(entries.length);
  const weight = new Float64Array(entries.length);
  const reversal = new Float64Array(entries.length);
  entries.forEach(([, pre, w, e], k) => {
    index[slot[k]] = pre;
    weight[slot[k]] = w;
    reversal[slot[k]] = e;
  });
  return { start, index, weight, reversal };
}

// Gap rows in both directions from each pair listed once.
export function gapRows(n: number, pairs: readonly (readonly [a: number, b: number, weight: number])[]): Rows {
  if (pairs.some(([a, b]) => a === b)) throw new Error('a gap junction joins two different neurons');
  return rows(
    n,
    pairs.flatMap(([a, b, w]) => [
      [a, b, w],
      [b, a, w],
    ]),
  );
}

// Cook's wiring in production units: a connection's conductance is its EM sections × the Cook-to-Varshney
// scale × the conductance per Varshney synapse; a chemical connection with no sign has none (PLAN §3.1). The
// scales are the registry's, which match the datasets' totals, unless the sensitivity runs give others (PLAN §3.2).
export function cookNetwork(
  data: WormlightData,
  scales: { chemical: number; gap: number } = {
    chemical: PARAMS.cookToVarshneyChemical.value,
    gap: PARAMS.cookToVarshneyGap.value,
  },
): Network {
  const names = data.neurons.map((n) => n.name);
  const at = new Map(names.map((name, i) => [name, i]));
  const id = (name: string): number => at.get(name) ?? fail(`unknown neuron ${name}`);
  const perSynapse = PARAMS.conductancePerSynapse.value / 1000; // pS → nS
  const chemical = data.chemical
    .filter((c) => c.sign !== 0)
    .map(
      (c) =>
        [
          id(c.post),
          id(c.pre),
          c.sections * scales.chemical * perSynapse,
          c.sign > 0 ? PARAMS.reversalExcitatory.value : PARAMS.reversalInhibitory.value,
        ] as const,
    );
  const gap = data.gap.map((g) => [id(g.a), id(g.b), g.sections * scales.gap * perSynapse] as const);
  return {
    names,
    capacitance: PARAMS.membraneCapacitance.value / 1000, // pF → nF
    leak: PARAMS.leakConductance.value / 1000, // pS → nS
    leakPotential: PARAMS.leakPotential.value,
    rise: PARAMS.synapticRise.value,
    decay: PARAMS.synapticDecay.value,
    slope: PARAMS.sigmoidWidth.value,
    gap: gapRows(names.length, gap),
    chemical: chemicalRows(names.length, chemical),
  };
}

// Every connection as a list: gap pairs once, as [a, b, g] with a < b, and chemical synapses as
// [post, pre, g, E], in row order.
export function connections(network: Network): {
  gap: [number, number, number][];
  chemical: [number, number, number, number][];
} {
  const gap: [number, number, number][] = [];
  const chemical: [number, number, number, number][] = [];
  const { gap: g, chemical: c } = network;
  for (let i = 0; i < network.names.length; i++) {
    for (let k = g.start[i]; k < g.start[i + 1]; k++) if (i < g.index[k]) gap.push([i, g.index[k], g.weight[k]]);
    for (let k = c.start[i]; k < c.start[i + 1]; k++) chemical.push([i, c.index[k], c.weight[k], c.reversal[k]]);
  }
  return { gap, chemical };
}

// The network with every gap junction that has one of the chosen neurons on either side scaled by a gain: a
// class-level gain (track R's κ_gap,B, PLAN §9). Both directions of each junction scale alike, so the solve
// stays symmetric; any gain above 0 keeps it positive definite.
export function scaleGap(network: Network, chosen: ReadonlySet<number>, gain: number): Network {
  if (gain === 1) return network;
  const { start, index, weight } = network.gap;
  const scaled = Float64Array.from(weight);
  for (let row = 0; row + 1 < start.length; row++) {
    for (let e = start[row]; e < start[row + 1]; e++) {
      if (chosen.has(row) || chosen.has(index[e])) scaled[e] *= gain;
    }
  }
  return { ...network, gap: { start, index, weight: scaled } };
}

// The same network with every chemical and gap connection of the named neurons removed, as laser ablation
// removes them (PLAN §3.5); the body lesions their neuromuscular connections. Thresholds are not
// recomputed: the caller keeps the intact network's.
export function lesion(network: Network, lesioned: readonly string[]): Network {
  const n = network.names.length;
  const cut = new Set(lesioned.map((name) => network.names.indexOf(name)));
  if (cut.has(-1)) throw new Error(`unknown neuron in ${lesioned.join(', ')}`);
  const { gap, chemical } = connections(network);
  return {
    ...network,
    gap: gapRows(
      n,
      gap.filter(([a, b]) => !cut.has(a) && !cut.has(b)),
    ),
    chemical: chemicalRows(
      n,
      chemical.filter(([post, pre]) => !cut.has(post) && !cut.has(pre)),
    ),
  };
}

// Each gap entry's rule, in row order: 0 for a junction that conducts both ways, 1 for one that conducts only while its
// row's neuron is the more depolarised (the row is its pair's `from`), and −1 for one that conducts only while its
// partner is (the row is its `to`). Both entries of a junction read the same comparison, so its conductance is the
// same in both rows and the system stays symmetric. Null when no junction the network has is rectified.
export function gapGates(network: Network): Int8Array | null {
  const pairs = network.rectified ?? [];
  if (pairs.length === 0) return null;
  const n = network.names.length;
  const key = (from: number, to: number): number => from * n + to;
  const listed = new Set(pairs.map(([from, to]) => key(from, to)));
  if (pairs.some(([from, to]) => from === to || listed.has(key(to, from)))) {
    throw new Error('a rectified junction joins two different neurons and passes current one way');
  }
  const { start, index } = network.gap;
  const gates = new Int8Array(index.length);
  let any = false;
  for (let i = 0; i < n; i++) {
    for (let e = start[i]; e < start[i + 1]; e++) {
      if (listed.has(key(i, index[e]))) gates[e] = 1;
      else if (listed.has(key(index[e], i))) gates[e] = -1;
      any ||= gates[e] !== 0;
    }
  }
  return any ? gates : null;
}

// Whether a gap entry with the given rule conducts, at its row's neuron's voltage and its partner's: a rectified one
// only while its `from` is strictly the more depolarised.
export const conducts = (gate: number, row: number, partner: number): boolean =>
  gate === 0 || (gate > 0 ? row > partner : partner > row);

// The network as it stands at the given voltages: each rectified junction at its conductance where it conducts and at
// 0 where it is shut, and none rectified, so it is linear. The network itself when none is rectified.
export function gatedAt(network: Network, voltage: ArrayLike<number>): Network {
  const gates = gapGates(network);
  if (!gates) return network;
  const { start, index, weight } = network.gap;
  const gated = Float64Array.from(weight);
  for (let i = 0; i + 1 < start.length; i++) {
    for (let e = start[i]; e < start[i + 1]; e++) {
      if (!conducts(gates[e], voltage[i], voltage[index[e]])) gated[e] = 0;
    }
  }
  return { ...network, gap: { start, index, weight: gated }, rectified: [] };
}

// How many of the network's rectified junctions conduct at the given voltages, of how many it has.
export function openRectified(network: Network, voltage: ArrayLike<number>): { open: number; of: number } {
  const gates = gapGates(network);
  let [open, of] = [0, 0];
  if (!gates) return { open, of };
  const { start, index } = network.gap;
  for (let i = 0; i + 1 < start.length; i++) {
    for (let e = start[i]; e < start[i + 1]; e++) {
      if (gates[e] !== 1) continue;
      of++;
      if (conducts(1, voltage[i], voltage[index[e]])) open++;
    }
  }
  return { open, of };
}

function fail(message: string): never {
  throw new Error(message);
}
