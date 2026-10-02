// Track S's model (PLAN §9; DECISIONS.md, 2026-10-01 and 2026-10-02), whose fit the app and the harness run since it
// replaced the refit. Its measured signs are the runtime data's, moved there from a side file when its fit was chosen.
// Its class offsets rest the D-types above their thresholds, and its rectifier passes current through the AVA–A-type
// gap junctions only from the A-type into AVA; both are its parts, which the loop's parameters switch on, so the
// planned model and track R's run without them. AWC's gains and touch's currents are rules set at the rest, and are
// rerun on whichever model a World runs.

import type { WormlightData } from '../data/schema.ts';
import type { Network } from './brain/network.ts';
import { PARAMS } from '../science/params.ts';

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

// The models a calibration searches (PLAN §9): track R's, the refit's and round 3's, and track S's, the same twelve
// calibrated parameters with its class offsets and rectifier, whose fit is chosen. Both run on the runtime data's
// signs, which since S's fit was chosen hold S's measured signs (DECISIONS.md, 2026-10-02).
export type Model = 'track R' | 'track S';

// The model the chosen fit runs, and so the app and the harness (DECISIONS.md, 2026-10-02): track S's, since its fit
// replaced the refit, in the conductance form (CHOSEN_FORM).
export const CHOSEN_MODEL: Model = 'track S';

// Track S's parts, as the loop's parameters take them.
export interface TrackSParts {
  restOffsets?: RestOffsets;
  rectified?: boolean;
}

// Track S's whole model (DECISIONS.md, 2026-10-01 and 2026-10-02): the D-types' offset and its rectifier on the
// runtime data's signs. Its calibration ran with a switch for the signs too, `measuredSigns`, which applied them from
// their side file before they moved into the data; its record names it.
export const TRACK_S: Readonly<TrackSParts> = { restOffsets: 'measured', rectified: true };

// What a model adds to the loop's parameters: nothing for track R's. A name that is neither is refused, not read as R's.
export function partsOf(model: Model): Readonly<TrackSParts> {
  if (model === 'track S') return TRACK_S;
  if (model === 'track R') return {};
  throw new Error(`there is no model ${String(model)}`);
}

// Which of track S's parts a World's model takes, as a key: '' for the runtime data's model, which the refit runs.
export const trackSKey = (choice: TrackSParts): string =>
  [choice.restOffsets ?? '', choice.rectified ? 'rectified' : ''].filter(Boolean).join(', ');
