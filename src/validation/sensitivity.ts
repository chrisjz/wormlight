// The sensitivity runs (spec §2.4; PLAN §2.4, §3.2; DECISIONS.md 2026-09-30): the real wiring with its uncertain
// signs set other ways, or its connections scaled as the datasets' shared ones ask, each run on the same values,
// reported and not graded. The uncertain signs are the chemical connections signed by the transmitter rule or
// not at all (PLAN §2.4's steps 3 and 4). A setting is a brain of its own: a world takes it as its network, with
// thresholds at its own rest (PLAN §3.3). Track S's rules add two settings of its rest, on the model's own wiring:
// its offsets off, and AVA's offsets added (DECISIONS.md, 2026-10-01).

import type { Chemical, Sign, WormlightData } from '../data/schema.ts';
import { cookNetwork, type Network } from '../sim/brain/network.ts';
import { hash, uniform } from '../sim/brain/rng.ts';
import type { LoopParams } from '../sim/world.ts';

// The scales at which the connections Cook's and Varshney's datasets share keep their Neural Interactome strength
// (PLAN §3.2), in place of the scales that match the datasets' totals.
export const SHARED_SCALES = { gap: 0.33, chemical: 0.5 } as const;

// The draws for the random signs: a seed, "sign" in ASCII, with the draw's number as its lane.
const SEED = 0x7369676e;
export const RANDOM_DRAWS = 10;

export interface Setting {
  id: string;
  label: string;
}

// The model's own setting first, which must repeat the checkpoints' figures.
export const SETTINGS: readonly Setting[] = [
  { id: 'rule', label: 'By the rule, as the model has them' },
  { id: 'excitatory', label: 'All excitatory' },
  { id: 'silent', label: 'All silent' },
  ...Array.from({ length: RANDOM_DRAWS }, (_, k) => ({ id: `random-${k + 1}`, label: `Random draw ${k + 1}` })),
  { id: 'shared-scales', label: "The model's signs, at the shared-connection scales" },
  { id: 'offsets-off', label: "The model's signs, with no rest offset" },
  { id: 'ava-offsets', label: "The model's signs, with AVA's rest offsets too" },
];

// The settings that keep the model's wiring and change its rest.
const REST_SETTINGS = new Set(['offsets-off', 'ava-offsets']);

// Whether a connection's sign is uncertain: set by the transmitter rule, or by nothing.
export const uncertain = (c: Chemical): boolean => c.signSource === 'rule' || c.signSource === 'none';

// The chemical connections under a setting of the uncertain signs.
export function resigned(chemical: readonly Chemical[], id: string): Chemical[] {
  if (id === 'rule' || id === 'shared-scales' || REST_SETTINGS.has(id)) return [...chemical];
  const draw = /^random-(\d+)$/.exec(id);
  const lane = draw ? Number(draw[1]) : 0;
  if (id !== 'excitatory' && id !== 'silent' && !(lane >= 1 && lane <= RANDOM_DRAWS)) {
    throw new Error(`unknown sensitivity setting ${id}`);
  }
  return chemical.map((c, index) => {
    if (!uncertain(c)) return c;
    const sign: Sign = id === 'excitatory' ? 1 : id === 'silent' ? 0 : uniform(hash(SEED, lane, index)) < 0.5 ? 1 : -1;
    return { ...c, sign };
  });
}

// The brain a setting makes of the real wiring.
export function settingNetwork(data: WormlightData, id: string): Network {
  const chemical = resigned(data.chemical, id);
  return id === 'shared-scales'
    ? cookNetwork({ ...data, chemical }, SHARED_SCALES)
    : cookNetwork({ ...data, chemical });
}

// The loop's parameters a setting runs: the fit's own, but for the settings of track S's rest. With its offsets off
// every neuron rests at its midpoint, the D-types too, as on R's model, the rectifier kept; with AVA's, AVAL and AVAR
// take theirs from Liu, Chen & Wang 2020 beside the D-types'. Both need a fit that runs S's offsets, since on any
// other they would either repeat it or add the D-types' offset it never had.
export function settingParams(params: LoopParams, id: string): LoopParams {
  if (!REST_SETTINGS.has(id)) return params;
  if (params.restOffsets !== 'measured') {
    throw new Error(`the setting ${id} changes track S's offsets, which these parameters don't run`);
  }
  return { ...params, restOffsets: id === 'ava-offsets' ? 'measured with AVA' : undefined };
}
