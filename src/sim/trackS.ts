// Track S's model (PLAN §9; DECISIONS.md, 2026-10-01). Its measured signs come as a copy of the runtime data with
// them applied, so that its brain, and every layer a World builds from the data, read them; touch's currents among
// them. AWC's gains are constants set at the runtime data's rest (`AWC_GAIN`), and are rerun on track S's model with
// its class offsets, which move that rest, as the track's rules have them. The app and the refit read the runtime
// data as it is until track S's fit is chosen.
//
// The copy keeps the runtime file's `meta.version`, a digest of the runtime file's contents, which its signs no longer
// match: a link, a record or a manifest tells track S's model apart by its loop parameters, never by the data's
// version.

import { TRACK_S_SIGNS } from '../data/trackSSigns.ts';
import type { WormlightData } from '../data/schema.ts';
import { reference } from '../science/citations.ts';

const key = (pre: string, post: string): string => `${pre}→${post}`;

// One copy for each runtime data object, so that the many worlds a run builds, sham twins and calibration trials
// among them, share it and the caches keyed on it, touch's among them.
const copies = new WeakMap<WormlightData, WormlightData>();

// The runtime data with track S's measured signs applied: each row's connection takes its sign, as cited physiology,
// and the row's citation joins the file's.
export function withMeasuredSigns(data: WormlightData): WormlightData {
  const cached = copies.get(data);
  if (cached) return cached;
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
  const copy = { ...data, meta: { ...data.meta, citations }, chemical };
  copies.set(data, copy);
  return copy;
}
