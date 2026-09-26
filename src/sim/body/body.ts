// The body (PLAN §5.1): Boyle, Berri & Cohen 2012's 2D model of a crawling worm. The body is 49 rigid
// rods, each a dorsoventral diameter with a centre and an angle, joined by lateral elements (cuticle and
// muscle) along each side and by diagonal elements that stand in for internal pressure. Each element is a
// spring in parallel with a damper, and a muscle's stiffness, damping and rest length scale with its
// activation (their eqs. 3–7). Motion is overdamped: on every rod the internal forces balance agar drag.
//
// Units are SI: metres, seconds, newtons. Rod i's dorsal point is its centre plus R_i·u_i, with
// u_i = (cos θ_i, sin θ_i), and its ventral point the centre minus that. Rod 0 is the head, and
// t = (sin θ, −cos θ) runs along the body from head to tail, so u is t turned anticlockwise: the dorsal side
// is on the left looking tailwards, and on the right of the direction of travel.
//
// Each step is semi-implicit Euler: the rods' velocities q̇ = (ẋ, ẏ, θ̇) solve (Ξ − B) q̇ = G, where Ξ is the
// drag, B the dampers and G the springs' and muscles' forces at the start of the step, and q advances by
// dt·q̇. Every spring has a damper in parallel, so no mode relaxes faster than β_D/κ_D = 10 ms, and the
// springs need no implicit treatment at the 2.5 ms step (DECISIONS.md). The matrix is symmetric and block
// tridiagonal (49 blocks of 3 × 3), because the dampers join neighbouring rods; the CPU solves it by block
// elimination.

import { PARAMS } from '../../science/params.ts';
import { WALL_SOFTENING } from '../numerics.ts';

export interface BodyParams {
  // M segments between M + 1 rods, each L_seg long.
  segments: number;
  segmentLength: number;
  // Each rod's radius, and the body's largest.
  radii: Float64Array;
  radius: number;
  lateralStiffness: number;
  diagonalStiffness: number;
  muscleStiffness: number;
  lateralDamping: number;
  diagonalDamping: number;
  muscleDamping: number;
  shortening: number;
  // F_max,m for each segment's muscles.
  efficacy: Float64Array;
  // Per rod: drag across the body (along the rod), along the body, and against the rod's rotation.
  dragNormal: number;
  dragTangential: number;
  dragRotation: Float64Array;
  // The dish's radius (m), whose wall stops the rods (PLAN §5.2); a radius beyond the body's reach for none,
  // never Infinity, which the GPU may not hold.
  wall: number;
}

// Radii on a prolate ellipse whose major radius is a little over half the body, so the tips keep a width
// (Boyle et al.'s eq. 2).
export function ellipseRadii(segments: number, radius: number): Float64Array {
  return Float64Array.from({ length: segments + 1 }, (_, i) =>
    Math.abs(radius * Math.sin(Math.acos((i - segments / 2) / (segments / 2 + 0.2)))),
  );
}

// The body from the registry: Boyle et al.'s Table 1, with each rod taking the whole worm's drag divided by
// 2(M + 1), and resisting rotation with 4πR_i² times its tangential coefficient, as their code does.
export function boyleBody(radii?: Float64Array): BodyParams {
  const p = PARAMS;
  const segments = p.bodyUnits.value;
  const length = p.bodyLength.value * 1e-3;
  const radius = p.bodyRadius.value * 1e-6;
  const rods = segments + 1;
  const r = radii ?? ellipseRadii(segments, radius);
  const lateralStiffness = p.lateralStiffness.value;
  const lateralDamping = lateralStiffness * p.lateralDamping.value;
  const diagonalStiffness = lateralStiffness * p.diagonalStiffness.value;
  const dragTangential = p.dragParallel.value / (2 * rods);
  return {
    segments,
    segmentLength: length / segments,
    radii: r,
    radius,
    lateralStiffness,
    diagonalStiffness,
    muscleStiffness: lateralStiffness * p.muscleStiffness.value,
    lateralDamping,
    diagonalDamping: diagonalStiffness * p.diagonalDamping.value,
    muscleDamping: lateralDamping * p.muscleDamping.value,
    shortening: p.muscleShortening.value,
    // F_max,m = F_max (1 − fall·(m − 1)/M), with the head muscle weakened further (Table 1).
    efficacy: Float64Array.from(
      { length: segments },
      (_, m) =>
        p.muscleEfficacy.value *
        (1 - (p.muscleEfficacyFall.value * m) / segments) *
        (m === 0 ? p.headMuscleEfficacy.value : 1),
    ),
    dragNormal: p.dragPerpendicular.value / (2 * rods),
    dragTangential,
    dragRotation: Float64Array.from(r, (ri) => 4 * Math.PI * ri * ri * dragTangential),
    wall: p.dishDiameter.value / 200, // cm → m, radius
  };
}

// Boyle et al.'s piecewise-linear σ, which bounds a muscle's response to [0, 1].
const clamp01 = (a: number): number => (a <= 0 ? 0 : a >= 1 ? 1 : a);

export class Body {
  readonly params: BodyParams;
  readonly rods: number;
  // Rod centres and angles.
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly theta: Float64Array;
  // Muscle activation per segment, dorsal and ventral, in [0, 1].
  readonly dorsal: Float64Array;
  readonly ventral: Float64Array;
  // External force on each rod's centre, x then y, in newtons.
  readonly force: Float64Array;

  // Per segment: the lateral and diagonal rest lengths, and the shortest a muscle can pull a lateral.
  readonly restLateral: Float64Array;
  readonly restDiagonal: Float64Array;
  readonly shortest: Float64Array;
  // The system, as symmetric block-tridiagonal 3 × 3 blocks: diagonal blocks, blocks above the diagonal
  // (rod i with rod i + 1), and the right-hand side; then elimination workspace.
  private readonly diag: Float64Array;
  private readonly upper: Float64Array;
  private readonly rhs: Float64Array;
  private readonly velocity: Float64Array;
  private readonly factor: Float64Array;
  private readonly carry: Float64Array;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly g = new Float64Array(6);
  private readonly block = new Float64Array(9);
  private readonly inverse = new Float64Array(9);
  private readonly residual = new Float64Array(3);

  constructor(params: BodyParams) {
    this.params = params;
    const n = params.segments + 1;
    this.rods = n;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.theta = new Float64Array(n);
    this.dorsal = new Float64Array(params.segments);
    this.ventral = new Float64Array(params.segments);
    this.force = new Float64Array(2 * n);
    const { radii: r, segmentLength: ls } = params;
    this.restLateral = Float64Array.from({ length: params.segments }, (_, m) => Math.hypot(ls, r[m] - r[m + 1]));
    this.restDiagonal = Float64Array.from({ length: params.segments }, (_, m) => Math.hypot(ls, r[m] + r[m + 1]));
    this.shortest = Float64Array.from(
      this.restLateral,
      (l, m) => l * (1 - (params.shortening * (r[m] + r[m + 1])) / (2 * params.radius)),
    );
    this.diag = new Float64Array(9 * n);
    this.upper = new Float64Array(9 * n);
    this.rhs = new Float64Array(3 * n);
    this.velocity = new Float64Array(3 * n);
    this.factor = new Float64Array(9 * n);
    this.carry = new Float64Array(3 * n);
    this.cos = new Float64Array(n);
    this.sin = new Float64Array(n);
    this.straighten();
  }

  // A straight, relaxed body with its head at (x, y) and its tail along the direction `heading` + π, so
  // the head leads when it crawls towards `heading`.
  straighten(x = 0, y = 0, heading = Math.PI): void {
    const ls = this.params.segmentLength;
    // Head to tail must be t = (sin θ, −cos θ) = −(cos heading, sin heading), so θ = heading − π/2.
    const theta = heading - Math.PI / 2;
    const tx = Math.sin(theta);
    const ty = -Math.cos(theta);
    for (let i = 0; i < this.rods; i++) {
      this.x[i] = x + i * ls * tx;
      this.y[i] = y + i * ls * ty;
      this.theta[i] = theta;
    }
  }

  // Lay the body along a midline, head at (x, y), given as the directions of its equal pieces from head to
  // tail (radians anticlockwise from x), the whole body long. The rods keep their rest spacing along it, each
  // across the midline, square to the line through its neighbours.
  pose(angles: ArrayLike<number>, x = 0, y = 0): void {
    if (angles.length === 0) throw new Error('a posture needs at least one angle');
    const ls = this.params.segmentLength;
    const piece = (ls * this.params.segments) / angles.length;
    let px = x;
    let py = y;
    let k = 0;
    for (let i = 0; i < this.rods; i++) {
      const s = i * ls;
      while (k < angles.length - 1 && (k + 1) * piece <= s) {
        px += piece * Math.cos(angles[k]);
        py += piece * Math.sin(angles[k]);
        k++;
      }
      this.x[i] = px + (s - k * piece) * Math.cos(angles[k]);
      this.y[i] = py + (s - k * piece) * Math.sin(angles[k]);
    }
    for (let i = 0; i < this.rods; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(this.rods - 1, i + 1);
      // Head to tail is t = (sin θ, −cos θ), so a direction ψ along the body gives θ = ψ + π/2.
      this.theta[i] = Math.atan2(this.y[b] - this.y[a], this.x[b] - this.x[a]) + Math.PI / 2;
    }
  }

  // Rod centres from head to tail, as [x0, y0, x1, y1, …].
  midline(): Float64Array {
    const out = new Float64Array(2 * this.rods);
    for (let i = 0; i < this.rods; i++) {
      out[2 * i] = this.x[i];
      out[2 * i + 1] = this.y[i];
    }
    return out;
  }

  step(dt: number): void {
    this.assemble();
    this.solve();
    const v = this.velocity;
    for (let i = 0; i < this.rods; i++) {
      this.x[i] += dt * v[3 * i];
      this.y[i] += dt * v[3 * i + 1];
      this.theta[i] += dt * v[3 * i + 2];
    }
  }

  // The velocities the last step took, [ẋ, ẏ, θ̇] per rod, zero before the first; rates() replaces them.
  lastRates(): Float64Array {
    return Float64Array.from(this.velocity);
  }

  // Set the velocities lastRates() reports, as a restored state had them. The next step doesn't read them.
  restoreRates(rates: ArrayLike<number>): void {
    this.velocity.set(rates);
  }

  // The rods' velocities in the current state, [ẋ, ẏ, θ̇] per rod: the overdamped motion the next step
  // takes.
  rates(): Float64Array {
    this.assemble();
    this.solve();
    return Float64Array.from(this.velocity);
  }

  private assemble(): void {
    const p = this.params;
    const { theta, diag, upper, rhs } = this;
    diag.fill(0);
    upper.fill(0);
    rhs.fill(0);
    // Drag on each rod: across the body along u, along the body along t, and against rotation.
    for (let i = 0; i < this.rods; i++) {
      const c = Math.cos(theta[i]);
      const s = Math.sin(theta[i]);
      this.cos[i] = c;
      this.sin[i] = s;
      const o = 9 * i;
      // Ξ = C⊥ u uᵀ + C∥ t tᵀ, with u = (c, s) and t = (s, −c).
      diag[o] = p.dragNormal * c * c + p.dragTangential * s * s;
      diag[o + 1] = (p.dragNormal - p.dragTangential) * c * s;
      diag[o + 3] = diag[o + 1];
      diag[o + 4] = p.dragNormal * s * s + p.dragTangential * c * c;
      diag[o + 8] = p.dragRotation[i];
      rhs[3 * i] = this.force[2 * i];
      rhs[3 * i + 1] = this.force[2 * i + 1];
      this.wallContact(i);
    }
    for (let m = 0; m < p.segments; m++) {
      const lateral = p.lateralStiffness;
      const rest = this.restLateral[m];
      for (let side = 1; side >= -1; side -= 2) {
        // The cuticle and the muscle beside it act as one spring and damper (their eqs. 3, 5 and 6).
        const a = p.efficacy[m] * clamp01(side > 0 ? this.dorsal[m] : this.ventral[m]);
        const muscle = p.muscleStiffness * a;
        const muscleRest = rest - a * (rest - this.shortest[m]);
        const k = lateral + muscle;
        this.element(
          m,
          side,
          side,
          k,
          (lateral * rest + muscle * muscleRest) / k,
          p.lateralDamping + p.muscleDamping * a,
        );
      }
      this.element(m, 1, -1, p.diagonalStiffness, this.restDiagonal[m], p.diagonalDamping);
      this.element(m, -1, 1, p.diagonalStiffness, this.restDiagonal[m], p.diagonalDamping);
    }
  }

  // The dish's wall (PLAN §5.2, DECISIONS.md 2026-09-26): a rod whose centre passes the wall, less the rod's
  // radius, is pushed back along the wall's normal by a spring and a damper like a diagonal element's. Both
  // ease in together over the first WALL_SOFTENING of penetration, so the contact grows smoothly from zero
  // and the step can't overshoot a rod that only grazes the wall. The wall has no friction.
  private wallContact(i: number): void {
    const p = this.params;
    const rho = Math.hypot(this.x[i], this.y[i]);
    const depth = rho - (p.wall - p.radii[i]);
    if (!(depth > 0)) return;
    const nx = this.x[i] / rho;
    const ny = this.y[i] / rho;
    const ease = Math.min(depth / WALL_SOFTENING, 1);
    const f = -p.diagonalStiffness * depth * ease;
    const beta = p.diagonalDamping * ease;
    const o = 9 * i;
    this.rhs[3 * i] += f * nx;
    this.rhs[3 * i + 1] += f * ny;
    this.diag[o] += beta * nx * nx;
    this.diag[o + 1] += beta * nx * ny;
    this.diag[o + 3] += beta * nx * ny;
    this.diag[o + 4] += beta * ny * ny;
  }

  // Add one element joining side `sa` of rod m to side `sb` of rod m + 1: a spring of stiffness k and rest
  // length `rest`, and a damper β. With n the unit vector from its first point to its second, and g the
  // rate at which its length grows per unit of each rod's velocity, the spring's generalised force is f·g
  // with f = k(rest − L), and the damper adds β g gᵀ to Ξ − B.
  private element(m: number, sa: number, sb: number, k: number, rest: number, beta: number): void {
    const p = this.params;
    const a = m;
    const b = m + 1;
    const ca = this.cos[a];
    const sna = this.sin[a];
    const cb = this.cos[b];
    const snb = this.sin[b];
    const ra = sa * p.radii[a];
    const rb = sb * p.radii[b];
    const dx = this.x[b] + rb * cb - (this.x[a] + ra * ca);
    const dy = this.y[b] + rb * snb - (this.y[a] + ra * sna);
    const length = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / length;
    const ny = dy / length;
    const f = k * (rest - length);
    // u⊥ = (−sin θ, cos θ): how a rod end moves as the rod turns.
    const { g, diag, upper, rhs } = this;
    g[0] = -nx;
    g[1] = -ny;
    g[2] = -ra * (-sna * nx + ca * ny);
    g[3] = nx;
    g[4] = ny;
    g[5] = rb * (-snb * nx + cb * ny);
    for (let r = 0; r < 3; r++) {
      rhs[3 * a + r] += f * g[r];
      rhs[3 * b + r] += f * g[r + 3];
      for (let c = 0; c < 3; c++) {
        diag[9 * a + 3 * r + c] += beta * g[r] * g[c];
        diag[9 * b + 3 * r + c] += beta * g[r + 3] * g[c + 3];
        upper[9 * a + 3 * r + c] += beta * g[r] * g[c + 3];
      }
    }
  }

  // Block elimination of the symmetric block-tridiagonal system, then back substitution into `velocity`.
  private solve(): void {
    const n = this.rods;
    const { diag, upper, rhs, factor, carry, velocity, block: s, inverse: inv, residual: r } = this;
    for (let i = 0; i < n; i++) {
      // S = A_ii − U_{i−1}ᵀ C_{i−1}, and r = b_i − U_{i−1}ᵀ d_{i−1}.
      for (let k = 0; k < 9; k++) s[k] = diag[9 * i + k];
      r[0] = rhs[3 * i];
      r[1] = rhs[3 * i + 1];
      r[2] = rhs[3 * i + 2];
      if (i > 0) {
        const u = 9 * (i - 1);
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 3; col++) {
            let sum = 0;
            for (let k = 0; k < 3; k++) sum += upper[u + 3 * k + row] * factor[u + 3 * k + col];
            s[3 * row + col] -= sum;
          }
          let sum = 0;
          for (let k = 0; k < 3; k++) sum += upper[u + 3 * k + row] * carry[3 * (i - 1) + k];
          r[row] -= sum;
        }
      }
      invert3(s, inv);
      // C_i = S⁻¹ U_i, d_i = S⁻¹ r.
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          let sum = 0;
          if (i + 1 < n) for (let k = 0; k < 3; k++) sum += inv[3 * row + k] * upper[9 * i + 3 * k + col];
          factor[9 * i + 3 * row + col] = sum;
        }
        carry[3 * i + row] = inv[3 * row] * r[0] + inv[3 * row + 1] * r[1] + inv[3 * row + 2] * r[2];
      }
    }
    for (let i = n - 1; i >= 0; i--) {
      for (let row = 0; row < 3; row++) {
        let value = carry[3 * i + row];
        if (i + 1 < n) {
          for (let k = 0; k < 3; k++) value -= factor[9 * i + 3 * row + k] * velocity[3 * (i + 1) + k];
        }
        velocity[3 * i + row] = value;
      }
    }
  }
}

// The inverse of a 3 × 3 row-major matrix.
function invert3(m: Float64Array, out: Float64Array): void {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  out[0] = A / det;
  out[1] = (c * h - b * i) / det;
  out[2] = (b * f - c * e) / det;
  out[3] = B / det;
  out[4] = (a * i - c * g) / det;
  out[5] = (c * d - a * f) / det;
  out[6] = C / det;
  out[7] = (b * g - a * h) / det;
  out[8] = (a * e - b * d) / det;
}
