// Each neuron's voltage spread under the coloured noise, by §7.3's linear analysis (PLAN §7.3, §9; DECISIONS.md,
// 2026-09-28 and 2026-10-03), which checkpoint 6's report gives for every brain at its fitted noise. With every
// synapse's activation and every rectified junction's gate held at rest, the network is linear and symmetric:
// C dV/dt = −A V + η, A the held conductances (each neuron's resting load on the diagonal, its gap junctions off it).
// Each neuron's noise is an Ornstein–Uhlenbeck current, τ dη = −η dt + σ dW, independent of the others'. In A's
// eigenbasis, A = U Λ Uᵀ, the modes are independent, each a one-pole filter of conductance λ and time constant C/λ
// driven by the same coloured current, so mode k's variance is σ² / (2 λ_k² (τ + C/λ_k)), and neuron i's is the sum
// over the modes of U_ik² times theirs. As τ falls to 0 this is white noise's σ² [A⁻¹]_ii / (2C), the σ/√(2·C·G_in)
// that σ_n's bound was derived from. With σ in pA·√s, conductances in nS, C in nF and τ in s, the variance is in mV².

import { passiveLoads, type Held } from '../sim/brain/brain.ts';
import type { Network } from '../sim/brain/network.ts';

// A real symmetric matrix's eigenvalues and eigenvectors, by cyclic Jacobi rotations: `vectors[i * n + k]` is
// component i of eigenvector k.
export function symmetricEigen(matrix: Float64Array, n: number): { values: Float64Array; vectors: Float64Array } {
  const a = Float64Array.from(matrix);
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;
  const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  for (let sweep = 0; ; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] ** 2;
    if (Math.sqrt(off) <= 1e-14 * norm) break;
    if (sweep === 100) throw new Error('the Jacobi rotations did not converge in 100 sweeps');
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
        for (let k = 0; k < n; k++) {
          const vkp = v[k * n + p];
          const vkq = v[k * n + q];
          v[k * n + p] = c * vkp - s * vkq;
          v[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: Float64Array.from({ length: n }, (_, k) => a[k * n + k]), vectors: v };
}

// The held conductance matrix A (nS), dense: each neuron's load with its activations held at `s` on the diagonal,
// less its gap junctions off it. A gated network holds each rectified junction's gate in its weights.
export function heldMatrix(network: Network, s: Held): Float64Array {
  const n = network.names.length;
  const d = passiveLoads(network, s);
  const a = new Float64Array(n * n);
  for (let i = 0; i < n; i++) a[i * n + i] = d[i];
  const { start, index, weight } = network.gap;
  for (let i = 0; i < n; i++) for (let e = start[i]; e < start[i + 1]; e++) a[i * n + index[e]] -= weight[e];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(a[i * n + j] - a[j * n + i]) > 1e-12 * Math.max(1, Math.abs(a[i * n + j]))) {
        throw new Error(`the held network isn't symmetric between ${network.names[i]} and ${network.names[j]}`);
      }
    }
  }
  return a;
}

// Each neuron's standard deviation of voltage (mV) under coloured noise of intensity σ (pA·√s) and correlation time
// τ (s), with every activation held at `s` in a network whose rectified junctions are already gated at rest.
export function voltageSpread(network: Network, s: Held, sigma: number, tau: number): Float64Array {
  const n = network.names.length;
  const { values, vectors } = symmetricEigen(heldMatrix(network, s), n);
  const C = network.capacitance;
  const modes = Float64Array.from(values, (lambda) => {
    if (!(lambda > 0)) throw new Error(`the held network has a mode of conductance ${lambda} nS, not above 0`);
    return (sigma * sigma) / (2 * lambda * lambda * (tau + C / lambda));
  });
  return Float64Array.from({ length: n }, (_, i) => {
    let variance = 0;
    for (let k = 0; k < n; k++) variance += vectors[i * n + k] ** 2 * modes[k];
    return Math.sqrt(variance);
  });
}

// The widest neuron, and its spread.
export function widest(network: Network, spread: ArrayLike<number>): { neuron: string; spread: number } {
  let k = 0;
  for (let i = 1; i < spread.length; i++) if (spread[i] > spread[k]) k = i;
  return { neuron: network.names[k], spread: spread[k] };
}
