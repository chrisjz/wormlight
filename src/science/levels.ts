// The fidelity scale (spec §1.3): how well biology supports a part of the model. A level describes the
// kind of evidence, not how much a part matters, and not certainty.

export type Level = 5 | 4 | 3 | 2 | 1 | 0;
// Parts that make no quantitative claim: biology deliberately left out, and visual choices.
export type Tag = 'omitted' | 'presentation';

export interface ScaleStep {
  level: Level | Tag;
  symbol: string;
  name: string;
  meaning: string;
  example: string;
}

export const SCALE: readonly ScaleStep[] = [
  {
    level: 5,
    symbol: '5',
    name: 'Measured',
    meaning: 'Observed directly in _C. elegans_ and used as-is.',
    example: 'Who connects to whom (Cook et al. 2019).',
  },
  {
    level: 4,
    symbol: '4',
    name: 'Derived',
    meaning: 'Computed from _C. elegans_ measurements by a published method.',
    example: 'Synapse signs predicted from receptor expression (Fenyves et al. 2020).',
  },
  {
    level: 3,
    symbol: '3',
    name: 'Established',
    meaning: 'A published _C. elegans_ model or value, used in the regime it was fitted for.',
    example: 'A 100 ms muscle time constant (Boyle, Berri & Cohen 2012).',
  },
  {
    level: 2,
    symbol: '2',
    name: 'Hypothesis or adapted',
    meaning: "A mechanism with support that the field hasn't settled, or a published value moved to a new setting.",
    example: "A head rhythm switched by proprioceptive thresholds; Kunert's conductances on Cook's data.",
  },
  {
    level: 1,
    symbol: '1',
    name: 'Calibrated',
    meaning: 'Tuned by us so the model reproduces a behaviour. It shows the model can, not that it predicts.',
    example: 'Neural noise set to match the spontaneous reversal rate.',
  },
  {
    level: 0,
    symbol: '0',
    name: 'Assumed',
    meaning: 'A simplification or placeholder with no specific evidence behind it; first in line for replacement.',
    example: 'Synaptic strength proportional to EM section count.',
  },
  {
    level: 'omitted',
    symbol: '—',
    name: 'Omitted',
    meaning: 'Known biology deliberately left out.',
    example: 'Neuropeptide signalling.',
  },
  {
    level: 'presentation',
    symbol: '◇',
    name: 'Presentation',
    meaning: 'A visual choice that makes no biological claim.',
    example: "The glow's colour and normalisation.",
  },
];

// A value is free, and counts toward the parameter budget, when we set it ourselves: calibrated or assumed.
export const isFree = (level: Level): boolean => level <= 1;

// The levels a set of parts spans, written as the ledger writes them: "5–0", "3", or a tag's symbol.
export function levelRange(levels: readonly Level[]): string {
  if (levels.length === 0) throw new Error('a range needs at least one level');
  const high = Math.max(...levels);
  const low = Math.min(...levels);
  return high === low ? String(high) : `${high}–${low}`;
}
