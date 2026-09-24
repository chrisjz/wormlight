# Wormlight: Build Spec

A living _C. elegans_ in the browser. The full hermaphrodite connectome runs in real time on the GPU and drives a physically simulated worm on an agar plate. Neurons glow as they activate, in the style of calcium imaging, so you can watch the worm think while it moves.

You are building this from scratch in a new repository. Read this whole document before writing code, then produce a plan (see "Working agreement") and wait for my approval.

## 1. The core rule

**Behaviour must emerge from the connectome.** No scripted animations, no state machines that say "if touched, reverse". The body moves only because motor neurons drive muscles, and motor neurons act only because of network dynamics. If a behaviour cannot be made to emerge honestly, document the gap rather than faking it. A worm that crawls convincingly for the wrong reasons is a failure.

The wiring diagram alone cannot produce these behaviours, so the rule needs a boundary. Crawling depends on rhythm generators inside neurons and on proprioceptive feedback (Ji et al. 2021; Gao et al. 2018; Wen et al. 2012), and chemotaxis on sensory adaptation; none of these is a connection in the connectome. Signal propagation measured in living worms also departs from wiring-based predictions (Randi et al. 2023).

### 1.1 What may sit outside the connectome

Only these layers. Each must be the same for every cell of a class, cited, shared by every brain, and blind to what the worm is doing: nothing outside the network may read "reversing" or "near food".

1. **Sensory transduction and adaptation:** environment to sensory-neuron input.
2. **Proprioception:** local body curvature to input in the neuron classes the literature names: B-type motor neurons (Wen et al. 2012), SMDD head motor neurons (Yeon et al. 2018), and A-type motor neurons as a hypothesis (Gao et al. 2018).
3. **Intrinsic dynamics per neuron class**, only where a source documents them (for example the intrinsic oscillation of A-type motor neurons, Gao et al. 2018).
4. **Neuromuscular transfer and muscle dynamics:** synaptic drive onto muscles to muscle activation.
5. **Noise:** independent, seeded per-neuron noise.

The brain interface sits on this boundary: every brain receives the same sensory and proprioceptive input and drives the same muscles through the same neuromuscular map. Neuromodulation and extrasynaptic signalling are out of scope (§2.4). Adding any other layer is a major deviation (§10).

### 1.2 Guards against hidden scripting

- **Silenced-network test (checkpoint 0).** With every neuron-to-neuron chemical synapse and gap junction silenced, and neuromuscular junctions and every §1.1 layer kept, forward crawling, both touch reflexes and chemotaxis must all disappear. Residual backward activity from A-type motor neurons is expected, since they oscillate without premotor input (Gao et al. 2018). If anything else survives, the glue is producing it.
- **Tuning protocol.** Parameters are global or per neuron class, never per neuron unless a cited source gives a per-neuron value. PLAN.md states how many are free. Tune only against the calibration targets: crawling (checkpoint 1) and the spontaneous reversal rate. Checkpoints 2 to 5 are held out and run with parameters frozen. If a held-out result prompts re-tuning, report that checkpoint as fitted, not emergent.
- **Calibrated or predicted.** VALIDATION.md labels every reported quantity as calibrated (a parameter was tuned to hit it) or predicted (it emerged with parameters frozen).

### 1.3 Fidelity ledger

Every part of the model is tagged with how well biology supports it, so a viewer can tell measured fact from informed guess and a future contributor knows what new research would replace. The scale, defined in `FIDELITY.md`, runs from measured in the worm, through derived, established model, hypothesis or adapted value, and calibrated, down to assumed; parts can also be tagged omitted or presentation-only.

- Keep the tags in a machine-readable registry in the code. Every component, parameter and data element carries a level, its sources, and an upgrade path: what new data or research would raise it. Data elements include each synapse's sign, each neuron's position, and so on.
- Generate `FIDELITY.md` from the registry, and fail CI when the two disagree.
- Surface the same registry in the app. An "About the science" view shows each subsystem's level, and the inspector shows provenance badges, for example "sign predicted from receptor expression (Fenyves et al. 2020)".

## 2. Source data

My existing project, Quantum Nematode (https://github.com/SyntheticBrains/nematode, Python, Apache-2.0; checked out beside this repository at `../nematode`), is the source of truth for connectome data. It is **not** a source of neural model parameters. Its connectome brain is a discrete-time tanh network with a learned readout to (speed, turn), trained on foraging tasks, with no time constants, conductances, muscles or body. Never import its trained weights, or the Creamer et al. fitted weights it vendors, as synaptic strengths. Do not port Python code line by line; port concepts and their parameters.

### 2.1 What to take from nematode

- Cook et al. 2019 hermaphrodite chemical synapses and gap junctions (EM serial-section counts), via `quantumnematode.connectome`.
- Neuron classes and release identities from the Wang et al. 2024 neurotransmitter atlas, with the per-neuron sign rule in `connectome/neurotransmitters.py` as a baseline that §2.3 refines.
- The degree-preserving double-edge-swap rewiring (`connectome/rewiring.py`), for the contrast brain.
- The adaptive chemosensory sensor (`agent/adaptive_sensor.py`, Logbook 028), as the conceptual precedent for the Levy & Bargmann model (§2.3).
- The analytic Fick gradient kernel (`env/env.py`), as a check on the diffusion field.
- Chemotaxis validation: the klinokinesis and weathervane bias-curve method of Logbook 035. Take chemotaxis indices from Bargmann, Hartwieg & Horvitz 1993 directly, because `data/chemotaxis/literature_ci_values.json` misattributes two entries.
- Its provenance practice: pin every input by commit and SHA-256, as `data/connectome/PROVENANCE.md` does.

Logbooks 034, 057, 065, 070 and 071 hold nematode's evidence on the real wiring against rewired nulls. Read them before designing checkpoint 6.

### 2.2 The exporter

Write it in the nematode repo as a separate, reviewable change that follows that repo's process (`AGENTS.md`, OpenSpec). It emits one versioned file:

- neurons: name, class (sensory, inter, motor or pharyngeal), release identity and baseline sign;
- chemical synapses: pre, post and EM count;
- gap junctions: pair and EM count;
- neuromuscular connections. The loader currently discards muscles, but the vendored Cook sheet holds all 95 body wall muscles (24 dorsal-left, 24 dorsal-right, 23 ventral-left, 24 ventral-right). Add a parse path; expect 956 non-zero entries from 162 cells, many of them sensory neurons and interneurons;
- provenance: the nematode commit and input hashes.

Wormlight's own data build merges this export with the sources in §2.3 into the single runtime file the app loads.

### 2.3 Gaps filled from other sources

Record each in `DATA_SOURCES.md` with citation, URL, retrieval date, licence and hash.

- **Soma positions:** the c302 NeuroML2 cell files (`openworm/c302`, `c302/NeuroML2/*.cell.nml`; MIT). The morphologies come from the WormBase Virtual Worm, which its authors released into the public domain (per `openworm/CElegansNeuroML`). The y axis runs from the nose (about −350 µm) to the tail (about +425 µm); normalise to fractional body position.
- **Sensing locations:** the same morphologies. Head sensory neurons sense at their dendrite tips (the nose), and touch receptor neurons along their processes, which give their receptive fields. Never sense at the soma.
- **Synapse signs:** Fenyves et al. 2020 (_PLoS Comput Biol_, CC BY): S1 Data (the WormWiring reconstruction) and the Cook sheet of S5 Data. These are per-connection predictions from transmitter and receptor expression, including CeNGEN, and the two files agree wherever both cover a connection. Together they give a clear sign for 47.5% of Cook's chemical connections (55.6% of synaptic sections) and label others complex or unpredicted. Join them to Cook 2019 by name and report coverage.
- **Sign overrides from the literature**, each cited. Start with AWC→AIY inhibitory (glutamate-gated chloride channels) and AWC→AIB excitatory (AMPA-type receptors), from Chalasani et al. 2007. That paper has a 2016 corrigendum; these findings were upheld. nematode's baseline gets AWC→AIY wrong.
- **Sign cross-check:** compare against the signs of the Creamer et al. fitted weights (MIT, vendored in nematode) on the ~1,049 head connections they cover, and report disagreements.
- **Neuron and synapse parameters:** Kunert, Shlizerman & Kutz 2014 (_Phys Rev E_), as implemented in Neural Interactome (Kim, Leahy & Shlizerman 2019; code BSD-3-Clause, `initialize.py`). Reversal potentials and sigmoid width trace to Wicks, Roehrig & Rankin 1996. Use the published time constants (C = 1 pF, a_r = 1 s⁻¹, a_d = 5 s⁻¹, as restated by Kunert-Graf et al. 2017); Neural Interactome's code runs the same model 1.5× slower. That model was tuned on Varshney et al. 2011 synapse counts. Cook's section counts run several times larger, by different factors for chemical synapses and gap junctions (roughly 3× and 6× in total), so rescale per connection type before applying its per-unit conductances.
- **Body, muscles and proprioception:** Boyle, Berri & Cohen 2012, Tables 1–3. That gives 48 body units, agar drag C∥ = 3.2×10⁻³ and C⊥ = 128×10⁻³ kg s⁻¹ (ratio about 40; whole-worm values, split per rod as the authors' code does), and a 100 ms muscle time constant. Its proprioception, from the B neuron's own and posterior body over half a body length, is not used: Wen et al. 2012 found the coupling runs the other way. Each region's B-type neurons respond to bending of the region in front, over about 200 µm.
- **Sensory kinetics:** Levy & Bargmann 2020's adaptive threshold for AWC-ON (K = 5.5 µM, τ = 17 s, from the authors' code), with nematode's sensor as the conceptual precedent. Kato et al. 2014 show AWC tracking odour changes with subsecond precision while ASH integrates over seconds.
- **Behavioural reference data:**
  - crawling frequency and wavelength on agar (Fang-Yen et al. 2010; Berri et al. 2009);
  - posture space, the eigenworms of Stephens et al. 2008;
  - spontaneous reversals and navigation-circuit ablations (Gray, Hill & Bargmann 2005);
  - the touch circuit and its ablations (Chalfie et al. 1985).

Don't vendor the Randi et al. 2023 functional atlas: its OSF deposit states no licence, and the `wormneuroatlas` copy is GPL-3.0. Cite it and use it only as an external cross-check.

### 2.4 Known gaps: document, don't research

- **Rhythm generation is unresolved.** Candidates are a proprioceptive reflex chain (Wen et al. 2012), distributed oscillators (Fouad et al. 2018), and A-type motor neurons that oscillate intrinsically during backward locomotion (Gao et al. 2018). Implement one documented hypothesis. The network alone can't supply the rhythm: with fixed thresholds it settles to a stable fixed point (Kunert-Graf et al. 2017), and proprioception alone produces no rhythm in any precedent. The default is documented rhythm generators, and the network decides which of them run:
  - a proprioceptive relaxation switch in the head (Ji et al. 2021; SMDD, Yeon et al. 2018);
  - intrinsic oscillators in B- and A-type motor neurons (Fouad et al. 2018; Xu et al. 2018; Gao et al. 2018);
  - Wen et al. 2012's front-to-back coupling, which carries the wave.

  A delayed proprioceptive loop is the first fallback. Name the hypothesis in the app's explanation and don't present it as settled.

- **Extrasynaptic signalling** (neuropeptides, monoamines; Bentley et al. 2016; Randi et al. 2023) is out of scope, and so are the behaviours that depend on it (§5).
- **Synaptic strength:** the EM count is assumed to map linearly onto strength.
- **Uncertain signs:** connections with complex or unpredicted signs get a documented default, and a sensitivity toggle in the harness.
- **Individual variation:** the data describe one animal, and connectomes vary between individuals (Witvliet et al. 2021).

### 2.5 Prior art

Read these before planning, and say in PLAN.md what Wormlight reuses and what it adds:

- Neural Interactome (Kim, Leahy & Shlizerman 2019): an interactive whole-connectome simulation with ablation.
- Kim et al. 2025 (arXiv 2504.18073; code `shlizee/modWorm`): connectome, neural dynamics, muscles and biomechanics. Its unfitted base model walked forward and backward after a brief pulse into sensory neurons, sustained by a ~0.5–0.6 s delayed feedback of the network's own activity rather than body sensing. A later genetic-algorithm tuning of 5,146 synapse scale factors was optional. The delayed closed loop is the lesson worth keeping; it is the first fallback in §2.4.
- Ji et al. 2021 (_eLife_ 10:e69905): a relaxation-oscillator model of the head's locomotor rhythm, switched by proprioceptive thresholds and fitted to phase-response data.
- Fieseler, Kunert-Graf & Kutz (arXiv 1707.05359): extends Boyle, Berri & Cohen's model with A- and B-class circuits, and suppresses proprioception to produce omega turns. The connectome is left as future work.
- BAAIWorm (_Nature Computational Science_, 2024): a closed brain–body–environment loop.

## 3. Tech constraints

- Raw WebGPU with WGSL compute and render shaders. No Three.js, Babylon, or other engines.
- TypeScript, built with Vite, deployed as a static site to GitHub Pages through GitHub Actions, as `chrisjz/universe` does; deployment stays off while the repository is private. Minimal runtime dependencies; justify each one.
- Neural simulation and body physics both run in GPU compute passes. The CPU orchestrates, handles input, and draws UI. At this scale (about 300 neurons, about 50 body units) the GPU is a showcase choice rather than a performance need; the CPU reference (§8) is the scientific ground truth.
- Target: steady 60 fps on an Apple M-series laptop in Chrome and Safari, with simulation running at least real time. PLAN.md also sets a fast-forward target sized so a typical chemotaxis run (minutes to an hour of worm time) plays in a couple of minutes.
- If WebGPU is unavailable, show a clear, well-designed message. No silent failure and no WebGL fallback.

## 4. Neural model

- **Model:** most _C. elegans_ neurons use graded potentials rather than classic spikes. Default to the graded, conductance-based model of Kunert et al. 2014 (§2.3): leaky membranes, gap junctions (bidirectional, conductance-based), and chemical synapses with sigmoidal activation and a sign from §2.3. Each neuron's threshold is set at the intact network's equilibrium with no input, and lesions leave it unchanged; Neural Interactome instead recomputes it from the current input, which is kept only for the port check.
- **Integration:** use a fixed simulation timestep decoupled from frame rate, with multiple substeps per frame as needed. The source uses an adaptive stiff (BDF) solver, and strong gap-junction coupling can make the model stiff. Choose an integrator that stays stable and accurate at a fixed step, and check it against a high-accuracy solve in the CPU reference. Per-neuron exponential Euler is stable but rings on strongly coupled pairs, so PLAN.md uses a second-order linearly implicit scheme.
- **Noise:** add seeded per-neuron noise (§1.1), with its magnitude calibrated to the spontaneous reversal rate (Gray et al. 2005). Without it there are no spontaneous reversals and no trial-to-trial variation.
- **Parameters** come from §2.3. Anything you tune yourself goes in a single config file with a comment explaining why, and counts toward the free-parameter total (§1.2).
- **Architecture interface:** define the brain as a clean interface on the §1.1 boundary so architectures can be swapped at runtime.
  - Ship the connectome model as the default.
  - Ship one contrast: the same model on a degree-preserving rewiring of its chemical synapses, with gap junctions, sensory and motor identities and the neuromuscular map held fixed.
  - A generic recurrent network is optional. If included, it gets the same tuning procedure and budget.
- **The point is to let a viewer test whether the real wiring matters, not to show that it does.** nematode found no difference between the real wiring and its rewired nulls without learning. Under PPO it found faster learning, but that advantage depends on modelling choices (§2.1). Report whatever Wormlight finds.

## 5. Body and environment

- **Body:** a 2D worm on an agar surface, rendered with enough depth and lighting to feel physical. Model it as a chain of segments (Boyle et al. 2012 use 48). The worm crawls on its side, so bending is dorsoventral: collapse the four muscle quadrants into a dorsal side (48 muscles) and a ventral side (47), driven through the neuromuscular map (§2.2).
- **Locomotion physics:** use resistive force theory (anisotropic drag, higher perpendicular to the body than along it) with the agar coefficients from §2.3, so undulation produces forward thrust. Motion must come from this, not from moving the worm along a path. If you tune a physics parameter, the crawling metrics it affects count as calibrated, not predicted (§1.2).
- **Environment:** a petri dish with a bacterial food lawn and a diffusing attractant. The lawn, and any source the user drops, release 2-butanone, which is sensed by AWC-ON alone (Wes & Bargmann 2001). Killing AWC removes almost all chemotaxis to it (Bargmann, Hartwieg & Horvitz 1993), so an AWC-only model can in principle reproduce it. AWC's circuit is one of the best-characterised navigation circuits (Chalasani et al. 2007; Gray et al. 2005), with measured sensory kinetics (§2.3).
  - Odour spreads through the air across a dish within minutes, so a live diffusion field stays honest on interactive timescales. A salt gradient would take hours to form.
  - Model it as 2D diffusion with a cited effective coefficient, document the simplification, and check the field against nematode's Fick kernel.
- **Sensing:** sensory neurons sample the environment at their sensing locations (§2.3), not their somas.
- **Scale:** the worm is about 1 mm long on a 10 cm dish, the standard chemotaxis plate (Bargmann, Hartwieg & Horvitz 1993), so the plate view follows the worm at body scale, with the whole dish as context.
- **Food behaviours** that depend on neuromodulation won't emerge. These include slowing on food (dopamine; Sawin, Ranganathan & Horvitz 2000) and dwelling versus roaming (serotonin and PDF; Flavell et al. 2013). Say so in the app and README, and don't add them.

## 6. Interaction

- **Touch:** tap the body to stimulate the touch receptor neurons whose receptive field covers that point: ALM and AVM anteriorly, PLM posteriorly (fields from §2.3). Nose touch (ASH, FLP, OLQ) is a different circuit; if included, make it a separate stimulus.
- **Food:** click to drop or drag an odour source.
- **Lesion:** select any neuron in the neural view and ablate it (laser ablation, as in real experiments). Allow restoring.
- **Brain swap:** switch architectures live.
- **Time:** pause, slow motion, and fast forward.
- **Inspect:** hover or tap a neuron for name, class, current activity, and its strongest connections.
- **Shareable URL:** encode lesions, brain, food positions, random seed, and model and data version, so people can link to an experiment. A link reproduces the setup, but the trajectory can differ across GPUs; the app says so.

## 7. Visualisation

- **Views:** split or overlaid, showing the worm on the plate and a 3D rotatable graph of all 302 neurons positioned anatomically. Over half the neurons sit in the head and the body is long and thin. Keep anatomical order, but use a layout that keeps the head readable (for example non-uniform scaling along the body axis, or focus plus context). With about 4,800 connections, never draw them all at once; show the active or selected ones.
- **Glow:** render neuron activity as a calcium-imaging-style glow (think GCaMP green on dark), with active synapses faintly lit. Filter model activity through published GCaMP kinetics (e.g. Chen et al. 2013). Label it as simulated, never as imaging data, and document how it is normalised.
- **Glow on the body:** the worm body itself can optionally show neuron glow in place, so activity maps onto anatomy.
- Visual quality matters as much as correctness. This should look like a piece of science communication you'd want to share, not a debug view. Restrained palette, excellent typography, no clutter.

## 8. Validation checkpoints

Build a headless test harness that runs the simulation without rendering. Implement a CPU reference of the neural, body, sensory and environment update.

- **Ground truth:** the CPU reference is the scientific ground truth, and all behavioural trials run on it.
- **GPU parity:** check the GPU against it step by step, from identical state and over short horizons, within a stated tolerance. Compare long runs by behavioural statistics, because floating-point differences grow in multistable dynamics.
- **Port check, before anything else:** run on Neural Interactome's own connectome files and parameters, before any rescaling to Cook 2019. The CPU reference must reproduce its responses to its stimulation presets, for example the oscillation Kunert et al. 2014 report for PLM stimulation.
- **Thresholds fixed in advance:** before any tuning, PLAN.md fixes each checkpoint's metric, trial count and pass/partial/fail thresholds, with citations, for my approval. Log any later change in DECISIONS.md with the reason, and mark the checkpoint as changed.

Use the harness to test these behaviours, which must emerge rather than be coded. Published expectations are cited where known; verify them, and find and cite the rest. Where you can only approximate, say so in VALIDATION.md with your reasoning.

0. **Silenced network:** the test in §1.2.
1. **Undulatory crawling:** sustained sinusoidal forward locomotion, with body wave frequency and wavelength in the range reported for agar (Fang-Yen et al. 2010; Berri et al. 2009), and postures that project well onto the four eigenworms of Stephens et al. 2008.
2. **Anterior touch reflex:** touch in the anterior receptive field triggers backward movement (reversal) within a plausible latency.
3. **Posterior touch reflex:** touch in the posterior field triggers or accelerates forward movement.
4. **Chemotaxis:** over repeated randomised trials, measure a chemotaxis index against published population values (Bargmann, Hartwieg & Horvitz 1993). Measure the mechanism too: klinokinesis and weathervane bias curves as in nematode's Logbook 035 (Pierce-Shimomura et al. 1999; Iino & Yoshida 2009). Compare each with sensory input disabled.
5. **Lesion effects:** ablating key command interneurons (e.g. AVA for reversals, AVB for forward drive) degrades the corresponding behaviour in the direction the literature reports (Chalfie et al. 1985; Gray et al. 2005).
6. **Wiring test:** give the rewired-null brain the same tuning procedure and budget, then gate it on checkpoint 1; if it can't be made to crawl, that is the result. If it crawls, run checkpoints 2 to 5 on it and report the difference against the thresholds fixed in advance, whichever way it falls.

Report results for each checkpoint as pass, partial, or fail, and label each quantity calibrated or predicted (§1.2). Honest partials beat tuned-to-pass fakes.

## 9. Deliverables

- The app, deployable as a static site.
- `README.md`: what it is, how to run it, and a short explanation of the science, including the modelling hypothesis and what the model leaves out. It also needs a credit line naming where the data came from: "Connectome: Cook et al. 2019. Neurotransmitter identities: Wang et al. 2024. Exported via Quantum Nematode", with links.
- `VALIDATION.md`: checkpoint results, methods, known simplifications.
- `FIDELITY.md`: the fidelity ledger (§1.3), generated from the registry.
- `DATA_SOURCES.md`: every dataset, citation, and licence.
- `DECISIONS.md`: a running log of significant design choices and why.
- Licence: Apache-2.0 for the code. Bundled data keeps its original notices and attribution requirements, listed in `DATA_SOURCES.md` and shipped with the site.

## 10. Working agreement

1. **Plan first.** Before coding, write `PLAN.md` and stop for my review. It covers:
   - the architecture;
   - the neural model equations and integrator;
   - the physics approach;
   - the §1.1 layers with their sources;
   - the free-parameter count;
   - the thresholds fixed in advance (§8);
   - the fidelity registry design (§1.3);
   - the data format;
   - the milestones.
2. **Milestones**, each ending in a working, committed state:

   0. Feasibility spike, CPU only. Build the exporter and data build, the neural model with the port check, the rhythm generators, the body with proprioception, and checkpoint 0. The question to answer: does the connectome-driven body crawl? Stop for a go/no-go with me. If it can't crawl, we choose the fallback together.
   1. Neural graph rendered and inspectable.
   2. Neural simulation on GPU, matching the CPU reference.
   3. Body physics on GPU with motor output driving crawling (checkpoint 1).
   4. Sensory input, touch, and food (checkpoints 2 to 4).
   5. Lesions, brain swap, and checkpoints 5 and 6.
   6. Visual polish, shareable URLs, performance pass, docs.

3. After each milestone, summarise what works, what doesn't, and checkpoint status.
4. Ask me before any major deviation from this spec; adding a layer outside §1.1 counts as one. For smaller calls, decide, log it in `DECISIONS.md`, and keep going.
5. When you're unsure whether something is scientifically accurate, say so. Do not invent citations. The citations here were checked when this spec was written; still verify details against each source before relying on them.
