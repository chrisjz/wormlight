// Quantum Nematode's `wormlight.connectome/1` export: the part of it the build reads, and the checks it
// must pass before anything is built from it.

import type { CellClass } from '../../src/data/schema.ts';

export interface NematodeExport {
  schema: string;
  provenance: { nematodeCommit: string; nematodeDirty: boolean };
  neurons: { name: string; class: CellClass; transmitters: string[]; ruleSign: 1 | -1 | null }[];
  muscles: string[];
  chemical: { pre: string; post: string; sections: number }[];
  gap: { a: string; b: string; sections: number }[];
  neuromuscular: { pre: string; muscle: string; sections: number }[];
}

const TRANSMITTER_SIGN: Record<string, 1 | -1> = { ACh: 1, Glu: 1, GABA: -1 };

// Refuse an export in another schema, one made from a dirty tree, one from a commit other than the
// pinned one, or one whose rule signs don't follow from its first-listed identities (which the build
// reads as the identity the rule used).
export function checkExport(exported: NematodeExport, pinnedCommit: string | undefined): NematodeExport {
  if (exported.schema !== 'wormlight.connectome/1') throw new Error(`nematode export has schema ${exported.schema}`);
  if (exported.provenance.nematodeDirty) throw new Error('nematode export was made from a dirty tree');
  if (exported.provenance.nematodeCommit !== pinnedCommit) {
    throw new Error(
      `nematode export records commit ${exported.provenance.nematodeCommit}, not the pinned ${pinnedCommit}`,
    );
  }
  for (const n of exported.neurons) {
    const implied = TRANSMITTER_SIGN[n.transmitters[0] ?? ''] ?? null;
    if (implied !== n.ruleSign) {
      throw new Error(`${n.name}: rule sign ${n.ruleSign} does not follow from ${n.transmitters[0]}`);
    }
  }
  return exported;
}
