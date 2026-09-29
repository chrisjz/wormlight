// Every constant the model uses, with its value, unit, fidelity level and source. This file is the
// single source of truth: code reads constants from here, and FIDELITY.md lists them from here.
//
// A parameter is free when we set it ourselves (level 1 or 0), and the free ones count against the
// budget in PLAN.md §6.2. Calibrated parameters (level 1) are tuned by one CMA-ES procedure, within
// bounds set here before it runs (PLAN.md §7.3). They are track R's model's (PLAN.md §9), and their values are
// its refit's final ones, with the coloured noise, unrounded, which data/calibration/r2.json records and a test
// holds them to; R's first fit, with white noise, is in data/calibration/r1.json. Their provisional values,
// where the refit started, stay beside them; the planned model's own are in src/science/planned.ts (PLAN.md
// §6.2). A parameter fixed in advance (level 0)
// either has a value or is set by a stated rule. Every parameter says what new data or research
// would raise it (spec §1.3).

import type { CitationId } from './citations.ts';
import { isFree, type Level } from './levels.ts';

export type Subsystem = 'neural' | 'sensing' | 'rhythm' | 'muscle' | 'body' | 'environment';

export interface Param {
  name: string;
  symbol: string;
  // Null for a calibrated parameter not yet calibrated, and for one set by a rule.
  value: number | null;
  unit: string;
  level: Level;
  subsystem: Subsystem;
  sources: readonly CitationId[];
  note: string;
  // How a value set by a rule is found, for a parameter fixed in advance.
  rule?: string;
  // What new data or research would raise its level.
  upgrade: string;
  // What a calibrated parameter is tuned against (PLAN.md §7.3), and the range it may move within.
  calibratedAgainst?: string;
  bounds?: readonly [number, number] | null;
  // The value a calibrated parameter takes until calibration sets one, and where the calibration starts: for
  // track R's model, the planned model's fit carried over (PLAN.md §6.2, §7.3; DECISIONS.md 2026-09-27), and
  // the coloured noise's set for it (DECISIONS.md 2026-09-28).
  provisional?: number;
  // The head switch's and proprioception's gains in the conductance form (PLAN.md §4.3, set 2026-09-29): the same
  // parameter, counted once, since a fit uses one form. The entry above is the current form's, which the refit runs.
  conductance?: ConductanceForm;
}

// The form of the head switch's and proprioception's inputs (PLAN §4.3): currents, as every fit so far takes them,
// or push-pull conductances towards the model's reversal potentials (set 2026-09-29, DECISIONS.md).
export type Form = 'current' | 'conductance';

// The parameters whose entries depend on the form: g_sw and g_p.
export const FORM_DEPENDENT: readonly string[] = ['headSwitchGain', 'proprioceptiveGain'];

// A parameter's value, bounds and start in a form. In the conductance form, g_sw and g_p take their conductance
// entries, and one that lacks it is refused rather than read as the current form's.
export function inForm(id: string, param: Param, form: Form): Pick<Param, 'value' | 'bounds' | 'provisional'> {
  if (form === 'current' || !FORM_DEPENDENT.includes(id)) return param;
  if (!param.conductance) throw new Error(`${id} has no conductance form`);
  return param.conductance;
}

export interface ConductanceForm {
  value: number | null;
  unit: string;
  bounds: readonly [number, number];
  provisional: number;
  rule: string;
}

// PLAN §7.3's 1 mV rule for the conductance form's bounds: at the lower bound no target moves more than 1 mV at
// rest, and at the upper every target is held within 1 mV of the reversal potential it is driven towards, over
// κ_gap,B's bounds; proprioception's taken per unit of the curvature below.
export const BOUND_RULE_MV = 1;
// The 95th percentile of real worms' |mean κL| over the model's proprioceptive fields, in the pinned postures.
export const BOUND_RULE_CURVATURE = 8.3;

export const FREE_PARAMETER_BUDGET = 18;
const CALIBRATION_TARGETS =
  'undulation frequency, wavelength, speed and the spontaneous reversal rate, by one CMA-ES procedure (PLAN §7.3)';

export const PARAMS = {
  // Neurons and synapses (PLAN §3.2).
  membraneCapacitance: {
    name: 'Membrane capacitance',
    symbol: 'C',
    value: 1,
    unit: 'pF',
    level: 3,
    subsystem: 'neural',
    sources: ['kunert2014', 'kunertgraf2017'],
    note: "Kunert-Graf et al. 2017 (Table 1) give G_c = 10 pS and C = 1 pF. Neural Interactome's code runs the same model 1.5× slower (1.5 pF); only the port check uses that.",
    upgrade: 'Per-class capacitance from patch-clamp recordings',
  },
  leakConductance: {
    name: 'Leak conductance',
    symbol: 'G_c',
    value: 10,
    unit: 'pS',
    level: 3,
    subsystem: 'neural',
    sources: ['kunert2014', 'kunertgraf2017'],
    note: 'The same for every neuron.',
    upgrade: 'Per-class input resistance from patch-clamp recordings',
  },
  leakPotential: {
    name: 'Leak potential',
    symbol: 'E_c',
    value: -35,
    unit: 'mV',
    level: 3,
    subsystem: 'neural',
    sources: ['wicks1996', 'kunert2014'],
    note: 'From Wicks, Roehrig & Rankin, via Kunert et al.',
    upgrade: 'Measured resting potentials per neuron class',
  },
  reversalExcitatory: {
    name: 'Excitatory reversal potential',
    symbol: 'E_exc',
    value: 0,
    unit: 'mV',
    level: 3,
    subsystem: 'neural',
    sources: ['wicks1996'],
    note: 'Set per connection by its sign, where Neural Interactome sets it per presynaptic neuron.',
    upgrade: 'Measured reversal potentials of C. elegans excitatory ligand-gated channels',
  },
  reversalInhibitory: {
    name: 'Inhibitory reversal potential',
    symbol: 'E_inh',
    value: -48,
    unit: 'mV',
    level: 3,
    subsystem: 'neural',
    sources: ['wicks1996', 'kim2019'],
    note: 'Wicks, Roehrig & Rankin 1996 give −48 mV in their Table 1 but −45 mV in their text. Kunert et al. 2014 and Kunert-Graf et al. 2017 use −45 mV; Neural Interactome, whose code the port check runs, uses −48 mV, and so does Wormlight.',
    upgrade: 'Measured reversal potentials of C. elegans GABA and glutamate-gated chloride channels',
  },
  sigmoidWidth: {
    name: 'Synaptic activation sigmoid width',
    symbol: 'β',
    value: 0.125,
    unit: 'mV⁻¹',
    level: 3,
    subsystem: 'neural',
    sources: ['wicks1996'],
    note: '',
    upgrade: 'Measured voltage dependence of release at graded synapses',
  },
  synapticRise: {
    name: 'Synaptic rise rate',
    symbol: 'a_r',
    value: 1,
    unit: 's⁻¹',
    level: 3,
    subsystem: 'neural',
    sources: ['kunertgraf2017'],
    note: 'Kunert-Graf et al. 2017 (Table 1) give a_r = 1 s⁻¹ and a_d = 5 s⁻¹.',
    upgrade: 'Measured synaptic kinetics',
  },
  synapticDecay: {
    name: 'Synaptic decay rate',
    symbol: 'a_d',
    value: 5,
    unit: 's⁻¹',
    level: 3,
    subsystem: 'neural',
    sources: ['kunertgraf2017'],
    note: 'As above.',
    upgrade: 'Measured synaptic kinetics',
  },
  conductancePerSynapse: {
    name: 'Conductance per Varshney synapse',
    symbol: 'g',
    value: 100,
    unit: 'pS',
    level: 3,
    subsystem: 'neural',
    sources: ['kunert2014'],
    note: 'For gap junctions and chemical synapses alike, per unit of Varshney et al. 2011 count.',
    upgrade: 'Per-connection physiology (paired recordings, voltage imaging)',
  },
  cookToVarshneyChemical: {
    name: 'Cook-to-Varshney scale, chemical synapses',
    symbol: 'k_chem',
    value: 0.3444,
    unit: 'Varshney units per EM section',
    level: 2,
    subsystem: 'neural',
    sources: ['varshney2011', 'cook2019'],
    note: "Matches the two datasets' totals over the 279 neurons they share, autapses excluded as in Neural Interactome's matrices. Connections the two share end up about 0.69× their Neural Interactome strength.",
    upgrade: "A model parameterised on Cook's counts directly, or per-connection physiology",
  },
  cookToVarshneyGap: {
    name: 'Cook-to-Varshney scale, gap junctions',
    symbol: 'k_gap',
    value: 0.2055,
    unit: 'Varshney units per EM section',
    level: 2,
    subsystem: 'neural',
    sources: ['varshney2011', 'emmons2024'],
    note: "As above, on Emmons 2024's corrected gap junctions; shared connections end up about 0.63× their Neural Interactome strength.",
    upgrade: "A model parameterised on Cook's counts directly, or per-connection physiology",
  },
  noiseIntensity: {
    name: 'Neural noise intensity',
    symbol: 'σ_n',
    value: 0.05943608161917489,
    unit: 'pA·√s',
    level: 1,
    subsystem: 'neural',
    sources: ['gray2005'],
    note: "The intensity of each neuron's coloured noise current, an Ornstein–Uhlenbeck process with correlation time τ_n: τ_n dη = −η dt + σ_n dW, updated exactly each step (DECISIONS.md, 2026-09-28). Its upper bound is white noise's, which gives the widest neuron at rest, IL2DL, a voltage spread of 20 mV; the coloured current's power lies below white noise's at every frequency, so no neuron in any network spreads more (PLAN §7.3; DECISIONS.md, 2026-09-28).",
    calibratedAgainst: CALIBRATION_TARGETS,
    upgrade: 'Measured noise statistics of C. elegans neurons',
    bounds: [0, 0.169],
    provisional: 0.148,
  },
  noiseCorrelation: {
    name: 'Neural noise correlation time',
    symbol: 'τ_n',
    value: 0.2,
    unit: 's',
    level: 1,
    subsystem: 'neural',
    sources: [],
    note: "The coloured noise current's correlation time. Tuned, not set: it moves the worm as much as any parameter (DECISIONS.md, 2026-09-28).",
    calibratedAgainst: CALIBRATION_TARGETS,
    upgrade: 'Measured noise statistics of C. elegans neurons',
    bounds: [0.02, 0.2],
    provisional: 0.0632,
  },
  gapGainB: {
    name: 'B-type gap junction gain',
    symbol: 'κ_gap,B',
    value: 1,
    unit: '',
    level: 1,
    subsystem: 'neural',
    sources: [],
    note: 'A gain on every gap junction with a VB or DB neuron on either side, applied before thresholds are set (PLAN §9).',
    calibratedAgainst: CALIBRATION_TARGETS,
    upgrade: 'Measured coupling between B-type motor neurons',
    bounds: [0.1, 1],
    provisional: 1,
  },

  // Sensing (PLAN §4.1, §4.2).
  awcAdaptationScale: {
    name: 'AWC adaptive threshold scale',
    symbol: 'K',
    value: 5.5,
    unit: 'µM',
    level: 3,
    subsystem: 'sensing',
    sources: ['levy2020'],
    note: "Read from the authors' code; fitted to butanone in microfluidic devices.",
    upgrade: 'Threshold measurements on assay plates',
  },
  awcAdaptationTime: {
    name: 'AWC adaptive threshold time constant',
    symbol: 'τ',
    value: 17,
    unit: 's',
    level: 3,
    subsystem: 'sensing',
    sources: ['levy2020'],
    note: 'As above.',
    upgrade: 'Threshold measurements on assay plates',
  },
  awcGain: {
    name: 'AWC transduction gain',
    symbol: 'g_AWC',
    value: null,
    unit: 'pA',
    level: 0,
    subsystem: 'sensing',
    sources: [],
    note: "Never tuned against chemotaxis. The rule gives 3.73 pA when AWCL is AWC-ON and 5.52 pA when AWCR is, which a test holds; adapted to the assay's start, AWC-ON rises 16.6 mV when the odour is removed.",
    rule: "Set once, on the intact real wiring, so that removing odour depolarises AWC-ON by 16 mV (2/β) from rest, the limit of weak odour: measured on the connectome alone, at its rest thresholds without the oscillators or the loop, at steady state, for each side as AWC-ON: one rule for the class, each cell's value from its own wiring, as touch's currents are.",
    upgrade: 'Current-clamp recordings from AWC',
  },
  touchAmplitude: {
    name: 'Touch stimulus amplitude',
    symbol: 'ΔV_touch',
    value: 10,
    unit: 'mV above rest',
    level: 0,
    subsystem: 'sensing',
    sources: [],
    note: 'Applied as currents computed, for each set of receptors a tap can reach, to hold every receptor in the set that far above rest together in the intact real wiring; the same for every brain and lesion.',
    upgrade: 'Recorded touch receptor currents',
  },
  touchDuration: {
    name: 'Touch stimulus duration',
    symbol: 't_touch',
    value: 500,
    unit: 'ms',
    level: 0,
    subsystem: 'sensing',
    sources: [],
    note: '',
    upgrade: 'Recorded touch receptor currents',
  },

  // Rhythm and proprioception (PLAN §4.3).
  headSwitchDerivativeWeight: {
    name: 'Head switch derivative weight',
    symbol: 'b',
    value: 46,
    unit: 'ms',
    level: 2,
    subsystem: 'rhythm',
    sources: ['ji2021'],
    note: 'Fitted in a 120 mPa·s fluid, so adapted on agar.',
    upgrade: 'The same phase-response fit made on agar',
  },
  headSwitchThreshold: {
    name: 'Head switch threshold',
    symbol: 'P_th',
    value: 2.33,
    unit: 'dimensionless',
    level: 2,
    subsystem: 'rhythm',
    sources: ['ji2021'],
    note: 'As above.',
    upgrade: 'The same phase-response fit made on agar',
  },
  headSwitchRegionStart: {
    name: 'Head switch curvature region, front',
    symbol: 's_head,0',
    value: 0.1,
    unit: 'body coordinate',
    level: 2,
    subsystem: 'rhythm',
    sources: ['ji2021'],
    note: 'The switch reads the scaled curvature K = κL averaged over body coordinates 0.1–0.3, the head region where Ji et al. measured it and fitted b and P_th.',
    upgrade: 'The same phase-response fit made on agar',
  },
  headSwitchRegionEnd: {
    name: 'Head switch curvature region, back',
    symbol: 's_head,1',
    value: 0.3,
    unit: 'body coordinate',
    level: 2,
    subsystem: 'rhythm',
    sources: ['ji2021'],
    note: 'As above.',
    upgrade: 'The same phase-response fit made on agar',
  },
  headSwitchGain: {
    name: 'Head switch gain',
    symbol: 'g_sw',
    value: 311.74440224351065,
    unit: 'pA',
    level: 1,
    subsystem: 'rhythm',
    sources: [],
    note: '',
    calibratedAgainst: CALIBRATION_TARGETS,
    upgrade: 'Recordings of the head rhythm generator',
    bounds: [20, 400],
    provisional: 371,
    conductance: {
      value: null,
      unit: 'nS',
      bounds: [0.02, 50],
      provisional: 1,
      rule: "PLAN §7.3's 1 mV rule over the SMDs, which gives 0.022–48 nS, rounded outward to one significant figure; it starts at the bounds' log midpoint",
    },
  },
  oscillatorExcitability: {
    name: 'A-type oscillator excitability',
    symbol: 'g_osc',
    value: 5000,
    unit: 'pS',
    level: 1,
    subsystem: 'rhythm',
    sources: [],
    note: "The A-types' own; the B-types' is g_osc,B (track R, PLAN §9).",
    calibratedAgainst: CALIBRATION_TARGETS,
    upgrade: 'A parameterised model of the A-type rhythm',
    bounds: [300, 5000],
    provisional: 2140,
  },
  oscillatorExcitabilityB: {
    name: 'B-type oscillator excitability',
    symbol: 'g_osc,B',
    value: 3900.2952142736585,
    unit: 'pS',
    level: 1,
    subsystem: 'rhythm',
    sources: [],
    note: "Track R splits it from the A-types' g_osc; at 0 the B-types have no oscillator (PLAN §9).",
    calibratedAgainst: CALIBRATION_TARGETS,
    upgrade: 'A parameterised model of the B-type rhythm',
    bounds: [0, 5000],
    provisional: 2140,
  },
  oscillatorRecoveryTime: {
    name: 'Oscillator recovery time',
    symbol: 'τ_w',
    value: 2.6416265755471136,
    unit: 's',
    level: 1,
    subsystem: 'rhythm',
    sources: [],
    note: 'Shared by the A- and B-type oscillators.',
    calibratedAgainst: CALIBRATION_TARGETS,
    upgrade: 'A parameterised model of the A- and B-type rhythms',
    bounds: [0.2, 3],
    provisional: 2.51,
  },
  oscillatorDriveThreshold: {
    name: 'B-type oscillator drive threshold',
    symbol: 'θ_osc',
    value: -28,
    unit: 'mV',
    level: 1,
    subsystem: 'rhythm',
    sources: [],
    note: "B-type neurons and the head switch run only above it, which AVB's drive supplies.",
    calibratedAgainst: CALIBRATION_TARGETS,
    upgrade: 'Measured AVB drive at the onset of B-type oscillation',
    bounds: [-28, 5],
    provisional: -12.9,
  },
  proprioceptiveReach: {
    name: 'Proprioceptive reach',
    symbol: 'ℓ_p',
    value: 0.2,
    unit: 'body lengths',
    level: 3,
    subsystem: 'rhythm',
    sources: ['wen2012'],
    note: "About 200 µm in front of a B-type neuron's muscles; mirrored behind for A-type neurons (a hypothesis).",
    upgrade: 'Identified stretch receptors and their receptive fields',
  },
  proprioceptiveGain: {
    name: 'Proprioceptive gain',
    symbol: 'g_p',
    value: 0.18970755200111186,
    unit: 'pA',
    level: 1,
    subsystem: 'rhythm',
    sources: [],
    note: 'One gain for A- and B-type neurons.',
    calibratedAgainst: CALIBRATION_TARGETS,
    upgrade: 'Identified stretch receptors and their gain',
    bounds: [0.1, 30],
    provisional: 0.308,
    conductance: {
      value: null,
      unit: 'nS per unit of κL',
      bounds: [0.0001, 8],
      provisional: 0.028,
      rule: "PLAN §7.3's 1 mV rule over the A- and B-types with fields, at |κL| = 8.3, which gives 0.00017–7.8, rounded outward to one significant figure; it starts at the bounds' log midpoint, 0.028 as the rules give it",
    },
  },

  // Neuromuscular transfer and muscles (PLAN §4.4).
  neuromuscularGain: {
    name: 'Neuromuscular gain',
    symbol: 'g_nmj',
    value: 7.5460056354475835,
    unit: 'per unit of relative drive',
    level: 1,
    subsystem: 'muscle',
    sources: [],
    note: "On drive relative to each muscle's range, track R's rule (PLAN §9).",
    calibratedAgainst: CALIBRATION_TARGETS,
    upgrade: 'Measured transfer from motor neuron activity to muscle activation',
    bounds: [2, 40],
    provisional: 22,
  },
  neuromuscularThreshold: {
    name: 'Neuromuscular threshold',
    symbol: 'θ_nmj',
    value: -0.3,
    unit: 'relative drive',
    level: 1,
    subsystem: 'muscle',
    sources: [],
    note: "In units of each muscle's range of drive above its rest (PLAN §9).",
    calibratedAgainst: CALIBRATION_TARGETS,
    upgrade: 'Measured transfer from motor neuron activity to muscle activation',
    bounds: [-0.3, 0.8],
    provisional: 0.0642,
  },
  smdGain: {
    name: 'SMD junction gain past the head',
    symbol: 'κ_SMD',
    value: 0.7180212740176531,
    unit: '',
    level: 1,
    subsystem: 'muscle',
    sources: [],
    note: "A gain on the SMDs' neuromuscular junctions onto each quadrant's muscles from the ninth on, those starting 0.3 body lengths or more along; Cook et al. extrapolated nearly half the neuromuscular edges, and the data don't mark which (PLAN §9).",
    calibratedAgainst: CALIBRATION_TARGETS,
    upgrade: 'Observed, not extrapolated, neuromuscular junctions for the sublateral motor neurons',
    bounds: [0.1, 1],
    provisional: 1,
  },
  muscleTimeConstant: {
    name: 'Muscle time constant',
    symbol: 'τ_M',
    value: 100,
    unit: 'ms',
    level: 3,
    subsystem: 'muscle',
    sources: ['boyle2012', 'ji2021'],
    note: "Ji et al.'s muscle switching time is also 100 ms.",
    upgrade: 'Direct measurements of C. elegans body wall muscle kinetics',
  },

  // Body (PLAN §5.1).
  bodyLength: {
    name: 'Body length',
    symbol: 'L',
    value: 1,
    unit: 'mm',
    level: 3,
    subsystem: 'body',
    sources: ['boyle2012'],
    note: 'Speeds and wavelengths are compared in body lengths, so this sets only the scale.',
    upgrade: 'Per-animal lengths, which vary with age and strain',
  },
  bodyUnits: {
    name: 'Body units',
    symbol: 'M',
    value: 48,
    unit: 'units',
    level: 3,
    subsystem: 'body',
    sources: ['boyle2012'],
    note: 'Built from 49 rods.',
    upgrade: 'A continuum body model',
  },
  bodyRadius: {
    name: 'Body radius',
    symbol: 'R',
    value: 40,
    unit: 'µm',
    level: 3,
    subsystem: 'body',
    sources: ['boyle2012'],
    note: "The outline is a prolate ellipse with this minor radius: rod i's radius is R|sin(cos⁻¹((i − (M/2 + 1))/(M/2 + 0.2)))|, the major radius a little over L/2 so the tips keep a width (their eq. 2).",
    upgrade: 'Measured radius profiles',
  },
  lateralStiffness: {
    name: 'Lateral (cuticle) stiffness',
    symbol: 'κ_L',
    value: 0.02,
    unit: 'N m⁻¹',
    level: 3,
    subsystem: 'body',
    sources: ['boyle2012'],
    note: 'Table 1 gives (M/24) × 0.01 and prints the unit as kg·s⁻¹; a spring constant is in kg·s⁻², as their code uses it. Chosen with the damping below so a flaccid body straightens slowly on agar.',
    upgrade: 'Measured cuticle and body-wall elasticity',
  },
  diagonalStiffness: {
    name: 'Diagonal (pressure) stiffness',
    symbol: 'κ_D',
    value: 350,
    unit: '× κ_L',
    level: 3,
    subsystem: 'body',
    sources: ['boyle2012'],
    note: 'The diagonal elements stand in for the hydrostatic pressure that keeps each segment from collapsing.',
    upgrade: 'A model of internal pressure',
  },
  lateralDamping: {
    name: 'Lateral damping',
    symbol: 'β_L',
    value: 0.025,
    unit: 's × κ_L',
    level: 3,
    subsystem: 'body',
    sources: ['boyle2012'],
    note: '',
    upgrade: 'Measured body-wall viscoelasticity',
  },
  diagonalDamping: {
    name: 'Diagonal damping',
    symbol: 'β_D',
    value: 0.01,
    unit: 's × κ_D',
    level: 3,
    subsystem: 'body',
    sources: ['boyle2012'],
    note: '',
    upgrade: 'Measured body-wall viscoelasticity',
  },
  muscleStiffness: {
    name: 'Muscle stiffness at full activation',
    symbol: 'κ_0M',
    value: 20,
    unit: '× κ_L',
    level: 3,
    subsystem: 'muscle',
    sources: ['boyle2012'],
    note: 'A muscle is a spring and damper beside the cuticle whose stiffness, damping and shortened rest length all scale with F_max,m σ(A), a simple Hill-like length-force and force-velocity relation (their eqs. 5–7).',
    upgrade: 'Measured force-length and force-velocity curves of body wall muscle',
  },
  muscleDamping: {
    name: 'Muscle damping at full activation',
    symbol: 'β_0M',
    value: 100,
    unit: '× β_L',
    level: 3,
    subsystem: 'muscle',
    sources: ['boyle2012'],
    note: '',
    upgrade: 'Measured force-velocity curves of body wall muscle',
  },
  muscleShortening: {
    name: 'Muscle shortening at full activation',
    symbol: 'Δ_M',
    value: 0.65,
    unit: 'dimensionless',
    level: 3,
    subsystem: 'muscle',
    sources: ['boyle2012'],
    note: 'A fully active muscle pulls its rest length down to L_min = L_0L (1 − Δ_M (R_m + R_m+1)/2R), scaled by the local radius so every segment can reach the same curvature.',
    upgrade: 'Measured sarcomere shortening limits',
  },
  muscleEfficacy: {
    name: 'Muscle efficacy at the head',
    symbol: 'F_max',
    value: 0.7,
    unit: 'dimensionless',
    level: 3,
    subsystem: 'muscle',
    sources: ['boyle2012'],
    note: "Scales each muscle's stiffness, damping and shortening: F_max,m = F_max (1 − f (m − 1)/M), which is Table 1's 0.70 − 0.42 (m − 1)/M.",
    upgrade: 'Measured force along the body',
  },
  muscleEfficacyFall: {
    name: 'Fall in muscle efficacy from head to tail',
    symbol: 'f',
    value: 0.6,
    unit: 'dimensionless',
    level: 3,
    subsystem: 'muscle',
    sources: ['boyle2012'],
    note: "The share of F_max lost by the tail, which gives the body's decreasing curvature from head to tail.",
    upgrade: 'Measured force along the body',
  },
  headMuscleEfficacy: {
    name: 'Head muscle weakening',
    symbol: 'F_max,1 / F_max',
    value: 2 / 3,
    unit: 'dimensionless',
    level: 3,
    subsystem: 'muscle',
    sources: ['boyle2012'],
    note: 'The first muscle gets F_max × 2/3, so the tip of the head does not over-bend (Table 1).',
    upgrade: 'Measured force along the body',
  },
  dragParallel: {
    name: 'Agar drag coefficient, tangential',
    symbol: 'C∥',
    value: 3.2e-3,
    unit: 'kg s⁻¹',
    level: 3,
    subsystem: 'body',
    sources: ['boyle2012'],
    note: "Whole-worm value. Each of the 49 rods takes C/98, as the authors' code does, so a body moving as a whole feels C/2.",
    upgrade: "Drag measured on agar of the assay's concentration",
  },
  dragPerpendicular: {
    name: 'Agar drag coefficient, normal',
    symbol: 'C⊥',
    value: 128e-3,
    unit: 'kg s⁻¹',
    level: 3,
    subsystem: 'body',
    sources: ['boyle2012'],
    note: 'As above; 40 times the tangential value.',
    upgrade: "Drag measured on agar of the assay's concentration",
  },

  // Environment (PLAN §5.2).
  butanoneDiffusion: {
    name: 'Butanone diffusion coefficient in air',
    symbol: 'D',
    value: 0.091,
    unit: 'cm² s⁻¹',
    level: 3,
    subsystem: 'environment',
    sources: ['lugg1968', 'tang2015'],
    note: 'Measured at 298 K by Lugg, as compiled by Tang et al.',
    upgrade: "A measurement at the assay's temperature and humidity",
  },
  odourDecayLength: {
    name: 'Odour decay length',
    symbol: '√(D/k)',
    value: 3,
    unit: 'cm',
    level: 0,
    subsystem: 'environment',
    sources: [],
    note: 'Sets the first-order loss rate k.',
    upgrade: 'Measured butanone fields on assay plates',
  },
  odourReleaseRate: {
    name: 'Odour release rate',
    symbol: 'Q',
    value: null,
    unit: 'µM cm² s⁻¹',
    level: 0,
    subsystem: 'environment',
    sources: [],
    note: 'The rule gives about 0.953 µM cm² s⁻¹, which a test holds. A lawn releases the same total, spread over its disc.',
    rule: "Set so that the steady concentration equals K, the top of the adaptation model's working range, where the 0.5 cm capture circle faces the dish's centre, on the walled grid.",
    upgrade: 'Measured butanone fields on assay plates',
  },
  lawnDiameter: {
    name: 'Food lawn diameter',
    symbol: 'd_lawn',
    value: 1,
    unit: 'cm',
    level: 0,
    subsystem: 'environment',
    sources: [],
    note: '',
    upgrade: 'A lawn size the reference assays specify',
  },
  dishDiameter: {
    name: 'Dish diameter',
    symbol: 'd_dish',
    value: 10,
    unit: 'cm',
    level: 3,
    subsystem: 'environment',
    sources: ['bargmann1993'],
    note: 'The standard chemotaxis plate.',
    upgrade: 'None needed: it is the assay protocol',
  },
  spotOffset: {
    name: 'Odour and control spots from the dish edge',
    symbol: 'x_spot',
    value: 0.5,
    unit: 'cm',
    level: 3,
    subsystem: 'environment',
    sources: ['bargmann1993'],
    note: '',
    upgrade: 'None needed: it is the assay protocol',
  },
} as const satisfies Record<string, Param>;

export type ParamId = keyof typeof PARAMS;

export const freeParams = (): ParamId[] => (Object.keys(PARAMS) as ParamId[]).filter((id) => isFree(PARAMS[id].level));
