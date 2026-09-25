// Reference data the validation checkpoints (PLAN.md §7) score the model against, fixed before any
// simulated data exist. The harness reads these; the pins themselves are in data/sources.json.

import type { CitationId } from './citations.ts';

export interface ReferenceData {
  // The pin in data/sources.json that holds the file.
  pin: string;
  checkpoint: number;
  use: string;
  sources: readonly CitationId[];
}

export const EIGENWORM_BASIS = {
  pin: 'eigenworms',
  checkpoint: 1,
  use: "The first four modes, over 100 tangent angles with the head first, score the share of posture variance they capture: postures pooled over all 20 trials at 4 Hz, each trial's first 10 s left out, and self-intersecting postures left out, as Stephens et al. left them out (PLAN §7.4).",
  sources: ['stephens2008', 'hebert2021', 'broekmans2016', 'oist2025'],
} as const satisfies ReferenceData;

export const REFERENCE_DATA: readonly ReferenceData[] = [EIGENWORM_BASIS];
