// Track S's model (PLAN §9; DECISIONS.md, 2026-10-01). Its measured signs come as a copy of the runtime data with
// them applied, so that every brain and every layer built from the data reads them, touch's currents and AWC's
// gains among them, as the track's rules have those rerun on its model. The app and the refit read the runtime data
// as it is until track S's fit is chosen.

import { TRACK_S_SIGNS } from '../data/trackSSigns.ts';
import type { WormlightData } from '../data/schema.ts';
import { reference } from '../science/citations.ts';

const key = (pre: string, post: string): string => `${pre}→${post}`;

// The runtime data with track S's measured signs applied: each row's connection takes its sign, as cited physiology,
// and the row's citation joins the file's.
export function withMeasuredSigns(data: WormlightData): WormlightData {
  const rows = new Map(TRACK_S_SIGNS.map((r) => [key(r.pre, r.post), r]));
  let applied = 0;
  const chemical = data.chemical.map((c) => {
    const row = rows.get(key(c.pre, c.post));
    if (!row) return c;
    applied++;
    return { ...c, sign: row.sign, signSource: 'physiology' as const, citation: row.citation };
  });
  if (applied !== rows.size) throw new Error("track S's signs name connections the data doesn't have");
  const citations = { ...data.meta.citations };
  for (const row of TRACK_S_SIGNS) citations[row.citation] ??= reference(row.citation);
  return { ...data, meta: { ...data.meta, citations }, chemical };
}
