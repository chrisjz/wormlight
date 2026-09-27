// GPU parity for the odour field (PLAN §7.2, set 2026-09-27 before any food was built): the GPU's stepped field
// against OdourField.step, from the app's steady lawn field with a second lawn just dropped at the dish's centre,
// both sides taking the same sub-steps. After one sub-step and after one simulated second, every cell must lie
// within its share of the CPU field's largest concentration; over the second, the change in the total odour
// within FIELD_SECOND of the CPU's, which the explicit scheme makes what the sources released less the loss.

import { lawnSources } from '../sim/env/dish.ts';
import { OdourField } from '../sim/env/odour.ts';
import { GpuField } from './field.ts';
import { packOdour } from './loopLayout.ts';
import { FIELD_SECOND, FIELD_STEP, FIELD_TIMES, fieldCase } from './parityCases.ts';

export interface FieldResult {
  label: string;
  seconds: number;
  // The largest error in any cell inside the dish, as a share of its tolerance, and the error in the change of
  // the total odour as a share of its (after one second only).
  share: number;
  totalShare: number | null;
  pass: boolean;
}

export interface FieldReport {
  results: FieldResult[];
  pass: boolean;
  seconds: number;
}

export async function runFieldParity(device: GPUDevice): Promise<FieldReport> {
  const started = performance.now();
  const { start, lawns } = fieldCase();
  const grid = packOdour(start);
  const dropped = new OdourField(start.geometry);
  dropped.setSources(lawnSources(lawns));
  const gpu = await GpuField.create(device, grid, dropped.source);
  const inside = start.inside;
  const total = (c: ArrayLike<number>): number => {
    let sum = 0;
    for (let k = 0; k < c.length; k++) if (inside[k]) sum += c[k];
    return sum;
  };
  const results: FieldResult[] = [];
  try {
    for (const [label, seconds, tolerance] of [
      ['one sub-step', FIELD_TIMES.step, FIELD_STEP],
      ['one second', FIELD_TIMES.second, FIELD_SECOND],
    ] as const) {
      const cpu = new OdourField(start.geometry);
      cpu.concentration.set(start.concentration);
      cpu.setSources(lawnSources(lawns));
      cpu.step(seconds);
      gpu.set(grid.values);
      gpu.step(seconds);
      const got = await gpu.read();
      let largest = 0;
      let error = 0;
      for (let k = 0; k < got.length; k++) {
        if (!inside[k]) continue;
        largest = Math.max(largest, cpu.concentration[k]);
        error = Math.max(error, Math.abs(got[k] - cpu.concentration[k]));
      }
      const share = error / (tolerance * largest);
      // Over the second, the change in the total, each side from where it started: the GPU from its f32 copy.
      const totalShare =
        seconds === FIELD_TIMES.second
          ? Math.abs(total(got) - total(grid.values) - (total(cpu.concentration) - total(start.concentration))) /
            (FIELD_SECOND * Math.abs(total(cpu.concentration) - total(start.concentration)))
          : null;
      results.push({ label, seconds, share, totalShare, pass: share <= 1 && (totalShare ?? 0) <= 1 });
    }
  } finally {
    gpu.destroy();
  }
  return { results, pass: results.every((r) => r.pass), seconds: (performance.now() - started) / 1000 };
}
