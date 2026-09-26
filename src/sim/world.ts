// One simulated worm (PLAN §1): the brain, the layers outside it (spec §1.1) and the body, stepped in the
// plan's order. Milestone 0c has no odour or touch yet, so a step reads the body's curvature, sets the
// proprioceptive and head-switch currents, advances the brain, turns its activation into muscle activation
// and advances the body.

import type { WormlightData } from '../data/schema.ts';
import { PARAMS } from '../science/params.ts';
import { Body, boyleBody } from './body/body.ts';
import {
  Brain,
  equilibrium,
  midpointActivation,
  type BrainState,
  type Oscillators,
  type SolverOptions,
} from './brain/brain.ts';
import { cookNetwork, lesion, type Network } from './brain/network.ts';
import { hash } from './brain/rng.ts';
import { Muscles } from './muscles.ts';
import { NEURAL_STEP } from './numerics.ts';
import { curvature, HeadSwitch, proprioceptiveFields, regionMean, type Field } from './proprio.ts';

// The calibrated parameters (PLAN §6.2), in the units the simulation uses.
export interface LoopParams {
  // g_osc (nS), τ_w (s) and θ_osc (mV).
  oscillatorGain: number;
  recoveryTime: number;
  driveThreshold: number;
  // g_sw and g_p (pA per unit of scaled curvature).
  switchGain: number;
  proprioceptiveGain: number;
  // g_nmj (per EM section) and θ_nmj (EM sections).
  neuromuscularGain: number;
  neuromuscularThreshold: number;
  // σ_n (pA·√s).
  noise: number;
}

// The registry's calibrated values, in the registry's units, as LoopParams.
export function loopParams(values: {
  oscillatorExcitability: number; // pS
  oscillatorRecoveryTime: number; // s
  oscillatorDriveThreshold: number; // mV
  headSwitchGain: number; // pA
  proprioceptiveGain: number; // pA
  neuromuscularGain: number; // per EM section
  neuromuscularThreshold: number; // EM sections
  noiseIntensity: number; // pA·√s
}): LoopParams {
  return {
    oscillatorGain: values.oscillatorExcitability / 1000, // pS → nS
    recoveryTime: values.oscillatorRecoveryTime,
    driveThreshold: values.oscillatorDriveThreshold,
    switchGain: values.headSwitchGain,
    proprioceptiveGain: values.proprioceptiveGain,
    neuromuscularGain: values.neuromuscularGain,
    neuromuscularThreshold: values.neuromuscularThreshold,
    noise: values.noiseIntensity,
  };
}

const CALIBRATED = [
  'oscillatorExcitability',
  'oscillatorRecoveryTime',
  'oscillatorDriveThreshold',
  'headSwitchGain',
  'proprioceptiveGain',
  'neuromuscularGain',
  'neuromuscularThreshold',
  'noiseIntensity',
] as const;

// The registry's values, once calibrated.
export function calibratedParams(): LoopParams {
  const values = Object.fromEntries(CALIBRATED.map((id) => [id, PARAMS[id].value as number | null]));
  if (Object.values(values).some((v) => v === null)) throw new Error('the loop parameters are not calibrated yet');
  return loopParams(values as Parameters<typeof loopParams>[0]);
}

export interface WorldOptions {
  seed?: number;
  // Neurons to ablate (PLAN §3.5): their connections, neuromuscular junctions, oscillators and
  // proprioceptive input go, and every neuron keeps the intact network's threshold (§3.3).
  lesions?: readonly string[];
  // A different brain on the same neurons, such as a rewired one. It gets its own thresholds, from its own
  // wiring at rest (§3.3). Lesions apply to it as to the intact one.
  network?: Network;
  // Checkpoint 0's silenced network (PLAN §7.2): every neuron-to-neuron synapse and gap junction cut, with
  // neuromuscular junctions, oscillators and every layer outside the brain kept, and the intact thresholds.
  silenced?: boolean;
  // The direction the head faces; the body starts straight with its head at the origin.
  heading?: number;
  // The brain's solver settings, if not the reference's (PLAN §3.4).
  solver?: SolverOptions;
  // The head switch's threshold P_th, if not the registry's: GPU parity lowers it so the switch flips often.
  switchThreshold?: number;
}

// Everything the next step reads, so another world, on the CPU or the GPU, can take the same step.
export interface WorldState {
  brain: BrainState;
  // Rod centres and angles, and the velocities of the last step.
  x: Float64Array;
  y: Float64Array;
  theta: Float64Array;
  velocity: Float64Array;
  // Each muscle's activation.
  muscles: Float64Array;
  // The head switch: its state, the head's curvature at its last update, and the current it drove.
  h: number;
  previousCurvature: number | null;
  switchCurrent: number;
}

export class World {
  readonly params: LoopParams;
  readonly brain: Brain;
  readonly body: Body;
  readonly muscles: Muscles;
  readonly headSwitch: HeadSwitch;
  readonly fields: Field[];
  readonly curvature: Float64Array;
  // The head-switch current into the dorsal SMDs, the opposite into the ventral ones.
  switchCurrent = 0;
  // The SMDs the switch drives, and the body coordinates whose curvature it reads.
  readonly dorsalSwitch: readonly number[];
  readonly ventralSwitch: readonly number[];
  readonly headFrom: number;
  readonly headTo: number;
  private readonly smd: Set<number>;

  constructor(data: WormlightData, params: LoopParams, options: WorldOptions = {}) {
    this.params = params;
    const seed = options.seed ?? 0;
    const whole = options.network ?? cookNetwork(data);
    const thresholds = equilibrium(whole, midpointActivation(whole));
    const lesioned = new Set(options.lesions ?? []);
    const cut = options.silenced ? whole.names : [...lesioned];
    const network = cut.length > 0 ? lesion(whole, cut) : whole;
    this.brain = new Brain(network, thresholds, options.solver);
    this.brain.noise = params.noise;
    this.brain.seed = seed;
    const alive = (name: string): boolean => !lesioned.has(name);
    const oscillating = data.neurons.flatMap((n, i) =>
      (n.oscillator === 'A' || n.oscillator === 'B') && alive(n.name)
        ? [[i, n.oscillator === 'B' ? params.driveThreshold : 0]]
        : [],
    );
    const oscillators: Oscillators = {
      neurons: Int32Array.from(oscillating, ([i]) => i),
      shift: Float64Array.from(oscillating, ([, shift]) => shift),
      gain: params.oscillatorGain,
      recovery: params.recoveryTime,
    };
    this.brain.setOscillators(oscillators);

    this.body = new Body(boyleBody());
    this.body.straighten(0, 0, options.heading ?? Math.PI);
    this.muscles = new Muscles(
      data,
      {
        gain: params.neuromuscularGain,
        threshold: params.neuromuscularThreshold,
        timeConstant: PARAMS.muscleTimeConstant.value / 1000,
      },
      this.body.params.segments,
      lesioned,
    );
    this.muscles.settle(this.brain.activation);
    this.muscles.segments(this.body.dorsal, this.body.ventral);

    this.fields = proprioceptiveFields(data, PARAMS.proprioceptiveReach.value).filter((f) =>
      alive(data.neurons[f.neuron].name),
    );
    this.curvature = new Float64Array(this.body.rods);
    const smd = (prefix: string): number[] =>
      data.neurons.flatMap((n, i) =>
        n.oscillator === 'headSwitch' && n.name.startsWith(prefix) && alive(n.name) ? [i] : [],
      );
    this.dorsalSwitch = smd('SMDD');
    this.ventralSwitch = smd('SMDV');
    this.smd = new Set([...this.dorsalSwitch, ...this.ventralSwitch]);
    this.headFrom = PARAMS.headSwitchRegionStart.value;
    this.headTo = PARAMS.headSwitchRegionEnd.value;
    // Which side the switch drives first is drawn from the seed, so trials don't all start dorsal.
    this.headSwitch = new HeadSwitch(
      PARAMS.headSwitchDerivativeWeight.value / 1000,
      options.switchThreshold ?? PARAMS.headSwitchThreshold.value,
      hash(seed, 0, 0xffffffff) & 1,
    );
  }

  snapshot(): WorldState {
    return {
      brain: this.brain.snapshot(),
      x: Float64Array.from(this.body.x),
      y: Float64Array.from(this.body.y),
      theta: Float64Array.from(this.body.theta),
      velocity: this.body.lastRates(),
      muscles: Float64Array.from(this.muscles.activation),
      h: this.headSwitch.h,
      previousCurvature: this.headSwitch.lastCurvature,
      switchCurrent: this.switchCurrent,
    };
  }

  // Restore a state, so snapshot() gives it back. What each step derives afresh, the curvature and the muscles'
  // drive, waits for the next step.
  restore(state: WorldState): void {
    this.brain.restore(state.brain);
    this.body.x.set(state.x);
    this.body.y.set(state.y);
    this.body.theta.set(state.theta);
    this.body.restoreRates(state.velocity);
    this.muscles.activation.set(state.muscles);
    this.muscles.segments(this.body.dorsal, this.body.ventral);
    this.headSwitch.restore(state.h, state.previousCurvature);
    this.switchCurrent = state.switchCurrent;
  }

  get time(): number {
    return this.brain.steps * NEURAL_STEP;
  }

  // The network's drive on the SMDs, which gates the head switch: for each, the voltage its partners and
  // leak would hold it at, less its threshold, averaged over the four. The SMDs' own voltages, and so the
  // switch's current, don't enter: links among the SMDs count at their rest values. It is 0 at rest and
  // E_c − V_th, about −28 mV, in a silenced network.
  headDrive(): number {
    const { network, voltage, activation, threshold } = this.brain;
    const rest = midpointActivation(network);
    let sum = 0;
    for (const i of this.smd) {
      let g = network.leak;
      let current = network.leak * network.leakPotential;
      const { gap, chemical } = network;
      for (let k = gap.start[i]; k < gap.start[i + 1]; k++) {
        const j = gap.index[k];
        g += gap.weight[k];
        current += gap.weight[k] * (this.smd.has(j) ? threshold[j] : voltage[j]);
      }
      for (let k = chemical.start[i]; k < chemical.start[i + 1]; k++) {
        const j = chemical.index[k];
        const conductance = chemical.weight[k] * (this.smd.has(j) ? rest : activation[j]);
        g += conductance;
        current += conductance * chemical.reversal[k];
      }
      sum += current / g - threshold[i];
    }
    return this.smd.size > 0 ? sum / this.smd.size : -Infinity;
  }

  step(): void {
    const dt = NEURAL_STEP;
    const { brain, body, params } = this;
    curvature(body, this.curvature);
    brain.input.fill(0);
    for (const field of this.fields) {
      brain.input[field.neuron] +=
        params.proprioceptiveGain * field.side * regionMean(this.curvature, field.from, field.to);
    }
    const gated = this.headDrive() > params.driveThreshold;
    this.headSwitch.update(regionMean(this.curvature, this.headFrom, this.headTo), dt, gated);
    const current = gated ? params.switchGain * (this.headSwitch.h - 0.5) : 0;
    // The switch current jumps when it flips or is gated on or off; BDF2 across a jump is first order.
    if (current !== this.switchCurrent) brain.restart();
    this.switchCurrent = current;
    for (const i of this.dorsalSwitch) brain.input[i] += current;
    for (const i of this.ventralSwitch) brain.input[i] -= current;
    brain.step(dt);
    this.muscles.step(dt, brain.activation);
    this.muscles.segments(body.dorsal, body.ventral);
    body.step(dt);
  }
}
