// One simulated worm (PLAN §1): the brain, the layers outside it (spec §1.1) and the body, stepped in the
// plan's order. Milestone 0c has no odour or touch yet, so a step reads the body's curvature, sets the
// proprioceptive and head-switch currents, advances the brain, turns its activation into muscle activation
// and advances the body.

import type { WormlightData } from '../data/schema.ts';
import { PARAMS } from '../science/params.ts';
import { Body, boyleBody } from './body/body.ts';
import { Brain, equilibrium, midpointActivation, type Oscillators } from './brain/brain.ts';
import { cookNetwork, type Network } from './brain/network.ts';
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

// The registry's values, once calibrated.
export function calibratedParams(): LoopParams {
  const p = PARAMS;
  const values = [
    p.oscillatorExcitability,
    p.oscillatorRecoveryTime,
    p.oscillatorDriveThreshold,
    p.headSwitchGain,
    p.proprioceptiveGain,
    p.neuromuscularGain,
    p.neuromuscularThreshold,
    p.noiseIntensity,
  ].map((param) => param.value as number | null);
  if (values.some((v) => v === null)) throw new Error('the loop parameters are not calibrated yet');
  const [gOsc, tauW, thetaOsc, gSw, gP, gNmj, thetaNmj, noise] = values as number[];
  return {
    oscillatorGain: gOsc / 1000, // pS → nS
    recoveryTime: tauW,
    driveThreshold: thetaOsc,
    switchGain: gSw,
    proprioceptiveGain: gP,
    neuromuscularGain: gNmj,
    neuromuscularThreshold: thetaNmj,
    noise,
  };
}

export interface WorldOptions {
  seed?: number;
  // A network other than the intact one, such as a lesioned or silenced one. Its thresholds stay the
  // intact network's (PLAN §3.3).
  network?: Network;
  // Where the head starts and which way it faces; the body starts straight.
  heading?: number;
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
  private readonly dorsalSwitch: number[];
  private readonly ventralSwitch: number[];
  private readonly headFrom: number;
  private readonly headTo: number;

  constructor(data: WormlightData, params: LoopParams, options: WorldOptions = {}) {
    this.params = params;
    const intact = cookNetwork(data);
    const thresholds = equilibrium(intact, midpointActivation(intact));
    this.brain = new Brain(options.network ?? intact, thresholds);
    this.brain.noise = params.noise;
    this.brain.seed = options.seed ?? 0;
    const oscillating = data.neurons.flatMap((n, i) =>
      n.oscillator === 'A' || n.oscillator === 'B' ? [[i, n.oscillator === 'B' ? params.driveThreshold : 0]] : [],
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
    );
    this.muscles.settle(this.brain.activation);
    this.muscles.segments(this.body.dorsal, this.body.ventral);

    this.fields = proprioceptiveFields(data, PARAMS.proprioceptiveReach.value);
    this.curvature = new Float64Array(this.body.rods);
    const smd = (prefix: string): number[] =>
      data.neurons.flatMap((n, i) => (n.oscillator === 'headSwitch' && n.name.startsWith(prefix) ? [i] : []));
    this.dorsalSwitch = smd('SMDD');
    this.ventralSwitch = smd('SMDV');
    this.headFrom = PARAMS.headSwitchRegionStart.value;
    this.headTo = PARAMS.headSwitchRegionEnd.value;
    this.headSwitch = new HeadSwitch(PARAMS.headSwitchDerivativeWeight.value / 1000, PARAMS.headSwitchThreshold.value);
  }

  get time(): number {
    return this.brain.steps * NEURAL_STEP;
  }

  // The SMDs' mean depolarisation above threshold: the network drive that gates the head switch. Its
  // antiphase current into the dorsal and ventral pairs roughly cancels in the mean.
  headDrive(): number {
    const { voltage, threshold } = this.brain;
    const all = [...this.dorsalSwitch, ...this.ventralSwitch];
    return all.reduce((sum, i) => sum + voltage[i] - threshold[i], 0) / all.length;
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
