// Where the 3D graph draws each neuron (spec §7): anatomical, but readable.
// - The reconstruction is posed with a bend, which in a graph reads as the worm bending. The layout takes
//   the bend out: the ventral-cord motor neurons, whose somata all sit in the cord, trace the posed
//   midline, and every neuron is measured from that line at its own point along the body. The cord
//   becomes straight, with every other neuron where it sits relative to it.
// - Over half the neurons sit in the head's first sixth, so the body axis is warped to give dense stretches
//   more room, keeping every neuron's order along the body.
// - The cross-section keeps the reconstruction's own coordinates, scaled up so the ganglia separate.

import type { Neuron } from '../data/schema.ts';

export interface LayoutOptions {
  // Length of the drawn body, in layout units, with the nose at −length/2 on the x axis.
  length: number;
  // Layout units per µm across the body.
  crossScale: number;
  // How much of the axis follows the neurons' density rather than their true position, from 0 to 1.
  densityShare: number;
  // Width of the kernel that smooths the density, as a fraction of body length.
  bandwidth: number;
  // Width of the kernel that traces the posed midline through the cord, in µm along the body.
  midlineBandwidth: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  length: 12,
  crossScale: 0.034,
  densityShare: 0.6,
  bandwidth: 0.01,
  midlineBandwidth: 30,
};

// The motor neurons whose somata lie in the ventral nerve cord.
export const isCordNeuron = (name: string): boolean => /^(AS|DA|DB|DD|VA|VB|VC|VD)\d+$/.test(name);

// Abramowitz & Stegun 7.1.26: |error| < 1.5 × 10⁻⁷.
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

// The warp from body fraction s to drawn fraction u: a blend of s itself and the smoothed share of neurons
// in front of s. It is strictly increasing, with u(0) = 0 and u(1) = 1.
export function axisWarp(positions: readonly number[], densityShare: number, bandwidth: number): (s: number) => number {
  const scale = 1 / (bandwidth * Math.SQRT2);
  const cdf = (s: number): number =>
    positions.reduce((sum, p) => sum + 0.5 * (1 + erf((s - p) * scale)), 0) / positions.length;
  const lo = cdf(0);
  const hi = cdf(1);
  return (s) => (1 - densityShare) * s + (densityShare * (cdf(s) - lo)) / (hi - lo);
}

// The posed midline at y (µm along the reconstruction), as its x and z: a Gaussian-weighted local linear
// fit through the points given, which is unbiased where the line bends and at its ends. Beyond the points
// it holds the value at the nearer end.
export function midline(points: readonly (readonly [number, number, number])[], bandwidth: number) {
  const ys = points.map((p) => p[1]);
  const first = Math.min(...ys);
  const last = Math.max(...ys);
  return (at: number): [number, number] => {
    const y = Math.min(last, Math.max(first, at));
    const nearest = Math.min(...ys.map((v) => Math.abs(v - y)));
    // Weighted least squares for v = a + b·d, with d the distance along the body; a is the value at y.
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
    return [(wdd * wx - wd * wdx) / det, (wdd * wz - wd * wdz) / det];
  };
}

// Each neuron's position, as x, y, z triples: x runs from nose to tail, y is height above the cord (dorsal
// at the nose) and z is towards the animal's left.
export function graphLayout(neurons: readonly Neuron[], options: LayoutOptions = DEFAULT_LAYOUT): Float32Array {
  const warp = axisWarp(
    neurons.map((n) => n.position.s),
    options.densityShare,
    options.bandwidth,
  );
  const cord = neurons.filter((n) => isCordNeuron(n.name)).map((n) => n.position.reconstructionUm);
  const centre = midline(cord, options.midlineBandwidth);
  const out = new Float32Array(neurons.length * 3);
  neurons.forEach((n, i) => {
    const [x, y, z] = n.position.reconstructionUm;
    const [cx, cz] = centre(y);
    out[3 * i] = (warp(n.position.s) - 0.5) * options.length;
    out[3 * i + 1] = (z - cz) * options.crossScale;
    out[3 * i + 2] = (x - cx) * options.crossScale;
  });
  return out;
}
