# Decisions

A running log of significant design choices and why (spec §9). Each entry says what was decided, why, what else was considered, and whether it still needs the maintainer's sign-off. Entries revised after the multi-agent review of PR #1's first draft say so.

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

## 2026-09-24 — Synapse signs come from a four-step hierarchy (revised after review)

**Decision.** Each chemical connection takes its sign from the first source that has one:

1. a cited physiology result (level 5), for example AWC→AIY inhibitory;
2. Fenyves et al. 2020's expression-based prediction, from S1 Data (the WormWiring reconstruction) and the Cook sheet of S5 Data together (level 4);
3. the presynaptic transmitter rule, with acetylcholine and glutamate excitatory and GABA inhibitory (level 0);
4. otherwise no fast effect (level 0).

Each connection records which step set its sign. The harness reruns the checkpoints with steps 3 and 4 set four ways: by the rule (default), all excitatory, all silent, and ten random-sign draws.

**Why.** The two Fenyves files agree on all 3,121 connections they share. Together they give a clear sign for 1,763 of Cook's 3,709 chemical edges, 47.5% of edges and 55.6% of synaptic sections. The first draft used S5 alone and signed 218 fewer. The rule disagrees with Fenyves on about a fifth of the edges where both give a sign, so it gets the sensitivity check the spec asks for.
**Status.** Needs sign-off (PLAN.md §2.4).

## 2026-09-24 — Rescale Cook's counts to the Neural Interactome conductance units (revised after review)

**Decision.** Multiply Cook's EM section counts by 0.3444 for chemical synapses and 0.2055 for gap junctions before applying the per-unit conductances of Kunert et al. 2014. The factors live in `src/science/params.ts` only.
**Why.**

- Over the 279 neurons both datasets share, Cook's totals are 2.90× Varshney's for chemical synapses (excluding Cook's autapses, which Neural Interactome's matrices lack) and 4.87× for gap junctions, using Emmons 2024's corrected gap junctions (4.79× on the 2019 original).
- Matching totals keeps the chemical-to-electrical balance the model was built with. It does leave connections the datasets share at about 0.63× (gap) and 0.69× (chemical) their Neural Interactome strength, so the harness also reports shared-connection scales (0.33 gap, 0.50 chemical).
- The factors are level 2 (adapted).

**Status.** Needs sign-off.

## 2026-09-24 — Voltages and activation are integrated at second order (revised after review)

**Decision.** Each step solves the membrane equation with BDF2, conductances on the left and synaptic activation extrapolated, then advances activation with BDF2 at the new voltages. The target step is 2.5 ms.
The conjugate-gradient solve:

- uses a Jacobi preconditioner;
- stops at a relative residual of 10⁻⁶ on the CPU and 10⁻⁵ on the GPU;
- is capped at 64 iterations, with a reported flag.

**Why.**

- **Stiffness.** With Cook's weights, ALA's gap junctions give a membrane time constant near 0.05 ms. ALA has 1,314 sections across ten partners, 1,302 of them with CANL/R and PVDL/R along processes that run side by side down the body.
- **Why not per-neuron exponential Euler** (the spec's example). It rings on strongly coupled pairs.
- **Why not the first draft's scheme.** Implicit Euler with activation split off at first order failed the port check for the AVA preset at every step from 1 to 5 ms. Upgrading only the voltage solve to BDF2 stays first order; making both variables second order measured order 2.0 and passed all four presets at 2.5 ms.

**Status.** Needs sign-off.

## 2026-09-24 — A neuron's threshold is set at rest, and lesions don't move it (revised after review)

**Decision.** Each neuron's sigmoid threshold is its voltage at the intact network's equilibrium, with no external input and oscillators off. A rewired brain gets its own, from its own wiring. A lesion leaves every threshold where it was. Neural Interactome's behaviour, which recomputes thresholds whenever the input changes, is kept only for the port check.
**Why.**

- **Inputs.** In a closed loop the input never stops changing. A threshold that moved with it would cancel slow sensory signals: a hidden, perfect adaptation that no source documents.
- **Lesions.** The first draft recomputed thresholds after a lesion, which is the same hidden compensation. It re-centred every survivor and erased the loss of command-interneuron drive the lesion checkpoint is meant to test.
- **Level** 2 (hypothesis).

**Status.** Needs sign-off.

## 2026-09-24 — Stimulus strengths are target depolarisations, computed once (revised after review)

**Decision.** Touch is a current step that holds the receptor 10 mV above rest for 500 ms. The current is computed once, from the receptor's input conductance in the intact real wiring, and applied unchanged to every brain and lesion.
**Why.**

- **Can't borrow Neural Interactome's amplitudes.** Its preset amplitudes only make sense because it recomputes thresholds around the input; taken literally they come to nanoamps into a 10 pS leak.
- **Computed once.** The first draft left open whose conductance to use. Computed per brain, the same tap would inject 0.33–3.5× different currents across rewirings and 24–37% less after lesions.

**Status.** Level 0, fixed in advance.

## 2026-09-24 — The attractant is 2-butanone, sensed by AWC-ON (revised after review)

**Decision.** The lawn and user-dropped sources release 2-butanone. Only the AWC-ON neuron responds, and each worm draws at random whether that is the left or right AWC.
**Why.**

- An AWC-only model can in principle reproduce butanone chemotaxis. In Bargmann, Hartwieg & Horvitz 1993's single-animal assays (Fig. 5, read from the figure), 0.77 of intact animals scored positive, against 0.16 with AWC killed and a false-positive rate of 0.11. The first draft wrongly called those numbers chemotaxis indices. Isoamyl alcohol keeps about half its response without AWC.
- Butanone's diffusion coefficient in air is measured.
- Levy & Bargmann 2020's adaptive-threshold parameters are in butanone units.
- AWC-ON senses butanone (Wes & Bargmann 2001), and which AWC is ON is random (Troemel, Sagasti & Bargmann 1999).

**Status.** Needs sign-off. The spec is updated to match.

## 2026-09-24 — Proprioception runs front to back, as Wen et al. 2012 measured (revised after review)

**Decision.** Each VB (DB) neuron receives a current proportional to the ventral (dorsal) curvature of the ~200 µm in front of its muscle field. Each VA (DA) neuron receives the mirror image, from behind its field. One gain serves both.
**Why.**

- **Wen's direction.** Wen et al. 2012 found that posterior regions "are compelled to bend in the same direction and shortly after the bending of the neighboring anterior region".
- **Not Boyle's.** Boyle, Berri & Cohen 2012 integrate the neuron's own and posterior body over half its length, and their authors note that B-type axons don't reach that far.
- **A-type coupling is a level-2 hypothesis.** There is no direct evidence for proprioception in A-type neurons. But Gao et al. 2018 infer motor neurons are "likely proprioceptive", since the A-type rhythm is about 5× faster in crawling than in glued animals. The first draft's "no evidence" overstated this.

**Status.** Needs sign-off. The spec is updated to match.

## 2026-09-25 — The rhythm comes from documented generators (replaces "the head rhythm is expected from the network")

**Decision.** Three kinds of rhythm generator:

- **The head:** a proprioceptive relaxation switch in the SMD head motor neurons (Ji et al. 2021; Yeon et al. 2018).
- **Forward:** intrinsic oscillators in B-type motor neurons that need AVB's drive (Fouad et al. 2018; Xu et al. 2018).
- **Backward:** intrinsic oscillators in A-type motor neurons that run without drive (Gao et al. 2018).

The oscillator is a minimal FitzHugh–Nagumo form, which is ours (level 0), since no published parameterised model of these cells exists. The network decides which generators run, through AVB's and AVA's documented synapses. A delayed proprioceptive loop is the first fallback.
**Why.**

- **The network can't supply the rhythm.** The review showed that with thresholds fixed at rest, both the Varshney and the Cook-scaled networks settle to a stable fixed point under constant drive. Kunert's PLM oscillation exists only because Neural Interactome moves thresholds with the input. Kunert-Graf et al. 2017: "In the absence of constant stimulus, the neural state will collapse onto a static, stable fixed point".
- **The evidence places the generators** near the head (Ji et al. 2021, a relaxation oscillator fitted to phase-response data) and in ventral-cord motor neurons for both directions. Proprioception's evidence is for propagation and entrainment.

**Status.** The maintainer approved documented generators as the default, with the delayed loop as first fallback, on 2026-09-25. The head switch's placement in SMD, which came from a later literature check, needs sign-off.

## 2026-09-24 — The chemotaxis index is Bargmann's endpoint count

**Decision.** Checkpoint 4 simulates Bargmann, Hartwieg & Horvitz 1993's assay. Worms stop within 0.5 cm of either spot, as sodium azide makes them, and CI = (at odour − at control) / total after 60 minutes.
**Why.** That's how the literature's population values were measured. nematode's `literature_ci_values.json` uses a time-in-zone index, and two of its entries are misattributed: Bargmann et al. 1993 tested volatile odorants, not bacteria, and Pierce-Shimomura et al. 1999 used ammonium chloride and biotin, not a food gradient. Those should be fixed in nematode.
**Status.** Done in PLAN.md §7.

## 2026-09-25 — Neural time constants are Kunert's published values

**Decision.** C = 1 pF, G_c = 10 pS, a_r = 1 s⁻¹ and a_d = 5 s⁻¹, as Kunert-Graf et al. 2017 restate from Kunert, Shlizerman & Kutz 2014.
**Why.** Neural Interactome's code uses 1.5 pF with both rates divided by 1.5, which is the same model run 1.5× slower, and no source gives those values. The first draft credited them to Varshney and Kunert. The port check can't see a uniform time rescale, so the time scale has to rest on the publication. Neural Interactome's values stay in its own mode, for the port check.
**Status.** Needs sign-off.

## 2026-09-25 — Neuromuscular signs follow the muscle's receptors, in one shared layer

**Decision.** Acetylcholine excites muscle and GABA inhibits it. A cell releasing neither has no fast effect, with a harness toggle that applies the transmitter rule instead. The neuromuscular map lives in a layer shared by every brain; brains output synaptic activation, not muscle drive.
**Why.**

- **Receptors.** Body wall muscle responds through one GABA and two acetylcholine receptors (Richmond & Jorgensen 1999).
- **The gap.** The first draft left 32 of the 162 cells that synapse onto muscle unsigned: 366 of 5,515 sections, 15% of head-muscle input, including IL1 and RIM.
- **One layer.** Sharing it makes "every brain drives the same muscles" true by construction.

**Status.** Level 4 (derived). Done in PLAN.md §4.4.

## 2026-09-25 — The contrast brain rewires chemical synapses only

**Decision.** The primary null for checkpoint 6 is a degree-preserving double-edge swap of the chemical graph. Each directed connection keeps its section count and sign at its presynaptic end. Autapses, gap junctions and the neuromuscular map are unchanged. Rewired connections are badged "rewired", never with a physiology source. A secondary null also rewires gap junctions, and is reported without verdicts.
**Why.** "Keeps its sign at its presynaptic end" means nothing for an undirected gap junction. nematode's undirected swap moves strength with the edges: ALA's 1,314 sections leave ALA, and half the neurons' gap-junction totals change by more than 50%. A verdict could then reflect where four outlier junctions land. It also deleted all 38 autapses.
**Status.** Needs sign-off.

## 2026-09-25 — One tuning procedure for every wiring

**Decision.**

- **Procedure.** The calibrated parameters are tuned by CMA-ES, with a fixed objective (crawling kinematics and the spontaneous reversal rate), fixed evaluation trials and seeds, and a budget of 400 evaluations. This applies identically to the real wiring and every null.
- **Crawl gate.** A null "crawls" if it reaches at least partial on checkpoint 1.
- **Verdicts.** Checkpoints 2–5 are compared among crawling nulls only.

**Why.** The first draft promised the nulls "the same procedure and budget" without defining either, while the real wiring would have been tuned by hand. It also scored non-crawling nulls as failing everything, which biased the headline result toward "wiring matters".
**Status.** Needs sign-off (PLAN.md §7.3, §7.4).

## 2026-09-25 — Noise is a white-noise current with a defined intensity

**Decision.** Noise intensity σ_n is in pA·√s. Each step draws with standard deviation σ_n/√dt, from a counter-based hash turned into a uniform strictly inside (0, 1), then Box–Muller.
**Why.** A fixed per-step standard deviation, as in the first draft, makes noise power at behavioural time scales proportional to the step size, so a σ calibrated at one step would be wrong at another. The uniform transform must exclude 0 and 1, or Box–Muller takes log(0).
**Status.** Done in PLAN.md §3.5.

## 2026-09-25 — The odour field's loss rate is an assumption, and the harness precomputes the field

**Decision.** The first-order loss is set so the steady decay length is 3 cm (level 0, fixed in advance). The app steps the field explicitly on the GPU in sub-steps of at most 4 ms. The harness computes it once per layout and shares it across trials.
**Why.**

- **Not a measured loss rate.** The first draft took Tanimoto et al. 2017's 0.84 min⁻¹ as one. It is the near-source intercept of a distance-dependent saturation rate in a phenomenological fit for 2-nonanone, falling to 0.08 min⁻¹ at 4.5 cm.
- **Stability.** The explicit limit on the 0.4 mm grid is 4.4 ms.
- **Cost.** The field doesn't depend on the worm, so recomputing it per trial would waste about a fifth to half of every chemotaxis trial.

**Status.** Level 0. Done in PLAN.md §5.2.

## 2026-09-25 — AWC's transduction is bounded and anchored by a removal step

**Decision.** `I_AWC = g_AWC · (T − C)/(T + C)`, with `g_AWC` set so that removing odour from the adapted start concentration depolarises AWC by 16 mV. The odour release rate is set so the steady concentration at the 0.5 cm capture radius equals K.
**Why.** Levy & Bargmann model only the threshold crossing, so the transduction form is ours (level 0). The first draft's linear form was unbounded, driving AWC hundreds of millivolts below rest near a source, and its gain anchor ("the plate's typical concentration") was undefined, which left the gain uncertain by 5–12×. The bounded form makes the gain nearly independent of the anchor.
**Status.** Level 0. Done in PLAN.md §4.1.

## 2026-09-25 — The dish is 10 cm

**Decision.** The standard chemotaxis plate: a 10 cm dish, with spots 0.5 cm from the edge.
**Why.** Bargmann, Hartwieg & Horvitz 1993 ("Assay plates were 10 cm tissue culture dishes"), whose indices checkpoint 4 compares against. The spec's "60–90 mm" predates the choice of assay.
**Status.** The spec is updated to match.

## 2026-09-25 — The free-parameter budget rises to 14

**Decision.** At most 14 values we set ourselves, all global or per class. Currently eight are calibrated and six fixed in advance.
**Why.** The documented rhythm generators need a head-switch gain and three shared oscillator parameters. The review also found the lawn diameter and the odour decay length uncounted.
**Status.** The maintainer approved "about 14" on 2026-09-25.

## 2026-09-25 — The fast-forward target is 10× real time

**Decision.** Sustained 10× real time on an M-series laptop in Chrome: a 20-minute chemotaxis run in 2 minutes, and the full 60-minute assay in 6.
**Why.** The spec asks PLAN to set a target sized so a typical chemotaxis run plays in a couple of minutes. The review benchmarked the planned one-workgroup neural step alone on an M5 Max at 6.3× real time at 1 ms and 18× at 5 ms, so the second-order scheme's 2.5 ms step is what makes 10× plausible. A shortfall is logged, not paid for with accuracy.
**Status.** Needs sign-off.

## 2026-09-25 — FIDELITY.md and DATA_SOURCES.md are hand-written until milestone 0a

**Decision.** Until the generators exist, both pages are hand-written and marked "planned". From milestone 0a, `FIDELITY.md` is generated from the registry and `DATA_SOURCES.md` from `data/sources.json`, and CI checks both.
**Why.** CLAUDE.md says `FIDELITY.md` is never edited by hand, but nothing generates it yet. The planned ledger is still needed for this review.
**Status.** Done. CLAUDE.md notes the exception.

## 2026-09-25 — The connectome comes from Emmons 2024's CC BY release

**Decision.** Take Cook et al. 2019's hermaphrodite connectome from the S1 File of Emmons 2024 (_PLoS Biol_ 22:e3002939), and cite both papers. The nematode exporter vendors that file alongside the 2019 original, which nematode's existing experiments keep using.
**Why.**

- **Licence.** The 2019 supplement belongs to a subscription article and states no licence, and WormWiring shows only "Emmons Lab Copyright (c) 2020". Emmons 2024 comes from Cook et al.'s senior author and is CC BY 4.0, supplement included.
- **Quality.** Compared cell by cell, its chemical matrix is identical to the 2019 original, including all 956 neuromuscular entries. Its gap junctions carry the lab's July 2020 corrections ("to remove all inconsistencies and errors in the published tables") and its 2023 addition of BDU–ALM and BDU–PLM gap junctions.
- **Effect.** Among neurons, gap-junction pairs go from 1,093 to 1,095 and the gap scale factor from 0.2087 to 0.2055. Nothing that depends on chemical synapses changes, including the sign coverage.
- **Alternatives rejected.** Varshney et al. 2011 is CC BY, but its connectivity file sits on WormAtlas rather than in the licensed supplement. It also records neuromuscular junctions only as a count per neuron, never naming a muscle.

**Status.** Approved by the maintainer on 2026-09-25.

## 2026-09-25 — The data build pins every input and vendors the nematode export

**Decision.** `npm run data:build` reads each input through a pin in `data/sources.json` and checks every byte against its SHA-256. Downloads are cached in `data/cache/` under their digest.

- **The nematode export is committed**, under `data/vendor/nematode/`, because nematode doesn't commit its exports. The build refuses an export whose recorded commit differs from the pin, or one made from a dirty tree.
- **The 302 c302 morphologies** are pinned at one commit through a manifest of per-file digests, `data/c302-cells.sha256`.
- **No spreadsheet dependency.** The build reads one sheet from each of two files, and a small reader over Node's zlib does that. Its tests build workbooks in memory.
- **The scripts run on Node's built-in TypeScript support**, so the build adds only `@types/node`. Node 22.22.1 (or 23.6) becomes the minimum: type stripping needs 22.18 or 23.6, and lint-staged needs 22.22.1.
- **`.gitattributes` fixes line endings**, so a Windows checkout keeps the pinned bytes.

**Why.** Anyone can rebuild the runtime file from its sources and get the same bytes. CI's `data` job does exactly that and fails when a committed output is stale.
**Status.** Done.

## 2026-09-25 — DATA_SOURCES.md is generated; FIDELITY.md waits for the registry

**Decision.** `DATA_SOURCES.md` and `public/data/NOTICE.md` are now generated from `data/sources.json`, which closes half of the earlier exception. `FIDELITY.md` stays hand-written and marked "planned" until the registry lands, in the next milestone-0a PR.
**Why.** The credits and the pins then come from one file, and the build refuses a shipped dataset without a notice, a copyright line or a licence, so nothing can ship without its attribution.
**Status.** Done. CLAUDE.md is updated.

## 2026-09-25 — Where the model senses, the body's frame, and the sign of a dual-identity cell on muscle

**Decision.**

- **Sensing sites exist only where the model has a stimulus.** AWCL and AWCR sense at their dendrite tips; ALM, AVM, PVM and PLM sense along their processes. Every other neuron has none, because its stimulus is outside v1.
- **The body's frame is the reconstruction's extremes, along its anteroposterior axis.** The nose is the most anterior point of any neuron (CEPDL's dendrite tip, −349.5 µm) and the tail the most posterior (AVG's process, 448.4 µm), so positions are fractions of 797.9 µm of y. ALM's touch field therefore starts at 0.05, not the 0.06 PLAN §4.2 had.
- **The Virtual Worm is posed with a dorsoventral bend**, so y is a projection (the midline is about 5% longer, 836.8 µm against 797.9, which moves the ends of the touch fields by at most 0.014), and z is dorsal only near the head: the midline's z runs from +57 µm at the nose to −31 µm and back to +25 µm. So the file keeps each soma's raw coordinates, named as such, rather than calling z dorsal. The build checks the axes where they can be read: the left cell lies at larger x in 96 of 99 pairs, and at the nose all 12 dorsal sensory dendrites (CEP, IL1, IL2, OLQ, URA, URY) end above their ventral partners. Straightening the worm for display belongs to milestone 1.
- **A cell with two release identities signs muscle by its first-listed one**, which is the identity the transmitter rule reads. Eleven of the 162 cells that synapse onto muscle list a second identity. The four SMDs are listed cholinergic, then GABAergic, so they excite. That fits Wang et al. 2024's own reading: SMD lacks the GABA synthesis reporter (`unc-25`), "corroborating the notion that these neurons … take up GABA from other cells", though it still expresses the vesicular transporter `unc-47`. The rule gives PLAN §4.4's figures: 32 cells and 366 sections with no fast effect.

**Why.** Each choice follows the evidence the build can check, and each is reported in `data/reports/data-build.md`.
**Alternatives rejected.** Letting any GABA identity inhibit would make the SMDs inhibit their head muscles, on a GABA identity Wang et al. themselves attribute to uptake.
**Status.** Done.

## 2026-09-25 — A Fenyves sign needs its transmitter to be one of the cell's Wang identities

**Decision.** The build uses a Fenyves et al. 2020 sign only where the primary transmitter the prediction rests on is one of the presynaptic cell's release identities in Wang et al. 2024. Otherwise the connection falls through to the transmitter rule.
**Why.** Fenyves predicted each sign from the transmitter expression known in 2020, and Wang et al. 2024's knock-in atlas has since revised some cells: AVFL/R's GABA is uptake only, and PVM and PVQL/R release no identified transmitter. Wang is the transmitter source everywhere else in the build, so a Fenyves sign resting on a withdrawn transmitter has no footing. The review found this on 40 connections (129 sections), 25 of them AVF outputs shipped as inhibitory.
**Effect.** Expression-based signs go from 1,756 to 1,716 connections (46.3% of connections, 54.5% of sections), and those with no basis from 493 to 533 (14.4%; 9.8%), since the five cells have no Wang identity for the rule to use. The Creamer cross-check is unchanged at 364 disagreements, because none of the 40 is among the connections it covers.
**Residual.** A further 67 connections (208 sections) from AIM, AVA, AVB and RIB rest partly on a second transmitter the atlas doesn't list. Their primary transmitter agrees, so they keep Fenyves's sign.
**Status.** Approved by the maintainer on 2026-09-25.

## 2026-09-25 — Every muscle quadrant sits on one grid

**Decision.** The body wall muscles of all four quadrants sit on one grid of 24 slots from nose to tail, so muscle i covers the same stretch in every quadrant. The 23-cell ventral-left quadrant's last cell, vBWML23, covers the last two slots.
**Why.** Spacing ventral-left in 23 even steps drifted its middle cells by up to a muscle from the ventral-right ones they are averaged with. Cook's innervation says they mostly belong together. By the Jaccard index of their presynaptic cells, vBWMLi matches vBWMRi best for 12 of the 15 cells from vBWML7 to vBWML21, and clearly from 17 to 21 (vBWML17: 0.86 against vBWMR17, 0.56 against vBWMR18). At 10, 12 and 14 the next ventral-right cell overlaps more (0.20 against 0.19, 0.36 against 0.29, 0.32 against 0.24), and vBWML23 matches vBWMR24 (0.67 against 0.60). An even stretch fits none of this better.
**Status.** Approved by the maintainer on 2026-09-25. Still an assumption (level 0).
