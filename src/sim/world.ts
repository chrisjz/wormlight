// One simulated worm (PLAN §1): the brain, the layers outside it (spec §1.1) and the body, stepped in the
// plan's order. A step reads the body's curvature and the odour at the nose, sets the proprioceptive, AWC,
// touch and head-switch currents, advances the brain, turns its activation into muscle activation and
// advances the body.

import type { WormlightData } from '../data/schema.ts';
import { PARAMS } from '../science/params.ts';
import type { PlannedValues } from '../science/planned.ts';
import { Body, boyleBody } from './body/body.ts';
import {
  Brain,
  equilibrium,
  midpointActivation,
  type BrainState,
  type Oscillators,
  type SolverOptions,
} from './brain/brain.ts';
import { cookNetwork, lesion, scaleGap, type Network } from './brain/network.ts';
import { hash } from './brain/rng.ts';
import { Muscles } from './muscles.ts';
import { AWC_JUMP, NEURAL_STEP } from './numerics.ts';
import { curvature, HeadSwitch, proprioceptiveFields, regionMean, type Field } from './proprio.ts';
import { AWC_GAIN, AwcSensor, type AwcSide, type Odour } from './sensing.ts';
import { tap, TOUCH_STEPS, touchData, type Touch, type TouchReceptor } from './touch.ts';

// The calibrated parameters (PLAN §6.2), in the units the simulation uses.
export interface LoopParams {
  // g_osc (nS), τ_w (s) and θ_osc (mV).
  oscillatorGain: number;
  recoveryTime: number;
  driveThreshold: number;
  // g_sw and g_p (pA per unit of scaled curvature).
  switchGain: number;
  proprioceptiveGain: number;
  // g_nmj (per EM section) and θ_nmj (EM sections), or with relativeDrive per unit of relative drive and in it.
  neuromuscularGain: number;
  neuromuscularThreshold: number;
  // σ_n (pA·√s), and the noise's correlation time τ_n (s): left out or 0, white noise, as the model runs; above 0,
  // an Ornstein–Uhlenbeck current, a candidate the second numerics study tests (DECISIONS.md, 2026-09-28).
  noise: number;
  noiseCorrelation?: number;
  // Track R's model (PLAN §9): g_osc for the B-types, apart from the A-types' (nS); κ_gap,B on every gap junction
  // with a B-type on either side; κ_SMD on the SMDs' neuromuscular junctions past the head; and drive relative to
  // each muscle's range, in whose units g_nmj and θ_nmj then are. Left out, each is the planned model's: the
  // A-types' g_osc, gains of 1, and raw drive.
  oscillatorGainB?: number;
  gapGainB?: number;
  smdGain?: number;
  relativeDrive?: boolean;
}

// The values of track R's model, the registry's (PLAN §9), in the registry's units, as LoopParams.
// oscillatorExcitability is the A-types' alone here, and g_nmj and θ_nmj are on relative drive.
export interface RValues extends PlannedValues {
  oscillatorExcitabilityB: number; // pS
  gapGainB: number;
  smdGain: number;
}
export function loopParams(values: RValues): LoopParams {
  return {
    ...plannedParams(values),
    oscillatorGainB: values.oscillatorExcitabilityB / 1000, // pS → nS
    gapGainB: values.gapGainB,
    smdGain: values.smdGain,
    relativeDrive: true,
  };
}

// The planned model's values (src/science/planned.ts), as LoopParams: one oscillator gain, no class gains and
// raw drive, g_nmj per EM section and θ_nmj in EM sections.
export function plannedParams(values: PlannedValues): LoopParams {
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

// The calibrated parameters' ids in the registry: track R's eleven (PLAN §9).
export const CALIBRATED = [
  'oscillatorExcitability',
  'oscillatorExcitabilityB',
  'oscillatorRecoveryTime',
  'oscillatorDriveThreshold',
  'headSwitchGain',
  'proprioceptiveGain',
  'gapGainB',
  'neuromuscularGain',
  'neuromuscularThreshold',
  'smdGain',
  'noiseIntensity',
] as const;

// The registry's values, once calibrated.
export function calibratedParams(): LoopParams {
  const values = Object.fromEntries(CALIBRATED.map((id) => [id, PARAMS[id].value as number | null]));
  if (Object.values(values).some((v) => v === null)) throw new Error('the loop parameters are not calibrated yet');
  return loopParams(values as unknown as RValues);
}

// The registry's provisional values, which the simulation runs on until calibration (PLAN §6.2).
export function provisionalParams(): LoopParams {
  return loopParams(Object.fromEntries(CALIBRATED.map((id) => [id, PARAMS[id].provisional])) as unknown as RValues);
}

// Whether calibration has set every calibrated parameter's value.
export const isCalibrated = (): boolean => CALIBRATED.every((id) => PARAMS[id].value !== null);

// The values the app and the harness run on: the calibrated ones once calibration has set them, the provisional
// ones until then (PLAN §6.2).
export const currentParams = (): LoopParams => (isCalibrated() ? calibratedParams() : provisionalParams());

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
  // A midline to start from instead, head at the origin: the directions of its equal pieces from head to
  // tail, as Body.pose takes them. A trial starts from a real posture this way (PLAN §7.4).
  posture?: ArrayLike<number>;
  // The brain's solver settings, if not the reference's (PLAN §3.4).
  solver?: SolverOptions;
  // The head switch's threshold P_th, if not the registry's: GPU parity lowers it so the switch flips often.
  switchThreshold?: number;
  // The butanone AWC-ON senses (PLAN §4.1); with none, the concentration is 0 everywhere.
  odour?: Odour;
  // Numerics the second numerics study tests (DECISIONS.md, 2026-09-28), which the GPU doesn't run: the brain's
  // steps within each loop step, 1 by default; and a grid the noise's path is drawn on, so that worlds at different
  // steps share their noise, none by default.
  neuralSubsteps?: number;
  noiseGrid?: number;
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
  // AWC-ON's adaptive threshold T (µM), and the current it took on the last step (pA).
  awcThreshold: number;
  awcCurrent: number;
  // Per touch receptor, the steps left in its pulse, the current its last tap gave it (pA), and the current it
  // took on the last step.
  touchLeft: Int32Array;
  touchCurrent: Float64Array;
  touchApplied: Float64Array;
}

export class World {
  readonly params: LoopParams;
  readonly brain: Brain;
  // The brain's steps within each loop step (WorldOptions.neuralSubsteps).
  readonly substeps: number;
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
  // Which AWC is ON, drawn from the seed; its neuron, or −1 if lesioned; where along the body it senses; its
  // sensor; the odour it senses; and the current it took on the last step. AWC-OFF takes no odour.
  readonly awcSide: AwcSide;
  readonly awcOn: number;
  readonly nose: number;
  readonly awc: AwcSensor;
  readonly odour: Odour | null;
  awcCurrent = 0;
  // Every touch receptor and the currents of the sets a tap can reach; the receptors that aren't lesioned; and
  // per receptor, the steps left in its pulse, the current its last tap gave it and the current it took on the
  // last step.
  readonly touchSets: Touch;
  readonly receptors: readonly TouchReceptor[];
  readonly touchLeft: Int32Array;
  readonly touchCurrent: Float64Array;
  readonly touchApplied: Float64Array;
  private readonly smd: Set<number>;

  constructor(data: WormlightData, params: LoopParams, options: WorldOptions = {}) {
    this.params = params;
    const seed = options.seed ?? 0;
    // κ_gap,B makes a rewired brain, with its own thresholds (PLAN §3.3, §9).
    const bTypes = new Set(data.neurons.flatMap((n, i) => (n.oscillator === 'B' ? [i] : [])));
    const whole = scaleGap(options.network ?? cookNetwork(data), bTypes, params.gapGainB ?? 1);
    const thresholds = equilibrium(whole, midpointActivation(whole));
    const lesioned = new Set(options.lesions ?? []);
    for (const name of lesioned) if (!whole.names.includes(name)) throw new Error(`unknown neuron ${name} to lesion`);
    const cut = options.silenced ? whole.names : [...lesioned];
    const network = cut.length > 0 ? lesion(whole, cut) : whole;
    this.brain = new Brain(network, thresholds, options.solver);
    this.brain.noise = params.noise;
    this.brain.noiseCorrelation = params.noiseCorrelation ?? 0;
    this.brain.noiseGrid = options.noiseGrid ?? 0;
    this.substeps = options.neuralSubsteps ?? 1;
    if (!Number.isInteger(this.substeps) || this.substeps < 1)
      throw new Error('neural sub-steps must be a whole number');
    this.brain.seed = seed;
    const alive = (name: string): boolean => !lesioned.has(name);
    // Each A- and B-type neuron's oscillator, with its class's gain; one with a gain of 0 has none.
    const gainB = params.oscillatorGainB ?? params.oscillatorGain;
    const oscillating = data.neurons.flatMap((n, i) => {
      if ((n.oscillator !== 'A' && n.oscillator !== 'B') || !alive(n.name)) return [];
      const [shift, gain] = n.oscillator === 'B' ? [params.driveThreshold, gainB] : [0, params.oscillatorGain];
      return gain > 0 ? [[i, shift, gain]] : [];
    });
    const oscillators: Oscillators = {
      neurons: Int32Array.from(oscillating, ([i]) => i),
      shift: Float64Array.from(oscillating, ([, shift]) => shift),
      gain: Float64Array.from(oscillating, ([, , gain]) => gain),
      recovery: params.recoveryTime,
    };
    this.brain.setOscillators(oscillators);

    this.body = new Body(boyleBody());
    if (options.posture) {
      if (options.heading !== undefined) throw new Error('a world starts from a posture or a heading, not both');
      this.body.pose(options.posture);
    } else this.body.straighten(0, 0, options.heading ?? Math.PI);
    this.muscles = new Muscles(
      data,
      {
        gain: params.neuromuscularGain,
        threshold: params.neuromuscularThreshold,
        timeConstant: PARAMS.muscleTimeConstant.value / 1000,
        relative: params.relativeDrive ?? false,
        smdGain: params.smdGain ?? 1,
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

    // Which AWC is ON is decided at random in each animal (Troemel, Sagasti & Bargmann 1999), so it is drawn
    // from the seed too, on a lane of its own.
    this.awcSide = hash(seed, 0, 0xfffffffb) & 1 ? 'AWCR' : 'AWCL';
    const on = data.neurons.findIndex((n) => n.name === this.awcSide);
    const sensing = data.neurons[on]?.sensing;
    if (sensing?.kind !== 'tip') throw new Error(`${this.awcSide} should sense at its dendrite's tip`);
    this.awcOn = alive(this.awcSide) ? on : -1;
    this.nose = sensing.s;
    this.awc = new AwcSensor(AWC_GAIN[this.awcSide]);
    this.odour = options.odour ?? null;
    this.adapt();

    this.touchSets = touchData(data);
    this.receptors = this.touchSets.receptors.filter((r) => alive(r.name));
    this.touchLeft = new Int32Array(this.receptors.length);
    this.touchCurrent = new Float64Array(this.receptors.length);
    this.touchApplied = new Float64Array(this.receptors.length);
  }

  // Tap the body at coordinate s, from the nose (0) to the tail tip (1): every receptor whose field covers it is
  // stimulated for the next 500 ms, from the next step, at the current its covered set gives it. Returns the
  // receptors reached; a lesioned one is reached by none, though its set's currents are the intact wiring's.
  touch(s: number): TouchReceptor[] {
    const { mask, currents } = tap(this.touchSets, s);
    return this.receptors.filter((r, k) => {
      if (!(mask & (1 << r.index))) return false;
      this.touchLeft[k] = TOUCH_STEPS;
      this.touchCurrent[k] = currents[r.index];
      return true;
    });
  }

  // The concentration (µM) where AWC senses.
  smell(): number {
    if (!this.odour) return 0;
    const [x, y] = this.body.at(this.nose);
    return this.odour.sample(x, y);
  }

  // Adapt AWC-ON's threshold to the concentration where it is now, as in a worm that has sat there a while.
  // The world adapts when it is made; whoever moves the body afterwards adapts it again.
  adapt(): void {
    const c = this.smell();
    this.awc.adapt(c);
    // And the current it would have been taking there, so the next step sees no jump.
    this.awcCurrent = this.awc.current(Math.max(c, 0));
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
      awcThreshold: this.awc.threshold,
      awcCurrent: this.awcCurrent,
      touchLeft: Int32Array.from(this.touchLeft),
      touchCurrent: Float64Array.from(this.touchCurrent),
      touchApplied: Float64Array.from(this.touchApplied),
    };
  }

  // Restore a state, so snapshot() gives it back. What each step derives afresh, the curvature and the muscles'
  // drive, waits for the next step. A state of other touch receptors is refused before anything changes.
  restore(state: WorldState): void {
    const receptors = this.receptors.length;
    if ([state.touchLeft, state.touchCurrent, state.touchApplied].some((a) => a.length !== receptors)) {
      throw new Error('the state has other touch receptors');
    }
    this.brain.restore(state.brain);
    this.body.x.set(state.x);
    this.body.y.set(state.y);
    this.body.theta.set(state.theta);
    this.body.restoreRates(state.velocity);
    this.muscles.activation.set(state.muscles);
    this.muscles.segments(this.body.dorsal, this.body.ventral);
    this.headSwitch.restore(state.h, state.previousCurvature);
    this.switchCurrent = state.switchCurrent;
    this.awc.threshold = state.awcThreshold;
    this.awcCurrent = state.awcCurrent;
    this.touchLeft.set(state.touchLeft);
    this.touchCurrent.set(state.touchCurrent);
    this.touchApplied.set(state.touchApplied);
  }

  get time(): number {
    return (this.brain.steps * NEURAL_STEP) / this.substeps;
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
    // AWC-ON's threshold follows the odour at the nose, and the difference drives it (PLAN §4.1).
    const awc = this.awc.step(this.smell(), dt);
    const awcJumped = this.awcOn >= 0 && Math.abs(awc - this.awcCurrent) > AWC_JUMP * this.awc.gain;
    this.awcCurrent = awc;
    if (this.awcOn >= 0) brain.input[this.awcOn] += awc;
    // Each stimulated touch receptor takes its tap's current for its pulse's steps (PLAN §4.2).
    let touchJumped = false;
    this.receptors.forEach((r, k) => {
      const applied = this.touchLeft[k] > 0 ? this.touchCurrent[k] : 0;
      if (this.touchLeft[k] > 0) this.touchLeft[k]--;
      if (applied !== this.touchApplied[k]) touchJumped = true;
      this.touchApplied[k] = applied;
      brain.input[r.neuron] += applied;
    });
    const gated = this.headDrive() > params.driveThreshold;
    this.headSwitch.update(regionMean(this.curvature, this.headFrom, this.headTo), dt, gated);
    const current = gated ? params.switchGain * (this.headSwitch.h - 0.5) : 0;
    // The switch current jumps when it flips or is gated on or off, a touch current when it switches on or off
    // or a new tap changes it, and AWC-ON's when the odour at the nose changes fast; BDF2 across a jump is first
    // order.
    if (current !== this.switchCurrent || touchJumped || awcJumped) brain.restart();
    this.switchCurrent = current;
    for (const i of this.dorsalSwitch) brain.input[i] += current;
    for (const i of this.ventralSwitch) brain.input[i] -= current;
    for (let k = 0; k < this.substeps; k++) brain.step(dt / this.substeps);
    this.muscles.step(dt, brain.activation);
    this.muscles.segments(body.dorsal, body.ventral);
    body.step(dt);
  }
}
