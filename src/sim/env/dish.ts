// The dish's layout (PLAN §5.2): the standard chemotaxis plate of Bargmann, Hartwieg & Horvitz 1993, a 10 cm
// dish with the butanone spot 0.5 cm from its edge and a control spot opposite, the worm starting at the
// centre. The app puts a 1 cm food lawn where the spot is, releasing at the same total rate (DECISIONS.md,
// 2026-09-26). Positions are in metres from the dish's centre.

import { PARAMS } from '../../science/params.ts';
import { DISH_GEOMETRY, OdourField, type Source } from './odour.ts';

export const DISH_RADIUS = DISH_GEOMETRY.dish;
// The spot on the +x side, the control opposite.
export const SPOT: [number, number] = [DISH_RADIUS - PARAMS.spotOffset.value * 1e-2, 0];
export const CONTROL: [number, number] = [-SPOT[0], 0];
export const LAWN_RADIUS = PARAMS.lawnDiameter.value * 5e-3; // cm diameter → m radius
// Worms are counted within this distance of either spot (PLAN §7.4), as sodium azide stops them there.
export const CAPTURE_RADIUS = 5e-3; // m
// The adaptation model's working range tops out at K (PLAN §4.1).
const K = PARAMS.awcAdaptationScale.value; // µM

// The release rate (µM·m²/s) that sets the steady concentration to K at the capture circle's point facing the
// dish's centre, where a worm coming from the centre enters it: the registry's rule for odourReleaseRate,
// taken on the walled grid (DECISIONS.md, 2026-09-26). The field is linear in the rate, so one solve at unit
// rate gives it.
export function releaseRate(): number {
  const field = new OdourField();
  field.addSource({ x: SPOT[0], y: SPOT[1], rate: 1 });
  field.steady();
  return K / field.sample(SPOT[0] - CAPTURE_RADIUS, SPOT[1]);
}

export type Layout = 'assay' | 'lawn';

// The sources of a layout: checkpoint 4's butanone spot (the control releases nothing), or the app's lawn.
export function sources(layout: Layout, rate = releaseRate()): Source[] {
  return layout === 'assay'
    ? [{ x: SPOT[0], y: SPOT[1], rate }]
    : [{ x: SPOT[0], y: SPOT[1], rate, radius: LAWN_RADIUS }];
}

// A layout's field at its steady state, as trials and the app start from it.
export function steadyField(layout: Layout, rate = releaseRate()): OdourField {
  const field = new OdourField();
  for (const s of sources(layout, rate)) field.addSource(s);
  field.steady();
  return field;
}
