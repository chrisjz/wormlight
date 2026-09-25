// The neuromuscular layer (PLAN §4.4), shared by every brain: Cook's neuromuscular map turns synaptic
// activation into muscle drive, each muscle's activation follows its drive with a 100 ms time constant, and
// the four quadrants' muscles become the body's dorsal and ventral activation per segment.

import type { WormlightData } from '../data/schema.ts';

export interface MuscleParams {
  // g_nmj per EM section and θ_nmj in EM sections (calibrated), and τ_M in seconds.
  gain: number;
  threshold: number;
  timeConstant: number;
}

const logistic = (x: number): number => 1 / (1 + Math.exp(-x));

export class Muscles {
  readonly names: readonly string[];
  // u_m = Σ_j w_jm sign_j s_j, and the activation A_m that follows σ(g_nmj (u_m − θ_nmj)).
  readonly drive: Float64Array;
  readonly activation: Float64Array;
  readonly params: MuscleParams;
  // Each muscle's presynaptic neurons and signed section counts, as compressed rows.
  private readonly start: Int32Array;
  private readonly pre: Int32Array;
  private readonly weight: Float64Array;
  // For each of the body's segments, the muscle covering its middle in each quadrant.
  private readonly cover: { DL: Int32Array; DR: Int32Array; VL: Int32Array; VR: Int32Array };

  constructor(data: WormlightData, params: MuscleParams, segments: number) {
    this.params = params;
    this.names = data.muscles.map((m) => m.name);
    const muscleAt = new Map(this.names.map((name, i) => [name, i]));
    const neuronAt = new Map(data.neurons.map((n, i) => [n.name, i]));
    // Connections from cells with no fast effect on muscle carry no drive.
    const edges = data.neuromuscular
      .filter((j) => j.sign !== 0)
      .map((j) => [muscleAt.get(j.muscle) ?? -1, neuronAt.get(j.pre) ?? -1, j.sections * j.sign] as const);
    if (edges.some(([m, n]) => m < 0 || n < 0)) throw new Error('a neuromuscular connection names an unknown cell');
    const count = this.names.length;
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
    return logistic(this.params.gain * (this.drive[m] - this.params.threshold));
  }
}
