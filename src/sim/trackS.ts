// Track S's model (PLAN §9; DECISIONS.md, 2026-10-01 and 2026-10-02). Its measured signs come as a copy of the
// runtime data with them applied, so that its brain, and every layer a World builds from the data, read them;
// touch's currents among them. Its class offsets rest the D-types above their thresholds, and its rectifier passes
// current through the AVA–A-type gap junctions only from the A-type into AVA.
// AWC's gains and touch's currents are rules set at the rest, and are rerun on whichever model a World runs. The app
// and the refit read the runtime data as it is, with no offsets, until track S's fit is chosen.
//
// The copy keeps the runtime file's `meta.version`, a digest of the runtime file's contents, which its signs no longer
// match: a link, a record or a manifest tells track S's model apart by its loop parameters, never by the data's
// version.

import { TRACK_S_SIGNS } from '../data/trackSSigns.ts';
import type { WormlightData } from '../data/schema.ts';
import type { Network } from './brain/network.ts';
import { reference } from '../science/citations.ts';
import { PARAMS } from '../science/params.ts';

const key = (pre: string, post: string): string => `${pre}→${post}`;

// One copy for each runtime data object, so that the many worlds a run builds, sham twins and calibration trials
// among them, share it and the caches keyed on it, touch's among them.
const copies = new WeakMap<WormlightData, WormlightData>();

// The runtime data with track S's measured signs applied: each row's connection takes its sign, as cited physiology,
// and the row's citation joins the file's.
export function withMeasuredSigns(data: WormlightData): WormlightData {
  const cached = copies.get(data);
  if (cached) return cached;
  const rows = new Map(TRACK_S_SIGNS.map((r) => [key(r.pre, r.post), r]));
  let applied = 0;
  const chemical = data.chemical.map((c) => {
    const row = rows.get(key(c.pre, c.post));
    if (!row) return c;
    applied++;
    return { ...c, sign: row.sign, signSource: 'physiology' as const, citation: row.citation };
  });
  if (applied !== rows.size) throw new Error("track S's signs name connections the data doesn't have");
  const citations = { ...data.meta.citations };
  for (const row of TRACK_S_SIGNS) citations[row.citation] ??= reference(row.citation);
  const copy = { ...data, meta: { ...data.meta, citations }, chemical };
  copies.set(data, copy);
  return copy;
}

// Track S's class offsets (PLAN §3.3; DECISIONS.md, 2026-10-01 and 2026-10-02): how far a class rests below its
// threshold, in mV, with Δ = V_th − V_rest. Liu, Chen & Wang 2014 recorded, at zero current, VB6 at −53.2 mV and VD5
// at −45.8. Every class's sigmoid is taken to have its midpoint where the B-types rest, so VD5's difference becomes
// the D-types' distance from their midpoint: 7.4 mV above it. The dorsal D-types take VD5's value, our choice, since
// an offset on one side alone would bias the body's bending. The A-types keep their midpoint, for two reasons:
// VA5's −71.7 mV is the down state of an alternation, not a rest, and the model's neurons rest near −10 mV, so its
// 18.5 mV below VB6 would put the A-types' thresholds near +10 mV, above the excitatory reversal potential, where no
// synaptic input could bring them to their midpoint (DECISIONS.md, 2026-10-02).
export const REST_OFFSET = { D: PARAMS.restOffsetD.value } as const;
// The sensitivity setting's AVA offsets (DECISIONS.md, 2026-10-01): AVAL at −24.2 mV and AVAR at −37.2 (Liu, Chen &
// Wang 2020), against VB6's −53.2 mV, so 29.0 and 16.0 mV above their midpoints. A cell that holds several stable
// states has no single rest, so track S's model leaves AVA at its midpoint and the setting shows what an offset
// would do.
export const AVA_REST_OFFSET = { AVAL: PARAMS.restOffsetAvaL.value, AVAR: PARAMS.restOffsetAvaR.value } as const;

// Which offsets a World's model takes: none, track S's measured classes, or those with AVA's as well.
export type RestOffsets = 'measured' | 'measured with AVA';

// Each neuron's offset under the given choice, in the data's neuron order: the D-types are DD and VD, named as the
// data names them, since the schema marks no D-type class.
export function restOffsets(data: WormlightData, choice: RestOffsets): Float64Array {
  return Float64Array.from(data.neurons, ({ name }) => {
    if (/^(DD|VD)\d+$/.test(name)) return REST_OFFSET.D;
    if (choice === 'measured with AVA' && (name === 'AVAL' || name === 'AVAR')) return AVA_REST_OFFSET[name];
    return 0;
  });
}

// What a rule set at rest reads of a model (AWC's gain, touch's currents): each neuron's offset below its threshold,
// in the data's neuron order, and whether its AVA–A-type junctions are rectified. Left out, the runtime model's rest:
// every neuron at its threshold, every junction conducting both ways.
export interface RestModel {
  offset?: ArrayLike<number>;
  rectified?: boolean;
}

// Track S's rectifier (PLAN §3.4; DECISIONS.md, 2026-10-01): every gap junction the network has between AVA and an
// A-type passes current only from the A-type into AVA, g·max(V_A − V_AVA, 0). Liu et al. 2017 measured it with VA5,
// VA8 and DA4; its extension to every A-type is their reading. The neurons are named as the data names them, so a
// rewired network rectifies whichever of these junctions it has.
const A_TYPE = /^(DA|VA)\d+$/;
const AVA = new Set(['AVAL', 'AVAR']);
export function rectify(network: Network): Network {
  const { names, gap } = network;
  const rectified: [number, number][] = [];
  for (let i = 0; i < names.length; i++) {
    if (!A_TYPE.test(names[i])) continue;
    for (let e = gap.start[i]; e < gap.start[i + 1]; e++) {
      if (AVA.has(names[gap.index[e]])) rectified.push([i, gap.index[e]]);
    }
  }
  return { ...network, rectified };
}

// Which of track S's parts a World's model takes, as a key: '' for the runtime data's model, which the refit runs.
export const trackSKey = (choice: {
  measuredSigns?: boolean;
  restOffsets?: RestOffsets;
  rectified?: boolean;
}): string =>
  [choice.measuredSigns ? 'signs' : '', choice.restOffsets ?? '', choice.rectified ? 'rectified' : '']
    .filter(Boolean)
    .join(', ');
