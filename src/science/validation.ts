// Reference data the validation checkpoints (PLAN.md §7) score the model against or start it from, fixed
// before any simulated data exist. The harness reads these; the pins themselves are in data/sources.json.

import type { CitationId } from './citations.ts';

export interface ReferenceData {
  // The pin in data/sources.json that holds the file.
  pin: string;
  checkpoints: readonly number[];
  use: string;
  sources: readonly CitationId[];
}

export const EIGENWORM_BASIS = {
  pin: 'eigenworms',
  checkpoints: [1],
  use: "The first four modes, over 100 tangent angles with the head first, score the share of posture variance they capture: postures pooled over all 20 trials at 4 Hz, each trial's first 10 s left out, and self-intersecting postures left out, as Stephens et al. left them out (PLAN §7.4).",
  sources: ['stephens2008', 'hebert2021', 'broekmans2016', 'oist2025'],
} as const satisfies ReferenceData;

export const STARTING_POSTURES = {
  pin: 'oist-postures',
  checkpoints: [0, 1],
  use: "Each trial starts from one of these 6,655 real postures, drawn by its seed, head first and turned to a heading drawn uniformly (PLAN §7.4). The data build checks them, and finds the first four eigenworms capture 96.46% of their variance by the harness's own measure.",
  sources: ['oist2025', 'stephens2008'],
} as const satisfies ReferenceData;

export const REFERENCE_DATA: readonly ReferenceData[] = [EIGENWORM_BASIS, STARTING_POSTURES];
