// What the inspector shows for a neuron (spec §6 "Inspect"): who it is, where it sits, its part in the model,
// and its connections, strongest first, each with the provenance of its sign.

import type { CellClass, Neuron, Neuromuscular, Sign, WormlightData } from '../data/schema.ts';
import { chemicalProvenance, GAP_PROVENANCE, muscleProvenance, type Provenance } from '../science/provenance.ts';
import type { Wiring } from './connections.ts';

export const CLASS_NAMES: Record<CellClass, string> = {
  sensory: 'Sensory',
  interneuron: 'Interneuron',
  motor: 'Motor',
  pharyngeal: 'Pharyngeal',
};

export interface Row {
  // The partner's name, and its index when it is a neuron (a muscle has none).
  name: string;
  neuron: number | null;
  sections: number;
  sign: Sign | null; // null for a gap junction, which has no sign
  provenance: Provenance;
}

export type GroupKind = 'out' | 'in' | 'gap' | 'muscle';

export interface Group {
  kind: GroupKind;
  title: string;
  rows: Row[];
}

export interface Inspection {
  index: number;
  name: string;
  cellClass: CellClass;
  facts: { label: string; value: string }[];
  groups: Group[];
}

export const GROUP_TITLES: Record<GroupKind, string> = {
  out: 'Synapses onto',
  in: 'Synapses from',
  gap: 'Gap junctions with',
  muscle: 'Synapses onto muscle',
};

const TRANSMITTERS: Record<string, string> = {
  ACh: 'acetylcholine',
  Glu: 'glutamate',
  GABA: 'GABA',
  DA: 'dopamine',
  '5-HT': 'serotonin',
};

const percent = (f: number): string => `${Math.round(100 * f)}%`;

// The cell's part in the model's rhythm, as the ledger describes it.
const ROLES = {
  A: 'an A-type intrinsic oscillator (Gao et al. 2018), which does not yet cycle on its own',
  B: 'a B-type intrinsic oscillator, gated by drive (Fouad et al. 2018; Xu et al. 2018)',
  headSwitch: "driven by the head's proprioceptive switch (Ji et al. 2021; Yeon et al. 2018)",
} as const;

function facts(n: Neuron): { label: string; value: string }[] {
  const out = [
    {
      label: n.transmitters.length > 1 ? 'Transmitters' : 'Transmitter',
      value:
        n.transmitters.length === 0
          ? 'no release identified (Wang et al. 2024)'
          : `${n.transmitters.map((t) => TRANSMITTERS[t] ?? t).join(', ')} (Wang et al. 2024)`,
    },
    { label: 'Soma', value: `${percent(n.position.s)} of the way from nose to tail (WormBase Virtual Worm)` },
  ];
  if (n.sensing.kind === 'tip') {
    // Only AWC senses at a tip, and only the AWC-ON side, drawn at random for each worm, takes butanone.
    const where = n.sensing.s < 0.02 ? 'at the nose' : `${percent(n.sensing.s)} of the way along`;
    out.push({ label: 'Senses', value: `butanone at its dendrite tip, ${where}, when it is the worm's AWC-ON` });
  }
  if (n.sensing.kind === 'field') {
    out.push({
      label: 'Senses',
      value: `touch from ${percent(n.sensing.s0)} to ${percent(n.sensing.s1)} of the way along`,
    });
  }
  if (n.oscillator) out.push({ label: 'In the model', value: ROLES[n.oscillator] });
  return out;
}

export function inspect(
  data: WormlightData,
  wiring: Wiring,
  muscles: ReadonlyMap<string, Neuromuscular[]>,
  index: number,
): Inspection {
  const neuron = data.neurons[index];
  const connections = wiring.of(index);
  const neuronRows = (kind: 'out' | 'in' | 'gap'): Row[] =>
    connections
      .filter((c) => c.kind === kind)
      .map((c) => ({
        name: wiring.names[c.partner],
        neuron: c.partner,
        sections: c.sections,
        sign: kind === 'gap' ? null : c.sign,
        provenance:
          c.signSource === null
            ? GAP_PROVENANCE
            : chemicalProvenance({ signSource: c.signSource, citation: c.citation }),
      }));
  const muscleRows = [...(muscles.get(neuron.name) ?? [])]
    .sort((a, b) => b.sections - a.sections || a.muscle.localeCompare(b.muscle))
    .map((j) => ({
      name: j.muscle,
      neuron: null,
      sections: j.sections,
      sign: j.sign,
      provenance: muscleProvenance(j),
    }));
  const rows: Record<GroupKind, Row[]> = {
    out: neuronRows('out'),
    in: neuronRows('in'),
    gap: neuronRows('gap'),
    muscle: muscleRows,
  };
  return {
    index,
    name: neuron.name,
    cellClass: neuron.class,
    facts: facts(neuron),
    groups: (Object.keys(GROUP_TITLES) as GroupKind[])
      .filter((kind) => rows[kind].length > 0)
      .map((kind) => ({ kind, title: GROUP_TITLES[kind], rows: rows[kind] })),
  };
}

// The badges among some rows, one per explanation, best evidence first: the inspector's key.
export function badgeKey(rows: readonly Row[]): Provenance[] {
  const seen = new Map<string, Provenance>();
  for (const row of rows) seen.set(row.provenance.detail, row.provenance);
  return [...seen.values()].sort((a, b) => b.level - a.level || a.label.localeCompare(b.label));
}

// Each neuron's junctions onto muscle, by the neuron's name.
export function musclesByNeuron(data: WormlightData): Map<string, Neuromuscular[]> {
  const out = new Map<string, Neuromuscular[]>();
  for (const j of data.neuromuscular) {
    const list = out.get(j.pre);
    if (list) list.push(j);
    else out.set(j.pre, [j]);
  }
  return out;
}
