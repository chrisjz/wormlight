// Kim et al. 2025's mechanism (modWorm, arXiv 2504.18073) on Wormlight's Cook network and Boyle body, for
// the go/no-go (DECISIONS.md, 2026-09-26). As their code does it:
// - a stimulus pulse into sensory neurons, held to 1.18 s and then decaying, with thresholds recomputed from
//   it as Neural Interactome's are;
// - from 1.18 s, a delayed feedback: each neuron gets α · [P (V − V_th)](t − τ), where P = M⁺M projects onto
//   the patterns the neuromuscular map M can see (modWorm adds it to the voltages; here it is a current);
// - muscles as theirs, Hill-like on the positive part of M (V − V_th), or as Wormlight's.
// No oscillators, head switch or curvature sensing, which their model doesn't have.

import type { WormlightData } from '../../../src/data/schema.ts';
import { Body, boyleBody } from '../../../src/sim/body/body.ts';
import { Brain, equilibrium, midpointActivation } from '../../../src/sim/brain/brain.ts';
import { cookNetwork } from '../../../src/sim/brain/network.ts';
import { NEURAL_STEP } from '../../../src/sim/numerics.ts';
import { summarise, type Metrics } from './loop.ts';

export interface KimDraw {
  alpha: number; // nS
  delay: number; // s
  pulse: number; // pA into each stimulated neuron
  stimulus: readonly string[];
  muscleScale: number; // Kim's Hill function: (κc)²/(1 + (κc)²)
  muscles: 'kim' | 'wormlight';
  gNmj: number;
  tNmj: number;
  thresholds: 'ni' | 'rest';
}

export function runKim(data: WormlightData, p: KimDraw, seconds = 30): Metrics {
  const dt = NEURAL_STEP;
  const net = cookNetwork(data);
  const s0 = midpointActivation(net);
  const rest = equilibrium(net, s0);
  const brain = new Brain(net, rest);
  const n = data.neurons.length;
  const at = (name: string): number => data.neurons.findIndex((x) => x.name === name);
  const muscleAt = new Map(data.muscles.map((m, i) => [m.name, i]));
  const map = data.muscles.map(() => new Float64Array(n));
  for (const j of data.neuromuscular) {
    if (j.sign !== 0) map[muscleAt.get(j.muscle) ?? 0][at(j.pre)] += j.sections * j.sign;
  }
  // An orthonormal basis of M's row space, by modified Gram–Schmidt: P = QᵀQ.
  const basis: Float64Array[] = [];
  for (const row of map) {
    const u = Float64Array.from(row);
    for (const q of basis) {
      let d = 0;
      for (let i = 0; i < n; i++) d += u[i] * q[i];
      for (let i = 0; i < n; i++) u[i] -= d * q[i];
    }
    const norm = Math.sqrt(u.reduce((a, x) => a + x * x, 0));
    if (norm > 1e-9) basis.push(u.map((x) => x / norm));
  }
  const body = new Body(boyleBody());
  body.straighten(0, 0, Math.PI);
  const cover = (quadrant: string): Int32Array =>
    Int32Array.from({ length: 48 }, (_, m) =>
      data.muscles.findIndex((x) => x.quadrant === quadrant && x.s0 <= (m + 0.5) / 48 && (m + 0.5) / 48 < x.s1),
    );
  const [dl, dr, vl, vr] = ['DL', 'DR', 'VL', 'VR'].map(cover);
  const activation = new Float64Array(map.length);
  const stimulated = p.stimulus.map(at);
  const history: Float64Array[] = [];
  const delaySteps = Math.round(p.delay / dt);
  const onStep = Math.round(1.18 / dt);
  const feedback = new Float64Array(n);
  const input = new Float64Array(n);
  const logistic = (x: number): number => 1 / (1 + Math.exp(-x));
  const steps = Math.round(seconds / dt);
  const warm = Math.round(10 / dt);
  let threshold = rest;
  let prev: [number, number] = [0, 0];
  let forward = 0;
  let path = 0;
  const k3: number[] = [];
  const k5: number[] = [];
  const k6: number[] = [];
  const centroid = (): [number, number] => {
    let x = 0;
    let y = 0;
    for (let i = 0; i < body.rods; i++) {
      x += body.x[i];
      y += body.y[i];
    }
    return [x / body.rods, y / body.rods];
  };
  const turn = (i: number): number => {
    const ax = body.x[i] - body.x[i - 1];
    const ay = body.y[i] - body.y[i - 1];
    const bx = body.x[i + 1] - body.x[i];
    const by = body.y[i + 1] - body.y[i];
    return Math.atan2(ax * by - ay * bx, ax * bx + ay * by) * 48;
  };
  for (let s = 1; s <= steps; s++) {
    const t = s * dt;
    const amount = t <= 1.18 ? p.pulse : p.pulse * Math.exp(-(t - 1.18));
    input.fill(0);
    for (const i of stimulated) input[i] = amount;
    threshold = p.thresholds === 'ni' && amount > 1e-3 ? equilibrium(net, s0, input, threshold) : rest;
    brain.threshold.set(threshold);
    history.push(Float64Array.from(brain.voltage, (v, i) => v - threshold[i]));
    if (history.length > delaySteps + 1) history.shift();
    brain.input.set(input);
    if (s >= onStep && history.length > delaySteps) {
      feedback.fill(0);
      for (const q of basis) {
        let d = 0;
        for (let i = 0; i < n; i++) d += history[0][i] * q[i];
        for (let i = 0; i < n; i++) feedback[i] += d * q[i];
      }
      for (let i = 0; i < n; i++) brain.input[i] += p.alpha * feedback[i];
    }
    brain.step(dt);
    for (let m = 0; m < map.length; m++) {
      let u = 0;
      const row = map[m];
      for (let i = 0; i < n; i++) {
        if (row[i] !== 0) u += row[i] * (p.muscles === 'kim' ? brain.voltage[i] - threshold[i] : brain.activation[i]);
      }
      const c = Math.max(u, 0) * p.muscleScale;
      const target = p.muscles === 'kim' ? (c * c) / (1 + c * c) : logistic(p.gNmj * (u - p.tNmj));
      activation[m] = target + (activation[m] - target) * Math.exp(-dt / 0.1);
    }
    for (let m = 0; m < 48; m++) {
      body.dorsal[m] = (activation[dl[m]] + activation[dr[m]]) / 2;
      body.ventral[m] = (activation[vl[m]] + activation[vr[m]]) / 2;
    }
    body.step(dt);
    if (!Number.isFinite(body.x[0]))
      return { speed: 0, path: 0, sdMid: 0, freq: 0, lag: 0, corr: 0, flips: 0, finite: false };
    if (s === warm) prev = centroid();
    if (s > warm && s % 40 === 0) {
      const c = centroid();
      const hx = body.x[0] - c[0];
      const hy = body.y[0] - c[1];
      forward += ((c[0] - prev[0]) * hx + (c[1] - prev[1]) * hy) / Math.hypot(hx, hy);
      path += Math.hypot(c[0] - prev[0], c[1] - prev[1]);
      prev = c;
      k3.push(turn(14));
      k5.push(turn(24));
      k6.push(turn(29));
    }
  }
  return summarise({ forward, path, k3, k5, k6, flips: 0, duration: (steps - warm) * dt });
}
