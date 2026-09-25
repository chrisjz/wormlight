// Figures the fidelity ledger quotes, counted from the runtime data rather than typed, so the ledger
// cannot drift from the file the model loads.

import type { SignSource, WormlightData } from '../data/schema.ts';

export interface Share {
  count: number;
  sections: number;
  // Of all chemical connections, and of all their EM sections, as whole-number and one-decimal percents.
  percent: string;
  percentWhole: string;
}

export interface Facts {
  neurons: number;
  muscles: number;
  chemical: number;
  autapses: number;
  gapPairs: number;
  neuromuscular: number;
  signs: Record<SignSource, Share>;
  // Cells that synapse onto muscle but release neither acetylcholine nor GABA.
  silentMuscleInputs: number;
  // The neuron with the most gap-junction sections, and how many it has.
  largestGap: { name: string; sections: number };
  // The EM sections of the A- and B-type motor neurons' excitatory junctions onto dorsal and ventral muscle.
  motorMuscle: Record<'A' | 'B', { dorsal: number; ventral: number }>;
}

export function countFacts(data: WormlightData): Facts {
  const total = data.chemical.length;
  const share = (source: SignSource): Share => {
    const of = data.chemical.filter((c) => c.signSource === source);
    return {
      count: of.length,
      sections: of.reduce((sum, c) => sum + c.sections, 0),
      percent: `${((100 * of.length) / total).toFixed(1)}%`,
      percentWhole: `${Math.round((100 * of.length) / total)}%`,
    };
  };
  return {
    neurons: data.neurons.length,
    muscles: data.muscles.length,
    chemical: total,
    autapses: data.chemical.filter((c) => c.pre === c.post).length,
    gapPairs: data.gap.length,
    neuromuscular: data.neuromuscular.length,
    signs: {
      physiology: share('physiology'),
      expression: share('expression'),
      rule: share('rule'),
      none: share('none'),
    },
    silentMuscleInputs: new Set(data.neuromuscular.filter((j) => j.sign === 0).map((j) => j.pre)).size,
    largestGap: largestGap(data),
    motorMuscle: motorMuscle(data),
  };
}

function motorMuscle(data: WormlightData): Facts['motorMuscle'] {
  const type = new Map(data.neurons.map((n) => [n.name, n.oscillator]));
  const side = new Map(data.muscles.map((m) => [m.name, m.quadrant.startsWith('D') ? 'dorsal' : 'ventral'] as const));
  const out = { A: { dorsal: 0, ventral: 0 }, B: { dorsal: 0, ventral: 0 } };
  for (const j of data.neuromuscular) {
    const t = type.get(j.pre);
    const s = side.get(j.muscle);
    if (j.sign > 0 && (t === 'A' || t === 'B') && s) out[t][s] += j.sections;
  }
  return out;
}

function largestGap(data: WormlightData): { name: string; sections: number } {
  const totals = new Map<string, number>();
  for (const g of data.gap) {
    totals.set(g.a, (totals.get(g.a) ?? 0) + g.sections);
    totals.set(g.b, (totals.get(g.b) ?? 0) + g.sections);
  }
  let best = { name: '', sections: -1 };
  for (const [name, sections] of totals) {
    if (sections > best.sections || (sections === best.sections && name < best.name)) best = { name, sections };
  }
  return best;
}

// A thousands separator, as the ledger writes counts; by hand, so no locale data is involved.
export const grouped = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
