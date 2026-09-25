// Kim et al. 2025's mechanism (modWorm, arXiv 2504.18073) on Wormlight's Cook network and Boyle body, for
// the go/no-go (DECISIONS.md, 2026-09-26). As their code (shlizee/modWorm) does it:
// - a pulse into sensory neurons that decays as A / (1 + e^((t − t½)/w)), the form of their preset input
//   files, with Neural Interactome's thresholds recomputed from it;
// - from 1.18 s, a feedback δ = g · [P (V − V_th)](t − τ), where P = M⁺M projects onto the patterns the
//   neuromuscular map M can see, V is the state and g = 1, τ = 0.6 s in their code. They add δ to the
//   voltage every current and the synaptic activation see; here the Brain's voltage is V + δ, moved by a
//   current C dδ/dt;
// - their muscles: each muscle's input M (V − V_th) rectified, left and right summed per segment, and
//   activation (κc)²/(1 + (κc)²) with no lag. Their κ is 15 on a map whose largest row sums to about 40 in
//   absolute value; Wormlight's map counts EM sections, so κ is scaled by the ratio of the largest rows.
// Or Wormlight's own muscles, on the synaptic activation. No oscillators, head switch or curvature
// sensing, which their model doesn't have.

import type { WormlightData } from '../../../src/data/schema.ts';
import { Body, boyleBody } from '../../../src/sim/body/body.ts';
import { Brain, equilibrium, midpointActivation } from '../../../src/sim/brain/brain.ts';
import { cookNetwork } from '../../../src/sim/brain/network.ts';
import { NEURAL_STEP } from '../../../src/sim/numerics.ts';
import { curvature } from '../../../src/sim/proprio.ts';
import { NOT_FINITE, Recorder, WARM_UP, type Metrics } from './loop.ts';

const FEEDBACK_START = 1.18; // s, modWorm's fdb_init
const THEIR_HILL = 15;
const THEIR_LARGEST_ROW = 40; // Σ|M| over the largest row of modWorm's muscle_map_adjust.npy (39.99)

export interface KimSetup {
  // The stimulated neurons and their pulse amplitudes (pA), its half-time and width (s).
  pulses: readonly { neurons: readonly string[]; amplitude: number }[];
  halfTime: number;
  width: number;
  // The direction the stimulus should drive the body, in which speed is reported: 1 forward, −1 backward.
  direction: 1 | -1;
  muscles: 'kim' | 'wormlight';
  thresholds: 'ni' | 'rest';
}

export interface KimDraw extends KimSetup {
  gain: number; // the feedback's; theirs is 1
  delay: number; // s; theirs is 0.6
  hill: number; // κ relative to the value matched to their map
  gNmj: number; // Wormlight's muscles only: gain and threshold on synaptic drive
  tNmj: number;
}

export function runKim(data: WormlightData, p: KimDraw, seconds = 30): Metrics {
  if (seconds <= WARM_UP + 1) throw new Error(`a run must be longer than the ${WARM_UP} s warm-up`);
  const dt = NEURAL_STEP;
  const net = cookNetwork(data);
  const s0 = midpointActivation(net);
  const rest = equilibrium(net, s0);
  const brain = new Brain(net, rest);
  const n = data.neurons.length;
  const at = (name: string): number => {
    const i = data.neurons.findIndex((x) => x.name === name);
    if (i < 0) throw new Error(`unknown neuron ${name}`);
    return i;
  };
  const muscleAt = new Map(data.muscles.map((m, i) => [m.name, i]));
  const map = data.muscles.map(() => new Float64Array(n));
  for (const j of data.neuromuscular) {
    const m = muscleAt.get(j.muscle);
    if (m === undefined) throw new Error(`unknown muscle ${j.muscle}`);
    if (j.sign !== 0) map[m][at(j.pre)] += j.sections * j.sign;
  }
  const largest = Math.max(...map.map((row) => row.reduce((a, x) => a + Math.abs(x), 0)));
  const kappa = (p.hill * THEIR_HILL * THEIR_LARGEST_ROW) / largest;
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
  const segments = body.params.segments;
  const cover = (quadrant: string): Int32Array =>
    Int32Array.from({ length: segments }, (_, m) =>
      data.muscles.findIndex(
        (x) => x.quadrant === quadrant && x.s0 <= (m + 0.5) / segments && (m + 0.5) / segments < x.s1,
      ),
    );
  const [dl, dr, vl, vr] = ['DL', 'DR', 'VL', 'VR'].map(cover);
  const stimulated = p.pulses.flatMap(({ neurons, amplitude }) => neurons.map((name) => [at(name), amplitude]));
  const loudest = Math.max(...p.pulses.map((x) => x.amplitude));
  const pulse = (t: number): number => 1 / (1 + Math.exp((t - p.halfTime) / p.width));
  const logistic = (x: number): number => 1 / (1 + Math.exp(-x));
  const hill = (c: number): number => (kappa * c) ** 2 / (1 + (kappa * c) ** 2);
  const drive = new Float64Array(map.length);
  const activation = new Float64Array(map.length);
  const history: Float64Array[] = [];
  const delaySteps = Math.round(p.delay / dt);
  const startStep = Math.round(FEEDBACK_START / dt);
  const offset = new Float64Array(n);
  const next = new Float64Array(n);
  const input = new Float64Array(n);
  const k = new Float64Array(body.rods);
  const steps = Math.round(seconds / dt);
  const recorder = new Recorder(body);
  const decay = Math.exp(-dt / 0.1);
  let threshold = rest;
  for (let s = 1; s <= steps; s++) {
    const on = pulse(s * dt);
    input.fill(0);
    for (const [i, amplitude] of stimulated) input[i] = amplitude * on;
    threshold = p.thresholds === 'ni' && loudest * on > 1e-3 ? equilibrium(net, s0, input, threshold) : rest;
    brain.threshold.set(threshold);
    history.push(Float64Array.from(brain.voltage, (u, i) => u - offset[i] - threshold[i]));
    if (history.length > delaySteps + 1) history.shift();
    brain.input.set(input);
    if (s >= startStep && history.length > delaySteps) {
      next.fill(0);
      for (const q of basis) {
        let d = 0;
        for (let i = 0; i < n; i++) d += history[0][i] * q[i];
        for (let i = 0; i < n; i++) next[i] += p.gain * d * q[i];
      }
      if (s === startStep) {
        // The feedback switches on as a jump in the voltage the network sees.
        for (let i = 0; i < n; i++) brain.voltage[i] += next[i];
        brain.restart();
      } else {
        for (let i = 0; i < n; i++) brain.input[i] += (net.capacitance * (next[i] - offset[i])) / dt;
      }
      offset.set(next);
    }
    curvature(body, k);
    brain.step(dt);
    for (let m = 0; m < map.length; m++) {
      let u = 0;
      const row = map[m];
      for (let i = 0; i < n; i++) {
        if (row[i] !== 0)
          u += row[i] * (p.muscles === 'kim' ? brain.voltage[i] - offset[i] - threshold[i] : brain.activation[i]);
      }
      if (p.muscles === 'kim') drive[m] = Math.max(u, 0);
      else {
        const target = logistic(p.gNmj * (u - p.tNmj));
        activation[m] = target + (activation[m] - target) * decay;
      }
    }
    for (let m = 0; m < segments; m++) {
      if (p.muscles === 'kim') {
        body.dorsal[m] = hill(drive[dl[m]] + drive[dr[m]]);
        body.ventral[m] = hill(drive[vl[m]] + drive[vr[m]]);
      } else {
        body.dorsal[m] = (activation[dl[m]] + activation[dr[m]]) / 2;
        body.ventral[m] = (activation[vl[m]] + activation[vr[m]]) / 2;
      }
    }
    body.step(dt);
    if (!Number.isFinite(body.x[0])) return NOT_FINITE;
    recorder.sample(s, k);
  }
  const metrics = recorder.metrics(steps);
  return { ...metrics, speed: metrics.speed * p.direction };
}
