// What the inspector shows for a neuron (spec §6 "Inspect"): who it is, where it sits, its part in the model,
// and its connections, strongest first, each with the provenance of its sign.

import type { CellClass, Neuron, Neuromuscular, Sign, WormlightData } from '../data/schema.ts';
import { chemicalProvenance, GAP_PROVENANCE, muscleProvenance, type Provenance } from '../science/provenance.ts';
import type { Wiring } from './connections.ts';

export interface Row {
  // The partner's name, and its index when it is a neuron (a muscle has none).
  name: string;
  neuron: number | null;
  sections: number;
  sign: Sign | null; // null for a gap junction, which has no sign
  provenance: Provenance;
}

export interface Group {
  kind: 'out' | 'in' | 'gap' | 'muscle';
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

const TRANSMITTERS: Record<string, string> = {
  ACh: 'acetylcholine',
  Glu: 'glutamate',
  GABA: 'GABA',
  DA: 'dopamine',
  '5-HT': 'serotonin',
};

const percent = (f: number): string => `${Math.round(100 * f)}%`;

function facts(n: Neuron): { label: string; value: string }[] {
  const out = [
    {
      label: n.transmitters.length > 1 ? 'Transmitters' : 'Transmitter',
      value:
        n.transmitters.length === 0
          ? 'none identified (Wang et al. 2024)'
          : `${n.transmitters.map((t) => TRANSMITTERS[t] ?? t).join(', ')} (Wang et al. 2024)`,
    },
    { label: 'Soma', value: `${percent(n.position.s)} of the way from nose to tail (WormBase Virtual Worm)` },
  ];
  if (n.sensing.kind === 'tip') {
    const where = n.sensing.s < 0.02 ? 'at the nose' : `${percent(n.sensing.s)} of the way along`;
    out.push({ label: 'Senses', value: `at its dendrite tip, ${where}` });
  }
  if (n.sensing.kind === 'field') {
    out.push({
      label: 'Senses',
      value: `touch from ${percent(n.sensing.s0)} to ${percent(n.sensing.s1)} of the way along`,
    });
  }
  const role = {
    A: 'an A-type rhythm oscillator (Gao et al. 2018)',
    B: 'a B-type rhythm oscillator (Fouad et al. 2018; Xu et al. 2018)',
    headSwitch: "driven by the head's proprioceptive switch (Ji et al. 2021)",
  } as const;
  if (n.oscillator) out.push({ label: 'In the model', value: role[n.oscillator] });
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
          kind === 'gap' || c.signSource === null
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
  const groups: Group[] = [
    { kind: 'out', title: 'Synapses onto', rows: neuronRows('out') },
    { kind: 'in', title: 'Synapses from', rows: neuronRows('in') },
    { kind: 'gap', title: 'Gap junctions with', rows: neuronRows('gap') },
    { kind: 'muscle', title: 'Synapses onto muscle', rows: muscleRows },
  ];
  return {
    index,
    name: neuron.name,
    cellClass: neuron.class,
    facts: facts(neuron),
    groups: groups.filter((g) => g.rows.length > 0),
  };
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
