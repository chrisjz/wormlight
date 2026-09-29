// One simulated worm (PLAN §1): the brain, the layers outside it (spec §1.1) and the body, stepped in the
// plan's order. A step reads the body's curvature and the odour at the nose, sets the proprioceptive, AWC,
// touch and head-switch inputs, advances the brain, turns its activation into muscle activation and
// advances the body.

import type { WormlightData } from '../data/schema.ts';
import { inForm, PARAMS, type Form, type Param } from '../science/params.ts';
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

// The model's reversal potentials (mV), which the conductance form drives towards.
const EXCITATORY = PARAMS.reversalExcitatory.value;
const INHIBITORY = PARAMS.reversalInhibitory.value;

export type { Form };

// The calibrated parameters (PLAN §6.2), in the units the simulation uses.
export interface LoopParams {
  // g_osc (nS), τ_w (s) and θ_osc (mV).
  oscillatorGain: number;
  recoveryTime: number;
  driveThreshold: number;
  // g_sw and g_p: in the current form pA (g_p per unit of scaled curvature), in the conductance form nS.
  switchGain: number;
  proprioceptiveGain: number;
  // Their form; left out, the current form.
  form?: Form;
  // g_nmj (per EM section) and θ_nmj (EM sections), or with relativeDrive per unit of relative drive and in it.
  neuromuscularGain: number;
  neuromuscularThreshold: number;
  // σ_n (pA·√s), and the noise's correlation time τ_n (s): left out or 0, white noise, as the planned model runs;
  // above 0, an Ornstein–Uhlenbeck current, as track R's model runs from its refit on (DECISIONS.md, 2026-09-28).
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
  // τ_n (s), the coloured noise's correlation time; σ_n is then the coloured current's intensity.
  noiseCorrelation: number;
}
export function loopParams(values: RValues, form: Form): LoopParams {
  return {
    ...plannedParams(values),
    oscillatorGainB: values.oscillatorExcitabilityB / 1000, // pS → nS
    gapGainB: values.gapGainB,
    smdGain: values.smdGain,
    relativeDrive: true,
    noiseCorrelation: values.noiseCorrelation,
    ...(form === 'conductance' ? { form } : {}),
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

// The calibrated parameters' ids in the registry: track R's twelve (PLAN §9).
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
  'noiseCorrelation',
] as const;

// The registry's values in a form, once calibrated, or those of a registry standing in for it: in the conductance
// form, g_sw's and g_p's are their conductance entries'.
export function calibratedParams(form: Form, registry: Record<string, Param> = PARAMS): LoopParams {
  const values = Object.fromEntries(CALIBRATED.map((id) => [id, inForm(id, registry[id], form).value]));
  if (Object.values(values).some((v) => v === null)) throw new Error('the loop parameters are not calibrated yet');
  return loopParams(values as unknown as RValues, form);
}

// The registry's provisional values in a form, which the simulation runs on until calibration (PLAN §6.2).
export function provisionalParams(form: Form): LoopParams {
  const values = Object.fromEntries(CALIBRATED.map((id) => [id, inForm(id, PARAMS[id], form).provisional]));
  return loopParams(values as unknown as RValues, form);
}

// Whether calibration has set every calibrated parameter's value.
export const isCalibrated = (): boolean => CALIBRATED.every((id) => PARAMS[id].value !== null);

// The values the app and the harness run on: the calibrated ones once calibration has set them, the provisional
// ones until then (PLAN §6.2).
export const currentParams = (): LoopParams =>
  isCalibrated() ? calibratedParams('current') : provisionalParams('current');

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
  // The head switch: its state, the head's curvature at its last update, and the current it drove, or in the
  // conductance form the conductance it opened, signed by the side it drove, dorsal positive.
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
  // The head-switch current into the dorsal SMDs, the opposite into the ventral ones; in the conductance form, the
  // conductance it opens, positive when it drives the dorsal side and 0 while its gate is shut.
  switchCurrent = 0;
  // A sham touch's steps left, and whether it was on at the last step: the harness's alone (PLAN §7.4), so the GPU
  // has none.
  private shamLeft = 0;
  private shamOn = false;
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
    if (!(this.brain.noiseCorrelation >= 0)) throw new Error("the noise's correlation time can't be negative");
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

  // A sham touch at s (PLAN §7.4): for the steps a touch there would switch its receptors' currents on and off, the
  // integrator restarts, with no current of its own. A sham where a touch would reach no receptor, or give none a
  // current, does nothing, as that touch wouldn't restart it either. Returns the receptors the touch would reach.
  sham(s: number): TouchReceptor[] {
    const { mask, currents } = tap(this.touchSets, s);
    const reached = this.receptors.filter((r) => (mask & (1 << r.index)) !== 0);
    this.shamLeft = reached.some((r) => currents[r.index] !== 0) ? TOUCH_STEPS : 0;
    return reached;
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
    // A sham belongs to no state: a restored world has none under way.
    this.shamLeft = 0;
    this.shamOn = false;
  }

  // Take on the state of another world on the same neurons, body and seed, as a worm whose brain has just changed
  // under it: a lesion made or undone, or another brain in its place (spec §6). Every neuron keeps its voltage,
  // activation and noise current, every oscillator both worlds share its recovery, and every touch receptor both
  // share its pulse; the body, muscles, head switch, AWC-ON and the step count carry over whole. An oscillator only
  // this world has starts on its w-nullcline at its neuron's voltage, as a new world's do, and a receptor only it has
  // starts untouched. This world's wiring and thresholds hold from the next step, which restarts the integrator,
  // as after any jump in the input.
  carry(state: WorldState, from: World): void {
    const { brain } = state;
    if (brain.voltage.length !== this.brain.n) throw new Error('the state has another number of neurons');
    // Every oscillator on its nullcline at the voltages carried, then the shared ones' recovery carried over.
    this.brain.setState(brain.voltage, brain.activation, brain.steps);
    this.brain.setOscillators(this.brain.oscillators);
    const recovery = Float64Array.from(this.brain.recovery);
    const previousRecovery = Float64Array.from(this.brain.recovery);
    const was = new Map(Array.from(from.brain.oscillators?.neurons ?? [], (neuron, k) => [neuron, k]));
    this.brain.oscillators?.neurons.forEach((neuron, k) => {
      const at = was.get(neuron);
      if (at === undefined) return;
      recovery[k] = brain.recovery[at];
      previousRecovery[k] = brain.previousRecovery[at];
    });
    const receptor = new Map(from.receptors.map((r, k) => [r.name, k]));
    const pulses = <T extends Int32Array | Float64Array>(values: T, empty: T): T => {
      this.receptors.forEach((r, k) => {
        const at = receptor.get(r.name);
        if (at !== undefined) empty[k] = values[at];
      });
      return empty;
    };
    const receptors = this.receptors.length;
    this.restore({
      ...state,
      brain: { ...brain, recovery, previousRecovery, history: 0 },
      touchLeft: pulses(state.touchLeft, new Int32Array(receptors)),
      touchCurrent: pulses(state.touchCurrent, new Float64Array(receptors)),
      touchApplied: pulses(state.touchApplied, new Float64Array(receptors)),
    });
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
    const conducting = params.form === 'conductance';
    curvature(body, this.curvature);
    brain.input.fill(0);
    brain.conductance.fill(0);
    brain.conductanceCurrent.fill(0);
    // In the conductance form, a conductance g towards a reversal potential E (PLAN §4.3).
    const open = (i: number, g: number, excitatory: boolean): void => {
      brain.conductance[i] += g;
      brain.conductanceCurrent[i] += g * (excitatory ? EXCITATORY : INHIBITORY);
    };
    for (const field of this.fields) {
      if (conducting) {
        // K_f, positive when the body bends towards the neuron's own side, opens g_p·|K_f| towards E_exc when
        // positive and towards E_inh when negative, both taken at the step's start.
        const bend = field.side * regionMean(this.curvature, field.from, field.to);
        if (bend !== 0) open(field.neuron, params.proprioceptiveGain * Math.abs(bend), bend > 0);
      } else {
        brain.input[field.neuron] +=
          params.proprioceptiveGain * field.side * regionMean(this.curvature, field.from, field.to);
      }
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
    // A sham touch switches on and off where a touch would, with no current.
    const shamOn = this.shamLeft > 0;
    if (this.shamLeft > 0) this.shamLeft--;
    const shamJumped = shamOn !== this.shamOn;
    this.shamOn = shamOn;
    const gated = this.headDrive() > params.driveThreshold;
    this.headSwitch.update(regionMean(this.curvature, this.headFrom, this.headTo), dt, gated);
    const dorsal = this.headSwitch.h === 1;
    // In the conductance form, the whole g_sw on each SMD: towards E_exc on the side h names, towards E_inh on the
    // other.
    const current = gated
      ? conducting
        ? (dorsal ? 1 : -1) * params.switchGain
        : params.switchGain * (this.headSwitch.h - 0.5)
      : 0;
    // The switch's input jumps when it flips or is gated on or off, a touch current when it switches on or off
    // or a new tap changes it, and AWC-ON's when the odour at the nose changes fast; BDF2 across a jump is first
    // order. A sham touch restarts it as a touch would.
    if (current !== this.switchCurrent || touchJumped || awcJumped || shamJumped) brain.restart();
    this.switchCurrent = current;
    if (conducting) {
      if (current !== 0) {
        for (const i of this.dorsalSwitch) open(i, params.switchGain, dorsal);
        for (const i of this.ventralSwitch) open(i, params.switchGain, !dorsal);
      }
    } else {
      for (const i of this.dorsalSwitch) brain.input[i] += current;
      for (const i of this.ventralSwitch) brain.input[i] -= current;
    }
    for (let k = 0; k < this.substeps; k++) brain.step(dt / this.substeps);
    this.muscles.step(dt, brain.activation);
    this.muscles.segments(body.dorsal, body.ventral);
    body.step(dt);
  }
}
