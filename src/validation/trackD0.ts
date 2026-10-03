// Track D0 (DECISIONS.md, 2026-10-03): two linear analyses of track S's brain alone at its fixed point, with the head
// switch off, over the four oscillator parameters and a gain on each class pair among twelve classes. (a) Whether the
// network has a live mode in the crawl's band that spans the B-types; (b) how far a touch moves the command
// interneurons over a pulse of 500 ms. Exploratory and never shipped: the gains are applied here, to the network a
// world is given, and the CPU reference doesn't change.

import type { WormlightData } from '../data/schema.ts';
import { cookNetwork, conducts, gapGates, type Network } from '../sim/brain/network.ts';
import { hash, uniform } from '../sim/brain/rng.ts';
import { BACK, FRONT, tap } from '../sim/touch.ts';
import { partsOf } from '../sim/trackS.ts';
import { loopParams, World } from '../sim/world.ts';
import { boxOf, MAPPING, type CalibratedId, type Values } from './calibration.ts';
import { eigenvalues, eigenvector, linearResponse } from './linear.ts';

// The twelve classes (DECISIONS.md, 2026-10-03): the five command interneuron pairs, the A-, B- and D-types, the SMDs,
// the RMDs, and the touch receptors at the front and the back.
export const CLASSES = ['AVA', 'AVB', 'AVD', 'AVE', 'PVC', 'A', 'B', 'D', 'SMD', 'RMD', 'front', 'back'] as const;
export type Class = (typeof CLASSES)[number];
export function classOf(name: string): Class | null {
  const pair = /^(AVA|AVB|AVD|AVE|PVC)[LR]$/.exec(name);
  if (pair) return pair[1] as Class;
  if (/^(DA|VA)\d+$/.test(name)) return 'A';
  if (/^(DB|VB)\d+$/.test(name)) return 'B';
  if (/^(DD|VD)\d+$/.test(name)) return 'D';
  if (/^SMD/.test(name)) return 'SMD';
  if (/^RMD/.test(name)) return 'RMD';
  if (/^(ALM[LR]|AVM)$/.test(name)) return 'front';
  if (/^(PLM[LR]|PVM)$/.test(name)) return 'back';
  return null;
}

// A class pair with a connection: a directed pair of signed chemical synapses, or an unordered pair of gap junctions,
// its classes in CLASSES' order.
export interface Pair {
  kind: 'chemical' | 'gap';
  key: string;
  sections: number;
}
const gapKey = (a: Class, b: Class): string => {
  const [x, y] = CLASSES.indexOf(a) <= CLASSES.indexOf(b) ? [a, b] : [b, a];
  return `${x}–${y}`;
};
// Every pair, the chemical ones first, each kind in the order of its key.
export function classPairs(data: WormlightData): Pair[] {
  const name = (x: string | number): string => (typeof x === 'number' ? data.neurons[x].name : x);
  const chemical = new Map<string, number>();
  const gap = new Map<string, number>();
  for (const c of data.chemical) {
    const [a, b] = [classOf(name(c.pre)), classOf(name(c.post))];
    if (!a || !b || c.sign === 0) continue;
    const key = `${a}→${b}`;
    chemical.set(key, (chemical.get(key) ?? 0) + c.sections);
  }
  for (const g of data.gap) {
    const [a, b] = [classOf(name(g.a)), classOf(name(g.b))];
    if (!a || !b) continue;
    const key = gapKey(a, b);
    gap.set(key, (gap.get(key) ?? 0) + g.sections);
  }
  const sorted = (m: Map<string, number>, kind: Pair['kind']): Pair[] =>
    [...m].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).map(([key, sections]) => ({ kind, key, sections }));
  return [...sorted(chemical, 'chemical'), ...sorted(gap, 'gap')];
}

// The network with each pair's connections multiplied by its gain; every other connection as it was.
export function gainedNetwork(network: Network, pairs: readonly Pair[], gains: ArrayLike<number>): Network {
  const classes = network.names.map(classOf);
  const gain = new Map(pairs.map((p, k) => [`${p.kind} ${p.key}`, gains[k]]));
  const chemical = Float64Array.from(network.chemical.weight);
  for (let i = 0; i < classes.length; i++) {
    const post = classes[i];
    for (let e = network.chemical.start[i]; e < network.chemical.start[i + 1]; e++) {
      const pre = classes[network.chemical.index[e]];
      if (post && pre) chemical[e] *= gain.get(`chemical ${pre}→${post}`) ?? 1;
    }
  }
  const gap = Float64Array.from(network.gap.weight);
  for (let i = 0; i < classes.length; i++) {
    const a = classes[i];
    for (let e = network.gap.start[i]; e < network.gap.start[i + 1]; e++) {
      const b = classes[network.gap.index[e]];
      if (a && b) gap[e] *= gain.get(`gap ${gapKey(a, b)}`) ?? 1;
    }
  }
  return {
    ...network,
    chemical: { ...network.chemical, weight: chemical },
    gap: { ...network.gap, weight: gap },
  };
}

// D0's box: g_osc, g_osc,B, τ_w and θ_osc in S's box, mapped as the calibration maps them, then each pair's gain from
// 0.1 to 10, logarithmically.
export const PARAMETERS = [
  'oscillatorExcitability',
  'oscillatorExcitabilityB',
  'oscillatorRecoveryTime',
  'oscillatorDriveThreshold',
] as const satisfies readonly CalibratedId[];
export const GAIN_RANGE = [0.1, 10] as const;
export function fromUnit(u: readonly number[], fit: Values): { values: Values; gains: Float64Array } {
  const box = boxOf('conductance', 'track S');
  const clip = (x: number): number => Math.min(1, Math.max(0, x));
  const values = { ...fit, headSwitchGain: 0 };
  PARAMETERS.forEach((id, k) => {
    const [lo, hi] = box[id];
    const t = clip(u[k]);
    const v = MAPPING[id] === 'log' ? lo * (hi / lo) ** t : lo + (hi - lo) * t;
    values[id] = Math.min(hi, Math.max(lo, v));
  });
  const [glo, ghi] = GAIN_RANGE;
  const gains = Float64Array.from(u.slice(PARAMETERS.length), (x) => glo * (ghi / glo) ** clip(x));
  return { values, gains };
}

// The Latin hypercube's point j of `count` in `dims` dimensions, on D0's seed, "D0" in ASCII: coordinate k is
// (π_k(j) + u)/count, u = uniform(hash(seed, j, k)), π_k(j) the rank of uniform(hash(seed, j, 10,000 + k)) among the
// points. `ranks` holds each coordinate's ranks, which the caller computes once.
export const SEED = 0x4430;
export function hypercubeRanks(count: number, dims: number): Int32Array[] {
  return Array.from({ length: dims }, (_, k) => {
    const keys = Array.from({ length: count }, (_, j) => uniform(hash(SEED, j, 10_000 + k)));
    const order = Array.from({ length: count }, (_, j) => j).sort((x, y) => keys[x] - keys[y] || x - y);
    const ranks = new Int32Array(count);
    order.forEach((j, r) => (ranks[j] = r));
    return ranks;
  });
}
export const hypercubePoint = (j: number, count: number, ranks: readonly Int32Array[]): number[] =>
  ranks.map((r, k) => (r[j] + uniform(hash(SEED, j, k))) / count);

// The crawl's band, checkpoint 1's partial range of frequency, and its pass range, reported beside it (Hz).
export const BAND = [0.1, 0.6] as const;
export const PASS_BAND = [0.2, 0.45] as const;
// A body mode spans the B-types: its voltage components' participation ratio over the 18 B-types at least this.
export const BODY = 6;
// FitzHugh's constants, as the brain has them.
const FHN_A = 0.7;
const FHN_B = 0.8;
// The touch's pulse, and the trapezoid's step for its response (s).
export const PULSE = 0.5;
const STEP = 0.0005;

// A brain's state at its fixed point and its Jacobian there: V, then s, then each oscillator's w.
export interface Linearised {
  n: number;
  size: number;
  voltage: Float64Array;
  J: Float64Array;
}

// The world a sample's brain is: S's model at the sample's values with the head switch off, on the gained network, the
// real wiring's unless another is given, as a null's is.
export function sampleWorld(
  data: WormlightData,
  values: Values,
  gains: ArrayLike<number>,
  pairs: readonly Pair[],
  base: Network = cookNetwork(data),
): World {
  const network = gainedNetwork(base, pairs, gains);
  return new World(data, { ...loopParams(values, 'conductance'), ...partsOf('track S') }, { network });
}

// The brain's fixed point and Jacobian. With `oscillators` off, the fixed point is its rest; on, Newton's method from
// the rest over V, with s and w at their steady states and the rectifier's gates set by the voltages at each
// iteration, until neither moves; null if it doesn't converge in 100 iterations.
export function linearise(world: World, oscillators: boolean): Linearised | null {
  const { network, threshold, offset } = world.brain;
  const osc = oscillators ? world.brain.oscillators : null;
  const n = network.names.length;
  const { leak, leakPotential: EL, capacitance: C, rise, decay, slope } = network;
  const v0 = 1 / (2 * slope);
  const gates = gapGates(network);
  const { gap, chemical } = network;
  const phi = (i: number, V: ArrayLike<number>): number => 1 / (1 + Math.exp(-slope * (V[i] - threshold[i])));
  const sOf = (i: number, V: ArrayLike<number>): number => {
    const f = phi(i, V);
    return (rise * f) / (rise * f + decay);
  };
  const open = (e: number, i: number, V: ArrayLike<number>): boolean =>
    !gates || conducts(gates[e], V[i], V[gap.index[e]]);
  const oscOf = new Int32Array(n).fill(-1);
  osc?.neurons.forEach((i, k) => (oscOf[i] = k));
  const V = Float64Array.from(threshold, (t, i) => t - offset[i]);
  if (osc) {
    // Newton on F(V) = C dV/dt with s and w at their steady states.
    let converged = false;
    for (let iteration = 0; iteration < 100 && !converged; iteration++) {
      const F = new Float64Array(n);
      const D = new Float64Array(n * n);
      const s = Float64Array.from({ length: n }, (_, i) => sOf(i, V));
      const ds = Float64Array.from({ length: n }, (_, i) => {
        const f = phi(i, V);
        return ((rise * decay) / (rise * f + decay) ** 2) * slope * f * (1 - f);
      });
      for (let i = 0; i < n; i++) {
        F[i] = -leak * (V[i] - EL);
        D[i * n + i] = -leak;
        for (let e = gap.start[i]; e < gap.start[i + 1]; e++) {
          if (!open(e, i, V)) continue;
          const j = gap.index[e];
          F[i] -= gap.weight[e] * (V[i] - V[j]);
          D[i * n + i] -= gap.weight[e];
          D[i * n + j] += gap.weight[e];
        }
        for (let e = chemical.start[i]; e < chemical.start[i + 1]; e++) {
          const j = chemical.index[e];
          const w = chemical.weight[e];
          F[i] -= w * s[j] * (V[i] - chemical.reversal[e]);
          D[i * n + i] -= w * s[j];
          D[i * n + j] -= w * ds[j] * (V[i] - chemical.reversal[e]);
        }
        const k = oscOf[i];
        if (k >= 0 && osc) {
          const x = (V[i] - threshold[i] - osc.shift[k]) / v0;
          const g = osc.gain[k];
          // w at its steady state, (x + a)/b.
          F[i] += g * v0 * (x - (x * x * x) / 3 - (x + FHN_A) / FHN_B);
          D[i * n + i] += g * (1 - x * x - 1 / FHN_B);
        }
      }
      // Solve D Δ = −F.
      const delta = solveDense(
        D,
        n,
        Float64Array.from(F, (f) => -f),
      );
      let biggest = 0;
      for (let i = 0; i < n; i++) {
        V[i] += delta[i];
        biggest = Math.max(biggest, Math.abs(delta[i]));
      }
      if (!Number.isFinite(biggest)) return null;
      converged = biggest < 1e-9;
    }
    if (!converged) return null;
  }
  // The Jacobian at the fixed point, the gates held as it sets them.
  const m = osc ? osc.neurons.length : 0;
  const size = 2 * n + m;
  const J = new Float64Array(size * size);
  const s = Float64Array.from({ length: n }, (_, i) => sOf(i, V));
  for (let i = 0; i < n; i++) {
    let diagonal = -leak;
    for (let e = gap.start[i]; e < gap.start[i + 1]; e++) {
      if (!open(e, i, V)) continue;
      diagonal -= gap.weight[e];
      J[i * size + gap.index[e]] += gap.weight[e] / C;
    }
    for (let e = chemical.start[i]; e < chemical.start[i + 1]; e++) {
      const j = chemical.index[e];
      diagonal -= chemical.weight[e] * s[j];
      J[i * size + n + j] -= (chemical.weight[e] * (V[i] - chemical.reversal[e])) / C;
    }
    const k = oscOf[i];
    if (k >= 0 && osc) {
      const x = (V[i] - threshold[i] - osc.shift[k]) / v0;
      diagonal += osc.gain[k] * (1 - x * x);
      J[i * size + 2 * n + k] = (-osc.gain[k] * v0) / C;
      J[(2 * n + k) * size + i] = 1 / (v0 * osc.recovery);
      J[(2 * n + k) * size + 2 * n + k] = -FHN_B / osc.recovery;
    }
    J[i * size + i] += diagonal / C;
    const f = phi(i, V);
    J[(n + i) * size + i] = rise * slope * f * (1 - f) * (1 - s[i]);
    J[(n + i) * size + n + i] = -(rise * f + decay);
  }
  return { n, size, voltage: V, J };
}

function solveDense(a: Float64Array, n: number, b: Float64Array): Float64Array {
  const A = Float64Array.from(a);
  const x = Float64Array.from(b);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i * n + k]) > Math.abs(A[p * n + k])) p = i;
    if (p !== k) {
      for (let j = 0; j < n; j++) [A[k * n + j], A[p * n + j]] = [A[p * n + j], A[k * n + j]];
      [x[k], x[p]] = [x[p], x[k]];
    }
    const pivot = A[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = A[i * n + k] / pivot;
      if (f === 0) continue;
      for (let j = k + 1; j < n; j++) A[i * n + j] -= f * A[k * n + j];
      x[i] -= f * x[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let sum = x[i];
    for (let j = i + 1; j < n; j++) sum -= A[i * n + j] * x[j];
    x[i] = sum / A[i * n + i];
  }
  return x;
}

// A mode of the network: its frequency (Hz), its margin, Re λ + Im λ/2π, which is at least 0 for a live one, and, for
// a live mode in the band, how it spreads: its voltage weight by class, its participation ratio over the B-types, and
// each B-type's amplitude and phase, from head to tail.
export interface Mode {
  frequency: number;
  margin: number;
  growth: number;
  body?: boolean;
  // How well its eigenvector is one: the largest |(J v − λ v)_i|.
  residual?: number;
  participation?: number;
  weights?: Partial<Record<Class, number>>;
  bTypes?: { name: string; amplitude: number; phase: number }[];
}

// What a condition reads: the largest real part of any mode, the five modes in the band with the largest margins, every
// live one among them described, how many lie in the pass band, and the search's objective.
export interface Reading {
  stable: boolean;
  maxGrowth: number;
  band: Mode[];
  live: Mode[];
  inPassBand: number;
  objective: number;
}

// The modes of a linearised brain, read as the rules read them. The search's objective: the largest margin among the
// modes in the band; with none there, the largest margin of any oscillatory mode less 10 and less its distance from
// the band in Hz, so that any mode in the band ranks above every one outside it (changed by the maintainer after the
// run's first samples, DECISIONS.md, 2026-10-03); with no oscillatory mode at all, −20.
export function readModes(world: World, lin: Linearised, data: WormlightData): Reading {
  const { re, im } = eigenvalues(lin.J, lin.size);
  const names = world.brain.network.names;
  const maxGrowth = Math.max(...re);
  const modes: Mode[] = [];
  let outside = -Infinity;
  let inPassBand = 0;
  for (let k = 0; k < re.length; k++) {
    if (!(im[k] > 0)) continue;
    const frequency = im[k] / (2 * Math.PI);
    const margin = re[k] + im[k] / (2 * Math.PI);
    if (frequency >= BAND[0] && frequency <= BAND[1]) {
      modes.push({ frequency, margin, growth: re[k] });
      if (frequency >= PASS_BAND[0] && frequency <= PASS_BAND[1]) inPassBand++;
    } else {
      const distance = frequency < BAND[0] ? BAND[0] - frequency : frequency - BAND[1];
      outside = Math.max(outside, margin - 10 - distance);
    }
  }
  modes.sort((x, y) => y.margin - x.margin);
  const live = modes.filter((m) => m.margin >= 0);
  // The B-types from head to tail by their place along the body.
  const position = new Map(data.neurons.map((nm) => [nm.name, nm.position?.s ?? 0]));
  const bIndex = names
    .map((nm, i) => [nm, i] as const)
    .filter(([nm]) => classOf(nm) === 'B')
    .sort(([x], [y]) => (position.get(x) ?? 0) - (position.get(y) ?? 0));
  for (const mode of live) {
    const v = eigenvector(lin.J, lin.size, { re: mode.growth, im: mode.frequency * 2 * Math.PI });
    mode.residual = v.residual;
    const amp = (i: number): number => Math.hypot(v.re[i], v.im[i]);
    let total = 0;
    const weights: Partial<Record<Class, number>> = {};
    for (let i = 0; i < lin.n; i++) {
      const a2 = amp(i) ** 2;
      total += a2;
      const c = classOf(names[i]);
      if (c) weights[c] = (weights[c] ?? 0) + a2;
    }
    for (const c of Object.keys(weights) as Class[]) weights[c] = (weights[c] ?? 0) / total;
    const b2 = bIndex.map(([, i]) => amp(i) ** 2);
    const sum2 = b2.reduce((x, y) => x + y, 0);
    const sum4 = b2.reduce((x, y) => x + y * y, 0);
    mode.participation = sum4 > 0 && Number.isFinite(sum4) ? (sum2 * sum2) / sum4 : 0;
    mode.body = mode.participation >= BODY;
    mode.weights = weights;
    mode.bTypes = bIndex.map(([name, i]) => ({ name, amplitude: amp(i), phase: Math.atan2(v.im[i], v.re[i]) }));
  }
  const objective = modes.length > 0 ? modes[0].margin : Number.isFinite(outside) ? outside : -20;
  return { stable: maxGrowth < 0, maxGrowth, band: modes.slice(0, 5), live, inPassBand, objective };
}

// A touch's currents as the world builds them, at the front or the back, as a right-hand side over the linearised
// state (mV/s on the voltages).
export function touchInput(world: World, at: number, lin: Linearised): Float64Array {
  const { currents } = tap(world.touchSets, at);
  const b = new Float64Array(lin.size);
  world.touchSets.receptors.forEach((r) => (b[r.neuron] = currents[r.index] / world.brain.network.capacitance));
  return b;
}

// The command interneurons' and the receptors' response to a touch over the pulse (mV), each named neuron's.
export const COMMAND = ['AVAL', 'AVAR', 'AVDL', 'AVDR', 'AVBL', 'AVBR', 'PVCL', 'PVCR'] as const;
export function touchResponse(
  world: World,
  lin: Linearised,
  b: Float64Array,
): { command: Record<string, number>; receptors: Record<string, number> } {
  const x = linearResponse(lin.J, lin.size, b, PULSE, STEP);
  const names = world.brain.network.names;
  const at = (nm: string): number => x[names.indexOf(nm)];
  return {
    command: Object.fromEntries(COMMAND.map((nm) => [nm, at(nm)])),
    receptors: Object.fromEntries(world.touchSets.receptors.map((r) => [r.name, x[r.neuron]])),
  };
}

// A whole sample: both conditions' modes and both touches; or why it couldn't be read, and at which step: building
// its world, finding its fixed point with the oscillators on, or the analysis itself. A sample that fails at any step
// is counted and reported, and read no further (DECISIONS.md, 2026-10-03).
export type Failure = 'world' | 'fixed point' | 'analysis';
export interface Sample {
  failed?: string;
  failure?: Failure;
  off?: Reading;
  on?: Reading;
  touch?: {
    front: ReturnType<typeof touchResponse>;
    back: ReturnType<typeof touchResponse>;
  };
}
const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
export function analyse(
  data: WormlightData,
  values: Values,
  gains: ArrayLike<number>,
  pairs: readonly Pair[],
  reference: World,
  options: { touches?: boolean; on?: boolean; base?: Network } = {},
): Sample {
  const { touches = true, on = true, base } = options;
  let world: World;
  try {
    world = sampleWorld(data, values, gains, pairs, base);
  } catch (e) {
    return { failed: why(e), failure: 'world' };
  }
  try {
    const off = linearise(world, false) as Linearised;
    const sample: Sample = { off: readModes(world, off, data) };
    if (on) {
      const onLin = linearise(world, true);
      if (!onLin) {
        return {
          failed: "no fixed point with the oscillators on in 100 iterations of Newton's method",
          failure: 'fixed point',
        };
      }
      sample.on = readModes(world, onLin, data);
    }
    if (touches) {
      // The receptors' currents are the reference world's, S's at gains 1, the same in every sample.
      sample.touch = {
        front: touchResponse(world, off, touchInput(reference, FRONT, off)),
        back: touchResponse(world, off, touchInput(reference, BACK, off)),
      };
    }
    return sample;
  } catch (e) {
    return { failed: why(e), failure: 'analysis' };
  }
}
