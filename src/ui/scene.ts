// What the plate draws of the dish (PLAN §5.2): the app's lawn where checkpoint 4's spot sits, and its steady
// odour field as log₂(C/K), a texture the agar shader reads with row j at y = (j + ½ − cells/2)·h, the rows
// running up the dish as OdourField's do.

import type { PlateScene } from '../render/plate.ts';
import { PARAMS } from '../science/params.ts';
import { LAWN_RADIUS, SPOT, steadyField } from '../sim/env/dish.ts';
import type { OdourField } from '../sim/env/odour.ts';

const K = PARAMS.awcAdaptationScale.value; // µM, the top of AWC's working range (PLAN §4.1)
// How many rings of cells outside the dish take their inside neighbours' values, and what the rest hold.
export const RINGS = 4;
export const FAR = -30;

// log₂(C/K) per cell. Cells outside the dish take their inside neighbours' mean, RINGS rings deep, so the
// shader's interpolation doesn't pull the field down at the wall and crowd isolines there; the rest hold FAR.
export function levels(field: OdourField): Float32Array {
  const { cells } = field.geometry;
  const level = new Float32Array(cells * cells).fill(NaN);
  for (let k = 0; k < level.length; k++) {
    if (field.inside[k] && field.concentration[k] > 0) level[k] = Math.log2(field.concentration[k] / K);
  }
  for (let ring = 0; ring < RINGS; ring++) {
    const next = Float32Array.from(level);
    for (let j = 1; j < cells - 1; j++) {
      for (let i = 1; i < cells - 1; i++) {
        const k = j * cells + i;
        if (!Number.isNaN(level[k])) continue;
        let sum = 0;
        let n = 0;
        for (const m of [k - 1, k + 1, k - cells, k + cells]) {
          if (!Number.isNaN(level[m])) {
            sum += level[m];
            n++;
          }
        }
        if (n > 0) next[k] = sum / n;
      }
    }
    level.set(next);
  }
  for (let k = 0; k < level.length; k++) if (Number.isNaN(level[k])) level[k] = FAR;
  return level;
}

export function plateScene(field: OdourField = steadyField('lawn')): PlateScene {
  const { cells, cell } = field.geometry;
  return {
    odour: { level: levels(field), cells, extent: cells * cell },
    lawn: { x: SPOT[0], y: SPOT[1], radius: LAWN_RADIUS },
  };
}
