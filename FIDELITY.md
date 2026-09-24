# Fidelity ledger

How well biology supports each part of Wormlight (spec §1.3). It lets a viewer tell measured fact from informed guess, and it tells later work what to replace when new research lands.

> **Status: planned.** Nothing is simulated yet; this page records the level each part is planned at. From milestone 0a it is generated from the registry in `src/science/`, and CI fails if the two disagree. Until then it is hand-written, an exception logged in `DECISIONS.md`.

## The scale

| Level | Name                  | Meaning                                                                                              | Example                                                                                    |
| ----- | --------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 5     | Measured              | Observed directly in _C. elegans_ and used as-is.                                                    | Who connects to whom (Cook et al. 2019).                                                   |
| 4     | Derived               | Computed from _C. elegans_ measurements by a published method.                                       | Synapse signs predicted from receptor expression (Fenyves et al. 2020).                    |
| 3     | Established           | A published _C. elegans_ model or value, used in the regime it was fitted for.                       | A 100 ms muscle time constant (Boyle, Berri & Cohen 2012).                                 |
| 2     | Hypothesis or adapted | A mechanism with support that the field hasn't settled, or a published value moved to a new setting. | A head rhythm switched by proprioceptive thresholds; Kunert's conductances on Cook's data. |
| 1     | Calibrated            | Tuned by us so the model reproduces a behaviour. It shows the model can, not that it predicts.       | Neural noise set to match the spontaneous reversal rate.                                   |
| 0     | Assumed               | A simplification or placeholder with no specific evidence behind it; first in line for replacement.  | Synaptic strength proportional to EM section count.                                        |
| —     | Omitted               | Known biology deliberately left out.                                                                 | Neuropeptide signalling.                                                                   |
| ◇     | Presentation          | A visual choice that makes no biological claim.                                                      | The glow's colour and normalisation.                                                       |

A level describes the kind of evidence, not how much a part matters, and not certainty: a measured wiring diagram still comes from one animal. A subsystem's levels are the range of its components' levels, listed below under the same headings.

## At a glance

| Subsystem              | Levels | What's solid                                                                                                | What isn't                                                                                                  | What would raise it                                                       |
| ---------------------- | ------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Anatomy and wiring     | 5–4    | Every connection and its EM size (Cook et al. 2019); positions from a 3D reconstruction                     | One animal, and connectomes vary between individuals (Witvliet et al. 2021)                                 | Whole-animal connectomes and position atlases from more individuals       |
| Synapse signs          | 5–0    | A few physiology results; expression-based signs for 47.5% of chemical edges                                | 39% fall back to a transmitter rule and 13% have no basis at all                                            | A signed functional connectome of the whole animal, ventral cord included |
| Synaptic strengths     | 2–0    | Relative sizes from EM                                                                                      | Strength assumed proportional to section count, with one conductance per unit                               | Per-connection physiology (paired recordings, voltage imaging)            |
| Neuron dynamics        | 3–1    | Kunert et al.'s published whole-network model and parameters                                                | Every neuron is the same passive cell, with no spikes, plateaus or channel diversity                        | Cell-type-specific membrane models                                        |
| Rhythm, proprioception | 3–0    | Documented rhythm generators (Ji 2021; Fouad 2018; Gao 2018) and measured front-to-back coupling (Wen 2012) | Which cells generate the rhythm is still debated; the oscillator form is ours and its gains are tuned       | A settled rhythm-generation mechanism with cell-level parameters          |
| Sensing                | 4–0    | AWC-ON's adaptive threshold (Levy & Bargmann 2020); touch fields from morphology                            | The odour-to-current form and the stimulus sizes are ours; only AWC-ON and the touch receptors take stimuli | Recordings that fix sensory currents; measured odour at the agar surface  |
| Muscles and body       | 3–0    | A published neuromechanical model (Boyle, Berri & Cohen 2012)                                               | 2D; resistive force theory approximates agar; muscle placement assumed; no self-contact                     | Measured muscle positions and agar mechanics; a 3D body                   |
| Environment            | 3–0    | Diffusion with butanone's measured coefficient; the standard assay layout                                   | A 2D air layer over uniform agar; the loss and release rates are ours; a lawn that only emits odour         | Measured butanone fields on assay plates                                  |
| Neuromodulation        | —      |                                                                                                             | Dopamine, serotonin, tyramine, octopamine and neuropeptides are all absent                                  | Dynamical models of extrasynaptic signalling                              |
| Visuals                | ◇      |                                                                                                             | The glow is filtered model state, not imaging data                                                          | —                                                                         |

## Components

### Anatomy and wiring

| Component                              | Level | Basis                                                   | Caveats                                                                                               | What would raise it                       |
| -------------------------------------- | ----- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Neuron identities and classes (302)    | 5     | White et al. 1986; Cook et al. 2019                     |                                                                                                       |                                           |
| Chemical synapses (3,709 connections)  | 5     | Serial-section EM, Cook et al. 2019                     | One animal; counts are EM sections, which fold synapse number and size together; includes 38 autapses | More whole-animal connectomes             |
| Gap junctions (1,093 pairs)            | 5     | Cook et al. 2019                                        | No rectification or innexin identity                                                                  | Innexin expression and rectification data |
| Neuromuscular connections (95 muscles) | 5     | Cook et al. 2019                                        |                                                                                                       |                                           |
| Transmitter identities                 | 5     | CRISPR reporter knock-ins, Wang et al. 2024             | Expression does not prove release at every synapse                                                    |                                           |
| Soma positions                         | 4     | WormBase Virtual Worm morphologies, via `openworm/c302` | One reconstruction, normalised to body length                                                         | A multi-animal position atlas             |

### Synapse signs

| Component              | Level     | Basis                                                                                    | Caveats                                                                                          | What would raise it                    |
| ---------------------- | --------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Chemical synapse signs | 5 / 4 / 0 | Physiology overrides; Fenyves et al. 2020 (S1 and S5 Data); presynaptic transmitter rule | 1,453 connections (39%) take the rule, and 493 (13%) have no basis and default to no fast effect | A signed functional connectome         |
| Neuromuscular signs    | 4 / 0     | Muscle's receptors are acetylcholine and GABA (Richmond & Jorgensen 1999)                | 32 cells releasing neither get no fast effect on muscle (0)                                      | Evidence for other receptors on muscle |

### Synaptic strengths

| Component                                 | Level | Basis                                                                           | Caveats                                                                                 | What would raise it       |
| ----------------------------------------- | ----- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------- |
| Conductance per EM section                | 2     | Kunert's per-synapse conductance, rescaled to Cook's totals per connection type | Connections shared with Varshney end up about a third weaker than in Neural Interactome | Per-connection physiology |
| Strength proportional to EM section count | 0     | An assumption                                                                   | ALA's 1,314 gap-junction sections show how much it carries                              | Per-connection physiology |

### Neuron dynamics

| Component                                                                                  | Level | Basis                                                                                    | Caveats                                                                                | What would raise it                |
| ------------------------------------------------------------------------------------------ | ----- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------- |
| Membrane model (one passive compartment, graded)                                           | 2     | Kunert, Shlizerman & Kutz 2014, moved from Varshney's data to Cook's                     | Every neuron alike; no action potentials (AWA has them), plateaus or channel diversity | Cell-type-specific membrane models |
| Membrane and synapse parameters (C 1 pF, G_c 10 pS, rates 1 and 5 s⁻¹, reversals, sigmoid) | 3     | Kunert et al. 2014, as restated by Kunert-Graf et al. 2017; Wicks, Roehrig & Rankin 1996 | The same values for every neuron; Neural Interactome's code runs them 1.5× slower      | Per-class electrophysiology        |
| Threshold set at rest, unchanged by lesions                                                | 2     | Our adaptation of Kunert's equilibrium threshold (DECISIONS.md)                          | Every neuron rests at half activation                                                  | Measured resting states            |
| Neural noise                                                                               | 1     | Calibrated to the spontaneous reversal rate                                              | White current noise; its intensity is tuned                                            | Measured noise statistics          |
| Lesions                                                                                    | 3     | Removing all of a neuron's connections, as laser ablation does                           | No developmental compensation                                                          |                                    |

### Rhythm and proprioception

| Component                                    | Level     | Basis                                                                                                             | Caveats                                                                                   | What would raise it                         |
| -------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------- |
| Head relaxation switch in SMD                | 2 / 1 / 0 | Ji et al. 2021 (threshold 2.33, derivative weight 46 ms; level 2 on agar); Yeon et al. 2018 (SMDD proprioceptive) | The gain is calibrated (1); gating by network drive and the curvature region are ours (0) | Recordings of the head rhythm generator     |
| B-type intrinsic oscillators, gated by drive | 2 / 1 / 0 | Fouad et al. 2018; Xu et al. 2018 (abstract only); AVB needed for forward movement (Chalfie et al. 1985)          | The FitzHugh–Nagumo form is ours (0); its parameters are calibrated (1)                   | A parameterised model of the B-type rhythm  |
| A-type intrinsic oscillators                 | 2 / 1 / 0 | Gao et al. 2018 (sufficient for backward locomotion without premotor interneurons)                                | As above                                                                                  | A parameterised model of the A-type rhythm  |
| Proprioceptive input to B-type neurons       | 3 / 1     | Wen et al. 2012: driven by bending of the ~200 µm in front of each neuron's muscles                               | The gain is calibrated (1)                                                                | Identified stretch receptors and their gain |
| Proprioceptive input to A-type neurons       | 2 / 1     | Mirror of Wen's coupling; Gao et al. 2018 infer motor neurons are likely proprioceptive                           | No direct evidence; shares the B-type gain                                                | Direct evidence on A-type sensing           |

### Sensing

| Component                                    | Level | Basis                                                                                                                  | Caveats                                                 | What would raise it                    |
| -------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| AWC-ON adaptive threshold (K 5.5 µM, τ 17 s) | 3     | Levy & Bargmann 2020; the AWC-ON side drawn at random per worm (Troemel, Sagasti & Bargmann 1999; Wes & Bargmann 2001) | Parameters are for butanone in microfluidic devices     | Threshold measurements on assay plates |
| AWC odour-to-current form                    | 0     | Ours: `(T − C)/(T + C)`, bounded, depolarising on odour removal (the OFF response, Chalasani et al. 2007)              |                                                         | Current-clamp recordings from AWC      |
| AWC gain                                     | 0     | Fixed in advance: removing odour depolarises AWC by 16 mV                                                              | Aqueous-equivalent concentration at the agar is assumed | Recordings that fix the gain           |
| Sensing locations and touch receptive fields | 4     | Dendrite tips and process extents in the c302 morphologies                                                             |                                                         |                                        |
| Touch stimulus                               | 0     | 10 mV for 500 ms, one current for every brain                                                                          |                                                         | Recorded receptor currents             |
| Other sensory neurons                        | —     | Omitted in v1: only AWC-ON and the touch receptors take stimuli                                                        |                                                         |                                        |

### Muscles and body

| Component                                                 | Level | Basis                                                                                        | Caveats                                                       | What would raise it                |
| --------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| Neuromuscular transfer and muscle activation              | 3 / 1 | Time constant 100 ms (Boyle et al. 2012; also Ji et al. 2021); gain and threshold calibrated | Muscle action potentials are not modelled                     |                                    |
| Muscle placement along the body                           | 0     | Assumed evenly spaced within each quadrant                                                   |                                                               | Measured muscle positions          |
| Four quadrants collapsed to dorsal and ventral            | 3     | Worms crawl on their sides, bending dorsoventrally                                           | No head lifts or other 3D head movement                       | A 3D body                          |
| Body mechanics (48 elastic units, resistive force theory) | 3     | Boyle, Berri & Cohen 2012                                                                    | Resistive force theory approximates agar; 2D; no self-contact | Measured agar mechanics; a 3D body |
| Agar drag coefficients                                    | 3     | Boyle et al. 2012, split per rod as their code does                                          |                                                               |                                    |

### Environment

| Component                 | Level | Basis                                                                                                                       | Caveats                                                                 | What would raise it                      |
| ------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| Butanone diffusion in air | 3     | 0.091 cm² s⁻¹ at 298 K (Lugg 1968, via Tang et al. 2015)                                                                    |                                                                         |                                          |
| Odour field geometry      | 0     | A 2D air layer over uniform agar; a 3 cm decay length; the release rate set so the concentration at the capture radius is K | Tanimoto et al. 2017's plate measurements (2-nonanone) are context only | Measured butanone fields on assay plates |
| Food lawn                 | 0     | A 1 cm disc that releases butanone                                                                                          | Real lawns release many odours; no mechanosensation, feeding or slowing |                                          |
| Dish geometry             | 3     | Standard chemotaxis layout: 10 cm dish, spots 0.5 cm from the edge (Bargmann, Hartwieg & Horvitz 1993)                      |                                                                         |                                          |

## Omitted biology

- Neuropeptides and monoamines: dopamine, serotonin, tyramine, octopamine and the peptides. With them go slowing on food (Sawin, Ranganathan & Horvitz 2000), dwelling versus roaming (Flavell et al. 2013), the change in reversal rates with time off food (Gray, Hill & Bargmann 2005), and part of the control of reversals and turns.
- Extrasynaptic signalling in general (Bentley et al. 2016; Randi et al. 2023).
- Other senses: temperature, oxygen, CO₂, salt (ASE), pheromones, harsh touch, and nose touch.
- The pharynx and feeding. The 20 pharyngeal neurons are simulated but drive no effector.
- Glia, gap-junction rectification, individual variation, development and learning.

## Presentation

- Calcium-style glow: model activity filtered through published GCaMP kinetics (Chen et al. 2013). The colour and normalisation are display choices.
- The 3D graph keeps anatomical order but scales the body axis non-uniformly so the head stays readable.
- The camera follows the worm at body scale.

## Parameters

Generated from the registry at milestone 0a: every parameter with its value, unit, level and source. There are 14 free parameters, meaning those at level 1 or 0: eight calibrated and six fixed in advance (PLAN.md §6.2).
