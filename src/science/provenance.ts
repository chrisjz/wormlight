// Where each connection's sign comes from, as the inspector's badges show it: the fidelity level of the
// source (spec §1.3) and a sentence naming it. The levels are the ledger's, component by component (PLAN
// §2.4), and a test keeps them so; the sources are the ones the runtime data names in meta.signBasis.

import type { Chemical, MuscleSignSource, Neuromuscular, SignSource } from '../data/schema.ts';
import { CITATIONS, type CitationId } from './citations.ts';
import type { Level } from './levels.ts';

export interface Provenance {
  level: Level;
  // A short label for the badge, and a sentence saying what it rests on.
  label: string;
  detail: string;
  // The work it cites, if one.
  cite: CitationId | null;
}

export const SIGN_LEVELS: Record<SignSource, Level> = { physiology: 5, expression: 4, rule: 0, none: 0 };
export const MUSCLE_SIGN_LEVELS: Record<MuscleSignSource, Level> = { receptor: 4, none: 0 };

const short = (id: string): string => (id in CITATIONS ? CITATIONS[id as CitationId].short : id);

export function chemicalProvenance(c: Pick<Chemical, 'signSource' | 'citation'>): Provenance {
  const level = SIGN_LEVELS[c.signSource];
  switch (c.signSource) {
    case 'physiology':
      return {
        level,
        label: 'Physiology',
        detail: `Measured: the sign comes from recordings (${short(c.citation ?? '')}).`,
        cite: (c.citation as CitationId | undefined) ?? null,
      };
    case 'expression':
      return {
        level,
        label: 'Expression',
        detail:
          "Derived: predicted from the cells' transmitter and receptor expression (Fenyves et al. 2020), " +
          'where Wang et al. 2024 confirm the transmitter.',
        cite: 'fenyves2020',
      };
    case 'rule':
      return {
        level,
        label: 'Transmitter',
        detail:
          "Assumed: from the presynaptic cell's transmitter alone (Wang et al. 2024): acetylcholine and " +
          'glutamate excite, GABA inhibits.',
        cite: 'wang2024',
      };
    case 'none':
      return {
        level,
        label: 'No basis',
        detail: 'Assumed: nothing gives this connection a sign, so the model gives it no fast effect.',
        cite: null,
      };
  }
}

export function muscleProvenance(j: Pick<Neuromuscular, 'signSource'>): Provenance {
  const level = MUSCLE_SIGN_LEVELS[j.signSource];
  return j.signSource === 'receptor'
    ? {
        level,
        label: 'Receptors',
        detail:
          "Derived: from the transmitter the cell releases (Wang et al. 2024) and muscle's receptors " +
          '(Richmond & Jorgensen 1999): acetylcholine excites, GABA inhibits.',
        cite: 'richmond1999',
      }
    : {
        level,
        label: 'No basis',
        detail: 'Assumed: the cell releases neither acetylcholine nor GABA, so it has no fast effect on muscle.',
        cite: null,
      };
}

// A gap junction has no sign; what the badge vouches for is that it exists.
export const GAP_PROVENANCE: Provenance = {
  level: 5,
  label: 'EM',
  detail:
    'Measured: seen by electron microscopy (Cook et al. 2019). In the model gap junctions pass current both ways and have no sign.',
  cite: 'cook2019',
};
