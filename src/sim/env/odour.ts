// The 2-butanone field (PLAN §5.2): 2D diffusion with first-order loss on a grid over the dish, the wall
// reflecting odour (no flux crosses it). Concentrations are in µM, as Levy & Bargmann's parameters use;
// lengths in metres and times in seconds. Sources release at a rate in µM·m²/s, a point spread over its four
// nearest cells, a disc over the cells whose centres it covers.

import { PARAMS } from '../../science/params.ts';
import { ODOUR_CELL, ODOUR_CELLS, ODOUR_SUBSTEP, ODOUR_TOLERANCE } from '../numerics.ts';

export const DIFFUSION = PARAMS.butanoneDiffusion.value * 1e-4; // cm² s⁻¹ → m² s⁻¹
export const DECAY_LENGTH = PARAMS.odourDecayLength.value * 1e-2; // cm → m
export const LOSS = DIFFUSION / (DECAY_LENGTH * DECAY_LENGTH); // s⁻¹, so that √(D/k) is the decay length

export interface Source {
  x: number;
  y: number;
  // µM·m²/s.
  rate: number;
  // A disc of this radius (m), or a point.
  radius?: number;
}

export interface FieldGeometry {
  cells: number;
  cell: number;
  // The dish's radius (m); cells whose centres lie outside it are outside the field.
  dish: number;
}

export const DISH_GEOMETRY: FieldGeometry = {
  cells: ODOUR_CELLS,
  cell: ODOUR_CELL,
  dish: PARAMS.dishDiameter.value / 200, // cm → m, radius
};

export class OdourField {
  readonly geometry: FieldGeometry;
  // µM per cell, row by row from the grid's lower left, and each cell's source in µM/s.
  readonly concentration: Float64Array;
  readonly source: Float64Array;
  // Whether each cell lies inside the dish, and the inside cells' indices.
  readonly inside: Uint8Array;
  private readonly cellsInside: Int32Array;
  private readonly scratch: Float64Array;

  constructor(geometry: FieldGeometry = DISH_GEOMETRY) {
    this.geometry = geometry;
    const { cells } = geometry;
    this.concentration = new Float64Array(cells * cells);
    this.source = new Float64Array(cells * cells);
    this.scratch = new Float64Array(cells * cells);
    this.inside = new Uint8Array(cells * cells);
    const list: number[] = [];
    // The grid's outermost ring always lies outside, so every inside cell has four neighbours on the grid.
    for (let j = 1; j < cells - 1; j++) {
      for (let i = 1; i < cells - 1; i++) {
        const [x, y] = this.centre(i, j);
        if (Math.hypot(x, y) < geometry.dish) {
          this.inside[j * cells + i] = 1;
          list.push(j * cells + i);
        }
      }
    }
    this.cellsInside = Int32Array.from(list);
  }

  // Cell (i, j)'s centre, in metres from the dish's centre.
  centre(i: number, j: number): [number, number] {
    const { cells, cell } = this.geometry;
    return [(i + 0.5 - cells / 2) * cell, (j + 0.5 - cells / 2) * cell];
  }

  // Add a source: a point spread bilinearly over its four nearest cells, or a disc spread evenly over the
  // cells whose centres it covers. Only cells inside the dish take any.
  addSource(s: Source): void {
    const { cells, cell } = this.geometry;
    const area = cell * cell;
    if (s.radius) {
      const covered: number[] = [];
      for (const k of this.cellsInside) {
        const [x, y] = this.centre(k % cells, Math.floor(k / cells));
        if (Math.hypot(x - s.x, y - s.y) <= s.radius) covered.push(k);
      }
      if (covered.length === 0) throw new Error('a source covers no cell of the dish');
      for (const k of covered) this.source[k] += s.rate / covered.length / area;
      return;
    }
    const gx = s.x / cell + cells / 2 - 0.5;
    const gy = s.y / cell + cells / 2 - 0.5;
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = gx - i;
    const fy = gy - j;
    const parts: [number, number, number][] = [
      [i, j, (1 - fx) * (1 - fy)],
      [i + 1, j, fx * (1 - fy)],
      [i, j + 1, (1 - fx) * fy],
      [i + 1, j + 1, fx * fy],
    ];
    const kept = parts.filter(
      ([a, b, w]) => w > 0 && a >= 0 && b >= 0 && a < cells && b < cells && this.inside[b * cells + a],
    );
    const total = kept.reduce((sum, [, , w]) => sum + w, 0);
    if (total === 0) throw new Error('a source lies outside the dish');
    for (const [a, b, w] of kept) this.source[b * cells + a] += (s.rate * w) / total / area;
  }

  // out = (k − D∇²) c over the cells inside the dish: the operator whose steady solution balances the sources.
  // A neighbour outside the dish contributes no flux, as a reflecting wall.
  private apply(c: Float64Array, out: Float64Array): void {
    const cells = this.geometry.cells;
    const d = DIFFUSION / (this.geometry.cell * this.geometry.cell);
    const inside = this.inside;
    const list = this.cellsInside;
    for (let n = 0; n < list.length; n++) {
      const k = list[n];
      const here = c[k];
      let flux = 0;
      if (inside[k - 1]) flux += c[k - 1] - here;
      if (inside[k + 1]) flux += c[k + 1] - here;
      if (inside[k - cells]) flux += c[k - cells] - here;
      if (inside[k + cells]) flux += c[k + cells] - here;
      out[k] = LOSS * here - d * flux;
    }
  }

  // Set the field to its steady state for the sources, by conjugate gradients on (k − D∇²) c = source, whose
  // operator is symmetric and positive definite.
  steady(tolerance = ODOUR_TOLERANCE): { iterations: number; residual: number } {
    const list = this.cellsInside;
    const b = this.source;
    const c = this.concentration;
    c.fill(0);
    const r = Float64Array.from(b);
    const p = Float64Array.from(r);
    const q = this.scratch;
    let bb = 0;
    for (let n = 0; n < list.length; n++) bb += b[list[n]] * b[list[n]];
    if (bb === 0) return { iterations: 0, residual: 0 };
    let rr = bb;
    let iterations = 0;
    while (rr > tolerance * tolerance * bb && iterations < 10000) {
      this.apply(p, q);
      let pq = 0;
      for (let n = 0; n < list.length; n++) pq += p[list[n]] * q[list[n]];
      const alpha = rr / pq;
      let next = 0;
      for (let n = 0; n < list.length; n++) {
        const k = list[n];
        c[k] += alpha * p[k];
        r[k] -= alpha * q[k];
        next += r[k] * r[k];
      }
      const beta = next / rr;
      rr = next;
      for (let n = 0; n < list.length; n++) {
        const k = list[n];
        p[k] = r[k] + beta * p[k];
      }
      iterations++;
    }
    return { iterations, residual: Math.sqrt(rr / bb) };
  }

  // Advance the field by `seconds`, in explicit sub-steps of at most ODOUR_SUBSTEP.
  step(seconds: number): void {
    const n = Math.max(1, Math.ceil(seconds / ODOUR_SUBSTEP - 1e-9));
    const dt = seconds / n;
    const c = this.concentration;
    const change = this.scratch;
    const list = this.cellsInside;
    for (let s = 0; s < n; s++) {
      this.apply(c, change);
      for (let m = 0; m < list.length; m++) {
        const k = list[m];
        c[k] += dt * (this.source[k] - change[k]);
      }
    }
  }

  // The concentration at a point (m), bilinear between cell centres; cells outside the dish count as their
  // nearest inside neighbour would, so the value doesn't dip at the wall.
  sample(x: number, y: number): number {
    const { cells, cell } = this.geometry;
    const gx = Math.min(Math.max(x / cell + cells / 2 - 0.5, 0), cells - 1.000001);
    const gy = Math.min(Math.max(y / cell + cells / 2 - 0.5, 0), cells - 1.000001);
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = gx - i;
    const fy = gy - j;
    const c = this.concentration;
    let sum = 0;
    let weight = 0;
    for (const [a, b, w] of [
      [i, j, (1 - fx) * (1 - fy)],
      [i + 1, j, fx * (1 - fy)],
      [i, j + 1, (1 - fx) * fy],
      [i + 1, j + 1, fx * fy],
    ] as const) {
      const k = b * cells + a;
      if (this.inside[k]) {
        sum += w * c[k];
        weight += w;
      }
    }
    return weight > 0 ? sum / weight : 0;
  }

  // The total odour in the dish (µM·m²).
  total(): number {
    const area = this.geometry.cell * this.geometry.cell;
    let sum = 0;
    for (let n = 0; n < this.cellsInside.length; n++) sum += this.concentration[this.cellsInside[n]];
    return sum * area;
  }
}
