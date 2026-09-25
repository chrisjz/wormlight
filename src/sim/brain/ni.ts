// Neural Interactome mode, for the port check only (PLAN §3.3, §7.2): its own matrices, constants and
// input schedule, with thresholds recomputed from the input as its code does. The network comes from
// tests/fixtures/ni/network.json, which tools/reference/ni_reference.py exports from Neural Interactome's
// module as it ran.

import { Brain, equilibrium } from './brain.ts';
import { chemicalRows, gapRows, type Network } from './network.ts';

export interface NiNetworkFile {
  names: string[];
  constants: {
    Gc: number;
    C: number;
    Ec: number;
    ggap: number;
    gsyn: number;
    ar: number;
    ad: number;
    B: number;
    Iext: number;
    rate: number;
    offset: number;
    inhibitoryReversal: number;
    sEq: number;
    transitEnd: number;
  };
  // Each symmetric pair once, as [a, b, weight].
  gap: [number, number, number][];
  // [post, pre, weight]: Neural Interactome's Gs is indexed [post, pre].
  chemical: [number, number, number][];
  // Presynaptic neurons whose synapses are inhibitory.
  inhibitory: number[];
  presets: Record<string, Record<string, number>>;
  // Its start state, V then s.
  start: number[];
}

export function niNetwork(file: NiNetworkFile): Network {
  const k = file.constants;
  const n = file.names.length;
  const inhibitory = new Set(file.inhibitory);
  return {
    names: file.names,
    capacitance: k.C,
    leak: k.Gc,
    leakPotential: k.Ec,
    rise: k.ar,
    decay: k.ad,
    slope: k.B,
    gap: gapRows(
      n,
      file.gap.map(([a, b, w]) => [a, b, w * k.ggap]),
    ),
    chemical: chemicalRows(
      n,
      file.chemical.map(([post, pre, w]) => [post, pre, w * k.gsyn, inhibitory.has(pre) ? k.inhibitoryReversal : 0]),
    ),
  };
}

// A preset switched on at t = 0 while the network runs, the path Neural Interactome's "update" event takes.
// Its input ramps in by a tanh centred `offset` after the switch; until `transitEnd` the thresholds follow
// the ramped input, and afterwards they hold at their value for the full input.
export class NiRun {
  readonly file: NiNetworkFile;
  readonly brain: Brain;
  private readonly network: Network;
  private readonly mask: Float64Array;
  private readonly finalThreshold: Float64Array;
  private readonly scratch: Float64Array;

  constructor(file: NiNetworkFile, preset: string, options: { tolerance?: number } = {}) {
    const network = niNetwork(file);
    this.file = file;
    const n = file.names.length;
    this.network = network;
    this.mask = new Float64Array(n);
    if (!(preset in file.presets)) throw new Error(`no preset ${preset}`);
    for (const [name, amount] of Object.entries(file.presets[preset])) {
      const i = file.names.indexOf(name);
      if (i < 0) throw new Error(`preset ${preset} names an unknown neuron, ${name}`);
      this.mask[i] = amount;
    }
    this.scratch = new Float64Array(n);
    this.finalThreshold = equilibrium(network, file.constants.sEq, this.input(Infinity));
    this.brain = new Brain(network, equilibrium(network, file.constants.sEq, this.input(0)), options);
    this.brain.setState(file.start.slice(0, n), file.start.slice(n));
  }

  // The input at time t, which the thresholds see as well: the preset's mask ramped in, times I_ext.
  input(t: number): Float64Array {
    const k = this.file.constants;
    const on = t <= k.transitEnd ? 0.5 + 0.5 * Math.tanh((t - k.offset) / k.rate) : 1;
    for (let i = 0; i < this.mask.length; i++) this.scratch[i] = k.Iext * this.mask[i] * on;
    return this.scratch;
  }

  threshold(t: number): Float64Array {
    if (t > this.file.constants.transitEnd) return this.finalThreshold;
    return equilibrium(this.network, this.file.constants.sEq, this.input(t), this.brain.threshold);
  }

  // One step, with the input and thresholds taken at its end, counted in whole steps so the switch at
  // transitEnd falls on the step it should. The input jumps there by 6 × 10⁻⁶ of its value, the tanh's
  // remainder, which is too small to need a restart.
  step(dt: number): void {
    const t = (this.brain.steps + 1) * dt;
    this.brain.threshold.set(this.threshold(t));
    this.brain.input.set(this.input(t));
    this.brain.step(dt);
  }
}
