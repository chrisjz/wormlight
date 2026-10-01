// The neuromuscular layer (PLAN §4.4), shared by every brain: Cook's neuromuscular map turns synaptic
// activation into muscle drive, each muscle's activation follows its drive with a 100 ms time constant, and
// the four quadrants' muscles become the body's dorsal and ventral activation per segment.

import type { WormlightData } from '../data/schema.ts';
import { PARAMS } from '../science/params.ts';

export interface MuscleParams {
  // g_nmj and θ_nmj (calibrated): per EM section and in EM sections, or with relative drive per unit of each
  // muscle's range and in units of it; and τ_M in seconds.
  gain: number;
  threshold: number;
  timeConstant: number;
  // Track R's model (PLAN §9): each muscle's drive relative to its own range, and a gain κ_SMD on the SMDs'
  // junctions onto the muscles starting at 0.3 body lengths or beyond. The planned model has neither.
  relative?: boolean;
  smdGain?: number;
  // Each neuron's activation at rest, in the data's order, for relative drive's baseline: track S's model's, whose
  // class offsets move it. Left out, every neuron at the sigmoid's midpoint.
  restActivation?: ArrayLike<number>;
}

// Where κ_SMD starts: the SMDs' junctions onto muscles whose field starts this far along the body or beyond.
export const SMD_REACH = 0.3; // body lengths

const logistic = (x: number): number => 1 / (1 + Math.exp(-x));

export class Muscles {
  readonly names: readonly string[];
  // u_m = Σ_j w_jm sign_j s_j, and the activation A_m that follows σ(g_nmj (u_m − o_m − θ_nmj)). With relative
  // drive each muscle's weights are divided by its range and o_m is its rest over its range, so u_m − o_m is
  // (u − u_rest)/(u_max − u_rest) in the raw drive u; otherwise o_m is 0.
  readonly drive: Float64Array;
  readonly offset: Float64Array;
  readonly activation: Float64Array;
  readonly params: MuscleParams;
  // Each muscle's presynaptic neurons and signed section counts, as compressed rows.
  readonly start: Int32Array;
  readonly pre: Int32Array;
  readonly weight: Float64Array;
  // For each of the body's segments, the muscle covering its middle in each quadrant.
  readonly cover: { DL: Int32Array; DR: Int32Array; VL: Int32Array; VR: Int32Array };

  // Junctions from the `excluded` neurons (lesioned ones) are left out.
  constructor(data: WormlightData, params: MuscleParams, segments: number, excluded: ReadonlySet<string> = new Set()) {
    this.params = params;
    this.names = data.muscles.map((m) => m.name);
    const muscleAt = new Map(this.names.map((name, i) => [name, i]));
    const neuronAt = new Map(data.neurons.map((n, i) => [n.name, i]));
    // Connections from cells with no fast effect on muscle carry no drive, and κ_SMD scales the SMDs' past the
    // head.
    const smdGain = params.smdGain ?? 1;
    const intact = data.neuromuscular
      .filter((j) => j.sign !== 0)
      .map((j) => {
        const m = muscleAt.get(j.muscle) ?? -1;
        const far = m >= 0 && j.pre.startsWith('SMD') && data.muscles[m].s0 >= SMD_REACH;
        return { m, n: neuronAt.get(j.pre) ?? -1, pre: j.pre, w: j.sections * j.sign * (far ? smdGain : 1) };
      });
    if (intact.some(({ m, n }) => m < 0 || n < 0)) throw new Error('a neuromuscular connection names an unknown cell');
    const count = this.names.length;
    // Relative drive's range, from the intact map, the same for every brain and lesion: u_rest with every
    // activation at the sigmoid's midpoint, a_r/(a_r + 2a_d), or at its neuron's own rest in track S's model, whose
    // class offsets move it (DECISIONS.md, 2026-10-02), and u_max with every excitatory one at the most a synapse
    // reaches, a_r/(a_r + a_d), and every inhibitory one at 0 (PLAN §9).
    const span = new Float64Array(count).fill(1);
    this.offset = new Float64Array(count);
    if (params.relative) {
      const [rise, decay] = [PARAMS.synapticRise.value, PARAMS.synapticDecay.value];
      const [mid, most] = [rise / (rise + 2 * decay), rise / (rise + decay)];
      const rest = new Float64Array(count);
      const max = new Float64Array(count);
      const at = params.restActivation;
      for (const { m, n, w } of intact) {
        rest[m] += w * (at ? at[n] : mid);
        if (w > 0) max[m] += w * most;
      }
      for (let m = 0; m < count; m++) {
        if (!(max[m] > rest[m])) throw new Error(`${this.names[m]} has no range of drive`);
        span[m] = max[m] - rest[m];
        this.offset[m] = rest[m] / span[m];
      }
    }
    const edges = intact.filter((j) => !excluded.has(j.pre)).map(({ m, n, w }) => [m, n, w / span[m]] as const);
    this.start = new Int32Array(count + 1);
    for (const [m] of edges) this.start[m + 1]++;
    for (let m = 0; m < count; m++) this.start[m + 1] += this.start[m];
    const next = this.start.slice(0, count);
    this.pre = new Int32Array(edges.length);
    this.weight = new Float64Array(edges.length);
    for (const [m, n, w] of edges) {
      const at = next[m]++;
      this.pre[at] = n;
      this.weight[at] = w;
    }
    this.drive = new Float64Array(count);
    this.activation = new Float64Array(count);

    const covering = (quadrant: string): Int32Array =>
      Int32Array.from({ length: segments }, (_, m) => {
        const middle = (m + 0.5) / segments;
        const i = data.muscles.findIndex(
          (muscle) => muscle.quadrant === quadrant && muscle.s0 <= middle && middle < muscle.s1,
        );
        if (i < 0) throw new Error(`no ${quadrant} muscle covers segment ${m}`);
        return i;
      });
    this.cover = { DL: covering('DL'), DR: covering('DR'), VL: covering('VL'), VR: covering('VR') };
  }

  // Set every muscle to the activation its drive holds it at, for this activation of the neurons.
  settle(activation: Float64Array): void {
    this.computeDrive(activation);
    for (let m = 0; m < this.activation.length; m++) this.activation[m] = this.target(m);
  }

  // Advance by dt with the neurons' activation at the end of the step, exactly for a drive held over it.
  step(dt: number, activation: Float64Array): void {
    this.computeDrive(activation);
    const decay = Math.exp(-dt / this.params.timeConstant);
    for (let m = 0; m < this.activation.length; m++) {
      const target = this.target(m);
      this.activation[m] = target + (this.activation[m] - target) * decay;
    }
  }

  // Each body segment's dorsal and ventral activation: the mean of the left and right muscles covering it.
  segments(dorsal: Float64Array, ventral: Float64Array): void {
    const { DL, DR, VL, VR } = this.cover;
    const a = this.activation;
    for (let m = 0; m < dorsal.length; m++) {
      dorsal[m] = (a[DL[m]] + a[DR[m]]) / 2;
      ventral[m] = (a[VL[m]] + a[VR[m]]) / 2;
    }
  }

  private computeDrive(activation: Float64Array): void {
    for (let m = 0; m < this.drive.length; m++) {
      let u = 0;
      for (let k = this.start[m]; k < this.start[m + 1]; k++) u += this.weight[k] * activation[this.pre[k]];
      this.drive[m] = u;
    }
  }

  private target(m: number): number {
    return logistic(this.params.gain * (this.drive[m] - this.offset[m] - this.params.threshold));
  }
}
