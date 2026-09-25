// Every constant the model uses, with its value, unit, fidelity level and source. This file is the
// single source of truth: code reads constants from here, and FIDELITY.md lists them from here.
//
// A parameter is free when we set it ourselves (level 1 or 0), and the free ones count against the
// budget in PLAN.md §6.2. Calibrated parameters (level 1) get their values and bounds from the
// calibration in milestone 0c; until then their value is null. A parameter fixed in advance (level 0)
// either has a value or is set by a stated rule.

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
  // What a calibrated parameter is tuned against (PLAN.md §7.3).
  calibratedAgainst?: string;
}

export const FREE_PARAMETER_BUDGET = 14;
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
    note: 'Kunert-Graf et al. 2017 restate "Gc = 10pS and C = 1pF". Neural Interactome\'s code runs the same model 1.5× slower (1.5 pF); only the port check uses that.',
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
  },
  reversalInhibitory: {
    name: 'Inhibitory reversal potential',
    symbol: 'E_inh',
    value: -48,
    unit: 'mV',
    level: 3,
    subsystem: 'neural',
    sources: ['wicks1996'],
    note: 'As above.',
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
  },
  synapticRise: {
    name: 'Synaptic rise rate',
    symbol: 'a_r',
    value: 1,
    unit: 's⁻¹',
    level: 3,
    subsystem: 'neural',
    sources: ['kunertgraf2017'],
    note: 'Kunert-Graf et al. 2017: "ar = 1 s−1 and ad = 5 s−1".',
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
  },
  noiseIntensity: {
    name: 'Neural noise intensity',
    symbol: 'σ_n',
    value: null,
    unit: 'pA·√s',
    level: 1,
    subsystem: 'neural',
    sources: ['gray2005'],
    note: 'White current noise, drawn each step with standard deviation σ_n/√dt.',
    calibratedAgainst: CALIBRATION_TARGETS,
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
  },
  awcGain: {
    name: 'AWC transduction gain',
    symbol: 'g_AWC',
    value: null,
    unit: 'pA',
    level: 0,
    subsystem: 'sensing',
    sources: [],
    note: 'Never tuned against chemotaxis.',
    rule: 'Set once, on the intact real wiring, so that removing odour from the adapted start concentration depolarises AWC by 16 mV (2/β).',
  },
  touchAmplitude: {
    name: 'Touch stimulus amplitude',
    symbol: 'ΔV_touch',
    value: 10,
    unit: 'mV above rest',
    level: 0,
    subsystem: 'sensing',
    sources: [],
    note: 'Applied as one current per receptor, computed from its input conductance in the intact real wiring, and the same for every brain and lesion.',
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
  },
  headSwitchGain: {
    name: 'Head switch current gain',
    symbol: 'g_sw',
    value: null,
    unit: 'pA',
    level: 1,
    subsystem: 'rhythm',
    sources: [],
    note: '',
    calibratedAgainst: CALIBRATION_TARGETS,
  },
  oscillatorExcitability: {
    name: 'Oscillator excitability',
    symbol: 'g_osc',
    value: null,
    unit: 'pS',
    level: 1,
    subsystem: 'rhythm',
    sources: [],
    note: 'Shared by the A- and B-type oscillators.',
    calibratedAgainst: CALIBRATION_TARGETS,
  },
  oscillatorRecoveryTime: {
    name: 'Oscillator recovery time',
    symbol: 'τ_w',
    value: null,
    unit: 's',
    level: 1,
    subsystem: 'rhythm',
    sources: [],
    note: 'Shared by the A- and B-type oscillators.',
    calibratedAgainst: CALIBRATION_TARGETS,
  },
  oscillatorDriveThreshold: {
    name: 'B-type oscillator drive threshold',
    symbol: 'θ_osc',
    value: null,
    unit: 'mV',
    level: 1,
    subsystem: 'rhythm',
    sources: [],
    note: "B-type neurons and the head switch run only above it, which AVB's drive supplies.",
    calibratedAgainst: CALIBRATION_TARGETS,
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
  },
  proprioceptiveGain: {
    name: 'Proprioceptive gain',
    symbol: 'g_p',
    value: null,
    unit: 'pA',
    level: 1,
    subsystem: 'rhythm',
    sources: [],
    note: 'One gain for A- and B-type neurons.',
    calibratedAgainst: CALIBRATION_TARGETS,
  },

  // Neuromuscular transfer and muscles (PLAN §4.4).
  neuromuscularGain: {
    name: 'Neuromuscular gain',
    symbol: 'g_nmj',
    value: null,
    unit: 'per EM section',
    level: 1,
    subsystem: 'muscle',
    sources: [],
    note: '',
    calibratedAgainst: CALIBRATION_TARGETS,
  },
  neuromuscularThreshold: {
    name: 'Neuromuscular threshold',
    symbol: 'θ_nmj',
    value: null,
    unit: 'EM sections',
    level: 1,
    subsystem: 'muscle',
    sources: [],
    note: '',
    calibratedAgainst: CALIBRATION_TARGETS,
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
  },
  dragParallel: {
    name: 'Agar drag coefficient, tangential',
    symbol: 'C∥',
    value: 3.2e-3,
    unit: 'kg s⁻¹',
    level: 3,
    subsystem: 'body',
    sources: ['boyle2012'],
    note: "Whole-worm value; each rod takes C/98, as the authors' code does.",
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
  },
  odourReleaseRate: {
    name: 'Odour release rate',
    symbol: 'Q',
    value: null,
    unit: 'µM cm² s⁻¹',
    level: 0,
    subsystem: 'environment',
    sources: [],
    note: '',
    rule: "Set so that the steady concentration at the 0.5 cm capture radius equals K, the top of the adaptation model's working range.",
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
  },
} as const satisfies Record<string, Param>;

export type ParamId = keyof typeof PARAMS;

export const freeParams = (): ParamId[] => (Object.keys(PARAMS) as ParamId[]).filter((id) => isFree(PARAMS[id].level));
