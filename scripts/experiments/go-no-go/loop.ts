// The go/no-go experiments of milestone 0c (DECISIONS.md, 2026-09-26): the World's loop composed from the
// simulation's own parts, with switches for the fallbacks PLAN §10 lists and for diagnostics that change
// the wiring. None of these variants is part of the model; they test what would make it crawl.

import type { WormlightData } from '../../../src/data/schema.ts';
import { Body, boyleBody } from '../../../src/sim/body/body.ts';
import { Brain, equilibrium, midpointActivation } from '../../../src/sim/brain/brain.ts';
import { cookNetwork, lesion, type Network, type Rows } from '../../../src/sim/brain/network.ts';
import { Muscles } from '../../../src/sim/muscles.ts';
import { NEURAL_STEP } from '../../../src/sim/numerics.ts';
import { curvature, HeadSwitch, proprioceptiveFields, regionMean } from '../../../src/sim/proprio.ts';

// The eight calibrated parameters, in the loop's units (nS, s, mV, pA, per section or relative drive).
export interface Draw {
  gOsc: number;
  tauW: number;
  theta: number;
  gSw: number;
  gP: number;
  gNmj: number;
  tNmj: number;
}

export interface Variant {
  // Fallback 1: proprioception reads the curvature this long ago (s).
  delay?: number;
  // Mirrored proprioception on the A-types (on unless false).
  aProprio?: boolean;
  // Neuromuscular drive: the plan's one threshold on section counts, or each muscle's drive between its
  // resting value and its most, so one threshold serves every muscle.
  nmj?: 'global' | 'relative';
  // Fallback 2: the B-types' oscillators, as FitzHugh–Nagumo, bistable (recovery held at 0), or off.
  bMode?: 'fhn' | 'bistable' | 'off';
  aMode?: 'fhn' | 'off';
  // Diagnostic: force the head switch to alternate at this frequency (Hz), always gated on.
  forcedHead?: number;
  // The head switch also drives the RMDs.
  rmd?: boolean;
  // Diagnostic: neurons removed entirely, their junctions onto muscle included.
  remove?: readonly string[];
  // Diagnostic: SMD junctions only onto muscles that start before this body coordinate.
  smdReach?: number;
  // Fallback 3 (class-level gain): scale every neuron-to-neuron connection of the B-types.
  scaleB?: number;
  // Diagnostic: keep only the B-types' connections this accepts, by kind and the two neurons' names.
  keepB?: (kind: 'gap' | 'chem', row: string, col: string) => boolean;
  // Hypothesis: the AVB–B gap junctions pass current one way, AVB to B.
  avbOneWay?: boolean;
  // Scale every gap junction in the network.
  gapScale?: number;
  // Hypothesis: the A-types rest this far below their thresholds (mV), a resting state per class.
  aOffset?: number;
  // Checkpoint 0's control: every neuron-to-neuron connection cut, after the changes above, with the
  // intact thresholds kept.
  silenced?: boolean;
}

export interface Metrics {
  // Forward speed of the centroid along the head's direction, and its path speed, in body lengths per
  // second over the last 20 s of a 30 s run.
  speed: number;
  path: number;
  // Scaled curvature at mid-body: its standard deviation, and its frequency from crossings of its mean.
  sdMid: number;
  freq: number;
  // The lag (s) of the best correlation between curvature at 0.3 and at 0.6 body lengths.
  lag: number;
  corr: number;
  flips: number;
  finite: boolean;
}

const logistic = (x: number): number => 1 / (1 + Math.exp(-x));
const isB = (data: WormlightData, i: number): boolean => data.neurons[i].oscillator === 'B';

function reweighted(rows: Rows, n: number, weight: (row: number, col: number, w: number) => number): Rows {
  const out = Float64Array.from(rows.weight);
  for (let r = 0; r < n; r++) {
    for (let k = rows.start[r]; k < rows.start[r + 1]; k++) out[k] = weight(r, rows.index[k], rows.weight[k]);
  }
  return { ...rows, weight: out };
}

export function runVariant(original: WormlightData, p: Draw, v: Variant = {}, seconds = 30): Metrics {
  const dt = NEURAL_STEP;
  const removed = new Set(v.remove ?? []);
  const muscleStart = new Map(original.muscles.map((m) => [m.name, m.s0]));
  const data: WormlightData = {
    ...original,
    neuromuscular: original.neuromuscular.filter(
      (j) =>
        !removed.has(j.pre) &&
        !(v.smdReach !== undefined && j.pre.startsWith('SMD') && (muscleStart.get(j.muscle) ?? 0) >= v.smdReach),
    ),
  };
  const names = original.neurons.map((x) => x.name);
  const n = names.length;
  const intact = cookNetwork(original);
  const rest = midpointActivation(intact);
  const vth = equilibrium(intact, rest);
  let net: Network = removed.size > 0 ? lesion(intact, [...removed]) : intact;
  if (v.gapScale !== undefined) {
    const scale = v.gapScale;
    net = { ...net, gap: reweighted(net.gap, n, (_r, _c, w) => w * scale) };
  }
  const oneWay: [number, number, number][] = [];
  if (v.avbOneWay) {
    const avbB = (r: number, c: number): boolean => isB(original, r) && names[c].startsWith('AVB');
    for (let r = 0; r < n; r++) {
      for (let k = net.gap.start[r]; k < net.gap.start[r + 1]; k++) {
        if (avbB(r, net.gap.index[k])) oneWay.push([r, net.gap.index[k], net.gap.weight[k]]);
      }
    }
    net = { ...net, gap: reweighted(net.gap, n, (r, c, w) => (avbB(r, c) || avbB(c, r) ? 0 : w)) };
  }
  if (v.keepB) {
    const keep = v.keepB;
    const cut = (kind: 'gap' | 'chem') => (r: number, c: number, w: number) =>
      (isB(original, r) || isB(original, c)) && !keep(kind, names[r], names[c]) ? 0 : w;
    net = {
      ...net,
      gap: reweighted(net.gap, n, cut('gap')),
      chemical: { ...net.chemical, ...reweighted(net.chemical, n, cut('chem')) },
    };
  }
  if (v.scaleB !== undefined) {
    const scale = v.scaleB;
    const touch = (r: number, c: number, w: number): number => (isB(original, r) || isB(original, c) ? w * scale : w);
    net = {
      ...net,
      gap: reweighted(net.gap, n, touch),
      chemical: { ...net.chemical, ...reweighted(net.chemical, n, touch) },
    };
  }
  if (v.silenced) {
    net = lesion(net, names);
    oneWay.length = 0;
  }
  const thresholds = Float64Array.from(vth);
  if (v.aOffset) {
    original.neurons.forEach((x, i) => {
      if (x.oscillator === 'A') thresholds[i] += v.aOffset ?? 0;
    });
  }
  const brain = new Brain(net, thresholds);
  brain.seed = 1;
  const at = (name: string): number => names.indexOf(name);
  const bMode = v.bMode ?? 'fhn';
  const aMode = v.aMode ?? 'fhn';
  const oscillating = original.neurons.flatMap((x, i) =>
    ((x.oscillator === 'A' && aMode !== 'off') || (x.oscillator === 'B' && bMode !== 'off')) && !removed.has(x.name)
      ? [i]
      : [],
  );
  brain.setOscillators({
    neurons: Int32Array.from(oscillating),
    shift: Float64Array.from(oscillating, (i) => (isB(original, i) ? p.theta : 0)),
    gain: p.gOsc,
    recovery: p.tauW,
  });
  const bistable = oscillating.flatMap((i, k) => (isB(original, i) && bMode === 'bistable' ? [k] : []));
  for (const k of bistable) brain.recovery[k] = 0;

  const body = new Body(boyleBody());
  body.straighten(0, 0, Math.PI);
  const muscles = new Muscles(data, { gain: 0, threshold: 0, timeConstant: 0.1 }, body.params.segments);
  muscles.settle(new Float64Array(n).fill(rest));
  const restDrive = Float64Array.from(muscles.drive);
  // Each muscle's most: every excitatory input at its highest activation, a_r/(a_r + a_d) = 1/6.
  const mostDrive = Float64Array.from(data.muscles, (m) =>
    data.neuromuscular.filter((j) => j.muscle === m.name && j.sign > 0).reduce((a, j) => a + j.sections / 6, 0),
  );
  const target = (m: number): number =>
    (v.nmj ?? 'global') === 'global'
      ? logistic(p.gNmj * (muscles.drive[m] - p.tNmj))
      : logistic(p.gNmj * ((muscles.drive[m] - restDrive[m]) / Math.max(mostDrive[m] - restDrive[m], 1e-9) - p.tNmj));
  const activation = new Float64Array(data.muscles.length);
  muscles.settle(brain.activation);
  for (let m = 0; m < activation.length; m++) activation[m] = target(m);
  muscles.activation.set(activation);
  muscles.segments(body.dorsal, body.ventral);

  const fields = proprioceptiveFields(data, 0.2).filter((f) => {
    if (removed.has(names[f.neuron])) return false;
    const type = original.neurons[f.neuron].oscillator;
    return type === 'B' || (type === 'A' && (v.aProprio ?? true));
  });
  const sw = new HeadSwitch(0.046, 2.33, 1);
  const dorsal = ['SMDDL', 'SMDDR', ...(v.rmd ? ['RMDDL', 'RMDDR'] : [])].map(at);
  const ventral = ['SMDVL', 'SMDVR', ...(v.rmd ? ['RMDVL', 'RMDVR'] : [])].map(at);
  const smd = new Set(['SMDDL', 'SMDDR', 'SMDVL', 'SMDVR'].map(at));
  // The World's gate: the voltage the SMDs' partners and leak would hold them at, less their thresholds.
  const headDrive = (): number => {
    let sum = 0;
    for (const i of smd) {
      let g = net.leak;
      let c = net.leak * net.leakPotential;
      for (let k = net.gap.start[i]; k < net.gap.start[i + 1]; k++) {
        const j = net.gap.index[k];
        g += net.gap.weight[k];
        c += net.gap.weight[k] * (smd.has(j) ? vth[j] : brain.voltage[j]);
      }
      for (let k = net.chemical.start[i]; k < net.chemical.start[i + 1]; k++) {
        const j = net.chemical.index[k];
        const conductance = net.chemical.weight[k] * (smd.has(j) ? rest : brain.activation[j]);
        g += conductance;
        c += conductance * net.chemical.reversal[k];
      }
      sum += c / g - vth[i];
    }
    return sum / smd.size;
  };

  const k = new Float64Array(body.rods);
  const delaySteps = Math.round((v.delay ?? 0) / dt);
  const history: Float64Array[] = [];
  let current = 0;
  let flips = 0;
  let lastH = sw.h;
  const steps = Math.round(seconds / dt);
  const warm = Math.round(10 / dt);
  const k3: number[] = [];
  const k5: number[] = [];
  const k6: number[] = [];
  let forward = 0;
  let path = 0;
  let prev: [number, number] = [0, 0];
  const centroid = (): [number, number] => {
    let x = 0;
    let y = 0;
    for (let i = 0; i < body.rods; i++) {
      x += body.x[i];
      y += body.y[i];
    }
    return [x / body.rods, y / body.rods];
  };
  for (let s = 1; s <= steps; s++) {
    curvature(body, k);
    history.push(Float64Array.from(k));
    if (history.length > delaySteps + 1) history.shift();
    brain.input.fill(0);
    for (const f of fields) brain.input[f.neuron] += p.gP * f.side * regionMean(history[0], f.from, f.to);
    let gated: boolean;
    if (v.forcedHead) {
      gated = true;
      sw.h = Math.floor(s * dt * 2 * v.forcedHead) % 2 === 0 ? 1 : 0;
    } else {
      gated = headDrive() > p.theta;
      sw.update(regionMean(k, 0.1, 0.3), dt, gated);
    }
    const next = gated ? p.gSw * (sw.h - 0.5) : 0;
    if (next !== current) brain.restart();
    current = next;
    if (sw.h !== lastH) {
      flips++;
      lastH = sw.h;
    }
    for (const i of dorsal) brain.input[i] += current;
    for (const i of ventral) brain.input[i] -= current;
    for (const [b, a, g] of oneWay) brain.input[b] += g * (brain.voltage[a] - brain.voltage[b]);
    brain.step(dt);
    for (const idx of bistable) brain.recovery[idx] = 0;
    muscles.settle(brain.activation);
    const decay = Math.exp(-dt / 0.1);
    for (let m = 0; m < activation.length; m++) {
      const t = target(m);
      activation[m] = t + (activation[m] - t) * decay;
    }
    muscles.activation.set(activation);
    muscles.segments(body.dorsal, body.ventral);
    body.step(dt);
    if (!Number.isFinite(body.x[0]))
      return { speed: 0, path: 0, sdMid: 0, freq: 0, lag: 0, corr: 0, flips, finite: false };
    if (s === warm) prev = centroid();
    if (s > warm && s % 40 === 0) {
      const c = centroid();
      const hx = body.x[0] - c[0];
      const hy = body.y[0] - c[1];
      forward += ((c[0] - prev[0]) * hx + (c[1] - prev[1]) * hy) / Math.hypot(hx, hy);
      path += Math.hypot(c[0] - prev[0], c[1] - prev[1]);
      prev = c;
      k3.push(k[14]);
      k5.push(k[24]);
      k6.push(k[29]);
    }
  }
  return summarise({ forward, path, k3, k5, k6, flips, duration: (steps - warm) * dt });
}

export function summarise(r: {
  forward: number;
  path: number;
  k3: number[];
  k5: number[];
  k6: number[];
  flips: number;
  duration: number;
}): Metrics {
  const length = 1e-3;
  const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
  const m5 = mean(r.k5);
  let crossings = 0;
  for (let i = 1; i < r.k5.length; i++) if ((r.k5[i - 1] - m5) * (r.k5[i] - m5) < 0) crossings++;
  const m3 = mean(r.k3);
  const m6 = mean(r.k6);
  let best = -Infinity;
  let bestLag = 0;
  for (let lag = -20; lag <= 20; lag++) {
    let s = 0;
    let a2 = 0;
    let b2 = 0;
    for (let i = 0; i < r.k3.length; i++) {
      const j = i + lag;
      if (j < 0 || j >= r.k6.length) continue;
      s += (r.k3[i] - m3) * (r.k6[j] - m6);
      a2 += (r.k3[i] - m3) ** 2;
      b2 += (r.k6[j] - m6) ** 2;
    }
    const correlation = s / Math.sqrt(a2 * b2 + 1e-30);
    if (correlation > best) {
      best = correlation;
      bestLag = lag * 0.1;
    }
  }
  return {
    speed: r.forward / r.duration / length,
    path: r.path / r.duration / length,
    sdMid: Math.sqrt(mean(r.k5.map((x) => (x - m5) ** 2))),
    freq: crossings / 2 / r.duration,
    lag: bestLag,
    corr: best,
    flips: r.flips,
    finite: true,
  };
}
