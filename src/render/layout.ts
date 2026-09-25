// Where the 3D graph draws each neuron (spec §7): anatomical, but readable.
// - The reconstruction is posed with a bend, which in a graph reads as the worm bending. The layout unbends
//   it along the ventral cord: the 75 motor neurons of the eight ventral-cord classes, whose somata line the
//   ventral midline from the retrovesicular to the preanal ganglion, trace the posed midline. Each soma is
//   placed by how far along that line its nearest point lies, and by its offset from the line, measured
//   across it. Beyond the cord the line runs on straight along its end direction, so the head and tail keep
//   their shape, turned with the nearest stretch of cord.
// - Over half the neurons sit in the head's first sixth, so the body axis is warped to give dense stretches
//   more room, keeping every neuron's order along the unbent body.
// - The cross-section keeps the unbent offsets, scaled up so the ganglia separate.

import type { Neuron } from '../data/schema.ts';

export interface LayoutOptions {
  // Length of the drawn body, in layout units, with the nose at −length/2 on the x axis.
  length: number;
  // Layout units per µm across the body.
  crossScale: number;
  // How much of the axis follows the neurons' density rather than their true position, from 0 to 1.
  densityShare: number;
  // Standard deviation of the kernel that smooths the density, as a fraction of body length.
  bandwidth: number;
  // Standard deviation of the kernel that traces the posed midline through the cord, in µm.
  midlineBandwidth: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  length: 12,
  crossScale: 0.034,
  densityShare: 0.6,
  bandwidth: 0.01,
  midlineBandwidth: 15,
};

// The motor neurons of the eight ventral-cord classes.
export const isCordNeuron = (name: string): boolean => /^(AS|DA|DB|DD|VA|VB|VC|VD)\d+$/.test(name);

type Point = readonly [number, number, number];

// Abramowitz & Stegun 7.1.26: |error| < 1.5 × 10⁻⁷.
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

// The warp from body fraction f to drawn fraction u: a blend of f itself and the smoothed share of neurons
// in front of f. It is strictly increasing, with u(0) = 0 and u(1) = 1.
export function axisWarp(positions: readonly number[], densityShare: number, bandwidth: number): (f: number) => number {
  const scale = 1 / (bandwidth * Math.SQRT2);
  const cdf = (f: number): number =>
    positions.reduce((sum, p) => sum + 0.5 * (1 + erf((f - p) * scale)), 0) / positions.length;
  const lo = cdf(0);
  const hi = cdf(1);
  return (f) => (1 - densityShare) * f + (densityShare * (cdf(f) - lo)) / (hi - lo);
}

// The posed midline through the given points as a function of y (µm along the reconstruction): a
// Gaussian-weighted local linear fit, free of first-order bias on slopes and at its ends, though it cuts
// corners where the line bends. Beyond the points it runs on straight along the fit's end direction.
export function midline(points: readonly Point[], bandwidth: number): (y: number) => Point {
  const ys = points.map((p) => p[1]);
  const first = Math.min(...ys);
  const last = Math.max(...ys);
  // The fit at y: x and z, and their slopes.
  const fit = (y: number): [number, number, number, number] => {
    const nearest = Math.min(...ys.map((v) => Math.abs(v - y)));
    let w = 0;
    let wd = 0;
    let wdd = 0;
    let wx = 0;
    let wdx = 0;
    let wz = 0;
    let wdz = 0;
    for (const [px, py, pz] of points) {
      const d = py - y;
      const k = Math.exp(-(d * d - nearest * nearest) / (2 * bandwidth * bandwidth));
      w += k;
      wd += k * d;
      wdd += k * d * d;
      wx += k * px;
      wdx += k * d * px;
      wz += k * pz;
      wdz += k * d * pz;
    }
    const det = w * wdd - wd * wd;
    return [
      (wdd * wx - wd * wdx) / det,
      (w * wdx - wd * wx) / det,
      (wdd * wz - wd * wdz) / det,
      (w * wdz - wd * wz) / det,
    ];
  };
  const [x0, sx0, z0, sz0] = fit(first);
  const [x1, sx1, z1, sz1] = fit(last);
  return (y) => {
    if (y < first) return [x0 + sx0 * (y - first), y, z0 + sz0 * (y - first)];
    if (y > last) return [x1 + sx1 * (y - last), y, z1 + sz1 * (y - last)];
    const [x, , z] = fit(y);
    return [x, y, z];
  };
}

export interface Unbent {
  // How far along the midline each soma's nearest point lies, from the nose, in µm.
  arc: Float64Array;
  // Each soma's offset from the midline, across it: towards the reconstruction's z (dorsal at the nose) and
  // its x (the animal's left), in µm.
  dorsal: Float64Array;
  lateral: Float64Array;
  // The midline's length from the nose to the tail tip, in µm.
  length: number;
}

const STEP = 0.5; // µm between samples of the midline

// Unbend the reconstruction along a midline. The nose and the tail tip come from the somata's body
// fractions, which run along the reconstruction's y axis: y = y₀ + f (y₁ − y₀).
export function unbend(somata: readonly Point[], fractions: readonly number[], line: (y: number) => Point): Unbent {
  const n = somata.length;
  const mf = fractions.reduce((a, f) => a + f, 0) / n;
  const my = somata.reduce((a, p) => a + p[1], 0) / n;
  const span =
    somata.reduce((a, p, i) => a + (fractions[i] - mf) * (p[1] - my), 0) /
    fractions.reduce((a, f) => a + (f - mf) ** 2, 0);
  const nose = my - span * mf;
  const tail = nose + span;
  const samples: Point[] = [];
  for (let y = nose; y < tail + STEP; y += STEP) samples.push(line(Math.min(y, tail)));
  const along = new Float64Array(samples.length);
  for (let k = 1; k < samples.length; k++) {
    const [a, b] = [samples[k - 1], samples[k]];
    along[k] = along[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const arc = new Float64Array(n);
  const dorsal = new Float64Array(n);
  const lateral = new Float64Array(n);
  somata.forEach((p, i) => {
    // The nearest point on the sampled line: the nearest sample, then the nearest point on its two segments.
    let best = 0;
    let bestDistance = Infinity;
    samples.forEach((q, k) => {
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = k;
      }
    });
    let chosen = { distance: Infinity, k: 0, t: 0 };
    for (const k of [best - 1, best]) {
      if (k < 0 || k + 1 >= samples.length) continue;
      const [a, b] = [samples[k], samples[k + 1]];
      const seg = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const len2 = seg[0] ** 2 + seg[1] ** 2 + seg[2] ** 2;
      const along = ((p[0] - a[0]) * seg[0] + (p[1] - a[1]) * seg[1] + (p[2] - a[2]) * seg[2]) / len2;
      const t = Math.max(0, Math.min(1, along));
      const distance = Math.hypot(p[0] - a[0] - t * seg[0], p[1] - a[1] - t * seg[1], p[2] - a[2] - t * seg[2]);
      if (distance < chosen.distance) chosen = { distance, k, t };
    }
    const { k, t } = chosen;
    const [a, b] = [samples[k], samples[k + 1]];
    const seg: Point = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...seg);
    const tangent: Point = [seg[0] / len, seg[1] / len, seg[2] / len];
    // Across the line: the reconstruction's x made perpendicular to it, and the direction completing a
    // right-handed frame, which is the reconstruction's z where the line runs along y.
    const lx = 1 - tangent[0] * tangent[0];
    const ly = -tangent[0] * tangent[1];
    const lz = -tangent[0] * tangent[2];
    const ln = Math.hypot(lx, ly, lz);
    const left: Point = [lx / ln, ly / ln, lz / ln];
    const up: Point = [
      left[1] * tangent[2] - left[2] * tangent[1],
      left[2] * tangent[0] - left[0] * tangent[2],
      left[0] * tangent[1] - left[1] * tangent[0],
    ];
    const d: Point = [p[0] - a[0] - t * seg[0], p[1] - a[1] - t * seg[1], p[2] - a[2] - t * seg[2]];
    arc[i] = along[k] + t * len;
    dorsal[i] = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
    lateral[i] = d[0] * left[0] + d[1] * left[1] + d[2] * left[2];
  });
  return { arc, dorsal, lateral, length: along[along.length - 1] };
}

// The reconstruction unbent along its ventral cord.
export function unbendNeurons(neurons: readonly Neuron[], bandwidth = DEFAULT_LAYOUT.midlineBandwidth): Unbent {
  const cord = neurons.filter((n) => isCordNeuron(n.name)).map((n) => n.position.reconstructionUm);
  return unbend(
    neurons.map((n) => n.position.reconstructionUm),
    neurons.map((n) => n.position.s),
    midline(cord, bandwidth),
  );
}

// Each neuron's position, as x, y, z triples: x runs from nose to tail, y is height above the cord (dorsal
// at the nose) and z is towards the animal's left.
export function graphLayout(neurons: readonly Neuron[], options: LayoutOptions = DEFAULT_LAYOUT): Float32Array {
  const body = unbendNeurons(neurons, options.midlineBandwidth);
  const fractions = Array.from(body.arc, (a) => a / body.length);
  const warp = axisWarp(fractions, options.densityShare, options.bandwidth);
  const out = new Float32Array(neurons.length * 3);
  neurons.forEach((_, i) => {
    out[3 * i] = (warp(fractions[i]) - 0.5) * options.length;
    out[3 * i + 1] = body.dorsal[i] * options.crossScale;
    out[3 * i + 2] = body.lateral[i] * options.crossScale;
  });
  return out;
}
