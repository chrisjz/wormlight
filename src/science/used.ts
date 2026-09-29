// Every citation the registry uses: in the ledger, the parameters, the omitted and presentation lists,
// the reference data and the calibration's targets. The generated page lists these, and a test fails on one no part uses.

import type { CitationId } from './citations.ts';
import { COMPONENTS, OMITTED, PRESENTATION, SUBSYSTEMS } from './fidelity.ts';
import { PARAMS, type Param } from './params.ts';
import { CALIBRATION_TARGETS, REFERENCE_DATA } from './validation.ts';

export function usedCitations(): Set<CitationId> {
  return new Set<CitationId>([
    ...COMPONENTS.flatMap((c) => c.sources),
    ...Object.values(SUBSYSTEMS).flatMap((s) => s.sources),
    ...(Object.values(PARAMS) as Param[]).flatMap((p) => p.sources),
    ...[...OMITTED, ...PRESENTATION].flatMap((item) => item.sources),
    ...REFERENCE_DATA.flatMap((r) => r.sources),
    ...CALIBRATION_TARGETS.flatMap((r) => r.sources),
  ]);
}
