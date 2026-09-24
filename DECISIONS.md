# Decisions

A running log of significant design choices and why (spec §9). Newest last. Each entry says what was decided, why, what else was considered, and whether it still needs the maintainer's sign-off.

## 2026-09-24 — Tooling and deployment mirror `chrisjz/universe`

**Decision.** Vite, strict TypeScript, ESLint (type-checked), Prettier, Husky with lint-staged, and one CI workflow with a Pages deploy job, as in Universe Atlas. Vitest is added for the CPU reference.
**Why.** Same maintainer, same stack (raw WebGPU, static site), and Universe already solves GPU-less CI (headless Chrome on Mesa lavapipe).
**Status.** Done on `main`.

## 2026-09-24 — TypeScript 6.0, not 7

**Decision.** Pin `typescript@~6.0.3`.
**Why.** typescript-eslint 8.70 supports TypeScript below 6.1, and type-checked linting is a CI gate. Revisit when typescript-eslint supports the native TypeScript 7.
**Status.** Done.

## 2026-09-24 — Pages deploy is gated while the repository is private

**Decision.** The deploy job runs only when the repository variable `DEPLOY_PAGES` is `true`. `BASE_PATH` defaults to `/wormlight/`.
**Why.** A Pages site is public even when its repository is private.
**Status.** Done. To go live, enable Pages (Source: GitHub Actions) and set `DEPLOY_PAGES=true`.

## 2026-09-24 — Synapse signs come from a four-step hierarchy

**Decision.** Each chemical connection takes its sign from the first source that has one:

1. a cited physiology result (level 5), for example AWC→AIY inhibitory;
2. Fenyves et al. 2020's expression-based prediction on the Cook connectome (level 4);
3. the presynaptic transmitter rule, with acetylcholine and glutamate excitatory and GABA inhibitory (level 0);
4. otherwise no fast effect (level 0).

Each connection records which step set its sign, and the harness has a toggle that treats step-4 connections as excitatory instead.

**Why.** Fenyves predicts a clear sign for 1,545 of Cook's 3,709 chemical edges (42% of edges, 49% of synaptic sections), and marks another 370 as complex. 495 edges (13%) have no basis for a sign at all, mostly from aminergic or unidentified neurons. The transmitter rule and Fenyves disagree on 310 edges; the rule is the weaker evidence.
**Status.** Needs sign-off (PLAN.md §3.3).

## 2026-09-24 — Rescale Cook's counts to the Neural Interactome conductance units

**Decision.** Multiply Cook's EM section counts by 0.3426 for chemical synapses and 0.2087 for gap junctions before applying the per-unit conductances of Kunert et al. 2014.
**Why.** Over the 279 neurons both datasets share, Cook's counts total 2.92× (chemical) and 4.79× (gap junction) Varshney's, the counts the model was tuned on. Matching the totals per connection type keeps the chemical-to-electrical balance the model was built with. The factors are level 2 (adapted).
**Status.** Needs sign-off.

## 2026-09-24 — Voltages are solved implicitly, not with per-neuron exponential Euler

**Decision.** Each step solves the membrane equation implicitly: leak, gap-junction and synaptic conductances go on the left, and the sparse symmetric system is solved by conjugate gradients. Synaptic activation then advances exactly for the new voltage.
**Why.** The model is very stiff. With Cook's weights, ALA's gap junctions with CANL/R and PVDL/R (1,314 sections, along processes that run side by side down the body) give a membrane time constant near 0.05 ms. That figure also shows how much the "strength ∝ section count" assumption carries. Per-neuron exponential Euler, the spec's example, is stable but leaves the difference mode of a strongly coupled pair ringing at the step rate. The source model used a stiff BDF solver.
**Status.** Needs sign-off. M0 compares the scheme against a BDF reference to choose the step (target 1–5 ms).

## 2026-09-24 — A neuron's threshold is set once, at rest

**Decision.** Each neuron's sigmoid threshold is the network's equilibrium voltage with no external input, recomputed after lesions. Neural Interactome's behaviour, which recomputes thresholds whenever the input changes, is kept only for the port check.
**Why.** In a closed loop the input never stops changing. A threshold that moves with the input would cancel slow sensory signals: a hidden, perfect adaptation that no source documents.
**Status.** Needs sign-off. Level 2 (hypothesis).

## 2026-09-24 — Stimulus strengths are target depolarisations

**Decision.** Touch and other stimuli are specified as how far they push the receptor above rest (touch: 10 mV for 500 ms), converted to current from the receptor's input conductance.
**Why.** Neural Interactome's preset amplitudes only make sense because it recomputes thresholds around the input. Taken literally, they come to nanoamps into a 10 pS leak.
**Status.** Level 0, fixed in advance.

## 2026-09-24 — The attractant is 2-butanone, sensed by AWC-ON

**Decision.** The lawn and user-dropped sources release 2-butanone. Only the AWC-ON neuron responds, and each worm draws at random whether that is the left or right AWC.
**Why.**

- An AWC-only model can in principle reproduce butanone chemotaxis. Killing AWC drops it from about 0.77 to 0.16, against a 0.11 baseline, while isoamyl alcohol keeps about half its response (Bargmann, Hartwieg & Horvitz 1993, Fig. 5, read from the figure).
- Butanone's diffusion coefficient in air is measured.
- Levy & Bargmann 2020's adaptive-threshold parameters are in butanone units.
- AWC-ON senses butanone (Wes & Bargmann 2001), and which AWC is ON is random (Troemel, Sagasti & Bargmann 1999).

**Status.** Needs sign-off. It narrows the spec's "an odour sensed by AWC (and AWA)", and the spec is updated to match.

## 2026-09-24 — Proprioception runs front to back, as Wen et al. 2012 measured

**Decision.** Each VB (DB) neuron receives a current proportional to the ventral (dorsal) curvature of the ~200 µm of body in front of its muscle field. A-type neurons get none.
**Why.** Wen et al. 2012 found that posterior regions "are compelled to bend in the same direction and shortly after the bending of the neighboring anterior region". Boyle, Berri & Cohen 2012 integrate the neuron's own and posterior body over half its length instead; their authors note that B-type axons don't reach that far. No source gives evidence for proprioception in A-type neurons.
**Status.** Needs sign-off. It replaces the spec's Boyle default, and the spec is updated to match.

## 2026-09-24 — The head rhythm is expected from the network; milestone 0 tests it

**Decision.** v1 adds no oscillator. The hypothesis is that the network's own dynamics generate the head rhythm under tonic drive, as Kunert, Shlizerman & Kutz 2014 found when stimulating PLM, and that proprioception carries it down the body.
**Why.** No precedent gets a rhythm from proprioception alone. Boyle et al. needed bistable neurons and a ventral bias, and Wen et al. assume a rhythm starting at the head. If the network can't supply it, the fallback menu adds documented intrinsic dynamics.
**Status.** Level 2 (hypothesis). Tested at the milestone 0 go/no-go.

## 2026-09-24 — The chemotaxis index is Bargmann's endpoint count

**Decision.** Checkpoint 4 simulates Bargmann, Hartwieg & Horvitz 1993's assay. Worms stop within 0.5 cm of either spot, as sodium azide makes them, and CI = (at odour − at control) / total after 60 minutes.
**Why.** That's how the literature values were measured. nematode's `literature_ci_values.json` uses a time-in-zone index, and two of its entries are misattributed: Bargmann et al. 1993 tested volatile odorants, not bacteria, and Pierce-Shimomura et al. 1999 used ammonium chloride and biotin, not a food gradient. Those should be fixed in nematode.
**Status.** Done in PLAN.md §7.
