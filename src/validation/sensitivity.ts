// The sensitivity runs (spec §2.4; PLAN §2.4, §3.2; DECISIONS.md 2026-09-30): the real wiring with its uncertain
// signs set other ways, or its connections scaled as the datasets' shared ones ask, each run on the same values,
// reported and not graded. The uncertain signs are the chemical connections signed by the transmitter rule or
// not at all (PLAN §2.4's steps 3 and 4). A setting is a brain of its own: a world takes it as its network, with
// thresholds at its own rest (PLAN §3.3).

import type { Chemical, Sign, WormlightData } from '../data/schema.ts';
import { cookNetwork, type Network } from '../sim/brain/network.ts';
import { hash, uniform } from '../sim/brain/rng.ts';

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
];

// Whether a connection's sign is uncertain: set by the transmitter rule, or by nothing.
export const uncertain = (c: Chemical): boolean => c.signSource === 'rule' || c.signSource === 'none';

// The chemical connections under a setting of the uncertain signs.
export function resigned(chemical: readonly Chemical[], id: string): Chemical[] {
  if (id === 'rule' || id === 'shared-scales') return [...chemical];
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
