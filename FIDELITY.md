# Fidelity ledger

How well biology supports each part of Wormlight (spec §1.3). It lets a viewer tell measured fact from informed guess, and it tells later work what to replace when new research lands.

> **Status: planned.** Nothing is simulated yet; this page records the level each part is planned at. From milestone 0 it is generated from the registry in `src/science/`, and CI fails if the two disagree.

## The scale

| Level | Name                  | Meaning                                                                                              | Example                                                                                   |
| ----- | --------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 5     | Measured              | Observed directly in _C. elegans_ and used as-is.                                                    | Who connects to whom (Cook et al. 2019).                                                  |
| 4     | Derived               | Computed from _C. elegans_ measurements by a published method.                                       | Synapse signs predicted from receptor expression (Fenyves et al. 2020).                   |
| 3     | Established           | A published _C. elegans_ model or value, used in the regime it was fitted for.                       | A 100 ms muscle time constant (Boyle, Berri & Cohen 2012).                                |
| 2     | Hypothesis or adapted | A mechanism with support that the field hasn't settled, or a published value moved to a new dataset. | Rhythm from a proprioceptive reflex chain; Kunert's conductances rescaled to Cook's data. |
| 1     | Calibrated            | Tuned by us so the model reproduces a behaviour. It shows the model can, not that it predicts.       | Neural noise set to match the spontaneous reversal rate.                                  |
| 0     | Assumed               | A simplification or placeholder with no specific evidence behind it; first in line for replacement.  | Synaptic strength proportional to EM section count.                                       |
| —     | Omitted               | Known biology deliberately left out.                                                                 | Neuropeptide signalling.                                                                  |
| ◇     | Presentation          | A visual choice that makes no biological claim.                                                      | The glow's colour and normalisation.                                                      |

A level describes the kind of evidence, not how much a part matters, and not certainty: a measured wiring diagram still comes from one animal.

## At a glance

| Subsystem              | Level     | What's solid                                                       | What isn't                                                                                                                               | What would raise it                                                       |
| ---------------------- | --------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Wiring                 | 5         | Every connection and its EM size (Cook et al. 2019)                | One animal, and connectomes vary between individuals (Witvliet et al. 2021)                                                              | Whole-animal connectomes from more individuals                            |
| Synapse signs          | 5 / 4 / 0 | A few physiology results; expression-based predictions for 42%     | The rest falls back to a transmitter rule, and 13% of connections have no basis at all                                                   | A signed functional connectome of the whole animal, ventral cord included |
| Synaptic strengths     | 2 / 0     | Relative sizes from EM                                             | Strength assumed proportional to section count, with one conductance per unit                                                            | Per-connection physiology (paired recordings, voltage imaging)            |
| Neuron dynamics        | 2         | A published whole-network model (Kunert, Shlizerman & Kutz 2014)   | Every neuron is the same passive cell: no spikes, plateaus or channel diversity                                                          | Cell-type-specific membrane models                                        |
| Sensing                | 3 / 1     | AWC-ON's adaptive threshold (Levy & Bargmann 2020); touch fields   | Current gains are tuned; odour units at the agar are assumed; only AWC-ON and the touch receptors take stimuli                           | Recordings that fix sensory currents; measured odour at the agar surface  |
| Rhythm, proprioception | 2         | Front-to-back proprioceptive coupling in B-type neurons (Wen 2012) | Where the rhythm comes from is unsettled (Fouad et al. 2018; Gao et al. 2018), and here it is expected from the network; gains are tuned | A settled rhythm-generation mechanism                                     |
| Muscles and body       | 3         | A published neuromechanical model (Boyle, Berri & Cohen 2012)      | 2D, resistive force theory approximates agar, no self-contact; muscle placement assumed                                                  | Measured muscle positions and agar mechanics; a 3D body                   |
| Environment            | 3 / 0     | Diffusion physics with butanone's measured coefficient             | A 2D air layer, uniform agar, a lawn that only emits odour                                                                               | Measured odour fields on assay plates                                     |
| Neuromodulation        | —         |                                                                    | Dopamine, serotonin, tyramine, octopamine and neuropeptides are all absent                                                               | Dynamical models of extrasynaptic signalling                              |
| Visuals                | ◇         |                                                                    | The glow is filtered model state, not imaging data                                                                                       | —                                                                         |

## Components

### Data

| Component                              | Level     | Basis                                                                   | Caveats                                                                         | What would raise it                       |
| -------------------------------------- | --------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| Neuron identities and classes (302)    | 5         | White et al. 1986; Cook et al. 2019                                     |                                                                                 |                                           |
| Chemical synapses (3,709 connections)  | 5         | Serial-section EM, Cook et al. 2019                                     | One animal; counts are EM sections, which fold synapse number and size together | More whole-animal connectomes             |
| Gap junctions (1,093 pairs)            | 5         | Cook et al. 2019                                                        | No rectification or innexin identity                                            | Innexin expression and rectification data |
| Neuromuscular connections (95 muscles) | 5         | Cook et al. 2019                                                        |                                                                                 |                                           |
| Transmitter identities                 | 5         | CRISPR reporter knock-ins, Wang et al. 2024                             | Expression does not prove release at every synapse                              |                                           |
| Soma positions                         | 4         | WormBase Virtual Worm morphologies, via `openworm/c302`                 | One reconstruction, normalised to body length                                   | A multi-animal position atlas             |
| Sensing locations                      | 4         | Dendrite tips and process extents in the same morphologies              |                                                                                 |                                           |
| Synapse signs                          | 5 / 4 / 0 | Physiology overrides; Fenyves et al. 2020; presynaptic transmitter rule | 495 connections (13%) have no basis and default to no fast effect               | A signed functional connectome            |

### Neural dynamics

| Component                                                              | Level | Basis                                                                           | Caveats                                                                                | What would raise it                |
| ---------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------- |
| Membrane model (one passive compartment, graded)                       | 2     | Kunert, Shlizerman & Kutz 2014, moved from Varshney's data to Cook's            | Every neuron alike; no action potentials (AWA has them), plateaus or channel diversity | Cell-type-specific membrane models |
| Membrane parameters (capacitance, leak)                                | 3     | Varshney et al. 2011 and Wicks, Roehrig & Rankin 1996, via Kunert et al. 2014   | The same values for every neuron                                                       | Per-class electrophysiology        |
| Synapse model (sigmoidal release, reversal potentials, rise and decay) | 3     | Wicks, Roehrig & Rankin 1996; Kunert, Shlizerman & Kutz 2014                    | Graded release assumed everywhere                                                      |                                    |
| Conductance per EM section                                             | 2     | Kunert's per-synapse conductance, rescaled to Cook's counts per connection type | Linear in section count; ALA's 1,314 gap-junction sections show how much this carries  | Per-connection physiology          |
| Threshold set at rest                                                  | 2     | Our adaptation of Kunert's equilibrium threshold (DECISIONS.md)                 |                                                                                        |                                    |
| Neural noise                                                           | 1     | Calibrated to the spontaneous reversal rate                                     | Both magnitude and form are chosen by us                                               | Measured noise statistics          |
| Lesions                                                                | 3     | Removing all of a neuron's connections, as laser ablation does                  | No developmental compensation                                                          |                                    |

### Sensing

| Component                                             | Level | Basis                                                                                                                                                                | Caveats                                                                                                       | What would raise it                                                   |
| ----------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| AWC-ON response to butanone (OFF, adaptive threshold) | 3 / 1 | Levy & Bargmann 2020 (K = 5.5 µM, τ = 17 s); Chalasani et al. 2007; Wes & Bargmann 2001; the AWC-ON side drawn at random per worm (Troemel, Sagasti & Bargmann 1999) | The gain from odour to current is calibrated, and the aqueous-equivalent concentration at the agar is assumed | Current-clamp recordings from AWC; measured odour at the agar surface |
| Touch receptor stimulation                            | 4 / 0 | Receptive fields from morphology (4); a 10 mV, 500 ms pulse assumed (0)                                                                                              |                                                                                                               | Recorded receptor currents                                            |
| Other sensory neurons                                 | —     | Omitted in v1: only AWC-ON and the touch receptors take stimuli                                                                                                      |                                                                                                               |                                                                       |

### Rhythm, proprioception and muscles

| Component                                      | Level | Basis                                                                               | Caveats                                                                                                                                         | What would raise it        |
| ---------------------------------------------- | ----- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Proprioceptive input to B-type motor neurons   | 2 / 1 | Wen et al. 2012: driven by bending of the ~200 µm in front of each neuron's muscles | The mechanism is debated (Fouad et al. 2018; Gao et al. 2018); Boyle, Berri & Cohen's model uses the opposite direction; the gain is calibrated | A settled rhythm mechanism |
| No proprioception in A-type motor neurons      | 0     | No evidence either way; Gao et al. 2018 find their rhythm is intrinsic              | Backward waves may not propagate without it                                                                                                     | Evidence on A-type sensing |
| Neuromuscular transfer and muscle activation   | 3 / 1 | Time constant from Boyle, Berri & Cohen 2012; gain calibrated                       | Muscle action potentials are not modelled                                                                                                       |                            |
| Muscle placement along the body                | 0     | Assumed evenly spaced within each quadrant                                          |                                                                                                                                                 | Measured muscle positions  |
| Four quadrants collapsed to dorsal and ventral | 3     | Worms crawl on their sides, bending dorsoventrally                                  | No head lifts or other 3D head movement                                                                                                         | A 3D body                  |

### Body and environment

| Component                                                 | Level     | Basis                                                                                                                                                                                                                   | Caveats                                                                 | What would raise it                      |
| --------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| Body mechanics (48 elastic units, resistive force theory) | 3         | Boyle, Berri & Cohen 2012                                                                                                                                                                                               | Resistive force theory approximates agar; 2D; no self-contact           | Measured agar mechanics; a 3D body       |
| Agar drag coefficients                                    | 3         | Boyle, Berri & Cohen 2012                                                                                                                                                                                               |                                                                         |                                          |
| Odour field (2-butanone)                                  | 3 / 2 / 0 | Measured diffusion coefficient in air, 0.091 cm² s⁻¹ (Lugg 1968, via Tang et al. 2015) (3); loss rate from Tanimoto et al. 2017's measurements of 2-nonanone (2); a 2D air layer, uniform agar and the release rate (0) |                                                                         | Measured butanone fields on assay plates |
| Food lawn                                                 | 0         | A disc that releases butanone                                                                                                                                                                                           | Real lawns release many odours; no mechanosensation, feeding or slowing |                                          |
| Dish geometry                                             | 3         | Standard chemotaxis layout: 10 cm dish, spots 0.5 cm from the edge (Bargmann, Hartwieg & Horvitz 1993)                                                                                                                  |                                                                         |                                          |

## Omitted biology

- Neuropeptides and monoamines: dopamine, serotonin, tyramine, octopamine and the peptides. With them go slowing on food (Sawin, Ranganathan & Horvitz 2000), dwelling versus roaming (Flavell et al. 2013), and part of the control of reversals and turns.
- Extrasynaptic signalling in general (Bentley et al. 2016; Randi et al. 2023).
- Other senses: temperature, oxygen, CO₂, salt (ASE), pheromones, harsh touch, and nose touch unless it is added as a separate stimulus.
- The pharynx and feeding. The 20 pharyngeal neurons are simulated but drive nothing.
- Glia, gap-junction rectification, individual variation, development and learning.

## Presentation

- Calcium-style glow: model activity filtered through published GCaMP kinetics (Chen et al. 2013). The colour and normalisation are display choices.
- The 3D graph keeps anatomical order but scales the body axis non-uniformly so the head stays readable.
- The camera follows the worm at body scale.

## Parameters

Filled from the registry at milestone 0: every parameter with its value, unit, level and source, and the count of free parameters, meaning those at level 1 or 0.
