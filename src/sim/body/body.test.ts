import { describe, expect, it } from 'vitest';
import { PARAMS } from '../../science/params.ts';
import { Body, boyleBody, ellipseRadii } from './body.ts';

const LENGTH = PARAMS.bodyLength.value * 1e-3;
// The registry's whole-worm drag, split over 2(M + 1) = 98 as Boyle et al.'s code does. Tests take these
// from the registry, not from the body, so a wrong split in the body fails them.
const DRAG_NORMAL = PARAMS.dragPerpendicular.value / 98;
const DRAG_TANGENTIAL = PARAMS.dragParallel.value / 98;

describe('boyleBody', () => {
  const p = boyleBody();

  it("takes Boyle et al.'s Table 1 values", () => {
    expect(p.segments).toBe(48);
    expect(p.segmentLength).toBeCloseTo(LENGTH / 48, 15);
    expect(p.lateralStiffness).toBe(0.02);
    expect(p.diagonalStiffness).toBeCloseTo(7, 12);
    expect(p.muscleStiffness).toBeCloseTo(0.4, 12);
    expect(p.lateralDamping).toBeCloseTo(5e-4, 15);
    expect(p.diagonalDamping).toBeCloseTo(0.07, 12);
    expect(p.muscleDamping).toBeCloseTo(0.05, 12);
    expect(p.shortening).toBe(0.65);
    expect(p.efficacy[0]).toBeCloseTo(0.7 * (2 / 3), 12);
    expect(p.efficacy[1]).toBeCloseTo(0.7 - 0.42 / 48, 12);
    expect(p.efficacy[47]).toBeCloseTo(0.7 - (0.42 * 47) / 48, 12);
    expect([p.dragNormal, p.dragTangential]).toEqual([DRAG_NORMAL, DRAG_TANGENTIAL]);
    expect(p.dragRotation[24]).toBeCloseTo(4 * Math.PI * 40e-6 ** 2 * DRAG_TANGENTIAL, 25);
  });

  it('shapes the body as a prolate ellipse whose tips keep a width', () => {
    const r = ellipseRadii(48, 40e-6);
    expect(r).toHaveLength(49);
    expect(r[24]).toBeCloseTo(40e-6, 15);
    expect(r[0]).toBeCloseTo(r[48], 18);
    expect(r[0]).toBeGreaterThan(4e-6);
    expect(r[0]).toBeLessThan(r[1]);
  });
});

describe('a passive body', () => {
  it('rests when straight and unforced', () => {
    const body = new Body(boyleBody());
    const before = body.midline();
    for (let k = 0; k < 100; k++) body.step(0.0025);
    body.midline().forEach((v, i) => expect(v).toBeCloseTo(before[i], 15));
    expect(Math.max(...body.rates().map(Math.abs))).toBeLessThan(1e-12);
  });

  it('translates without turning under a uniform force, at the drag the registry sets', () => {
    for (const [along, drag] of [
      [true, DRAG_TANGENTIAL],
      [false, DRAG_NORMAL],
    ] as const) {
      const body = new Body(boyleBody());
      body.straighten(0, 0, 0);
      // Along the body (x here) or across it (y), 1 nN on every rod.
      for (let i = 0; i < body.rods; i++) body.force[2 * i + (along ? 0 : 1)] = 1e-9;
      const start = body.midline();
      const theta = Float64Array.from(body.theta);
      for (let k = 0; k < 400; k++) body.step(0.0025);
      const moved = body.midline().map((v, i) => v - start[i]);
      for (let i = 0; i < body.rods; i++) {
        expect(moved[2 * i + (along ? 0 : 1)]).toBeCloseTo((1e-9 / drag) * 1, 12);
        expect(moved[2 * i + (along ? 1 : 0)]).toBeCloseTo(0, 15);
        expect(body.theta[i]).toBeCloseTo(theta[i], 12);
      }
    }
  });

  it('straightens from a bend at the rate the stiffness-to-drag ratio predicts, on agar and in low drag', () => {
    // A body of uniform radius, bent into the first free-free bending mode. Pure bending strains only the
    // laterals, to first order, so each joint's bending stiffness is 2 κ_L R², and each rod drags as C⊥/98.
    // The prediction is the slowest bending rate of that discrete beam, μ/(1 + ημ) with η = β_L/κ_L the
    // internal damping time. The body adds only rod rotation, whose drag slows it by about 2%. On agar the
    // drag sets the rate; with the drag cut 1,000-fold the internal damping slows it by about a fifth.
    const R = PARAMS.bodyRadius.value * 1e-6;
    const kappa = PARAMS.lateralStiffness.value;
    const eta = PARAMS.lateralDamping.value;
    const n = 49;
    const ls = LENGTH / 48;
    const beta = 4.730040744862704;
    const k = beta / LENGTH;
    const sigma = (Math.cosh(beta) - Math.cos(beta)) / (Math.sinh(beta) - Math.sin(beta));
    const mode = (x: number): number =>
      Math.cosh(k * x) + Math.cos(k * x) - sigma * (Math.sinh(k * x) + Math.sin(k * x));
    const slope = (x: number): number =>
      k * (Math.sinh(k * x) - Math.sin(k * x) - sigma * (Math.cosh(k * x) + Math.cos(k * x)));

    for (const scale of [1, 1e-3]) {
      const rates = new Float64Array(n * n);
      const joint = (2 * kappa * R * R) / (ls * ls * DRAG_NORMAL * scale);
      for (let j = 1; j < n - 1; j++) {
        const stencil = [
          [j - 1, 1],
          [j, -2],
          [j + 1, 1],
        ];
        for (const [a, va] of stencil) for (const [b, vb] of stencil) rates[a * n + b] += joint * va * vb;
      }
      // The two rigid modes have rate zero; the next is the first bending mode.
      const mu = symmetricEigenvalues(rates, n)[2];
      const predicted = mu / (1 + eta * mu);

      const params = boyleBody(new Float64Array(n).fill(R));
      const body = new Body({
        ...params,
        dragNormal: params.dragNormal * scale,
        dragTangential: params.dragTangential * scale,
        dragRotation: params.dragRotation.map((c) => c * scale),
      });
      const amplitude = 1e-6;
      for (let i = 0; i < n; i++) {
        body.x[i] = i * ls;
        body.y[i] = amplitude * mode(i * ls);
        body.theta[i] = Math.atan(amplitude * slope(i * ls)) + Math.PI / 2;
      }
      // The mode's amplitude, fitted by least squares alongside the rigid modes.
      const fit = (): number =>
        leastSquares(
          Array.from({ length: n }, (_, i) => [1, i * ls, mode(i * ls)]),
          body.y,
        )[2];
      const start = fit();
      // About a fifth of a decay time on agar, and two decay times in low drag, at a step 1% of it.
      const duration = scale === 1 ? 20 : 2 / predicted;
      const dt = scale === 1 ? 0.0025 : 0.01 / predicted;
      for (let t = 0; t < Math.round(duration / dt); t++) body.step(dt);
      const measured = -Math.log(fit() / start) / duration;
      expect(Math.abs(measured / predicted - 1), `drag × ${scale}`).toBeLessThan(0.03);
    }
  });
});

describe('a prescribed muscle wave', () => {
  // A travelling wave of activation at 0.30 Hz, 0.65 body lengths along the body, dorsal and ventral in
  // antiphase, running from head to tail.
  function crawl(dt: number, heading = Math.PI): { samples: Float64Array[]; angles: Float64Array[]; interval: number } {
    const body = new Body(boyleBody());
    body.straighten(0, 0, heading);
    const segments = body.params.segments;
    const every = Math.round(0.01 / dt);
    const samples: Float64Array[] = [];
    const angles: Float64Array[] = [];
    for (let s = 1; s <= Math.round(40 / dt); s++) {
      for (let m = 0; m < segments; m++) {
        const phase = 2 * Math.PI * (0.3 * s * dt - (m + 0.5) / segments / 0.65);
        body.dorsal[m] = 0.5 + 0.5 * Math.sin(phase);
        body.ventral[m] = 0.5 - 0.5 * Math.sin(phase);
      }
      body.step(dt);
      // Skip the first 10 s, while the wave establishes itself.
      if (s * dt > 10 && s % every === 0) {
        samples.push(body.midline());
        angles.push(Float64Array.from(body.theta));
      }
    }
    return { samples, angles, interval: every * dt };
  }

  const centroid = (m: Float64Array): [number, number] => {
    let x = 0;
    let y = 0;
    for (let i = 0; i < m.length; i += 2) {
      x += m[i];
      y += m[i + 1];
    }
    return [(2 * x) / m.length, (2 * y) / m.length];
  };

  const speed = ({ samples, interval }: ReturnType<typeof crawl>): number => {
    const [x0, y0] = centroid(samples[0]);
    const [x1, y1] = centroid(samples[samples.length - 1]);
    return Math.hypot(x1 - x0, y1 - y0) / ((samples.length - 1) * interval) / LENGTH;
  };

  const run = crawl(0.0025);

  it('crawls forward, head first, in the direction it was laid out facing', () => {
    for (const trial of [run, crawl(0.0025, 1)]) {
      const heading = trial === run ? Math.PI : 1;
      const last = trial.samples[trial.samples.length - 1];
      const [x0, y0] = centroid(trial.samples[0]);
      const [x1, y1] = centroid(last);
      // The head is ahead of the centroid along the direction of travel, which is within 30° of the heading
      // the body was straightened towards.
      expect((last[0] - x1) * (x1 - x0) + (last[1] - y1) * (y1 - y0)).toBeGreaterThan(0);
      expect(
        ((x1 - x0) * Math.cos(heading) + (y1 - y0) * Math.sin(heading)) / Math.hypot(x1 - x0, y1 - y0),
      ).toBeGreaterThan(Math.cos(Math.PI / 6));
      expect(speed(trial)).toBeGreaterThan(0.06);
    }
  });

  it('moves at the speed resistive force theory predicts for the shape it makes', () => {
    // Over each 10 ms, remove the best rigid fit to leave the change of shape, then find the rigid motion
    // that makes the drag on that shape change force- and torque-free, with the registry's anisotropy
    // along each rod's own orientation. This shares nothing with the body's internal forces: it tests that
    // they sum to no net force or torque, and that the drag has the right strength in each direction.
    let predicted = [0, 0];
    let actual = [0, 0];
    for (let k = 1; k < run.samples.length; k++) {
      const step = rigidRft(run.samples[k - 1], run.samples[k], run.angles[k - 1], run.angles[k], run.interval);
      predicted = [predicted[0] + step.predicted[0], predicted[1] + step.predicted[1]];
      actual = [actual[0] + step.actual[0], actual[1] + step.actual[1]];
    }
    expect(Math.abs(Math.hypot(...actual) / Math.hypot(...predicted) - 1)).toBeLessThan(0.005);
    expect(Math.abs(Math.atan2(actual[1], actual[0]) - Math.atan2(predicted[1], predicted[0]))).toBeLessThan(0.002);
  });

  it('crawls at the same speed at dt and dt/2', () => {
    expect(Math.abs(speed(crawl(0.00125)) / speed(run) - 1)).toBeLessThan(0.02);
  });
});

describe('the force law', () => {
  // Boyle et al.'s equations 2–7 and Table 1, written out here apart from the body's code: the cuticle and
  // each muscle as separate elements, the diagonals, and on each rod the drag balancing the forces on its
  // two points. The body's velocities must satisfy them on bent, active, externally forced states, with
  // activations outside [0, 1] to exercise σ.
  const M = 48;
  const L = LENGTH;
  const ls = L / M;
  const R = 40e-6;
  const radius = (i: number): number => R * Math.abs(Math.sin(Math.acos((i + 1 - (M / 2 + 1)) / (M / 2 + 0.2))));
  const kL = (M / 24) * 0.01;
  const kD = kL * 350;
  const k0M = kL * 20;
  const bL = kL * 0.025;
  const bD = kD * 0.01;
  const b0M = bL * 100;
  const deltaM = 0.65;
  const fmax = (m: number): number => (m === 1 ? 0.7 * (2 / 3) : 0.7 - (0.42 * (m - 1)) / M);
  const sigma = (x: number): number => (x <= 0 ? 0 : x < 1 ? x : 1);

  function residual(body: Body, rates: Float64Array): number {
    const n = M + 1;
    // Each rod's dorsal (k = 0) and ventral (k = 1) points and their velocities.
    const point = (i: number, k: number): [number, number, number, number] => {
      const side = k === 0 ? 1 : -1;
      const r = side * radius(i);
      const u = [Math.cos(body.theta[i]), Math.sin(body.theta[i])];
      const w = rates[3 * i + 2];
      return [body.x[i] + r * u[0], body.y[i] + r * u[1], rates[3 * i] - r * w * u[1], rates[3 * i + 1] + r * w * u[0]];
    };
    const force = Array.from({ length: n }, () => [
      [0, 0],
      [0, 0],
    ]);
    // A spring and damper from point (i, k) to (j, l), pushing them apart with f = κ(L0 − L) − β dL/dt.
    const element = (i: number, k: number, j: number, l: number, kappa: number, rest: number, beta: number): void => {
      const [ax, ay, avx, avy] = point(i, k);
      const [bx, by, bvx, bvy] = point(j, l);
      const len = Math.hypot(bx - ax, by - ay);
      const nx = (bx - ax) / len;
      const ny = (by - ay) / len;
      const f = kappa * (rest - len) - beta * ((bvx - avx) * nx + (bvy - avy) * ny);
      force[j][l][0] += f * nx;
      force[j][l][1] += f * ny;
      force[i][k][0] -= f * nx;
      force[i][k][1] -= f * ny;
    };
    for (let m = 1; m <= M; m++) {
      const i = m - 1;
      const rm = radius(i);
      const rn = radius(i + 1);
      const l0 = Math.hypot(ls, rm - rn);
      const lmin = l0 * (1 - (deltaM * (rm + rn)) / (2 * R));
      for (const [k, active] of [
        [0, body.dorsal[i]],
        [1, body.ventral[i]],
      ] as const) {
        const a = fmax(m) * sigma(active);
        element(i, k, i + 1, k, kL, l0, bL);
        element(i, k, i + 1, k, k0M * a, l0 - a * (l0 - lmin), b0M * a);
      }
      const l0d = Math.hypot(ls, rm + rn);
      element(i, 0, i + 1, 1, kD, l0d, bD);
      element(i, 1, i + 1, 0, kD, l0d, bD);
    }
    let worst = 0;
    let scale = 0;
    for (let i = 0; i < n; i++) {
      const c = Math.cos(body.theta[i]);
      const s = Math.sin(body.theta[i]);
      const [d, v] = force[i];
      const fx = d[0] + v[0] + body.force[2 * i];
      const fy = d[1] + v[1] + body.force[2 * i + 1];
      // Torque about the centre: R u × F on the dorsal point, −R u × F on the ventral one.
      const torque = radius(i) * (c * d[1] - s * d[0]) - radius(i) * (c * v[1] - s * v[0]);
      const vx = rates[3 * i];
      const vy = rates[3 * i + 1];
      const across = DRAG_NORMAL * (vx * c + vy * s) - (fx * c + fy * s);
      const along = DRAG_TANGENTIAL * (vx * s - vy * c) - (fx * s - fy * c);
      const turning = 4 * Math.PI * radius(i) ** 2 * DRAG_TANGENTIAL * rates[3 * i + 2] - torque;
      worst = Math.max(worst, Math.abs(across), Math.abs(along), Math.abs(turning) / radius(i));
      scale = Math.max(scale, Math.abs(d[0]), Math.abs(d[1]), Math.abs(v[0]), Math.abs(v[1]));
    }
    return worst / scale;
  }

  it("gives the body's velocities on bent, active, forced states", () => {
    let seed = 1;
    const random = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let trial = 0; trial < 10; trial++) {
      const body = new Body(boyleBody());
      let angle = random() * 2 * Math.PI;
      for (let i = 1; i < body.rods; i++) {
        angle += 0.15 * (random() - 0.5);
        body.x[i] = body.x[i - 1] + ls * 1.05 * Math.cos(angle);
        body.y[i] = body.y[i - 1] + ls * 1.05 * Math.sin(angle);
      }
      for (let i = 0; i < body.rods; i++) {
        const j = Math.min(i, body.rods - 2);
        body.theta[i] =
          Math.atan2(body.y[j + 1] - body.y[j], body.x[j + 1] - body.x[j]) + Math.PI / 2 + 0.05 * (random() - 0.5);
        body.force[2 * i] = 1e-7 * (random() - 0.5);
        body.force[2 * i + 1] = 1e-7 * (random() - 0.5);
      }
      for (let m = 0; m < M; m++) {
        body.dorsal[m] = 1.4 * random() - 0.2;
        body.ventral[m] = 1.4 * random() - 0.2;
      }
      expect(residual(body, body.rates()), `trial ${trial}`).toBeLessThan(1e-9);
    }
  });
});

describe('orientation', () => {
  // The signed turn of the midline from head to tail: positive is anticlockwise.
  const turn = (m: Float64Array): number => {
    let total = 0;
    for (let i = 2; i + 3 < m.length; i += 2) {
      const ax = m[i] - m[i - 2];
      const ay = m[i + 1] - m[i - 1];
      const bx = m[i + 2] - m[i];
      const by = m[i + 3] - m[i + 1];
      total += Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    }
    return total;
  };

  it('bends towards the dorsal side, which lies left of the head-to-tail direction', () => {
    for (const side of ['dorsal', 'ventral'] as const) {
      const body = new Body(boyleBody());
      body[side].fill(1);
      for (let k = 0; k < 2000; k++) body.step(0.0025);
      // The dorsal side is u, anticlockwise from head-to-tail t, so contracting it turns the midline
      // anticlockwise; the ventral side, the other way.
      expect(Math.sign(turn(body.midline()))).toBe(side === 'dorsal' ? 1 : -1);
      expect(Math.abs(turn(body.midline()))).toBeGreaterThan(1);
    }
  });

  it('straightens with the head at the given point, facing the given heading', () => {
    for (const heading of [0, 1, 2.5, -2]) {
      const body = new Body(boyleBody());
      body.straighten(1e-3, -2e-3, heading);
      const m = body.midline();
      expect(m[0]).toBeCloseTo(1e-3, 15);
      expect(m[1]).toBeCloseTo(-2e-3, 15);
      expect(m[96]).toBeCloseTo(1e-3 - LENGTH * Math.cos(heading), 15);
      expect(m[97]).toBeCloseTo(-2e-3 - LENGTH * Math.sin(heading), 15);
    }
  });
});

// The rigid motion over one interval, as it happened (centroid shift) and as resistive force theory
// predicts it from the change of shape alone.
function rigidRft(
  before: Float64Array,
  after: Float64Array,
  anglesBefore: Float64Array,
  anglesAfter: Float64Array,
  dt: number,
): { actual: [number, number]; predicted: [number, number] } {
  const n = before.length / 2;
  const mean = (m: Float64Array, o: number): number => {
    let s = 0;
    for (let i = 0; i < n; i++) s += m[2 * i + o];
    return s / n;
  };
  const c0 = [mean(before, 0), mean(before, 1)];
  const c1 = [mean(after, 0), mean(after, 1)];
  // The best rotation between the centred shapes (2D Procrustes).
  let dot = 0;
  let cross = 0;
  for (let i = 0; i < n; i++) {
    const ax = before[2 * i] - c0[0];
    const ay = before[2 * i + 1] - c0[1];
    const bx = after[2 * i] - c1[0];
    const by = after[2 * i + 1] - c1[1];
    dot += ax * bx + ay * by;
    cross += ax * by - ay * bx;
  }
  const spin = Math.atan2(cross, dot) / dt;
  const shift = [(c1[0] - c0[0]) / dt, (c1[1] - c0[1]) / dt];
  const centre = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2];
  const a = new Array<number>(9).fill(0);
  const b = [0, 0, 0];
  const cl = PARAMS.dragParallel.value;
  const cn = PARAMS.dragPerpendicular.value;
  const mid = (i: number, o: number): number => (before[2 * i + o] + after[2 * i + o]) / 2;
  for (let i = 0; i < n; i++) {
    const rx = mid(i, 0) - centre[0];
    const ry = mid(i, 1) - centre[1];
    // The change of shape: the velocity with the rigid fit taken out.
    const wx = (after[2 * i] - before[2 * i]) / dt - shift[0] + spin * ry;
    const wy = (after[2 * i + 1] - before[2 * i + 1]) / dt - shift[1] - spin * rx;
    // Along the body: t = (sin θ, −cos θ), from the rod's angle over the interval.
    const theta = (anglesBefore[i] + anglesAfter[i]) / 2;
    const tx = Math.sin(theta);
    const ty = -Math.cos(theta);
    // Drag per point: −(C∥ t tᵀ + C⊥ (I − t tᵀ)) v, as force and torque about the centre.
    const drag = (vx: number, vy: number): [number, number, number] => {
      const along = cl * (vx * tx + vy * ty);
      const fx = -(along * tx + cn * (vx - (vx * tx + vy * ty) * tx));
      const fy = -(along * ty + cn * (vy - (vx * tx + vy * ty) * ty));
      return [fx, fy, rx * fy - ry * fx];
    };
    const fromShape = drag(wx, wy);
    const columns = [drag(1, 0), drag(0, 1), drag(-ry, rx)];
    for (let r = 0; r < 3; r++) {
      b[r] -= fromShape[r];
      for (let c = 0; c < 3; c++) a[3 * r + c] += columns[c][r];
    }
  }
  const solution = cramer(a, b);
  return { actual: [shift[0] * dt, shift[1] * dt], predicted: [solution[0] * dt, solution[1] * dt] };
}

// Solve a 3 × 3 system (row-major) by Cramer's rule.
function cramer(m: number[], b: number[]): number[] {
  const det = (x: number[]): number =>
    x[0] * (x[4] * x[8] - x[5] * x[7]) - x[1] * (x[3] * x[8] - x[5] * x[6]) + x[2] * (x[3] * x[7] - x[4] * x[6]);
  const d = det(m);
  return [0, 1, 2].map((k) => {
    const x = [...m];
    for (let r = 0; r < 3; r++) x[3 * r + k] = b[r];
    return det(x) / d;
  });
}

// Least squares for three unknowns, by the normal equations.
function leastSquares(rows: number[][], values: Float64Array): number[] {
  const ata = new Array<number>(9).fill(0);
  const atb = [0, 0, 0];
  rows.forEach((row, i) => {
    for (let p = 0; p < 3; p++) {
      atb[p] += row[p] * values[i];
      for (let q = 0; q < 3; q++) ata[3 * p + q] += row[p] * row[q];
    }
  });
  return cramer(ata, atb);
}

// The eigenvalues of a symmetric matrix, ascending, by cyclic Jacobi rotations.
function symmetricEigenvalues(matrix: Float64Array, n: number): number[] {
  const a = Float64Array.from(matrix);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q];
        if (apq === 0) continue;
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p];
          const akq = a[k * n + q];
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k];
          const aqk = a[q * n + k];
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
        }
      }
    }
  }
  return Array.from({ length: n }, (_, i) => a[i * n + i]).sort((x, y) => x - y);
}
