// The fidelity ledger (spec §1.3): every part of the model, how well biology supports it, and what
// would raise it. FIDELITY.md is generated from this file, and the app's "About the science" view
// renders it. A subsystem's level is never set by hand: it is the range of its components' levels.

import type { CitationId } from './citations.ts';
import { grouped, type Facts } from './facts.ts';
import type { Level, Tag } from './levels.ts';

// Text that quotes figures from the runtime data is written as a function of those figures.
export type Text = string | ((facts: Facts) => string);

export type SubsystemId =
  | 'anatomy'
  | 'signs'
  | 'strengths'
  | 'neurons'
  | 'rhythm'
  | 'sensing'
  | 'body'
  | 'environment'
  | 'neuromodulation'
  | 'visuals';

export interface Subsystem {
  name: string;
  solid: Text;
  notSolid: Text;
  upgrade: Text;
  // The works its summary names.
  sources: readonly CitationId[];
  // A subsystem made only of omitted biology or presentation choices has a tag instead of components.
  tag?: Tag;
}

// The checks and checkpoints of PLAN §7 and the tests of §5 and §8 that exercise the model.
export type Check =
  | 'port'
  | 'production'
  | 'unit'
  | 'passiveBend'
  | 'signSensitivity'
  | 'sharedScale'
  | 'checkpoint0'
  | 'checkpoint1'
  | 'checkpoint2'
  | 'checkpoint3'
  | 'checkpoint4'
  | 'checkpoint5'
  | 'checkpoint6';

export const CHECKS: Record<Check, string> = {
  port: 'Port check',
  production: 'Production check',
  unit: 'Unit tests',
  passiveBend: 'Passive-bend relaxation test',
  signSensitivity: 'Sign sensitivity runs',
  sharedScale: 'Shared-connection scale runs',
  checkpoint0: 'Checkpoint 0',
  checkpoint1: 'Checkpoint 1',
  checkpoint2: 'Checkpoint 2',
  checkpoint3: 'Checkpoint 3',
  checkpoint4: 'Checkpoint 4',
  checkpoint5: 'Checkpoint 5',
  checkpoint6: 'Checkpoint 6',
};

// A check that exercises a component, and the part of it that does, where only part does.
export interface Test {
  check: Check;
  detail?: string;
}

export interface Component {
  name: Text;
  subsystem: SubsystemId;
  // Every level its parts sit at, highest first: "5 / 4 / 0" is a component with parts at each.
  levels: readonly Level[] | Tag;
  basis: Text;
  caveats: Text;
  upgrade: Text;
  sources: readonly CitationId[];
  // The checks and checkpoints that test it.
  testedBy: readonly Test[];
}

export const SUBSYSTEMS: Record<SubsystemId, Subsystem> = {
  anatomy: {
    name: 'Anatomy and wiring',
    solid:
      'Every connection and its EM size (Cook et al. 2019, as corrected in Emmons 2024); positions from a 3D reconstruction',
    notSolid:
      'Assembled from several animals, with some connections extrapolated where no EM data existed; connectomes also vary between individuals (Witvliet et al. 2021)',
    upgrade: 'Whole-animal connectomes and position atlases from more individuals',
    sources: ['cook2019', 'emmons2024', 'witvliet2021'],
  },
  signs: {
    name: 'Synapse signs',
    solid: (f) =>
      `A few physiology results; expression-based signs for ${f.signs.expression.percent} of chemical edges`,
    notSolid: (f) =>
      `${f.signs.rule.percentWhole} fall back to a transmitter rule and ${f.signs.none.percentWhole} have no basis at all`,
    upgrade: 'A signed functional connectome of the whole animal, ventral cord included',
    sources: ['fenyves2020'],
  },
  strengths: {
    name: 'Synaptic strengths',
    solid: 'Relative sizes from EM',
    notSolid: 'Strength assumed proportional to section count, with one conductance per unit',
    upgrade: 'Per-connection physiology (paired recordings, voltage imaging)',
    sources: [],
  },
  neurons: {
    name: 'Neuron dynamics',
    solid: "Kunert et al.'s published whole-network model and parameters",
    notSolid: 'Every neuron is the same passive cell, with no spikes, plateaus or channel diversity',
    upgrade: 'Cell-type-specific membrane models',
    sources: ['kunert2014'],
  },
  rhythm: {
    name: 'Rhythm and proprioception',
    solid:
      'Documented rhythm generators (Ji 2021; Fouad 2018; Gao 2018) and measured front-to-back coupling (Wen 2012)',
    notSolid:
      'Which cells generate the rhythm is still debated; the oscillator form is ours and its gains are tuned. Crawling does not yet emerge: at the milestone 0c go/no-go, none of the parameter draws tried made the planned model crawl (DECISIONS.md)',
    upgrade: 'A settled rhythm-generation mechanism with cell-level parameters',
    sources: ['ji2021', 'fouad2018', 'gao2018', 'wen2012'],
  },
  sensing: {
    name: 'Sensing',
    solid: "AWC-ON's adaptive threshold (Levy & Bargmann 2020); touch fields from morphology",
    notSolid:
      'The odour-to-current form and the stimulus sizes are ours; only AWC-ON and the touch receptors take stimuli',
    upgrade: 'Recordings that fix sensory currents; measured odour at the agar surface',
    sources: ['levy2020'],
  },
  body: {
    name: 'Muscles and body',
    solid: 'A published neuromechanical model (Boyle, Berri & Cohen 2012)',
    notSolid: '2D; resistive force theory approximates agar; muscle placement assumed; no self-contact',
    upgrade: 'Measured muscle positions and agar mechanics; a 3D body',
    sources: ['boyle2012'],
  },
  environment: {
    name: 'Environment',
    solid: "Diffusion with butanone's measured coefficient; the standard assay layout",
    notSolid: 'A 2D air layer over uniform agar; the loss and release rates are ours; a lawn that only emits odour',
    upgrade: 'Measured butanone fields on assay plates',
    sources: ['lugg1968', 'bargmann1993'],
  },
  neuromodulation: {
    name: 'Neuromodulation',
    tag: 'omitted',
    solid: '',
    notSolid: 'Dopamine, serotonin, tyramine, octopamine and neuropeptides are all absent',
    upgrade: 'Dynamical models of extrasynaptic signalling',
    sources: [],
  },
  visuals: {
    name: 'Visuals',
    tag: 'presentation',
    solid: '',
    notSolid: 'The glow is filtered model state, not imaging data',
    upgrade: '—',
    sources: [],
  },
};

export const COMPONENTS: readonly Component[] = [
  // Anatomy and wiring.
  {
    name: (f) => `Neuron identities and classes (${f.neurons})`,
    subsystem: 'anatomy',
    levels: [5],
    basis: 'White et al. 1986; Cook et al. 2019',
    caveats: '',
    upgrade: '',
    sources: ['white1986', 'cook2019'],
    testedBy: [],
  },
  {
    name: (f) => `Chemical synapses (${grouped(f.chemical)} connections)`,
    subsystem: 'anatomy',
    levels: [5],
    basis: 'Serial-section EM, Cook et al. 2019, released under CC BY in Emmons 2024',
    caveats: (f) =>
      `Assembled from several animals, with some connections extrapolated where no EM data existed; counts are EM sections, which fold synapse number and size together; includes ${f.autapses} autapses`,
    upgrade: 'More whole-animal connectomes',
    sources: ['cook2019', 'emmons2024'],
    testedBy: [{ check: 'checkpoint6' }],
  },
  {
    name: (f) => `Gap junctions (${grouped(f.gapPairs)} pairs)`,
    subsystem: 'anatomy',
    levels: [5],
    basis:
      "Cook et al. 2019, with the lab's July 2020 corrections and 2023 BDU–ALM and BDU–PLM junctions (Emmons 2024)",
    caveats:
      'As above; no rectification or innexin identity, though current crosses the AVA–A-type junctions only from the motor neurons into AVA (Liu et al. 2017); the 14 junctions between a neuron and itself are omitted',
    upgrade: 'Innexin expression and rectification data',
    sources: ['cook2019', 'emmons2024', 'liu2017'],
    testedBy: [],
  },
  {
    name: (f) => `Neuromuscular connections (${f.muscles} muscles)`,
    subsystem: 'anatomy',
    levels: [5],
    basis: 'Cook et al. 2019, as released in Emmons 2024',
    caveats:
      "Like the chemical synapses', and more so: 45% of the neuron–muscle edges were extrapolated from their neighbours' weights, half of them the sublateral motor neurons'",
    upgrade: '',
    sources: ['cook2019', 'emmons2024'],
    testedBy: [{ check: 'checkpoint0' }, { check: 'checkpoint1' }],
  },
  {
    name: 'Transmitter identities',
    subsystem: 'anatomy',
    levels: [5],
    basis: 'CRISPR reporter knock-ins, Wang et al. 2024',
    caveats: 'Expression does not prove release at every synapse',
    upgrade: '',
    sources: ['wang2024'],
    testedBy: [],
  },
  {
    name: 'Soma positions',
    subsystem: 'anatomy',
    levels: [4],
    basis: 'WormBase Virtual Worm morphologies, via `openworm/c302`',
    caveats:
      'One reconstruction, normalised to body length along its anteroposterior axis; the model is posed with a dorsoventral bend, so that axis is a projection (the midline is about 5% longer)',
    upgrade: 'A multi-animal position atlas',
    sources: ['gleeson2018'],
    testedBy: [],
  },

  // Synapse signs.
  {
    name: 'Chemical synapse signs',
    subsystem: 'signs',
    levels: [5, 4, 0],
    basis:
      'Physiology overrides; Fenyves et al. 2020 (S1 and S5 Data), where its transmitter agrees with Wang et al. 2024; presynaptic transmitter rule',
    caveats: (f) =>
      `${grouped(f.signs.rule.count)} connections (${f.signs.rule.percentWhole}) take the rule, and ${grouped(f.signs.none.count)} (${f.signs.none.percentWhole}) have no basis and default to no fast effect, among them the Fenyves predictions set aside because Wang et al. 2024 do not support their transmitter (listed in \`data/reports/data-build.md\`)`,
    upgrade: 'A signed functional connectome',
    sources: ['chalasani2007', 'fenyves2020', 'wang2024'],
    testedBy: [
      { check: 'checkpoint2' },
      { check: 'checkpoint3' },
      { check: 'checkpoint4' },
      { check: 'checkpoint5' },
      { check: 'signSensitivity' },
    ],
  },
  {
    name: 'Neuromuscular signs',
    subsystem: 'signs',
    levels: [4, 0],
    basis: "Muscle's receptors are acetylcholine and GABA (Richmond & Jorgensen 1999)",
    caveats: (f) => `${f.silentMuscleInputs} cells releasing neither get no fast effect on muscle (0)`,
    upgrade: 'Evidence for other receptors on body wall muscle',
    sources: ['richmond1999', 'wang2024'],
    testedBy: [{ check: 'checkpoint1' }],
  },

  // Synaptic strengths.
  {
    name: 'Conductance per EM section',
    subsystem: 'strengths',
    levels: [2],
    basis: "Kunert's per-synapse conductance, rescaled to Cook's totals per connection type",
    caveats: 'Connections shared with Varshney end up about a third weaker than in Neural Interactome',
    upgrade: 'Per-connection physiology',
    sources: ['kunert2014', 'varshney2011', 'cook2019'],
    testedBy: [{ check: 'sharedScale' }],
  },
  {
    name: 'Strength proportional to EM section count',
    subsystem: 'strengths',
    levels: [0],
    basis: 'An assumption',
    caveats: (f) =>
      `${f.largestGap.name}'s ${grouped(f.largestGap.sections)} gap-junction sections show how much a single cell carries. Measured signal propagation among head neurons agrees poorly with a model that takes its weights from the connectome, even with weights and signs fitted (Randi et al. 2023)`,
    upgrade: 'Per-connection physiology',
    sources: ['randi2023'],
    testedBy: [
      { check: 'checkpoint1' },
      { check: 'checkpoint2' },
      { check: 'checkpoint3' },
      { check: 'checkpoint4' },
      { check: 'checkpoint5' },
      { check: 'checkpoint6' },
    ],
  },

  // Neuron dynamics.
  {
    name: 'Membrane model (one passive compartment, graded)',
    subsystem: 'neurons',
    levels: [2],
    basis:
      "Kunert, Shlizerman & Kutz 2014, as implemented in Neural Interactome (Kim, Leahy & Shlizerman 2019), moved from Varshney's data to Cook's",
    caveats: 'Every neuron alike; no action potentials (AWA has them), plateaus or channel diversity',
    upgrade: 'Cell-type-specific membrane models',
    sources: ['kunert2014', 'kim2019'],
    testedBy: [{ check: 'port' }, { check: 'production' }],
  },
  {
    name: 'Membrane and synapse parameters (C 1 pF, G_c 10 pS, rates 1 and 5 s⁻¹, reversals, sigmoid)',
    subsystem: 'neurons',
    levels: [3],
    basis: 'Kunert et al. 2014, as restated by Kunert-Graf et al. 2017; Wicks, Roehrig & Rankin 1996',
    caveats:
      "The same values for every neuron. No check isolates them: the port check runs Neural Interactome's own values, 1.5× slower and with −48 mV where Kunert's papers use −45 mV",
    upgrade: 'Per-class electrophysiology',
    sources: ['kunert2014', 'kunertgraf2017', 'wicks1996'],
    testedBy: [{ check: 'unit', detail: 'a lone neuron relaxes with time constant C/G_c' }],
  },
  {
    name: 'Threshold set at rest, unchanged by lesions',
    subsystem: 'neurons',
    levels: [2],
    basis: "Our adaptation of Kunert's equilibrium threshold (DECISIONS.md)",
    caveats: (f) =>
      `Every neuron rests at half activation, though measured resting potentials differ by class: −71.7 mV in VA5 against −53.2 mV in VB6 (Liu, Chen & Wang 2014). In Cook's data the A-types' excitatory junctions onto muscle have ${f.motorMuscle.A.ventral} EM sections ventrally and ${f.motorMuscle.A.dorsal} dorsally, against the B-types' ${f.motorMuscle.B.ventral} and ${f.motorMuscle.B.dorsal}, so half-on A-types drive the muscles at least as much as the B-types do`,
    upgrade: 'Measured resting states',
    sources: ['kunert2014', 'liu2014', 'cook2019'],
    testedBy: [{ check: 'checkpoint5' }],
  },
  {
    name: 'Neural noise',
    subsystem: 'neurons',
    levels: [1],
    basis: 'Calibrated to the spontaneous reversal rate (PLAN §7.3)',
    caveats: 'White current noise; its intensity is tuned',
    upgrade: 'Measured noise statistics',
    sources: ['gray2005'],
    testedBy: [
      { check: 'unit', detail: 'its power is the same at any step, and each neuron draws its own' },
      { check: 'checkpoint1', detail: 'bout clause' },
      { check: 'checkpoint5', detail: 'spontaneous-reversal rows' },
    ],
  },
  {
    name: 'Lesions',
    subsystem: 'neurons',
    levels: [3],
    basis: "Removing all of a neuron's connections, as laser ablation does",
    caveats: 'No developmental compensation',
    upgrade: '',
    sources: ['chalfie1985', 'gray2005'],
    testedBy: [
      { check: 'unit', detail: "a lesion removes every one of the neuron's connections and leaves the rest intact" },
      { check: 'checkpoint5' },
    ],
  },

  // Rhythm and proprioception.
  {
    name: 'Head relaxation switch in SMD',
    subsystem: 'rhythm',
    levels: [2, 1, 0],
    basis:
      'Ji et al. 2021 (threshold 2.33 and derivative weight 46 ms, on curvature averaged over the 0.1–0.3 head region; level 2 on agar); Yeon et al. 2018 (SMDD proprioceptive)',
    caveats: 'The gain is calibrated (1); gating by network drive is ours (0)',
    upgrade: 'Recordings of the head rhythm generator',
    sources: ['ji2021', 'yeon2018'],
    testedBy: [
      { check: 'unit', detail: 'it flips at ±P_th with hysteresis, and drives the SMD pairs in antiphase' },
      { check: 'checkpoint1' },
    ],
  },
  {
    name: 'B-type intrinsic oscillators, gated by drive',
    subsystem: 'rhythm',
    levels: [2, 1, 0],
    basis: 'Fouad et al. 2018; Xu et al. 2018 (abstract only); AVB needed for forward movement (Chalfie et al. 1985)',
    caveats:
      'Applying the FitzHugh–Nagumo form, with its standard constants 0.7 and 0.8, to these cells is ours (0); its parameters are calibrated (1)',
    upgrade: 'A parameterised model of the B-type rhythm',
    sources: ['fouad2018', 'xu2018', 'chalfie1985', 'fitzhugh1961', 'nagumo1962'],
    testedBy: [
      { check: 'unit', detail: 'they cycle at the FitzHugh–Nagumo period, only within a window of drive' },
      { check: 'checkpoint0' },
      { check: 'checkpoint1' },
      { check: 'checkpoint5', detail: 'AVB + PVC row' },
    ],
  },
  {
    name: 'A-type intrinsic oscillators',
    subsystem: 'rhythm',
    levels: [2, 1, 0],
    basis: 'Gao et al. 2018 (sufficient for backward locomotion without premotor interneurons)',
    caveats:
      'As above. With these constants and no drive threshold the A-types do not cycle on their own, even without their premotor interneurons, only when the B-types drive them; the model does not yet show the intrinsic rhythm it cites (DECISIONS.md)',
    upgrade: 'A parameterised model of the A-type rhythm',
    sources: ['gao2018', 'fitzhugh1961', 'nagumo1962'],
    testedBy: [{ check: 'checkpoint2' }, { check: 'checkpoint5', detail: 'AVA and AVA + AVD rows' }],
  },
  {
    name: 'Proprioceptive input to B-type neurons',
    subsystem: 'rhythm',
    levels: [3, 1],
    basis: "Wen et al. 2012: driven by bending of the ~200 µm in front of each neuron's muscles",
    caveats: 'The gain is calibrated (1)',
    upgrade: 'Identified stretch receptors and their gain',
    sources: ['wen2012'],
    testedBy: [
      { check: 'unit', detail: 'curvature is κL, signed by side, from the field in front of the muscles' },
      { check: 'checkpoint1' },
    ],
  },
  {
    name: 'Proprioceptive input to A-type neurons',
    subsystem: 'rhythm',
    levels: [2, 1],
    basis: "Mirror of Wen's coupling; Gao et al. 2018 infer motor neurons are likely proprioceptive",
    caveats: 'No direct evidence; shares the B-type gain',
    upgrade: 'Direct evidence on A-type sensing',
    sources: ['wen2012', 'gao2018'],
    testedBy: [{ check: 'checkpoint2' }],
  },

  // Sensing.
  {
    name: 'AWC-ON adaptive threshold (K 5.5 µM, τ 17 s)',
    subsystem: 'sensing',
    levels: [3],
    basis:
      'Levy & Bargmann 2020; the AWC-ON side drawn at random per worm (Troemel, Sagasti & Bargmann 1999; Wes & Bargmann 2001)',
    caveats: 'Parameters are for butanone in microfluidic devices',
    upgrade: 'Threshold measurements on assay plates',
    sources: ['levy2020', 'troemel1999', 'wes2001'],
    testedBy: [{ check: 'checkpoint4' }],
  },
  {
    name: 'AWC odour-to-current form',
    subsystem: 'sensing',
    levels: [0],
    basis: 'Ours: `(T − C)/(T + C)`, bounded, depolarising on odour removal (the OFF response, Chalasani et al. 2007)',
    caveats: '',
    upgrade: 'Current-clamp recordings from AWC',
    sources: ['chalasani2007'],
    testedBy: [{ check: 'checkpoint4' }],
  },
  {
    name: 'AWC gain',
    subsystem: 'sensing',
    levels: [0],
    basis: 'Fixed in advance: removing odour depolarises AWC by 16 mV',
    caveats: 'Aqueous-equivalent concentration at the agar is assumed',
    upgrade: 'Recordings that fix the gain',
    sources: [],
    testedBy: [{ check: 'checkpoint4' }],
  },
  {
    name: 'Sensing locations and touch receptive fields',
    subsystem: 'sensing',
    levels: [4],
    basis: 'Dendrite tips and process extents in the c302 morphologies',
    caveats: '',
    upgrade: '',
    sources: ['gleeson2018', 'chalfie1985'],
    testedBy: [{ check: 'checkpoint2' }, { check: 'checkpoint3' }],
  },
  {
    name: 'Touch stimulus',
    subsystem: 'sensing',
    levels: [0],
    basis: '10 mV for 500 ms, one current for every brain',
    caveats: '',
    upgrade: 'Recorded receptor currents',
    sources: [],
    testedBy: [{ check: 'checkpoint2' }, { check: 'checkpoint3' }],
  },
  {
    name: 'Other sensory neurons',
    subsystem: 'sensing',
    levels: 'omitted',
    basis: 'Omitted in v1: only AWC-ON and the touch receptors take stimuli',
    caveats: '',
    upgrade: '',
    sources: [],
    testedBy: [],
  },

  // Muscles and body.
  {
    name: 'Neuromuscular transfer and muscle activation',
    subsystem: 'body',
    levels: [3, 1],
    basis: 'Time constant 100 ms (Boyle et al. 2012; also Ji et al. 2021); gain and threshold calibrated',
    caveats: 'Muscle action potentials are not modelled',
    upgrade: '',
    sources: ['boyle2012', 'ji2021'],
    testedBy: [
      { check: 'unit', detail: 'drive from the signed map, activation with the 100 ms time constant' },
      { check: 'checkpoint1' },
    ],
  },
  {
    name: 'Muscle placement along the body',
    subsystem: 'body',
    levels: [0],
    basis:
      "Assumed to sit on one grid of 24 slots in every quadrant, the 23-cell ventral-left quadrant's last cell covering two, as Cook's innervation suggests",
    caveats: '',
    upgrade: 'Measured muscle positions',
    sources: ['cook2019'],
    testedBy: [{ check: 'checkpoint1' }],
  },
  {
    name: 'Four quadrants collapsed to dorsal and ventral',
    subsystem: 'body',
    levels: [3],
    basis: 'Worms crawl on their sides, bending dorsoventrally',
    caveats: 'No head lifts or other 3D head movement',
    upgrade: 'A 3D body',
    sources: ['boyle2012'],
    testedBy: [],
  },
  {
    name: 'Body mechanics (48 elastic units, resistive force theory)',
    subsystem: 'body',
    levels: [3],
    basis: 'Boyle, Berri & Cohen 2012',
    caveats: 'Resistive force theory approximates agar; 2D; no self-contact',
    upgrade: 'Measured agar mechanics; a 3D body',
    sources: ['boyle2012'],
    testedBy: [
      { check: 'passiveBend' },
      { check: 'unit', detail: "the paper's force law, written independently, gives its velocities" },
      { check: 'unit', detail: 'a prescribed wave crawls at the predicted speed' },
      { check: 'checkpoint1' },
    ],
  },
  {
    name: 'Agar drag coefficients',
    subsystem: 'body',
    levels: [3],
    basis:
      "Boyle et al. 2012, split per rod as their code does, which also resists each rod's rotation with 4πR² times its tangential coefficient",
    caveats: '',
    upgrade: '',
    sources: ['boyle2012'],
    testedBy: [
      { check: 'passiveBend' },
      { check: 'unit', detail: "a uniform force moves the body at the registry's drag" },
      { check: 'checkpoint1' },
    ],
  },

  // Environment.
  {
    name: 'Butanone diffusion in air',
    subsystem: 'environment',
    levels: [3],
    basis: '0.091 cm² s⁻¹ at 298 K (Lugg 1968, via Tang et al. 2015)',
    caveats: '',
    upgrade: '',
    sources: ['lugg1968', 'tang2015'],
    testedBy: [{ check: 'unit', detail: 'a point release matches the analytic Gaussian' }, { check: 'checkpoint4' }],
  },
  {
    name: 'Odour field geometry',
    subsystem: 'environment',
    levels: [0],
    basis:
      'A 2D air layer over uniform agar; a 3 cm decay length; the release rate set so the concentration at the capture radius is K',
    caveats: "Tanimoto et al. 2017's plate measurements (2-nonanone) are context only",
    upgrade: 'Measured butanone fields on assay plates',
    sources: ['tanimoto2017'],
    testedBy: [{ check: 'checkpoint4' }],
  },
  {
    name: 'Food lawn',
    subsystem: 'environment',
    levels: [0],
    basis: 'A 1 cm disc that releases butanone',
    caveats: 'Real lawns release many odours; no mechanosensation, feeding or slowing',
    upgrade: '',
    sources: [],
    testedBy: [],
  },
  {
    name: 'Dish geometry',
    subsystem: 'environment',
    levels: [3],
    basis: 'Standard chemotaxis layout: 10 cm dish, spots 0.5 cm from the edge (Bargmann, Hartwieg & Horvitz 1993)',
    caveats: '',
    upgrade: '',
    sources: ['bargmann1993'],
    testedBy: [{ check: 'checkpoint4' }],
  },
];

// Biology deliberately left out, and visual choices that make no biological claim.
export const OMITTED: readonly { text: string; sources: readonly CitationId[] }[] = [
  {
    text: 'Neuropeptides and monoamines: dopamine, serotonin, tyramine, octopamine and the peptides. With them go slowing on food (Sawin, Ranganathan & Horvitz 2000), dwelling versus roaming (Flavell et al. 2013), the change in reversal rates with time off food (Gray, Hill & Bargmann 2005), and part of the control of reversals and turns.',
    sources: ['sawin2000', 'flavell2013', 'gray2005'],
  },
  {
    text: 'Extrasynaptic signalling in general (Bentley et al. 2016; Randi et al. 2023).',
    sources: ['bentley2016', 'randi2023'],
  },
  {
    text: 'Other senses: temperature, oxygen, CO₂, salt (ASE), pheromones, harsh touch, and nose touch.',
    sources: [],
  },
  {
    text: 'The pharynx and feeding. The 20 pharyngeal neurons are simulated but drive no effector.',
    sources: [],
  },
  {
    text: 'Glia, gap-junction rectification, individual variation, development and learning.',
    sources: [],
  },
];

export const PRESENTATION: readonly { text: string; sources: readonly CitationId[] }[] = [
  {
    text: 'Calcium-style glow: model activity filtered through published GCaMP kinetics (Chen et al. 2013). The colour and normalisation are display choices.',
    sources: ['chen2013'],
  },
  {
    text: 'The 3D graph places each soma where one reconstruction has it (the WormBase Virtual Worm, via c302; Gleeson et al. 2018), unbent along the ventral cord, with the body axis stretched where neurons crowd and the cross-section enlarged. Order along the unbent body is kept.',
    sources: ['gleeson2018'],
  },
  {
    text: "The plate view looks down on the dish as a dark-field microscope would. The worm's outline is the body model's: a strip through the rods' centres, smoothed between them, as wide as the rods' diameters, with its tips faded. Everything else is drawn, not simulated: the body's shading, the pharynx's bulbs and the gut's granules inside it, the halo around it, and the agar's mottle, specks, meniscus, rim and darker corners. The camera follows the worm at body scale, with the whole dish in an inset.",
    sources: [],
  },
];

// The levels a subsystem spans: every level of every component in it.
export function subsystemLevels(id: SubsystemId): Level[] {
  return COMPONENTS.filter((c) => c.subsystem === id).flatMap((c) =>
    typeof c.levels === 'string' ? [] : [...c.levels],
  );
}

export const render = (text: Text, facts: Facts): string => (typeof text === 'function' ? text(facts) : text);
