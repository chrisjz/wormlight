// Where each connection's sign comes from, as the inspector's badges show it: the fidelity level of the
// source (spec §1.3) and a sentence naming it. The levels are the ledger's, component by component (PLAN
// §2.4), and the cited works are the ones the runtime data names in meta.signBasis; tests keep both so.

import type { Chemical, MuscleSignSource, Neuromuscular, SignSource } from '../data/schema.ts';
import { CITATIONS, type CitationId } from './citations.ts';
import type { Level } from './levels.ts';

export interface Provenance {
  level: Level;
  // A short label for the badge, and a sentence saying what it rests on.
  label: string;
  detail: string;
  // The work it rests on, if one.
  cite: CitationId | null;
}

export const SIGN_LEVELS: Record<SignSource, Level> = { physiology: 5, expression: 4, rule: 0, none: 0 };
export const MUSCLE_SIGN_LEVELS: Record<MuscleSignSource, Level> = { receptor: 4, none: 0 };

const isCitation = (id: string | undefined): id is CitationId => id !== undefined && id in CITATIONS;

export function chemicalProvenance(c: Pick<Chemical, 'signSource' | 'citation'>): Provenance {
  const level = SIGN_LEVELS[c.signSource];
  switch (c.signSource) {
    case 'physiology': {
      const cite = isCitation(c.citation) ? c.citation : null;
      return {
        level,
        label: 'Physiology',
        detail: `Measured: the sign comes from recordings (${cite ? CITATIONS[cite].short : 'a cited paper'}).`,
        cite,
      };
    }
    case 'expression':
      return {
        level,
        label: 'Expression',
        detail:
          "Derived: predicted from the cells' transmitter and receptor expression (Fenyves et al. 2020), " +
          'where Wang et al. 2024 confirm the primary transmitter it rests on.',
        cite: 'fenyves2020',
      };
    case 'rule':
      return {
        level,
        label: 'Transmitter rule',
        detail:
          "Assumed: from the presynaptic cell's primary transmitter alone (Wang et al. 2024): acetylcholine " +
          'and glutamate excite, GABA inhibits.',
        cite: 'wang2024',
      };
    case 'none':
      return {
        level,
        label: 'No sign',
        detail:
          "Assumed: the presynaptic cell's primary transmitter (Wang et al. 2024) implies no fast sign, and no " +
          'accepted recording or prediction gives one, so the model gives it no fast effect.',
        cite: null,
      };
  }
}

export function muscleProvenance(j: Pick<Neuromuscular, 'signSource'>): Provenance {
  const level = MUSCLE_SIGN_LEVELS[j.signSource];
  switch (j.signSource) {
    case 'receptor':
      return {
        level,
        label: 'Receptors',
        detail:
          "Derived: from the cell's primary transmitter (Wang et al. 2024) and body wall muscle's receptors " +
          '(Richmond & Jorgensen 1999): acetylcholine excites, GABA inhibits.',
        cite: 'richmond1999',
      };
    case 'none':
      return {
        level,
        label: 'No ACh or GABA',
        detail:
          'Assumed: Wang et al. 2024 identify neither acetylcholine nor GABA release by this cell, so the model ' +
          'gives it no fast effect on muscle.',
        cite: null,
      };
  }
}

// A gap junction has no sign; what the badge vouches for is that it exists.
export const GAP_PROVENANCE: Provenance = {
  level: 5,
  label: 'EM',
  detail:
    'Measured: from serial-section electron microscopy (Cook et al. 2019, with corrections and additions released ' +
    'in Emmons 2024); some connections were extrapolated where no sections exist. In the model gap junctions ' +
    'pass current both ways and have no sign.',
  cite: 'cook2019',
};
