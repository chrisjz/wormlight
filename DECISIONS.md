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
**Status.** Done. Superseded on 2026-09-26: the repository is public and deploys are on (below).

## 2026-09-24 — Synapse signs come from a four-step hierarchy (revised after review)

**Decision.** Each chemical connection takes its sign from the first source that has one:

1. a cited physiology result (level 5), for example AWC→AIY inhibitory;
2. Fenyves et al. 2020's expression-based prediction, from S1 Data (the WormWiring reconstruction) and the Cook sheet of S5 Data together (level 4);
3. the presynaptic transmitter rule, with acetylcholine and glutamate excitatory and GABA inhibitory (level 0);
4. otherwise no fast effect (level 0).

Each connection records which step set its sign. The harness reruns the checkpoints with steps 3 and 4 set four ways: by the rule (default), all excitatory, all silent, and ten random-sign draws. (Noted 2026-09-30: it didn't until that day's `--sensitivity`, which an audit against the spec prompted.)

**Why.** The two Fenyves files agree on all 3,121 connections they share. Together they give a clear sign for 1,763 of Cook's 3,709 chemical edges, 47.5% of edges and 55.6% of synaptic sections. The first draft used S5 alone and signed 218 fewer. The rule disagrees with Fenyves on about a fifth of the edges where both give a sign, so it gets the sensitivity check the spec asks for.
**Status.** Needs sign-off (PLAN.md §2.4). Signed off with the plan, whose pull request (#1) merged on 2026-09-25 (noted 2026-09-30).

## 2026-09-24 — Rescale Cook's counts to the Neural Interactome conductance units (revised after review)

**Decision.** Multiply Cook's EM section counts by 0.3444 for chemical synapses and 0.2055 for gap junctions before applying the per-unit conductances of Kunert et al. 2014. The factors live in `src/science/params.ts` only.
**Why.**

- Over the 279 neurons both datasets share, Cook's totals are 2.90× Varshney's for chemical synapses (excluding Cook's autapses, which Neural Interactome's matrices lack) and 4.87× for gap junctions, using Emmons 2024's corrected gap junctions (4.79× on the 2019 original).
- Matching totals keeps the chemical-to-electrical balance the model was built with. It does leave connections the datasets share at about 0.63× (gap) and 0.69× (chemical) their Neural Interactome strength, so the harness also reports shared-connection scales (0.33 gap, 0.50 chemical).
- The factors are level 2 (adapted).

**Status.** Needs sign-off. Signed off with the plan, whose pull request (#1) merged on 2026-09-25 (noted 2026-09-30).

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

**Status.** Needs sign-off. Signed off with the plan, whose pull request (#1) merged on 2026-09-25 (noted 2026-09-30).

## 2026-09-24 — A neuron's threshold is set at rest, and lesions don't move it (revised after review)

**Decision.** Each neuron's sigmoid threshold is its voltage at the intact network's equilibrium, with no external input and oscillators off. A rewired brain gets its own, from its own wiring. A lesion leaves every threshold where it was. Neural Interactome's behaviour, which recomputes thresholds whenever the input changes, is kept only for the port check.
**Why.**

- **Inputs.** In a closed loop the input never stops changing. A threshold that moved with it would cancel slow sensory signals: a hidden, perfect adaptation that no source documents.
- **Lesions.** The first draft recomputed thresholds after a lesion, which is the same hidden compensation. It re-centred every survivor and erased the loss of command-interneuron drive the lesion checkpoint is meant to test.
- **Level** 2 (hypothesis).

**Status.** Needs sign-off. Signed off with the plan, whose pull request (#1) merged on 2026-09-25 (noted 2026-09-30).

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

**Status.** Needs sign-off. The spec is updated to match. Signed off with the plan, whose pull request (#1) merged on 2026-09-25 (noted 2026-09-30).

## 2026-09-24 — Proprioception runs front to back, as Wen et al. 2012 measured (revised after review)

**Decision.** Each VB (DB) neuron receives a current proportional to the ventral (dorsal) curvature of the ~200 µm in front of its muscle field. Each VA (DA) neuron receives the mirror image, from behind its field. One gain serves both.
**Why.**

- **Wen's direction.** Wen et al. 2012 found that posterior regions "are compelled to bend in the same direction and shortly after the bending of the neighboring anterior region".
- **Not Boyle's.** Boyle, Berri & Cohen 2012 integrate the neuron's own and posterior body over half its length, and their authors note that B-type axons don't reach that far.
- **A-type coupling is a level-2 hypothesis.** There is no direct evidence for proprioception in A-type neurons. But Gao et al. 2018 infer motor neurons are "likely proprioceptive", since the A-type rhythm is about 5× faster in crawling than in glued animals. The first draft's "no evidence" overstated this.

**Status.** Needs sign-off. The spec is updated to match. Signed off with the plan, whose pull request (#1) merged on 2026-09-25 (noted 2026-09-30).

## 2026-09-25 — The rhythm comes from documented generators (replaces "the head rhythm is expected from the network")

**Decision.** Three kinds of rhythm generator:

- **The head:** a proprioceptive relaxation switch in the SMD head motor neurons (Ji et al. 2021; Yeon et al. 2018).
- **Forward:** intrinsic oscillators in B-type motor neurons that need AVB's drive (Fouad et al. 2018; Xu et al. 2018).
- **Backward:** intrinsic oscillators in A-type motor neurons that run without drive (Gao et al. 2018).

The oscillator is a minimal FitzHugh–Nagumo form, which is ours (level 0), since no published parameterised model of these cells exists. The network decides which generators run, through AVB's and AVA's documented synapses. A delayed proprioceptive loop is the first fallback.
**Why.**

- **The network can't supply the rhythm.** The review showed that with thresholds fixed at rest, both the Varshney and the Cook-scaled networks settle to a stable fixed point under constant drive. Kunert's PLM oscillation exists only because Neural Interactome moves thresholds with the input. Kunert-Graf et al. 2017 note that their own model "does not sustain oscillation in the absence of explicit external input". (Corrected 2026-09-25: an earlier version of this entry quoted a sentence that is not in their paper.)
- **The evidence places the generators** near the head (Ji et al. 2021, a relaxation oscillator fitted to phase-response data) and in ventral-cord motor neurons for both directions. Proprioception's evidence is for propagation and entrainment.

**Status.** The maintainer approved documented generators as the default, with the delayed loop as first fallback, on 2026-09-25. The head switch's placement in SMD, which came from a later literature check, needs sign-off. Signed off with the plan, whose pull request (#1) merged on 2026-09-25 (noted 2026-09-30).

## 2026-09-24 — The chemotaxis index is Bargmann's endpoint count

**Decision.** Checkpoint 4 simulates Bargmann, Hartwieg & Horvitz 1993's assay. Worms stop within 0.5 cm of either spot, as sodium azide makes them, and CI = (at odour − at control) / total after 60 minutes.
**Why.** That's how the literature's population values were measured. nematode's `literature_ci_values.json` uses a time-in-zone index, and two of its entries are misattributed: Bargmann et al. 1993 tested volatile odorants, not bacteria, and Pierce-Shimomura et al. 1999 used ammonium chloride and biotin, not a food gradient. Those should be fixed in nematode.
**Status.** Done in PLAN.md §7.

## 2026-09-25 — Neural time constants are Kunert's published values

**Decision.** C = 1 pF, G_c = 10 pS, a_r = 1 s⁻¹ and a_d = 5 s⁻¹, as Kunert-Graf et al. 2017 restate from Kunert, Shlizerman & Kutz 2014.
**Why.** Neural Interactome's code uses 1.5 pF with both rates divided by 1.5, which is the same model run 1.5× slower, and no source gives those values. The first draft credited them to Varshney and Kunert. The port check can't see a uniform time rescale, so the time scale has to rest on the publication. Neural Interactome's values stay in its own mode, for the port check.
**Status.** Needs sign-off. Signed off with the plan, whose pull request (#1) merged on 2026-09-25 (noted 2026-09-30).

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
**Status.** Needs sign-off. Signed off with the plan, whose pull request (#1) merged on 2026-09-25 (noted 2026-09-30).

## 2026-09-25 — One tuning procedure for every wiring

**Decision.**

- **Procedure.** The calibrated parameters are tuned by CMA-ES, with a fixed objective (crawling kinematics and the spontaneous reversal rate), fixed evaluation trials and seeds, and a budget of 400 evaluations. This applies identically to the real wiring and every null.
- **Crawl gate.** A null "crawls" if it reaches at least partial on checkpoint 1.
- **Verdicts.** Checkpoints 2–5 are compared among crawling nulls only.

**Why.** The first draft promised the nulls "the same procedure and budget" without defining either, while the real wiring would have been tuned by hand. It also scored non-crawling nulls as failing everything, which biased the headline result toward "wiring matters".
**Status.** Needs sign-off (PLAN.md §7.3, §7.4). Signed off with the plan, whose pull request (#1) merged on 2026-09-25 (noted 2026-09-30).

## 2026-09-25 — Noise is a white-noise current with a defined intensity

**Decision.** Noise intensity σ_n is in pA·√s. Each step draws with standard deviation σ_n/√dt, from a counter-based hash turned into a uniform strictly inside (0, 1), then Box–Muller.
**Why.** A fixed per-step standard deviation, as in the first draft, makes noise power at behavioural time scales proportional to the step size, so a σ calibrated at one step would be wrong at another. The uniform transform must exclude 0 and 1, or Box–Muller takes log(0).
**Status.** Done in PLAN.md §3.5.

**Superseded from track R's refit on** (2026-09-28, below): the noise becomes an Ornstein–Uhlenbeck current, its correlation time calibrated.

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
**Status.** Needs sign-off. Signed off with the plan, whose pull request (#1) merged on 2026-09-25 (noted 2026-09-30).

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

## 2026-09-25 — The registry is the source of FIDELITY.md, and of every citation

**Decision.** `src/science/` holds the registry: `citations.ts` (every source once), `params.ts` (every constant, with its level and source) and `fidelity.ts` (every component and subsystem). `npm run docs:fidelity` generates `FIDELITY.md` from it, and CI's `checks` job fails when the page is stale. This closes the exception that kept the page hand-written.

- **Figures come from the data.** The ledger's sign coverage and connection counts are computed from `public/data/wormlight.v1.json` when the page is generated, so they can't drift from the file the model loads.
- **One citation list.** The data build takes the references in the runtime file's `meta.citations` from the registry, and refuses a sign override that cites an id the registry lacks. Every entry was checked against Crossref or the publisher; the Neural Interactome DOI the notes had was wrong (the paper is doi:10.3389/fncom.2019.00008).
- **Parameters: what the plan fixes so far.** `params.ts` holds the 14 free parameters and every constant PLAN §3.2, §4 and §5 give a value. Constants that only later milestones use, such as the body's spring constants and the oscillator's fixed coefficients, join it with the code that uses them. A test holds the free count at 14: eight calibrated, six fixed in advance.
- **Checkpoints per component.** Each component lists the checks and checkpoints that test it, as PLAN §6.1 asks, from a typed list, so a misspelt check does not compile.
- **Upgrade paths and bounds.** Every parameter says what would raise it, as spec §1.3 asks. Every calibrated parameter has bounds, null until they are set before the calibration runs in milestone 0c: PLAN §7.3 tunes within them, the same for the real wiring and every null.

**Why.** The spec asks for one machine-readable ledger that the page, the app and the tests all read.
**Status.** Done.

## 2026-09-25 — Checkpoint 1's eigenworms are the Stephens group's published basis

**Decision.** Pin `extras/EigenWorms.csv` from the Stephens group's WormPose repository (`iteal/wormpose` at `fb1d77ea`; SHA-256 `bc806b90…`; BSD-3-Clause, not redistributed) as checkpoint 1's basis, and fix the metric now: the variance the first four modes capture in postures pooled over all 20 trials at 4 Hz, each trial's first 10 s left out, and self-intersecting postures left out.
**Why.**

- **It is the basis the spec names.** Stephens et al. 2008 give the eigenworms only as figures. The group distributes the basis as this file with WormPose (Hebert et al. 2021), which projects postures onto "a canonical lower dimensional space of 'eigenworms'" citing Stephens et al. 2008; the group's Broekmans et al. 2016 likewise took its eigenworms "from Stephens et al. (2008)". The file itself names no source, so its identity with the 2008 basis is inferred, and `DATA_SOURCES.md` says so.
- **It checks out.** The build confirms a 100 × 100 orthonormal basis whose constant rotation mode is the last column. The OIST Physics of Behavior tutorials (Zenodo doi:10.5281/zenodo.15099731) publish 6,655 real postures and introduce them as coming from Stephens et al.'s experiment. The basis's first four modes capture 96.46% of their variance, against 96.48% for the best any four modes can do, and 95.8% read tail first, so head first is the orientation. Since the data are probably the ones the basis was computed from, this is a consistency check, not independent confirmation.
- **It fits the plan's representation.** It uses the same 100 tangent angles, so no resampling is needed.
- **The metric follows the source.** Stephens et al. measured all the behaviour of freely crawling worms, reversals and shallow turns included, but "Cases of self-intersection were excluded from processing". So the checkpoint pools all postures rather than only forward bouts, which would be easier to pass, and leaves out self-intersecting ones, which the simulated body can form because it has no self-contact. The first 10 s of each trial are left out because the trials start from random postures. (Corrected 2026-09-25: the first version of this entry said turns of every kind were included.)

**Alternatives rejected.** The Schafer lab's `master_eigen_worms_N2.mat` (Brown et al. 2013; Yemini et al. 2013; MIT via OpenWorm and Tierpsy) has 48 angles, was fitted to worms on food, and orders its modes differently. Resampling it to 100 angles works numerically, but it would no longer be a published basis.
**Status.** Done, before any posture data exist.

## 2026-09-25 — The inhibitory reversal potential is −48 mV, as Wicks's table gives it

**Decision.** Keep E_inh at −48 mV, cited to Wicks, Roehrig & Rankin 1996 and Neural Interactome.
**Why.** Wicks et al. give two values: their Table 1 lists the IPSP reversal potential as −0.048 V, and their text says −45 mV ("for inhibitory synapses −45 mV was used (R. E. Davis, personal communication)"). Kunert et al. 2014 and Kunert-Graf et al. 2017 use −45 mV; Neural Interactome, whose own code the port check runs, uses −48 mV. The difference is 3 mV on the inhibitory driving force, and keeping the implementation's value means the port check and the production model agree on it.
**Status.** Done. `params.ts` records both values.

## 2026-09-25 — The head switch reads curvature where Ji et al. measured it

**Decision.** The head switch's `K` is the scaled curvature κL averaged over body coordinates 0.1–0.3, Ji et al. 2021's "head region", not the anterior 0.2 body lengths PLAN §4.3 first chose.
**Why.** Ji et al. fitted `b` and `P_th` to curvature in that region ("we focus on curvature dynamics of the worm's head region (0.1–0.3 body coordinate)"), so reading it anywhere else would move their fitted values out of the setting they were fitted in. It also removes a level-0 value the free-parameter budget had not counted: with it, the count would have been 15 against a budget of 14. The region is now level 2, like `b` and `P_th`.
**Status.** Done.

## 2026-09-25 — Gap junctions between a neuron and itself are omitted

**Decision.** The ledger and the notices record that the 14 gap junctions between a neuron and itself (35 sections) are not in the connectome Wormlight uses.
**Why.** Nematode's loader drops self-pairs, so the export never carries them. The count comes from reading the Emmons 2024 S1 File's hermaphrodite gap-junction sheets with nematode's own parser (AIAR, ASKR, DVB, M4, M5 and PVM among them). They would do nothing in the model anyway, because a junction's current is proportional to the voltage difference across it.
**Status.** Done.

## 2026-09-25 — Milestone 0b confirms the 2.5 ms step

**Decision.** The neural step is 2.5 ms, with the solver PLAN §3.4 set: conjugate gradients with a Jacobi preconditioner, stopping at 10⁻⁶‖b‖ and capped at 64 iterations. The step after any jump in the input is implicit Euler.
**Why.** The CPU reference passes both checks at 2.5 ms with room to spare, and the port check fails at 5 ms. Each figure below is the worst neuron's RMS error in V − V_th as a share of max(excursion range, 1 mV); the limit, fixed in PLAN §7.2, is 1%.

| Check                       | 1 ms  | 2.5 ms | 3.33 ms | 5 ms                   |
| --------------------------- | ----- | ------ | ------- | ---------------------- |
| Port check, ALM preset      | 0.50% | 0.37%  | 0.68%   | 0.57%                  |
| Port check, AVA preset      | 0.15% | 0.35%  | 0.57%   | 1.23% (2 neurons fail) |
| Port check, AVB preset      | 0.09% | 0.17%  | 0.30%   | 0.69%                  |
| Port check, PLM preset      | 0.04% | 0.05%  | 0.10%   | 0.15%                  |
| Production check, PLM pulse | 0.04% | 0.29%  | 0.51%   | 0.93%                  |
| Production check, AVB step  | 0.03% | 0.16%  | 0.27%   | 0.49%                  |

- **How the checks run.** The port check's goldens come from Neural Interactome's own `initialize.py`, solved by Radau at rtol = atol = 10⁻¹⁰. Each preset is switched on at t = 0 while the network runs, the path its "update" event takes, so the input ramps in over its 0.3 s transition with the thresholds following it. The start state is its own draw, 10⁻⁴ · N(0, 0.94), from seed 0, and the comparison runs from the end of the ramp to 5 s, every 10 ms. The production check starts the Cook model at rest and drives each stimulated neuron with 10 mV times its input conductance at rest (9.5 and 7.5 pA into PLML and PLMR from 0.5 to 1 s; 28 and 27 pA into AVBL and AVBR from 0.5 s), compared every 10 ms over 3 s against an independent dense implementation, solved the same way. It is scored over the whole run from rest, so each neuron's range is its excursion from rest. Scored from the stimulus onset instead, it still passes at 2.5 ms (0.32% and 0.54%) but fails at 3.33 ms (2 neurons in the AVB step) and at 5 ms (1 and 23).
- **The step after a switch restarts.** The review of this milestone found that BDF2 stepping straight across a stimulus switching on or off is first order there: without the restart, the production check's worst neurons were at 0.82% and 0.53% at 2.5 ms, and 31 and 8 neurons failed at 5 ms. One implicit Euler step after each jump restores second order, and PLAN §3.4 now says so. Neural Interactome's input jumps by only 6 × 10⁻⁶ of its value at the end of its ramp, so the port check doesn't restart.
- **The checks can fail.** Reading Neural Interactome's [post, pre] chemical matrix the other way round fails every one of the 279 neurons in the AVA preset, and a model whose voltages go to NaN fails every neuron in both checks. A test keeps the first so, and tests of the scoring and the solver keep the second.
- **What each check sees.** The production check tests the wiring and the voltage dynamics. It can't see how activation is integrated: evaluating φ at the old voltage, or not extrapolating s, moves its worst neuron by at most 0.05 percentage points, and every neuron still passes. The port check (1.6–9.8% under those mistakes) and the convergence test catch them.
- **Order.** On the Cook model under a smooth input, successive halvings give order 1.99 (5, 2.5 and 1.25 ms) and 2.10 (2.5, 1.25 and 0.625 ms), within the 2 ± 0.3 PLAN §7.2 requires. From 10 ms it is 1.79, not yet asymptotic. Against an independent Radau solution the errors fall at order 2.02–2.08 over the same steps, so the scheme converges to the right answer, not just at the right rate.
- **The solver.** At 2.5 ms conjugate gradients average one to four iterations a step, and take at most 16 of the 64 allowed; no solve reached the cap. In the ALM preset the solve, not the integrator, sets most of the error: with a 10⁻¹⁰ solve its worst neuron falls from 0.37% to 0.06% at 2.5 ms, and from 0.50% to 0.08% at 1 ms. Neural Interactome's inputs are large (V − V_th reaches 25 V in that preset), and a tolerance relative to ‖b‖ grows with them; at 1 ms b is larger again, which is why ALM does slightly worse there than at 2.5 ms.
- **For milestone 0c.** At the 10⁻⁶ solve the production model's error against Radau stops falling below about 1.25 ms (3.9 × 10⁻⁴ at 2.5 ms, 2.0 × 10⁻⁴ at 1.25 ms, 3.4 × 10⁻⁴ at 0.625 ms), so checkpoint 1's comparison at dt and dt/2 will see the solver as well as the step.

**Status.** Done.

## 2026-09-25 — The noise uniform keeps 23 bits, so f32 holds it exactly

**Decision.** u = (⌊h / 2⁹⌋ + 0.5) · 2⁻²³, not (⌊h / 2⁸⌋ + 0.5) · 2⁻²⁴ as PLAN §3.5 first had it.
**Why.** The first form is an odd multiple of 2⁻²⁵, which needs 25 significant bits. f32 has 24, so above 0.5 the GPU would round it, and at h = 2³² − 1 it rounds to exactly 1: the CPU and GPU would draw different noise from the same hash. The second form is an odd multiple of 2⁻²⁴, exact in f32 from 2⁻²⁴ to 1 − 2⁻²⁴, at the cost of one bit of resolution. The hash is one step of O'Neill's 32-bit PCG generator (the generator's default multiplier and increment and its RXS-M-XS output, as in the reference `pcg-c`), nested over (seed, step, index). Jarzynski & Olano ("Hash Functions for GPU Rendering", _JCGT_ 9(3), 2020) evaluate it as "pcg" and recommend it as "a good default choice for an (N → 1) hash" built by nesting. The code names no source itself, because `citations.ts` holds only what the ledger uses.
**Status.** Done in PLAN.md §3.5 and `src/sim/brain/rng.ts`.

## 2026-09-25 — The body is Boyle et al.'s, stepped semi-implicitly

**Decision.** The body follows Boyle, Berri & Cohen 2012's equations and Table 1: 49 rods on a prolate-ellipse outline, lateral and diagonal elements each a spring and damper, and muscles whose stiffness, damping and rest length scale with activation. Each step is semi-implicit Euler: drag and dampers implicit, springs explicit, solving the symmetric block-tridiagonal system (49 blocks of 3 × 3) for the rod velocities. Boyle et al.'s code is licensed for non-commercial use only, so none of it is copied; it was read to settle what the paper leaves open:

- **Drag per rod.** Each rod resists motion across and along the body with the whole worm's coefficient divided by 2(M + 1) = 98, applied to the net force on its two points, as PLAN §5.1 already says. So a body moving as a whole feels C/2, not C; a force compared with a measured one must allow for that.
- **Rotational drag.** Each rod resists turning with 4πR_i² times its tangential coefficient: their code turns a rod at the half-difference of the tangential forces on its two ends divided by 2πR_i·C∥, which is that coefficient.
- **The damper's sign.** The paper's equations write the damping as +βv; the code subtracts it, which is the sign that dissipates, and so does Wormlight.
- **A quartic term left out.** Equation 3 adds 2(L₀ − L)⁴ when a lateral element is stretched, and the code (2(L − L₀))⁴. In SI units that adds a length to the fourth power to a length: at a 50% stretch of a 21 µm segment it is about 10⁻¹⁴ of the linear term, so the body omits it.
- **Orientation.** Rod 0 is the head, and the dorsal side is on the left looking from head to tail, on the right of the direction of travel.

**Why.** The body is the level-3 model PLAN §5.1 names, and the tests check it against predictions made without its code:

- **The force law.** Boyle et al.'s equations 2–7 and Table 1, written out in the test with the cuticle and each muscle as separate elements, give the body's velocities to 4 × 10⁻¹³ of the force scale, on bent, active, externally forced states with activations outside [0, 1].
- **Passive bend.** A uniform-radius body bent into its first free-free bending mode straightens at 0.979 of the rate of the discrete Euler–Bernoulli beam with the same joint stiffness (2κ_L R²) and rod drag, and at 0.987 with the drag cut 1,000-fold, where the internal damping slows it by a fifth. Rod rotation, which the beam leaves out, accounts for the 2% on agar. Against the continuum beam the rate is 10% lower, because the discrete body carries a full rod's drag at each tip, where the mode moves most.
- **Prescribed wave.** A travelling wave of activation at 0.30 Hz and 0.65 body lengths crawls head first at 0.134 body lengths per second. That is within 0.05% of what resistive force theory predicts for the shape it makes, the rigid motion that leaves its change of shape force- and torque-free with the drag along each rod. The infinite-sinusoid formula U/V = (K − 1)S/(1 + (K − 1)S) overestimates it by 15%; a finite body is part of the reason, since with two whole waves on the body it still overestimates by 8%.
- **Step size.** At 2.5 ms and 1.25 ms the wave's speed agrees within 0.08%.
- **Stability.** Every spring has a damper in parallel, and the fastest such pair, the diagonals, relaxes in β_D/κ_D = 10 ms, so the springs need no implicit treatment. The prescribed wave stays stable up to a 20 ms step and blows up at 25 ms, eight times the step Wormlight uses. A first version also put the springs' stiffness Jacobian on the left; it changed the wave's speed by 0.07% and no test could tell whether the step used it, so it was removed.

A CPU step costs about 34 µs.
**Status.** Done.

## 2026-09-25 — The loop outside the brain, and why it doesn't yet crawl

**Decision.** Milestone 0c's second part wires the layers of PLAN §4.3–4.4 to the brain and body, stepped in PLAN §1's order:

1. The body's curvature.
2. The proprioceptive and head-switch currents.
3. The brain.
4. The neuromuscular layer.
5. The body.

Details PLAN left open, settled here:

- **Oscillators in the voltage solve.** A FitzHugh–Nagumo current is a negative conductance of up to g_osc on its middle branch, and g_osc must exceed an oscillating neuron's own conductance (0.15–1.4 nS for the A- and B-types) to cycle at all, which is more than the solve's 1.5 C/dt = 0.6 nS. Linearising all of it would make the system indefinite. So the stabilising part (−g_osc(x² − 1) where |x| > 1) goes on the left and the rest is explicit, which keeps every row of the system diagonally dominant. A lone oscillator at g_osc = 2 nS cycles within 0.61% of the period of an RK4 solution of the same equations at 2.5 ms, and 0.22% at 0.5 ms. That term converges more slowly than second order, so with oscillators on, checkpoint 1's comparison at dt and dt/2 is the check on the step, not the order test.
- **The head switch's gate** reads, for each SMD, the voltage its partners and leak would hold it at, less its threshold, averaged over the four (level 0). The SMDs' own voltages, and so the switch's current, don't enter: links among the SMDs count at their rest values. It is 0 at rest and E_c − V_th, about −28 mV, in the silenced network, so θ_osc above that keeps the silenced network's head still. A first version read the SMDs' mean voltage; the switch's own current shifted that mean by about 0.04 mV per pA, closing its own gate and chattering at the step rate for many gains.
- **Which side the switch drives first** is drawn from the seed.
- **Proprioceptive fields** span each motor neuron's neuromuscular targets: B-types sense the 0.2 body lengths in front, A-types the 0.2 behind. Their edges are snapped to the 24-slot muscle grid, since the data file rounds them to four places; unsnapped, rounding decided whether 13 of 37 fields reached their edge rod. Two A-types, DA9 and VA12, have muscles reaching the tail and nothing behind, so they get no proprioception. Dorsal neurons read dorsal curvature and ventral ones its opposite.
- **Muscles to segments.** Each of the body's 48 segments takes the mean of the left and right muscles covering its middle. Muscle activation follows its drive exactly for a drive held over the step.
- **Lesions and other brains.** A lesion removes a neuron's connections, neuromuscular junctions, oscillator and proprioceptive input, and every neuron keeps the intact threshold (§3.3). A rewired brain gets its own thresholds. The silenced network of checkpoint 0 cuts every neuron-to-neuron connection and keeps everything else.
- **Restarts.** The step after the head-switch current changes (a flip, or the gate opening or closing) is implicit Euler, by PLAN §3.4's rule.
- **FitzHugh's constants.** The oscillators use the model's standard 0.7 and 0.8 (FitzHugh 1961; Nagumo et al. 1962), part of the form PLAN approved, not parameters of their own.

**What the exploration and the review found.** None of it is a bug: the signs run end to end, and the model steps the same at 0.5 ms as at 2.5 ms.

- **The resting body isn't straight.** Resting muscle drive differs between the dorsal and ventral sides, so with every loop layer off the head settles at K ≈ −3.5, and proprioception drives the motor neurons from that bend.
- **The oscillators need drive.** With FitzHugh's constants an undriven oscillator is excitable, not oscillating. In the network the B-types cycle when θ_osc sits well below their rest (all 18 from −8 to −32 mV at g_osc = 2 nS). The A-types, with no drive threshold, don't cycle on their own, even with AVA, AVB, AVD, AVE and PVC removed; they follow the B-types when those cycle. So the model does not yet show the intrinsic A-type rhythm Gao et al. report, which checkpoint 0's expected residual backward activity rests on.
- **No crawling.** A 64-sample random search over the eight calibrated parameters, 30 s each, found none: rerun with the fixed gate, the best moved at 0.014 body lengths per second, from the transient after a switch flip, and the switch flipped at most twice. The review's second search, over re-centred ranges, found none either.
- **Where the loop fails.** With the head switch forced to alternate at 0.3 Hz, no draw of the other parameters gave a travelling wave (the best of 144, the review's 96 and 48 of mine, moved at 0.004 body lengths per second), so calibration alone cannot make it crawl. Four causes:
  1. The SMDs cannot bend the head to Ji et al.'s P_th: driven hard with the SMDVs suppressed, they bend it to at most K = 1.99 against 2.33. Next to SAB's they carry little head-muscle drive, and the network moves SAB against them. SAB's neuromuscular counts are identical across its cells in Cook et al.'s SI5 and Emmons's S1 files themselves.
  2. The B-types, gap-coupled through the AVB hub, cycle dorsal and ventral together, which co-contracts rather than bends.
  3. The A-types' mirrored proprioception cancels much of the B-types' bending drive on the same muscles, and nothing silences the A-types in forward drive while every neuron rests half-on.
  4. One neuromuscular threshold can't serve the whole body: resting drive falls about five-fold from head to tail.

**Status.** The loop is done. Whether and how to change the model is the go/no-go (PLAN §9, §10), brought forward to follow this PR, and settled on 2026-09-26 (the next entry).

## 2026-09-26 — The go/no-go: crawling doesn't emerge, and milestone 0c closes as an honest partial

**Decision.** No-go on crawling. None of the parameter draws tried makes the planned model crawl, and neither of the first two fallbacks changes that. The maintainer chose fallback 4, an honest partial:

- Milestone 0c closes, the ledger says crawling does not yet emerge, and milestone 1 is next.
- Fallback 3, class-level fitting, becomes research track R (PLAN §9). It is widened to resting offsets and rectification, bounded in advance, and every primary null is tuned by the same procedure on the same budget.
- R's new parameters will need the free-parameter budget raised, which is settled when its proposal is approved.
- Nothing in the model changes.

**The experiments.** Every number here comes from `scripts/experiments/go-no-go/`. `node scripts/experiments/go-no-go/run.ts` runs every table, in about 10 minutes on 18 cores, and `node scripts/experiments/go-no-go/run.ts fallbacks silenced --draw 72 --seconds 120`, with `--draw 58` too, gives the 120 s checks.

- **How it runs.** The script composes the World's loop from the simulation's own parts, with a switch for each change tested; none of the switches is part of the model. With no switch set it is the World's loop step for step, and its removals and silencing are the World's lesions and silenced network; a test keeps them so.
- **The draws.** Each variant runs the same 96 draws of seven of the eight calibrated parameters, over ranges wide enough to hold every plausible value, with every coordinate of every draw hashed on its own. The eighth, the noise, is off, so every run is deterministic. Runs last 30 s from a straight body.
- **Thresholds.** A variant that changes weights is a rewired brain and gets its own thresholds (PLAN §3.3). Removals and silencing are lesions and keep them.
- **What it measures.** Speed is the centroid's motion along the head's direction after the first 10 s, in body lengths per second. Checkpoint 1's partial band starts at 0.06, and the calibration target is 0.22. Frequency is that of the mid-body's bending, from crossings of its mean; 0.025 Hz is a single crossing, no oscillation.

The plan, and the fallbacks:

| Variant                                                           | Best speed | Draws above 0.06 | Its frequency (Hz) |
| ----------------------------------------------------------------- | ---------- | ---------------- | ------------------ |
| The plan as merged                                                | 0.021      | 0                | 0.025              |
| Fallback 1: proprioception delayed 80, 300 or 550 ms              | 0.021      | 0                | 0.025              |
| Fallback 2: bistable B-types                                      | 0.021      | 0                | 0.025              |
| No A-type proprioception                                          | 0.022      | 0                | 0.025              |
| Drive relative per muscle                                         | 0.028      | 0                | 0.050              |
| Both of those                                                     | 0.027      | 0                | 0.050              |
| Both, and bistable B-types                                        | 0.027      | 0                | 0.075              |
| Both, and delayed 300 ms                                          | 0.027      | 0                | 0.050              |
| Both, and the head switch also drives the RMDs                    | 0.041      | 0                | 0.075              |
| Fallback 3: all three, B-type oscillators off, B-type links × 0.3 | 0.036      | 0                | 0.150              |
| The same with B-type links × 0.1                                  | 0.045      | 0                | 0.150              |
| The same with the B-types cut from the network                    | 0.071      | 2                | 0.175              |

- **The plan.** Its best draw holds a bend. Fallback 1's delays and fallback 2's bistable B-types change nothing, and neither does removing the A-types' mirrored proprioception (0.0215 against 0.0212).
- **What helps a little.** Scaling each muscle's drive between its own resting and highest values, so one threshold serves every muscle, and adding the RMDs to the head switch.
- **Reaching the partial band.** One setting does, in two draws of 96: fallback 3 with the B-types cut off from the rest of the network, on top of the other changes. At a tenth of their links the best is 0.045. With the B-types cut, the wave travels down the body by their proprioception alone; the network still gates and drives the head, and the A-types keep their oscillators.

The head alone isn't the obstacle. With the head switch forced to alternate at 0.3 Hz, relative drive and no A-type proprioception, the whole network moves at most 0.012. With the oscillators also off it reaches 0.038, then 0.039 with every gap junction at a tenth, and 0.035 with none.

The ladder starts from the B-type chain alone:

- The B-types are cut from every other neuron and the A-types removed. The D-types stay, cut off from the B-types.
- The SMDs keep only their junctions onto muscles starting in the first 0.3 body lengths.
- The head is forced at 0.3 Hz, the oscillators are off and drive is relative per muscle.

Each rung then adds one thing back:

| Variant                                                    | Best speed | Draws above 0.06 |
| ---------------------------------------------------------- | ---------- | ---------------- |
| The B-type chain alone                                     | 0.126      | 9                |
| + AVB–B-type gap junctions                                 | 0.088      | 3                |
| + AVB driving the B-types without their loading it instead | 0.078      | 1                |
| + gap junctions among the B-types                          | 0.095      | 3                |
| + all of the B-types' gap junctions                        | 0.065      | 1                |
| + all of the B-types' chemical synapses                    | 0.130      | 6                |
| + the A-types, without proprioception                      | 0.121      | 7                |
| + the SMDs' full reach                                     | 0.043      | 0                |
| + the FitzHugh–Nagumo oscillators                          | 0.051      | 0                |
| + one neuromuscular threshold                              | 0.026      | 0                |

- **What the chain does.** It moves forward at the forced 0.30 Hz, at a little over half the real worm's speed. Gao et al. 2018 saw much the same in worms without premotor interneurons and A-types: "an oscillating head slowly pulled a body with shallow bending".
- **What breaks it.** Three things each take it out of the partial band: the SMDs' junctions down the body, the oscillators, and one neuromuscular threshold for every muscle. The B-types' gap junctions, taken together, halve its speed and leave one draw in the band; AVB's alone, or those among the B-types, cost less.
- **What doesn't.** The B-types' chemical synapses and the A-types, without their proprioception, leave it moving as fast.

The biology-informed combination tries several of the literature's leads together:

- The A-types rest 20 mV below threshold, as Liu, Chen & Wang 2014 measured VA5 18.5 mV below VB6, and have no proprioception.
- AVB drives the B-types without their loading it, a hypothesis the evidence doesn't favour (below), and there are no gap junctions among the B-types.
- The SMDs are confined to the head, drive is relative per muscle and the oscillators are off.

It reaches 0.044 with the head forced, 0.024 with the head switch, and 0.032 with the switch also driving the RMDs; no draw reaches the partial band.

**The setting at the partial speed, checked.**

- **It holds.** Its two draws keep their speed over 120 s, as long as a checkpoint 1 trial: 0.071 at 0.16 Hz (draw 72) and 0.063 at 0.17 Hz (draw 58).
- **Silenced, nothing moves.** With every neuron-to-neuron connection cut, no draw of it, or of the informed combination with the head switch or forced, moves faster than 0.001, so each would pass checkpoint 0's clause. These controls start from a straight body without noise; checkpoint 0 itself uses random postures, noise and 120 s trials, and runs with the harness (PLAN §9).
- **It is not a crawling model.** It reaches only the bottom of checkpoint 1's speed band, in two draws of 96, and its wavelength, eigenworm and bout clauses were not measured. It needs five changes beyond the planned model, one of which takes the connectome away from the B-types entirely. It is where track R starts.

**Earlier numbers.** The maintainer chose on exploratory runs, and the first draft of this entry used a first version of the script. The review of PR #7 found two flaws in it:

- its 48 draws lay on one line through parameter space, since each coordinate was a linear function of the draw's index, modulo 1;
- it kept the intact network's thresholds on rewired brains, leaving the B-types about 28 mV below threshold whenever their links were cut.

That version found three settings at the partial speed. With independent draws and each rewired brain's own thresholds, only the one above remains.

**Kim et al. 2025's mechanism**, rebuilt as their code has it (`kim.ts`):

- a pulse into PLM (3 nA), or into ALM (6.8 nA) and AVM (3 nA), dying away as their preset files do, with Neural Interactome's thresholds recomputed from it;
- from 1.18 s, the network's state 0.6 s earlier, less its thresholds, projected onto the patterns the neuromuscular map can see and added at unit gain to the voltage the network sees;
- their muscles, on each muscle's rectified input, with the scale of their Hill function drawn, since Wormlight's neuromuscular map counts EM sections where theirs is normalised.

From a PLM pulse no draw moves forward at all. From the ALM and AVM pulse the body bends at about 1.15 Hz but moves backward at most 0.014. Drawing the feedback's gain (0.1–10) and delay (0.3–0.8 s) as well gives at most 0.001, and with rest thresholds or Wormlight's muscles nothing moves. Their model moves in a fluid of 10 mPa·s, which they take to stand for agar, with the delay chosen to match recorded curvatures.

**Why: the literature.** A sweep for precedents found no published model that makes the whole connectome crawl on agar with anatomy's weights and without fitting (PLAN §11):

- **Kunert, Proctor, Brunton & Kutz 2017**, on this model class: "In the absence of constant stimulus, the neural state will collapse onto a static, stable fixed point, i.e. a state of no movement."
- **Chung & Kim 2026** fitted the weights of Cook's motor circuit because, of earlier whole-connectome models, "the model using anatomical connectome weights directly did not achieve that".
- **Randi et al. 2023**, measuring signal propagation among head neurons, found "fairly poor agreement between anatomy-based model predictions and our measurements", with a model of this kind.
- **Models that do crawl** fitted their circuits: Izquierdo & Beer 2018; Olivares, Izquierdo & Beer 2021. Olivares et al. found that strengthening the gap junctions between neighbouring units' B-types reduced bending: "As the strength of the gap junctions was increased, the bending in the body decreased". In the ladder, those among the B-types cost little, and all of the B-types' gap junctions together halve the speed.
- **Kim et al. 2025** come nearest: their synapses are unfitted, but their body moves in a fluid standing for agar, and they chose the feedback's delay to match recorded curvatures.

A second sweep, over the biology, found three of the model's assumptions at odds with the evidence:

1. **Every neuron rests half-on.** Resting potentials differ by class: "−71.7 ± 2.4 mV in VA5, −53.2 ± 2.5 mV in VB6" (Liu, Chen & Wang 2014). During semi-restrained locomotion "VB and VA are never co-active" (Haspel, O'Donovan & Hart 2010). In Cook's data the A-types' excitatory junctions onto muscle have 318 EM sections on the ventral side and 346 on the dorsal, against the B-types' 338 and 170, so half-on A-types drive the muscles at least as much as the B-types do.
2. **Gap junctions pass current both ways.** The AVA–A-type junctions "only allow current flow from A-MNs into AVA" (Liu et al. 2017). The AVB–B-type junctions need "UNC-7S expression in AVB interneurons and UNC-9 expression in B motor neurons" (Starich et al. 2009). In oocytes that pair rectifies only slightly, and if anything towards AVB: it "would appear to favor conduction of depolarizing potentials from the motor neuron to AVB, rather than the reverse". So the informed combination's AVB coupling, which drives the B-types without their loading AVB, is a hypothesis against that evidence, not a reading of it.
3. **Section counts are weights.** Randi et al.'s measurements disagree with anatomy-based predictions even with weights and signs fitted. And nearly half the neuromuscular edges weren't observed at all: Cook et al. extrapolated them, "neuromuscular junctions amount to 45% of the neuron-muscle edges, half of which involve the sublateral motor neurons", SMD and SAB among them.

Two more findings bear on the ladder:

- **Dorsal and ventral B-types.** Under optogenetic AVB activation, with the body in front of the imaged cells held straight, Xu et al. 2018 saw that "neighboring VB/DB motor neuron exhibited oscillatory yet anticorrelated calcium activities". In the model the gap-coupled B-types cycle dorsal and ventral together (the previous entry). Haspel et al. 2010, though, found VB and DB co-active in semi-restrained worms and could detect no alternation.
- **Inhibition.** Deng et al. 2021 find that "inhibition is not necessary for muscle alternation during slow undulation", and the B-type chain moves with the D-types cut off from the B-types, so without the cross-inhibition the B-types would drive.

**Track R.** PLAN §9 sets its terms. A proposal the maintainer approves fixes, before anything runs:

- the classes and parameters, and the budget raise;
- which of them are spec deviations: resting offsets depart from PLAN §3.3's threshold rule, and rectification from the spec's bidirectional gap junctions;
- its evaluation budget.

Every primary null gets the same procedure and budget. R's parameterisation comes from experiments on the real wiring, a design step the nulls don't get, and checkpoint 6's report will say so. R ends when checkpoint 1 reaches at least partial or its evaluation budget is spent. The ladder and fallback 3's cut B-types are its starting points, and PLAN §10's rule on changes after held-out results applies.

**Checkpoint status.**

- **Checkpoint 0:** not run formally. The silenced controls above pass, but while the intact model doesn't crawl its crawling clause can't fail.
- **Checkpoint 1:** a fail; not run formally.
- **Checkpoints 2 to 6:** not reached.

**What changes now.**

- **The ledger** says crawling does not yet emerge. It records the three assumptions at odds with the evidence as caveats on the thresholds, gap junctions, neuromuscular connections and synaptic strengths, and Liu, Chen & Wang 2014 and Liu et al. 2017 join `citations.ts`. `FIDELITY.md` no longer says nothing is simulated, and the README says where the project stands.
- **PLAN** records the outcome and track R in §9, what each fallback did in §10, and the corrected Kim et al. entry and the precedents above in §11. Checkpoint 0's first formal run moves from milestone 0c to the harness at milestone 3 (§7.2), a change of schedule, not of threshold. Milestone 2's long-run parity statistic, which assumes crawling, is settled when milestone 2 starts.
- **The spec**'s §2.5 description of Kim et al. is corrected to match PLAN §11.

**Status.** Decided with the maintainer on 2026-09-26. The spec §2.5 correction needs the maintainer's sign-off. Signed off when its pull request (#7) merged on 2026-09-26 (noted 2026-09-30).

## 2026-09-26 — The 3D graph: an unbent, stretched worm, drawn in raw WebGPU

**Decision.** Milestone 1's first part draws the connectome as a rotatable 3D graph and adds visual regression CI. The inspector with provenance badges follows in its own PR. The PR's review reworked the layout, the line rendering and the picking; this entry describes the result.

- **Layout.** Each soma starts where the WormBase Virtual Worm reconstruction (via c302) puts it, with three changes, all display choices the ledger lists as presentation:
  - **The posed bend is unbent.** The reconstruction is posed with a bend, which in a graph reads as the worm bending. The 75 motor neurons of the eight ventral-cord classes (AS, DA, DB, DD, VA, VB, VC and VD), whose somata line the ventral midline from the retrovesicular to the preanal ganglion, trace the posed midline: a Gaussian-weighted local linear fit (standard deviation 15 µm). Beyond the cord the line runs on straight along its end direction. Each soma is placed by how far along that line its nearest point lies, and by its offset from the line, measured across it, so its place relative to the cord is kept.
    - The cord's somata end up a median 0.65 µm from the axis; the furthest are VD7 (7.1 µm) and VB7 (4.7 µm), beside the vulva.
    - The fit's tightest bend has a radius of 69 µm, more than any soma's 41.6 µm offset, so every soma has one nearest point.
    - The head ahead of the cord is unbent rigidly, turned with the cord's end: every distance between its somata is kept.
    - The review of this PR found that a first version subtracted the line's offset at each soma's own position without turning the frame. That shear moved somata well above a tilted stretch of cord along the body by up to 18 µm; unbending replaced it.
  - **The body axis is stretched where neurons crowd.** A soma at fraction f of the unbent body (865.5 µm from nose to tail tip) is drawn at u(f) = 0.4 f + 0.6 F(f), where F is the share of somata in front of f, smoothed by a Gaussian with a standard deviation of 1% of the body. The first sixth of the body holds 187 of the 302 somata and gets 44% of the drawn length. Order along the unbent body is kept exactly.
  - **The cross-section is enlarged,** to 0.034 layout units per µm against 0.014 on average along the body, about 2.5 times as much. The stretch is uneven, though: where neurons crowd, the axis is stretched more than the cross-section, and 163 of the 302 somata sit where it is, so the head is drawn elongated.
- **Drawing.** Raw WebGPU, as spec §3 requires:
  - Neurons are sphere impostors, their edges antialiased by alpha-to-coverage into a 4× multisampled target, sized by the square root of their total EM sections and coloured by class.
  - Only a selected neuron's connections are drawn (spec §7), as lines of constant screen width. Their width and opacity grow with the square root of their EM sections, their colour gives the sign (excitatory, inhibitory, or no sign known), and gap junctions are dashed. Every other neuron dims.
  - Lines are clipped to the near plane before projection, interpolate linearly in screen space, and take their alpha from their coverage of each pixel, so width and dashes hold at any depth.
  - Mild fog gives depth. The GCaMP green stays reserved for activity, which milestone 2 brings.
- **Camera and input.** An orbit camera starts in front of the animal's left side and a little above it, head nearest, at the distance where every soma falls inside the frame, and refits as the window changes shape until it is moved.
  - Mouse: drag turns, scroll zooms, shift- or right-drag pans, a click selects, and a double-click flies to a neuron or, on empty space, resets.
  - Touch: drag turns, a pinch zooms, two fingers pan, a tap selects.
  - Keyboard, with the canvas focused: the arrows turn (with shift, pan), + and − zoom, [ and ] step through the neurons from nose to tail, Home resets and Escape clears the selection.
  - Picking takes the neuron whose drawn disc is under the pointer, nearest the camera first, and only then the nearest within a reach (8 px for a mouse, 18 for touch).
  - The URL can pin a view: `neuron`, `yaw`, `pitch` (degrees), `dist`, and `tx`, `ty`, `tz` for its target.
- **Failures are explained.** Every failure after the GPU check, including a pipeline that fails validation, the GPU being lost at any point and a GPU error while drawing, replaces the graph with a message, as spec §3 requires.
- **Visual regression CI,** ported from Universe Atlas's:
  - The `visual` job serves the build, runs it in headless Chrome, and captures four fixed views: the whole graph, the head, AVAL selected and VB6 selected. The capture log names the adapter that drew them: SwiftShader, the software Vulkan that ships with Chrome, offered as WebGPU's fallback adapter (vendor "google", architecture "swiftshader"). Chrome offers no adapter at all unless Mesa's Vulkan drivers are installed, so the job installs them, as Universe's does, but the frames come from SwiftShader, which pinning Chrome pins too.
  - Each frame is read back through the app's `window.__snap`, which renders into a texture of its own; on software GPUs every canvas-side readback is black. With `?norender=1` nothing is presented, so the snapshot is the only work on the queue.
  - A capture fails on a uniform frame, a page error or an app that never becomes ready. A comparison fails when more than 0.1% of pixels differ beyond pixelmatch's threshold of 0.12, or when a view has no baseline. At 0.5%, the review found, losing every link or swapping the signs in the VB6 view passed; CI reproduces its baselines exactly, and a local GPU comes within 0.03% of them.
  - Chrome (154.0.8037.57, the version puppeteer-core 25.12 targets), and with it SwiftShader, and the runner image (ubuntu-24.04) are pinned: an unpinned stable Chrome broke Universe's identical job, and this one gates merging and deploying. The log names Chrome's version and the adapter that drew the frames.
  - The baselines are CI's own captures, since SwiftShader's pixels differ from a local GPU's.
- **Dependencies.** Development only: `puppeteer-core` drives Chrome, and `pixelmatch` and `pngjs` compare the PNGs. The app gains no runtime dependency.

**Why.**

- **The layout.** Spec §7 asks for anatomical positions with a readable head. Unbending removes the pose's false curvature while keeping every soma's place relative to the cord, and a density-weighted axis gives the ganglia room while keeping order, which uniform scaling can't do: at uniform scale the head's 187 somata would share a sixth of the length.
- **The CI.** Universe's net already works on GitHub's GPU-less runners, and lint, types and unit tests can't see a blank render pass.

**Status.** Done. The baselines are CI's captures of the final commit.

## 2026-09-26 — The repository is public, and main deploys to GitHub Pages

**Decision.** The maintainer made the repository public, and the site now deploys from `main` to https://chrisjz.github.io/wormlight/.

- **Pages.** Its source is GitHub Actions, and the repository variable `DEPLOY_PAGES` is `true`, so the `deploy` job publishes `main` after `checks`, `data` and `visual` pass, one deploy at a time. `BASE_PATH` stays at its default, `/wormlight/`, since the account has no custom domain; the build puts every asset, the data file and the notice under it. The first deploy was a rerun of `main`'s CI at the merge of PR #7.
- **Security.** Secret scanning with push protection, Dependabot alerts and private vulnerability reporting are on, and `SECURITY.md` says how to report. Dependabot's automatic pull requests are off, since they would cut across one PR at a time. The workflow's token only reads unless a job asks for more, checkouts keep no credentials, and the one third-party action, `browser-actions/setup-chrome`, is pinned by commit.
- **Before going public** the tracked files and their history were checked for local paths, tokens, keys and environment files; none were found. Neural Interactome's code isn't vendored: the reference tools fetch it at a pinned commit.
- The repository's description, homepage and topics are set, and a ruleset the maintainer set up protects `main`, requiring a pull request and the `checks`, `data` and `visual` jobs.

**Why.** The project is meant to be shared, and a Pages site is public either way. The rest is the usual care for a public repository whose workflow runs on other people's pull requests.

**Status.** Done. It supersedes the 2026-09-24 entry that kept deploys gated while the repository was private.

## 2026-09-26 — The inspector: every connection's sign, with its source and level

**Decision.** Milestone 1's second part adds the inspector (spec §6 "Inspect"). Selecting a neuron opens a panel, a sheet along the bottom on a narrow or short screen, that shows:

- **Who it is.** Its name and class, its transmitters (Wang et al. 2024) or that no release is identified, where its soma sits, what it senses, and its part in the model's rhythm, if any.
- **Its connections.** Synapses onto and from other neurons, gap junctions, and synapses onto muscle, strongest first, eight to a group until expanded. Each row gives the partner, the sign (+, − or 0), the EM sections as a number and a bar, and a badge with the sign's source and fidelity level:
  - **Physiology**, level 5 (measured), naming the paper, for the 7 connections signed from recordings;
  - **Expression**, level 4 (derived), for Fenyves et al. 2020's predictions, where Wang et al. confirm the primary transmitter they rest on;
  - **Transmitter rule**, level 0 (assumed), for the rule on the presynaptic cell's primary transmitter alone;
  - **No sign**, level 0, where that transmitter implies no fast sign and nothing else gives one, so the model gives the connection no fast effect;
  - **Receptors**, level 4, or **No ACh or GABA**, level 0, on muscle;
  - **EM**, level 5, on a gap junction, which has no sign: the badge vouches for its existence, from Cook et al. 2019 as corrected in Emmons 2024.
- **Its partners as links.** A partner's row selects it, and pointing at one marks it in the graph.

A key under the lists explains every badge shown, so the sources are readable without hovering, and it points to the fidelity ledger. The levels are the ledger's own (PLAN §2.4 and the ledger's sign components), and a test keeps the two the same and checks that each explanation opens with its level's name.

Also: a "Find a neuron" box (the `/` key reaches it from anywhere but a text field) selects a neuron by name and flies to it, answering the review's point that keyboard and screen-reader users need a way to reach a neuron; hovering the graph labels the neuron under the pointer; and the camera frames the graph beside the panel, or above the sheet, as it does above the legend.

**Why.** The spec asks for provenance down to each connection's sign (§1.3), and the connectome's signs are mostly inferred: of 3,709 chemical connections, 7 are signed from physiology, 1,716 from expression, 1,453 from the transmitter alone and 533 not at all. A reader should see which kind each one is, where they look at it.

**A level corrected.** PLAN §4.4 gave level 4 to a cell that releases neither acetylcholine nor GABA having no fast effect on muscle, while the ledger gives it 0. The ledger stands: Richmond & Jorgensen 1999 show which receptors muscle has, but no source shows that these 32 cells, glutamatergic, dopaminergic or unidentified, have no effect on it, so the "no effect" is our assumption. PLAN now says level 0; the model is unchanged.

**Milestone 1 summary.**

- **Works.** The graph renders in raw WebGPU on a local GPU and on CI's software GPU, where four fixed views match their baselines exactly; the inspector shows each connection's sign source and level. Both exit criteria in PLAN §9 are met. The site deploys from `main`.
- **Doesn't yet.** Nothing moves: activity comes with milestone 2, the body with milestone 3 and the glow with milestone 6. The graph shows one reconstruction's somata, laid out as a display choice (the entry above).
- **Checkpoints.** Unchanged since milestone 0c: checkpoint 0 not yet run formally, checkpoint 1 a fail, checkpoints 2 to 6 not reached.

**Status.** Done.

## 2026-09-26 — The neural model on the GPU, and what parity compares

**Decision.** Milestone 2 puts the neural model on the GPU and checks it against the CPU reference.

- **The kernel** (`src/gpu/brainShader.ts`) mirrors `Brain.step` step for step, the same equations in the same order: BDF2 voltages (implicit Euler without a history) solved by Jacobi-preconditioned conjugate gradients from the last step, the oscillators linearised as on the CPU, then activation and recovery by BDF2, with the noise drawn from the same hash. The network runs in one workgroup of 256 invocations, each keeping the state of one or two neurons in registers, so a dispatch takes any number of steps with only barriers between them; a long run is split into dispatches of at most 128 steps, so none trips a GPU watchdog. It binds 7 storage buffers and uses 8 KB of workgroup memory, within WebGPU's default limits.
- **`GpuBrain`** (`src/gpu/brain.ts`) holds the buffers and trades state with the CPU's `Brain` as a `BrainState`, which the CPU reference now exports and restores whole, history included. It takes any network, lesioned or rewired, with the thresholds the caller gives; parity runs it on the intact network and on one lesioned one.
- **Parity** (`npm run gpu:parity`, and the `gpu` CI job on SwiftShader) runs `parity.html`, a page the dev server serves and the build leaves out.
  - **The states.** The CPU reference in the page runs the closed loop with trial values (g_osc = 2 nS, θ_osc = −16 mV, σ_n = 0.01 pA·√s, the rest as the loop tests have them; seed 1), and takes 20 states every 0.5 s from 2 s to 11.5 s, plus the rest state. From each, both brains take one step and then one second, the state's input held and the noise on.
  - **The noise.** The hashes and uniforms must match exactly, and each Gaussian must lie within the error WGSL allows `log`, `sqrt` and `cos`. The one-step check adds that error's worst effect to its voltage tolerance, since the implicit solve moves no voltage by more than dt/C times the current's error. At these states the allowance is 0.75 to 0.97 µV, about the base tolerance of the median neuron. WGSL lets `log` return 0 or more for the four uniforms within 2⁻²¹ of 1, so the shader holds −2 ln u at 0 or above rather than take the square root of a negative number, which a review found could otherwise happen about once in 17 simulated seconds.
  - **The API.** Five checks cover what the states don't: a new brain's rest state, a state's round trip, a run split across dispatches against one dispatch a step, a restart, and the CPU carrying on from a state the GPU read. One lesioned case (AVA and AVB), without oscillators or noise, restarts its integrator halfway through its second.
- **The Safari check** is the same page opened in Safari: `npm run dev`, then `/parity.html`. The maintainer couldn't run it at milestone 2, so it moves to milestone 3 (PLAN §9). Until it runs, the GPU brain is checked only in Chrome.
- **Merging.** `main`'s ruleset now requires the `gpu` job, as it requires `checks`, `data` and `visual`, and deploying needs it too.

**Decided with the maintainer before any parity results.**

- Milestone 2 comes before research track R, which runs on the CPU reference and can be scheduled between any later milestones.
- Long-run parity needs the body on the GPU, so it moves to milestone 3, with the full step's speed. Milestone 2 measures the brain's step, and its one-second runs hold each state's input, since the body that would change it isn't on the GPU yet.
- While the worm doesn't crawl, long-run parity compares the mid-body curvature's frequency and its standard deviation of κL, as the go/no-go script measures them (`scripts/experiments/go-no-go/loop.ts`), by the same ±5% two one-sided tests. It returns to crawling frequency and speed once checkpoint 1 reaches partial. PLAN §7.2 and §9 now say so.

**Changed after results: what the one-step check compares (PLAN §7.2, marked changed).** As first built, the check compared the GPU with the CPU reference at the reference's own solver tolerance, 10⁻⁶, while the GPU solves to 10⁻⁵ (PLAN §3.4). A review found that it passed only because of the noise's allowance, which was covering something else:

- **What the difference was.** Almost all of it was the gap between the two stopping rules, not f32 or the port. The f64 reference, rerun at 10⁻⁵, gives the same per-state shares as the GPU to three figures, and the same solver iteration counts. Against PLAN's tolerance without the allowance, 7 of the 21 states fail, the worst at 2.4 times it (SIBDL, at −1.8 mV, in the state at t = 6.5 s), and they fail the same way for the f64 reference at 10⁻⁵. PLAN's two settings, fixed in advance, can't both hold.
- **The rule, the maintainer's choice.** The GPU is compared with the CPU reference solved at the GPU's own tolerance, so the check sees the port's arithmetic, and the allowance covers only the noise's rounding. The comparison with the reference at its own tolerance is reported, not graded. The recovery variable is now graded too, at the voltage's relative tolerance with a floor of 1, since a fault in it can't reach the voltage within one step.
- **The other way.** Tightening the GPU's tolerance to 10⁻⁶ would have kept the check as written, at about 15% of the speed and at the f32 floor the review measured, and would have made the one-second rule below grade the state it sets aside, which then fails.

**Changed after results: which one-second states are graded (PLAN §7.2, marked changed).** By the check as first fixed, the one-second check fails: on the M5 Max, 20 of the 21 states passed with room to spare (worst RMS relative error 0.0024 against 0.01), but the state at t = 10.5 s reached 0.033.

- **Ill posed, not a GPU fault.** The f64 CPU reference fails the same state against itself, at 0.020, when its only change is its solver tolerance set to the GPU's 10⁻⁵; an f32-rounded starting state alone costs 8 × 10⁻⁵. Against a 10⁻¹⁰ solve, the reference at its own 10⁻⁶ is 0.0088 away, and the error is not monotonic in the tolerance (0.0003 at 5 × 10⁻⁶, 0.023 at 3 × 10⁻⁶). The GPU at 10⁻⁶ still gives 0.027.
- **The cause.** VA1, an A-type oscillator, starts its fast FitzHugh–Nagumo upstroke in the last 60 ms of that second, and the sample at 1 s catches it near the top of the jump, still rising, near 0 mV. A sub-step difference in when the jump starts is a few tenths of a millivolt there, which the check's 1 mV floor counts as a 35% error. Any two solves differ so: the sensitivity for which spec §8 compares long runs by behaviour.
- **The rule, the maintainer's choice.** A state is graded only if it is well posed: if the CPU reference, rerun at the GPU's solver tolerance, stays within the threshold of itself. The others are reported with that figure, not graded. The check also fails if more than a quarter of the states are not graded, since it would then test little; that guard was added in implementation, unasked, and only makes the rule stricter. Today the rule sets aside t = 10.5 s alone.

**Results on the M5 Max** (Chrome 153, Metal):

- **Noise.** All 100 hashes and 4,841 uniforms identical; the largest Gaussian error 5 × 10⁻⁷, a negligible share of WGSL's bound.
- **The API and the lesioned case.** All five API checks pass; the lesioned case passes one step at 0.007 of its tolerance and one second at 7 × 10⁻⁵.
- **One step.** All 21 states pass. The worst voltage error is 0.011 of its tolerance, noise allowance included, and 0.015 without it; the worst activation error is 3 × 10⁻⁴ of its tolerance and the worst recovery error 0.002. The GPU's solver takes the same number of iterations as the CPU's at the same tolerance in every state. Against the reference at its own tolerance, reported, 7 states exceed the tolerance, as above.
- **One second.** All 20 graded states pass, the worst at 0.0024; t = 10.5 s is not graded (0.033 on the GPU, 0.020 for the reference against itself).
- **Speed.** The brain step runs at about 29× real time at 2.5 ms in dispatches of 67 steps (5.7 to 5.8 ms each) and about 25× in dispatches of 7 (0.7 ms), about 10 solver iterations a step: three times the 10× target, which applies to the full step (milestone 3). The CPU reference's brain runs about as fast in the same page, which agrees with the spec's point that at this scale the GPU is a showcase choice.

**Results on CI's SwiftShader** (Chrome 154, the fallback adapter): the same verdicts, in about a minute.

- **Noise.** The hashes and uniforms are identical. The largest Gaussian error is 6.7 × 10⁻⁴, 39% of WGSL's bound, against 5 × 10⁻⁷ on Metal: SwiftShader's transcendental functions use much of the latitude WGSL allows.
- **One step.** All 21 states pass, the worst at 0.106 of the tolerance with the noise's allowance and 0.48 without it. Here the allowance does the job it was built for: the difference is the noise's rounding. The solver iteration counts again match the CPU's in every state.
- **The rest.** The API checks and the lesioned case pass. The graded one-second states pass, the worst at 0.0048, and t = 10.5 s is again the one not graded (0.035 on the GPU, 0.020 for the reference against itself). The speed there, 0.4× real time, says nothing about a real GPU.

**Milestone 2 summary.**

- **Works.** The neural model runs on the GPU and matches the CPU reference by PLAN's one-step and one-second checks, as changed after results, on the Mac's GPU and on CI's software GPU, where the `gpu` job gates merging and deploying. The brain steps at about 29× real time on the M5 Max.
- **Doesn't yet.** The app doesn't run the GPU brain: nothing on screen moves until the body and the plate view arrive with milestone 3, which also brings long-run parity and the full step's speed. The glow comes with milestone 6. Safari is unchecked: its check moves to milestone 3.
- **Checkpoints.** Unchanged: checkpoint 0 not yet run formally, checkpoint 1 a fail, checkpoints 2 to 6 not reached.

**Status.** Done, but for the Safari check, which the maintainer postponed to milestone 3 on 2026-09-26, since it couldn't be run then.

## 2026-09-26 — The whole loop on the GPU, and what f32 can hold of the body

**Decision.** Milestone 3's first part puts the rest of the loop on the GPU beside the brain: each step is now `World.step` there, from the body's curvature to the body's next place.

- **The kernel** (`src/gpu/brainShader.ts`) takes each stage in the CPU's order: curvature from the rods; the proprioceptive currents and the head switch, gated on the network's drive on the SMDs; the brain, as in milestone 2; the neuromuscular layer; and the body, whose block-tridiagonal system is solved by block cyclic reduction on 63 rows, the rods and then identity rows, in the brain's workgroup. The brain's vectors and the body's blocks share one pool of workgroup memory, since they are never needed at once, which keeps the kernel to 15,360 of the 16,384 bytes WebGPU guarantees; it binds all 8 storage buffers a stage may have. A test holds it to both limits.
- **What f32 can't hold.** The body's stiffest springs, the diagonals at 7 N/m against the laterals' 0.02, stretch by nanometres, and at the thin tail by less than an ångström. So each rod's position and angle are kept as a coarse part on a power-of-two grid (2⁻²⁰ m, 2⁻¹⁰ rad) and a small remainder; each segment's run between its rods is taken as the coarse parts' difference and the remainders' difference, kept apart in workgroup memory until summed; each angle is kept within a half turn, whole turns counted apart; its cosine and sine, and the turn between segments, come from series written for the kernel, since WGSL allows `cos`, `sin` and `atan2` far larger errors than the body can take; a spring's stretch is taken from squared lengths; and the rotation's unknown is scaled by the body's radius.
- **Metal rearranges arithmetic.** Two faults came from it, both found in review and both fixed. Metal's compiler rejoined each rod's coarse part and remainder before differencing, so the body's precision depended on where the worm was in the dish: with the parity states moved 1 cm, the rods' end points' velocities erred at 110 times the tolerance and their centres' at 152, and at 4 cm at 264 and 478 times. And a rod's cosine was off by 4.36 × 10⁻⁸, matching f32's error in π/2 (4.37 × 10⁻⁸), as if the three-part reduction had been folded into one; that error grows with every quarter turn taken out, and angles weren't wrapped, so after 30 turns the rotation erred at 9 times the tolerance. Keeping the differences apart in memory, and angles within a half turn, gives the same figures at the origin, 1 cm and 4 cm away and 30 turns round. No WGSL setting turns the rearranging off, and SwiftShader doesn't seem to do it.
- **`GpuWorld`** (`src/gpu/world.ts`) packs a CPU World's fields, switch neurons, head region, neuromuscular rows, muscle cover and body constants into the kernel's layout, and trades whole states with it; the CPU's `World` now exports and restores a `WorldState`, takes its brain's solver settings, and can take the switch's threshold.
- **Parity** runs the whole loop from the rest world and twenty from its closed loop, one step and one second, beside milestone 2's brain checks; from copies of those states moved 3 cm across the dish and turned 50 times, which the CPU doesn't notice and the GPU must not; and from states of two variants that exercise the head switch, which with the trial values latches before the first state and never flips again. Lowering P_th to 0.5 makes it flip, in 4 of the variant's 11 one-second windows; putting θ_osc at −1 mV, within the SMDs' drive, makes its gate turn on and off, 3,585 times over its 11 windows. The switch's state is compared after one step and at every sample of each second. Loop API checks cover a round trip and a run split across dispatches. Long runs are `--long`, 11 to 18 minutes on the M5 Max and so local only (below).
- **The harnesses' dev server** runs with hot reload off, since an edit made during a long run reloaded its page and ended it.

**Decided with the maintainer before any loop results.** The body's thresholds extend §7.2's relative rule: one step, each rod's velocity within 10⁻⁴ of the body's largest, normwise and separately for x, y and θ, each muscle's |ΔA| ≤ 10⁻⁴, the same head-switch state; one second, the RMS error of κL ≤ 10⁻² × max(RMS κL, 1) and the centroid's displacement within 10⁻² (floor 0.01 body lengths), under the well-posed rule. The floors for a body at rest (10⁻⁴ segment lengths per second, 10⁻⁴ rad/s) were filled in during implementation, not chosen by the maintainer. That rule was committed on its own (`dd7965e`) before the loop first ran on the GPU.

**Changed after results: the velocities' threshold, 10⁻⁴ to 10⁻² (PLAN §7.2, marked changed).** No f32 assembly of this system can reach 10⁻⁴, short of emulating wider arithmetic. Its rigid motions are held only by drag, along the body some 2,000 times weaker than the diagonal dampers and in rotation weaker still: rounding the state alone to f32 costs up to 3 × 10⁻⁴, and an f32 assembly from an exact state, solved in f64, reaches 6 × 10⁻³ in some states. The maintainer chose 10⁻², the one-second threshold: a wrong sign, term or index would err by 10⁻² to 1. In putting the choice, the rotation's error was misreported as 7.6 × 10⁻⁴ relative; it was 7.6 × 10⁻⁴ rad/s, 1 to 3% of the largest rotation rate. So 10⁻² was chosen in the belief that the rotation would pass it; it didn't, which led to the next change.

**Changed after results, then undone: grading the rods' end points.** At 10⁻², the rods' own rotation rates failed in 7 of 21 states, all at the tail. The cause was put down to the fine cancellation there and to Metal's folding of the angle reduction, and the maintainer chose to grade each rod's two end points instead, which passed. A review found the real cause: Metal rejoining the split coordinates, the fault above, of which the folding explained about 2% here. Once it was fixed the rods' centres and rotation passed at 10⁻², at every place and turn, and the maintainer reinstated them; the end points are reported.

**Changed after results: long-run parity's seeds, 20 to 265 (PLAN §7.2, marked changed).** As planned, 20 seeds a side, long-run parity did not pass: the SD of κL was equivalent (p = 0.03) but the frequency was not (p = 0.25), and could not have been whatever the means. Its seed-to-seed spread, 0.0297 Hz or 18% of the mean, gives the difference a standard error of 0.0094 Hz, and Welch's two one-sided tests at α = 0.05 can pass only below about 0.0050 Hz (the 0.0085 Hz margin over t₀.₉₅). The maintainer chose to keep that run as a pilot and size the check from its spread, not its difference: 90% power at no true difference needs a standard error of at most 0.0085 / 3.29, which takes 265 seeds a side. That run was on an earlier kernel, with a refinement step since removed and before the fixes above, so its figures don't reproduce on the kernel now. The test's form (Welch's, unpaired, at ±5% of the CPU's mean, α = 0.05) was fixed in code before the first long run. The sides share each seed, so the samples are paired (r = 0.69 in the pilot); Welch's test ignores that, which costs power but can't favour a pass.

**What the long-run statistic measures here.** With the trial values the worm doesn't undulate: mid-body κL drifts slowly, from about 0 to about 0.7 over the 50 s window, with ripples on it. So the "frequency" counts ripples as the drift passes its mean (the counts come out odd, quantising it in steps of 0.02 Hz), and the SD measures the drift's range. The comparison is still of like with like, and the statistic returns to crawling frequency and speed once checkpoint 1 reaches partial.

**Long-run parity on the M5 Max** (265 seeds a side, 60 s each, 11 to 18 minutes a run): both statistics are equivalent. The SD of κL is 0.2147 on the CPU and 0.2148 on the GPU, a difference of 0.07% against a margin of 5% (p = 4 × 10⁻¹⁵); the frequency is 0.1652 and 0.1662 Hz, 0.6% apart (p = 0.002). Reported, not graded: the two sides' spreads are alike, the GPU's variance over the CPU's 1.03 for the SD (F test p = 0.81) and 1.05 for the frequency (p = 0.69), where before the fixes above the frequency's had differed (p = 0.03); and no solve failed to converge on either side.

**Results on the M5 Max** (Chrome 153, Metal):

- **The brain** is as in milestone 2: every check passes, the one-step worst at 0.012 of its tolerance, and t = 10.5 s is again the one-second state not graded.
- **The loop's API checks** pass: a world goes in and comes back, and 150 steps split into two dispatches equal 150 of one.
- **The loop, one step.** All 85 states pass: the trial values' 21, their 42 moved and turned copies, and the variants' 22. The centres' velocities are within 0.71 of their tolerance in x, 0.03 in y and 0.15 in θ, the same to three figures at the origin, 3 cm away and 50 turns round, and within 0.87 in the flipping variant; the muscles within 6 × 10⁻⁴ of theirs; the head switch agrees in every state; the brain's solver takes as many iterations as the CPU's in every state. The end points, reported, are within 0.36.
- **The loop, one second.** Of 48 states, the 41 graded pass, the worst voltage error at 0.38 of its threshold, curvature at 0.003 and the centroid at 0.0015, the switch agreeing at every sample. Seven are ill posed (the reference against itself above the thresholds), within the quarter the check allows: t = 4.0, 11.0 and 11.5 s, two of their moved and turned copies, and two gating states.
- **Speed.** The whole step runs at about 24× real time at 2.5 ms in dispatches of 67 steps (6.8 ms each) and about 21× in dispatches of 7, for the step alone: more than twice the 10× target PLAN sets for the full step. Rendering and readback come with the plate view.

**Results on CI's SwiftShader** (Chrome 154), the brain's and the loop's short checks in 259 s: every check passes. The loop's 85 one-step states have their centres within 0.51 of the tolerance in x, 0.04 in y and 0.15 in θ, the muscles within 6 × 10⁻⁴, and the switch agreeing; the 41 graded one-second states pass, curvature's worst at 0.003 of its threshold, with the switch agreeing at every sample; the same seven states are ill posed. Long runs aren't run on CI.

**Status.** Milestone 3's first part is done: the loop runs on the GPU and matches the CPU reference anywhere in the dish, the step alone clears the 10× target, and long-run parity passes at the seed count changed after results. The behavioural harness with checkpoints 0 and 1, and the plate view, come next; milestone 3's Safari check, which now includes milestone 2's, comes with them.

## 2026-09-26 — The Safari check: GPU parity passes in Safari

**Decision.** None to take: this records milestone 2's Safari check, postponed to milestone 3, and milestone 3's "the parity page passes in Safari", run together by the maintainer on `main` after milestone 3's first part merged, on the same M5 Max (Safari's adapter names itself "apple apple").

**The short checks.** Every check passes, brain and loop, and the figures match Chrome's on Metal almost exactly:

- **Noise.** The hashes and uniforms are identical; the largest Gaussian error is 5 × 10⁻⁷.
- **The brain.** The API checks, the 21 one-step states (worst 0.011 of the tolerance), the one-second states (t = 10.5 s again not graded) and the lesioned case all pass.
- **The loop.** The API checks pass; the 85 one-step states have their centres within 0.87 of the tolerance in x, 0.03 in y and 0.15 in θ, the muscles within 6 × 10⁻⁴, and the switch agrees in every state; the 41 graded one-second states pass, the voltage's worst at 0.40 of its threshold, with the switch agreeing at every sample, and the same seven are ill posed.

**The long runs** (265 seeds a side, 60 s each) pass. The SD of κL is 0.2147 on the CPU and 0.2148 on the GPU (p = 2 × 10⁻¹⁵); the frequency 0.1667 and 0.1656 Hz, 0.7% apart (p = 0.002). The spreads are alike (variance ratios 1.05 and 0.97, F test p = 0.68 and 0.78), and no solve failed to converge. The CPU side's frequency differs from its value in Chrome (0.1652 Hz) though the code, seeds and data are the same, most likely because JavaScript lets each engine compute `Math.exp`, `Math.log` and `Math.cos` to its own last bits, and 60 s of these dynamics amplify the difference. So the CPU reference is likely reproducible exactly only within one engine, one more reason long runs are compared by statistics.

**Speed.** The brain step runs at about 16× real time in Safari and the whole step at about 11×, for the step alone: under half Chrome's (29× and 24×), and still above PLAN's 10× target, which PLAN sets in Chrome. The spec's Safari target, 60 fps in real time, is checked with the plate view.

**Status.** Done: milestone 2 is complete, and milestone 3's Safari parity criterion is met. Its other Safari criterion, 60 fps real time, waits for the plate view.

## 2026-09-26 — The behavioural harness, and what checkpoints 0 and 1 run on before calibration

**Decision.** Milestone 3's second part is the behavioural harness (PLAN §8), running checkpoint 0's crawling clause and checkpoint 1 on the CPU reference. Three things PLAN left open were put to the maintainer, and settled, before any trial ran.

- **Parameters.** Calibration waits for track R, so the eight calibrated parameters have no values, and a trial can't run without them. Until calibration, the harness, and later the app, run on provisional values: the best of the planned model's 96 go/no-go draws, draw 46, which moved at 0.021 body lengths per second in 30 s runs from a straight body while holding a bend. They are rounded to three significant figures, which changes that speed only in the fifth: g_osc = 798 pS, τ_w = 1.53 s, θ_osc = −11.5 mV, g_sw = 258 pA, g_p = 16.7 pA, g_nmj = 2.45 per EM section and θ_nmj = 3.48 EM sections. The noise is off, as the go/no-go ran. They sit in `params.ts` as `provisional`, beside the calibrated values, which stay unset; `FIDELITY.md` lists them, and `calibratedParams()` still refuses. They are the same eight parameters, so the budget doesn't change.
- **Starting postures.** PLAN §7.4's "random postures" are real ones. Each trial starts from one of the 6,655 postures in the OIST Physics of Behavior tutorials' `data/shapes.csv`, which the tutorial introduces as coming from Stephens et al.'s experiment. The file is pinned by digest at the commit the tutorials' Zenodo archive (v1.0, CC BY 4.0) holds, byte for byte the file in that archive. The trial's seed draws the posture and a heading uniform on the circle; the head is at the first angle, as for the eigenworms, and the brain, muscles and head switch start as in any World.
- **Forward and backward.** Sampled every 0.1 s, the centroid's velocity is its displacement over the centred 1 s window, projected on the direction from the centroid to the head at the window's middle, as the go/no-go projected speed. Above +0.01 body lengths per second it is forward, below −0.01 backward, and between them a pause, which ends a bout or a reversal.

**Considered.**

- For the parameters:
  - running §7.3's calibration on the planned model now, which would bring calibration forward from track R and make final a result for a model the go/no-go showed can't reach the targets;
  - the parity runs' trial values, which were chosen to exercise the head switch, not to crawl;
  - the same draw with the noise at the parity runs' 0.01 pA·√s. The go/no-go entry had said checkpoint 0 would run with noise, but draw 46 was chosen without it.
- For the postures: random eigenworm amplitudes, which would add scales set by hand, and a straight body, which isn't what PLAN says.
- For the floor: none, under which a silenced worm drifting at any speed would count as crawling; and the partial band's 0.06, since selecting bouts by speed would meet the speed clause's partial automatically.

**Proposed to the maintainer with those questions** (PLAN §7.4). The kinematics, pooled over all forward bouts of 10 s or more, measured as the go/no-go measured them:

- **Speed** is the mean forward velocity.
- **Frequency** is half the mid-body curvature's crossings of each bout's mean, over the bouts' total duration, as the go/no-go and long-run parity count it.
- **Wavelength** was 0.3125 body lengths, between the go/no-go's rods at 0.29 and 0.60 body lengths, over the frequency times the lag at which their curvatures correlate best; changed after results (below).

**Filled in during implementation, before any trial ran** (PLAN §7.1 and §7.4):

- Every measure starts after each trial's first 10 s, as the eigenworm clause and the go/no-go do.
- The wavelength's lag was searched from 0.1 s to one period, with the correlations summed over bouts and the peak refined by a parabola through its neighbours; a forward wave runs from head to tail, so the rear rod lags.
- A posture self-intersects when any two non-adjacent segments of its 101-point midline cross.
- Trials use seeds 1 to 20, and checkpoint 0 the same seeds, so it silences the network on the same postures.
- Each clause is graded pass, partial or fail by §7.4's bands. The checkpoint passes if every clause passes, is partial if every clause is at least partial, and otherwise fails. With no bout of 10 s, the kinematic clauses fail, unmeasured; with no trials, or any trial that leaves the finite numbers, every clause fails.

**Results** (the M5 Max's 18 cores, at `a4c48dd`; both checkpoints' 40 trials take 6 s). Every trial stayed finite, no brain solve failed to converge, and no posture self-intersected. The first run, at `417359e`, gave the same figures but the wavelength's, under the measure since changed (below).

- **Checkpoint 0's crawling clause passes.** The silenced network doesn't move: no forward motion in any trial, each trial's mean velocity within 0.0011 body lengths per second of zero, and no reversals. While the intact model doesn't crawl, this pass says nothing about the wiring (PLAN §9).
- **Checkpoint 1 fails**, as milestone 3 expects until track R. The frequency (0.045 Hz) and speed (0.029 body lengths per second) fall below their partial bands, and the wavelength (5.82 body lengths) far above its; no trial has a forward bout of 20 s. The eigenworm clause passes, at 99.5%.
- **What the intact model does.** From every starting posture it settles into the same cycle. The mid-body bend deepens slowly, to a κL of about −6 over about a minute, as the body creeps to a halt. Then it flips, swinging to the other side and back while the body moves forward for about 25 s, and the cycle starts again. With the noise off, the trials differ only in when they reach the cycle.
- **What the kinematics measure.** Each 25 s forward episode dips once, for 0.8 s, to 0.00945 body lengths per second, 5.5% under the floor, so it counts as two runs of about 11 s. The kinematics come from those runs, 47 bouts of 10 s or more, every trial's longest lasting 11.6 s; ten shorter forward runs fall outside them. Each bout is one swing, not an undulation: the mid-body curvature crosses its mean once a bout, 47 times in 47 bouts, so 0.045 Hz is a swing's timing, not a frequency of undulation. The swing does travel from head to tail, reaching the rear rod 0.48 s after the front (correlation 0.96), about 0.26 body lengths per second; divided by that timing, it gives the "wavelength" of 5.82.
- **The bout clause turns on the floor** (checked after results; the rule is kept). At a floor of 0.0095 body lengths per second the longest run in each trial is about 12.2 s, and at 0.009 it is 25.1 to 25.2 s, when the bout clause would pass in every trial. The maintainer chose to keep the rule fixed before the trials, and to report this; track R's proposal may revisit it before anything runs. PLAN §7.1's older wording, a bout lasting "between reversals", now says what the rule set before the trials says: a pause or a reversal ends one.
- **Why the eigenworm clause passes.** The postures are smooth bends and slow swings between them, which the first four modes capture almost entirely. The covariance is taken about the mean posture, as Stephens et al. took it, so the clause scores the swings about the bend rather than the bend itself; about zero instead, it would be 99.1%. The clause measures how worm-like the postures are, not whether the worm crawls, so it passes a model that doesn't. It stays in the verdict as PLAN fixes it.
- **Deterministic.** Rerun, with any number of workers, the records are identical.
- **Cost.** Checkpoint 1's trials take about 1.4 CPU-minutes per worm-hour, worker start-up included, below the 2–11 PLAN §7.5 took from the review's benchmarks. That is without the odour field, which checkpoint 4 adds.

**Changed after results: the wavelength's measure (PLAN §7.4, marked changed).** A review of the first run found that the two rods, 0.3125 body lengths apart, sit about half a target wavelength apart. There a forward wave, a backward one and a standing one all lag by about half a period, so the measure can't tell them apart. At 0.3 Hz, a standing wave with the rods in antiphase read 0.625 body lengths and a backward wave of 0.65 read 0.602, both passes; only the forward wave read its true 0.650. Since wavelength is a calibration target, calibration could have met it without any wave running down the body. The maintainer chose to change the measure:

- the rods are now 14 and 20, 0.125 body lengths apart, at most 0.31 of a wavelength anywhere in the partial band (0.4–1.0), so the true lag stays within half a period;
- lags are searched both ways, within half a period and never beyond 5 s, half the shortest bout, so each lag pairs at least half of each bout's samples;
- the peak must fall strictly inside the search, on the rear's side: at no lag, a backward one or the search's edge, there is no head-to-tail wave, and the clause fails unmeasured.

It only makes the clause stricter, and changes no verdict: checkpoint 1's wavelength fails under both (3.54 body lengths under the old measure, 5.82 under the new).

**Deferred: the convergence comparison at dt and dt/2** (PLAN §1 and §7.2, marked). PLAN §1 said it waited for checkpoint 1. With the maintainer's agreement it now waits until checkpoint 1 reaches partial: with one mean-crossing a bout, a 2% comparison of the frequency would measure where bouts start and end, not the integrator.

**Status.** Milestone 3's second part is done: checkpoint 1 runs in the harness, a fail until track R, and checkpoint 0's crawling clause passes. The plate view comes next, with milestone 3's 60 fps criterion.

## 2026-09-26 — The plate view: the worm on its dish, drawn from the GPU's own buffers

**Decision.** Milestone 3's last part is the plate view (spec §5–§7): the worm on a 10 cm dish, its whole loop stepped on the GPU, beside the connectome's graph. The maintainer chose, before it was built:

- **A split layout.** The plate and the graph side by side, stacked when the window is taller than it is wide; `?view=plate` or `?view=graph` shows one alone. Considered: the plate with the graph as an inset, which keeps the brain small until asked for, and tabs, which never show body and brain together.
- **A dark-field look, from above.** Dark agar with faint texture and specks, the worm a translucent tube lit at its edges, as a dark-field microscope shows one. It suits the app's dark palette and will keep the glow readable (milestone 6). The camera follows the worm at three body lengths across the pane's shorter side, with the whole dish in an inset. Considered: bright-field, the look of most worm videos, which clashes with the app and would wash out a green glow; and a tilted 3D camera, which a 2D body gains little from.
- **A straight start, seeded.** The worm starts straight at the dish's centre, heading where a seed says: random on each visit, shown on the page, and fixed by `?seed=`. Considered: a real posture, which would mean shipping a subset of the OIST postures and their attribution; the harness keeps those.

**How it works.**

- **Drawing from the simulation's buffer.** `GpuWorld` steps the loop, and the renderer reads the rods' coordinates straight from the kernel's body buffer in a vertex shader, so drawing the worm needs no readback. Only the camera, which follows the worm, and the dish inset read back the rods' centres, a few kilobytes a frame, landing a frame or more behind, as PLAN §1 expects the display to trail the simulation.
- **Pacing.** Each frame runs the whole steps that the wall time since the last frame owes at the chosen speed (¼×, 1×, 4× or 10×), a gap counting for at most a tenth of a second. While two frames' work is still on the GPU, a frame runs no steps, so a GPU that can't keep up runs slower than asked instead of queueing work without limit. The camera's lag behind the worm is 0.6 s of worm time, so a fast-forwarded worm stays in view.
- **What's drawn.** The worm's outline is the body model's: a strip through the rods' centres, smoothed between them by a spline, as wide as the rods' diameters, with its tips faded. Everything else is texture, not simulated anatomy: the body's shading, the pharynx's bulbs and the gut's granules inside it, the halo around it, and the agar's mottle, specks, meniscus, rim and darker corners. The registry's presentation notes say so.
- **What it says.** The app runs on the provisional parameters, and a notice says crawling doesn't emerge yet, linking to `VALIDATION.md`, as PLAN §9 promised it would from the app's first view of the body.
- **A gap.** The dish's wall doesn't stop the worm yet, as PLAN §5.2 has it. With the maintainer's agreement it joins milestone 4, before track R's calibration, when a crawling worm could reach the wall in minutes. At the provisional parameters the worm barely moves: in checkpoint 1's trials it averaged about 0.01 body lengths per second, 0.03 over its forward bouts, and in the app, seeds 1 to 4 strayed no more than 1.3 mm from the centre in 75 minutes of worm time.

**Speed** (the default split view at 1440 × 900, in headless Chrome 153 on the M5 Max, `npm run plate:bench -- 1 10 30 50 100`, after review's fixes):

| Asked | Frames a second | Least in a second | Worm time a wall second | Queued work at the end (ms) |
| ----- | --------------- | ----------------- | ----------------------- | --------------------------- |
| 1×    | 60.0            | 60.0              | 1.00×                   | 0.1                         |
| 10×   | 60.0            | 60.0              | 10.00×                  | 6.2                         |
| 30×   | 60.0            | 60.0              | 30.00×                  | 5.8                         |
| 50×   | 60.0            | 60.0              | 50.00×                  | 12.7                        |
| 100×  | 31.6            | 29.0              | 61.18×                  | 114                         |

- **The whole app,** rendering and readback included, clears PLAN's 10× target with room to spare, and saturates at about 60 to 63× real time across runs, the reviewers' included; up to 50×, the work still queued at a run's end stayed under 13 ms in every run. The step alone measured about 24× in milestone 3's first part.
- **Why it's faster here, likely.** That benchmark ran the last parity state on the parity runs' trial values, whose solves take about 9.9 iterations a step at the GPU's tolerance on the CPU (4.8 with their noise off); the app's worm, on the provisional values, takes about 1.0 once settled. That benchmark also waited after every four dispatches of 67 steps, where the app dispatches up to 128 at once. Neither cause was timed apart, and a calibrated, more active brain may take more iterations.
- **Headless Chrome paces its own frames,** so these say what the GPU and the page sustain, not what a display shows.

**Visual tests.** The graph's four views now load `?view=graph` and match their baselines unchanged: exactly on CI, and locally within 0.03% as before. Three plate views join them, each paused at the start with seed 1: the default field of view, a close-up and the whole dish. Their baselines come from CI's runs of them.

**The window check** (the maintainer, on the M5 Max, `/?stats=1` on the dev server, at speeds up to 10×):

- **Chrome** held 120 frames a second throughout, most likely its pace for a 120 Hz display (not checked).
- **Safari** held 60, most likely its default cap for pages (not checked). It dropped a few times, to no lower than 50, then stayed at 60 without dropping again. The stats line averages over a second.

**Review.** Three reviewers read the branch, and the fixes are in:

- A readback landing after a restart no longer freezes the inset's trail.
- A failure while starting stops both views.
- The inset no longer covers the controls on a phone.
- A click no longer pans.
- The worm's shader no longer squares with `pow`, which WGSL leaves undefined for a base below zero.
- Keys held with Ctrl, Cmd or Alt are left to the browser, in both views.
- Every frame that gives the GPU work counts towards pacing's limit, drawn or not.
- This entry's claims are corrected: an earlier draft put the step's speed-up down to the parity bench running "the most demanding" state, which it doesn't.

**Status.** Done: milestone 3's last exit criterion, 60 fps in real time on an M-series Mac in Chrome and Safari, is met on the maintainer's check, with Safari's few dips to 50 noted, as the maintainer accepted.

## 2026-09-26 — The environment: the odour field, the lawn and the dish's wall

**Decision.** Milestone 4's first part is the environment (PLAN §5.2): the butanone field, the food lawn and the wall that stops the worm. The maintainer settled four choices PLAN left open, before it was built:

- **The wall's contact.** A rod whose centre passes the wall, less the rod's radius, is pushed back along the wall's normal by a spring and a damper in parallel, at the body's own 10 ms spring-to-damper ratio, without friction. Considered: moving rods back onto the wall after each step, which bypasses the physics and can kink the body.
- **The release rate's anchor.** PLAN sets the rate so the steady concentration at the 0.5 cm capture radius equals K (fixed 2026-09-25, above). Clarified before any odour trial, since the rate is a level-0 rule, not a validation threshold: The spot sits 0.5 cm from the wall, so that circle touches the wall and the concentration varies around it. It is taken where the circle faces the dish's centre, where a worm coming from the centre enters it, on the real walled grid. Considered: the circle's mean, which counts the wall's side, where reflection raises the concentration; and the free-space formula, 2πDK/K₀(r/λ), which ignores the wall.
- **The field's start.** Trials and the app start from the steady field, as if the sources had long been releasing, so the harness reads one precomputed field per layout. Considered: releasing from zero at the start, which is truer to the assay's first minutes but would need every trial to step its own field. With a loss time of about 100 s, the field is near steady within minutes of a 60-minute assay.
- **The app's dish.** A 1 cm lawn where checkpoint 4's butanone spot sits, releasing the same total rate spread over its disc. Considered: the assay's two spots, and both spots and a lawn.

**How it works.**

- **The wall** runs in the CPU's `Body` and in the kernel's row assembly alike.
  - Its stiffness and damping are the body's diagonal elements', 7 N/m and 0.07 N·s/m: the wall only needs to be stiff, and reusing them is the level-0 choice the registry's "Dish wall" component records. The registry's parameters don't grow; the budget of 14 is full.
  - The spring and the damper ease in together over the first 0.1 µm of penetration (`WALL_SOFTENING`), so the contact grows smoothly from zero. That is a numerical setting in `numerics.ts`, not a parameter: it shapes contact only within that 0.1 µm, and CPU–GPU agreement is what justifies it.
  - Changed in review: the first version eased only the damper. With the spring at full strength, the explicit step overshot any rod pressed lighter than about 0.2 µN, which popped in and out of contact. In a loop state pressed against the wall, the touching rod's velocity changed sign 278 times in a second. With the spring eased too it changed sign twice, and the rod stayed in contact.
  - The wall tests each rod's centre, less its radius, so a rod edge-on to the wall stops up to its radius short, 40 µm at mid-body; a rod facing the wall, as along it, touches with its outline.
  - Tests:
    - a body pressed against the wall comes to rest where the eased spring holds its push, and stops moving;
    - it slides along the wall exactly as it would in open agar;
    - the wall's push grows smoothly from zero, with no jump where the easing ends.
- **The field** (`src/sim/env/`) is PLAN's grid, 256 × 256 cells 0.4 mm wide, with D = 0.091 cm²/s and a loss that sets √(D/k) to 3 cm.
  - Cells outside the dish exchange nothing with those inside, so no odour crosses the wall.
  - Its steady state is solved by conjugate gradients, about 1,000 iterations and 240 ms on the CPU, which throws rather than return a field that hasn't settled. An explicit stepper, in sub-steps of at most 4 ms and within the grid's stability limit, serves the tests.
  - Tests:
    - a Gaussian released 5 s before spreads as the analytic 2D Gaussian with the loss, within the test's 0.5% (measured 0.03%);
    - the steady state of a point source at the dish's centre matches the exact solution for a circular dish whose wall reflects, Q/(2πD)·[K₀(r/λ) + (K₁(R/λ)/I₁(R/λ))·I₀(r/λ)], within the test's 0.1% from 3 mm to the wall (measured 0.05%);
    - a step changes the total by exactly what the sources release and the loss takes;
    - the steady state holds when stepped.
- **The release rate** comes out at 0.953 µM·cm²/s, 42% below the free-space formula's 1.631: at the anchor, the wall's reflection raises the field by 71%. The app takes it as a constant, which a test recomputes from the rule, so it solves for the lawn's field only once at startup, after yielding, so the browser can start the GPU's compile first. The circle's mean would have given 0.844.
- **Drawing.** The plate draws the lawn as bacteria look in dark field, brighter at its thicker rim. It draws the field faintly in amber: a glow that grows towards K, and an isoline at every halving from K down to K/256.
  - The field goes to the GPU in f32 and is interpolated in the shader. The first version filtered a 16-bit texture, which Metal interpolates at 16-bit precision, so up close the field went flat in steps and its isolines drew as wide, streaky bands.
  - A new visual view, `lawn`, centres the camera on the lawn, through two new URL parameters, `?cx=` and `?cy=`. The whole-dish view changed by 0.052% of its pixels, under the comparison's 0.1% limit, and a review found that even blanking the field went unnoticed at the comparison's usual perceptual threshold. The plate's views therefore compare at a stricter threshold, 0.05 instead of 0.12, at which blanking the field fails the lawn view (0.29%) and the dish view (0.17%). A unit test checks the texture's rows run up the dish, since the layout's symmetry would hide a flip.
- **GPU parity** adds three copies of each of the trial values' 21 states pressed against the wall for one step, and of every fifth for one second:
  - head on, pressed 2 µm, as far as about 14 µN holds a rod, well past the easing;
  - lying along the wall at a bearing of 60°, where its normal isn't along an axis, pressed 2 µm;
  - the same, pressed 50 nm, inside the easing.

  The first version had only the first, where one tail rod touched with its normal along x. A review asked for the others, and they failed: several rods touching at an angle, the light press by up to 14 times the tolerance. f32 knows a rod's distance from the dish's centre at 5 cm only to a few nanometres, as deep as a light press.

  The kernel now finds the depth as (ρ² − W²)/(ρ + W), with ρ² − W² taken exactly. The coarse parts' squares and W²'s whole part are differenced as integers, in units of 2⁻⁴⁰ m², and W²'s fraction and the small cross terms are added in f32. Emulated in f32 on these states, the depth is right to 0.0003 nm, where f32's plain difference erred by 6 nm. The dish can then be at most 6 cm in radius, which the packing checks.

  Results on the M5 Max: all 63 one-step copies pass, their centres' velocities within 0.117 of the tolerance, the light press the worst; all 15 one-second copies pass, 14 graded, their centroids within 0.002 of the threshold. Grading is unchanged.

  **In Safari** (the maintainer's run of `/parity.html` on the same machine, 2026-09-27, the adapter "apple apple"), every check passes, the brain's and the loop's. The wall copies match Chrome's figures: all 63 one-step copies within 0.124 of the tolerance, the light press again the worst, and all 15 one-second copies pass, 14 graded, their centroids within 0.002 of the threshold.

**Not yet.** Nothing senses the field yet: AWC comes next. Nor can the user drop sources, which comes later in milestone 4, whose row now lists it; until then the app's field doesn't change, so the GPU doesn't step it.

**Status.** Built, and revised after review.

## 2026-09-27 — AWC-ON senses butanone

**Decision.** Milestone 4's second part is AWC sensing (PLAN §4.1), on the CPU and the GPU alike. PLAN fixes its form:

- Levy & Bargmann's adaptive threshold, dT/dt = (K(1 − e^(−C/K)) − T)/τ, with K = 5.5 µM and τ = 17 s.
- The bounded current g_AWC·(T − C)/(T + C), read at the nose tip.
- Which AWC is ON, drawn from the worm's seed; AWC-OFF takes no butanone input.

Three choices it left open were put to the maintainer and settled before any sensing ran:

- **What g_AWC's 16 mV is measured in.** The connectome alone, at its rest thresholds, without the oscillators or the loop, at steady state. It depends only on the measured wiring and constants, so calibration never moves it. Considered: the whole world at rest, whose oscillating neurons have no steady state, and whose gain would change whenever calibration changed their parameters. Removing odour gives exactly I = g_AWC whatever T was adapted to, but an adapted cell already carries a small negative current, so the 16 mV is the rise from rest, the limit of weak odour (clarified after review, below).
- **One gain or two.** AWCL and AWCR are wired differently: on the connectome alone, AWCL rises 16 mV at 3.73 pA and AWCR at 5.52 pA, 48% more. Each gets its own gain when it is AWC-ON, so the rule holds for every worm. It is still one rule, with no new free parameter. Considered: one gain, their mean, 4.63 pA, which would give about 20 mV when AWCL is ON and about 13 mV when AWCR is.
- **GPU parity for T,** a new state variable, set before any results: compared as the voltages are. One step, |ΔT| ≤ 10⁻⁴ × max(|T|, 0.01 µM); one second, an RMS relative error ≤ 10⁻² under the well-posed rule. The states sit in the assay's odour field, so AWC has something to sense.

**Built.**

- **The sensor** (`src/sim/sensing.ts`). Each step advances T exactly with the concentration held, moving it (K(1 − e^(−C/K)) − T)(1 − e^(−dt/τ)) of the way, then gives the current from the new T, the ratio (T − C)/(T + C) taken first so that removing odour gives exactly g_AWC and nothing gives more. A concentration below zero, which only rounding could give, counts as none. With neither odour nor threshold there is no current.
- **The gains.** Pinned at 3.73338 pA for AWCL and 5.51839 pA for AWCR; a test recomputes both by bisection and holds them within 10⁻⁵.
- **The world.** AWC-ON's side is drawn from the seed on a hash lane of its own, 0xfffffffb. The odour is read at the body coordinate the data give AWC's dendrite tip, 0.0001, between rods 0 and 1, before the step moves the body. The current goes into AWC-ON alone, and a lesioned AWC-ON takes none. T joins the world's state. A world starts adapted to the odour at its nose, and the app adapts it again after centring the body.
- **The GPU.**
  - T is status word 12, and the odour an r32float texture holding −1 in cells beyond the wall, so no storage buffer is added. Word 13 holds the odour sensed on the last step, which parity reports.
  - The invocation holding rod 0 reads the four cells around the nose and shares the concentration through workgroup memory, now 15,364 bytes. Every invocation then advances T alike, as with the head switch.
  - The kernel takes 1 − e^(−x) from its series below 0.1: in f32, 1 − exp(−x) would put an error of up to about 4 × 10⁻⁴ on the rate, one f32 step near 1 over dt/τ, 1.5 × 10⁻⁴.
  - A GPU world takes another seed's world whole (`GpuWorld.load`): its seed, noise, AWC-ON and state.
- **The app.** The lawn's field feeds the CPU's world and the GPU's texture, and "New worm" loads the new seed's world whole.
- **Safari's parity from a script.** `npm run gpu:parity:safari` runs the parity page in Safari on the Mac's GPU through safaridriver, the WebDriver server macOS ships with Safari, spoken to over HTTP (`scripts/safari.ts`), once Safari's "Allow remote automation" setting is on. It runs locally only.

**Parity** (Chrome on an M5 Max, after review; T's one-second comparison takes the same 0.01 µM floor as its one-step one, as the voltages take 1 mV in both). Every loop case lies in the assay's field. After a first run with the old placements, which passed, two placements were changed for coverage; no threshold changed. The copies moved 3 cm along each axis now go to (−3, −3) cm, away from the spot, rather than (3, −3) cm. There the odour, 0.41 µM, lies below the 0.81 µM threshold adapted at the centre, so AWC-ON's current is positive, +1.24 pA. The copy pressed into the wall at bearing 0 lies beside the spot, at 7.4 µM, where the current is −3.0 of AWCL's 3.73 pA. The gating variant takes seed 4, which draws AWCR, so each side is ON somewhere; in 7 s it flips once and gates 2,289 times, as seed 1 does (1 and 2,287). After review, its states are also taken moved, so AWCR too senses odour its threshold never adapted to.

- **One step.** All 159 states pass; T's worst error is 7.0 × 10⁻⁴ of its tolerance. The odour the GPU sensed is within 1.4 × 10⁻⁷ of the CPU's (reported).
- **One second.** All 61 graded states of 66 pass, with 5 not graded, against 8 of 63 before sensing; T's worst error is 1.3 × 10⁻³ of its tolerance.
- **The loop's API.** T comes back from the GPU exactly as f32, and a run split across dispatches is the same run. Added after review: a GPU world built from seed 1 (AWCL) and loaded with seed 3's world (AWCR) runs 150 steps identically to one built from seed 3, and fails if `load` leaves AWC-ON as it was; an odour set after building runs as one built with it; and with AWC-ON lesioned, 150 steps with and without odour differ only in its threshold, where intact the worm differs.
- **Speed.** The whole step runs at 25.0× real time at 67 steps a dispatch, against 25.2× in the last run before sensing.
- **Long runs**, now also in the assay's field, rerun after review with each seed's own AWC-ON on the GPU: 265 seeds a side, 60 s each, in about 12 minutes. The mid-body curvature's SD is 0.2147 on both sides (equivalent within ±5%, p = 1.3 × 10⁻¹⁵). Its frequency is 0.1677 Hz on the CPU and 0.1649 Hz on the GPU (p = 0.017). No solve failed to converge on either side.

**The harness.** Checkpoints 0 and 1 run without odour, so C is 0, T stays 0 and AWC-ON takes exactly no current. Eight trial worlds, seeds 1 to 4 intact and silenced, stepped 10 s from a posture, give states bit for bit the same as on `main`. VALIDATION.md's results therefore stand without a rerun.

**A slip in the rules' commit.** `|ΔT|` went into PLAN §7.2's table unescaped, which split its row into an extra column. The next commit escapes it; the rule's words are unchanged.

**Review.** Three reviews of the branch found:

- **The GPU kept the first seed's AWC-ON.** A GPU world packed AWC-ON's neuron, gain and sensing point when built, and restoring a state didn't change them. Long-run parity builds one GPU world from seed 1 and reuses it, so for 136 of its 264 other seeds, whose AWCR is ON on the CPU, the GPU drove AWCL at AWCL's gain. The long runs first reported here compared different models for those seeds; they passed only because the current at the centre is small, about −0.15 pA against −0.22 pA. The app's "New worm" did the same. Both now load the new seed's world whole, and the long runs were rerun.
- **The current passed g_AWC by a rounding step.** (g·(T − C))/(T + C) gave 3.7333800000000004 for g = 3.73338 on odour removal. The ratio is now taken first, on both sides, and a test holds it with the real gains, where the old form missed 330 of 2,000 cases.
- **What the 16 mV is measured from.** This entry had said no anchoring concentration is needed. But an adapted cell carries a small negative current, −3.9% of g_AWC after adapting at the assay's start, so removing odour there raises AWC-ON 16.6 mV, and 19.7 mV from K. The gains stand as decided, measured at rest; PLAN §4.1 and the registry's rule now say the 16 mV is the rise from rest, the limit of weak odour. This clarifies wording, before any chemotaxis results.
- **Two gains and spec §1.1**, which asks each layer to be the same for every cell of a class. They meet it as touch's currents do (PLAN §4.2): one rule for the class, each cell's value from its own wiring. PLAN §4.1 and §6.2 now say so; the budget counts g_AWC once.
- **Weak spots in the parity cases.** Nothing ran an odour set after building, a lesioned AWC-ON, or AWCR away from its settled threshold: the API checks and the gating variant's moved copies above now do. And T's one-step tolerance, 10⁻⁴ of T, is looser than T's own movement in one step for the moved copies, 6.2 × 10⁻⁵ µM against 8.1 × 10⁻⁵ µM, so a GPU that froze T would pass one step. The one-second check, about 3× over, and the voltages would still catch it; the rule stays, and the odour the GPU sensed is now reported beside it.
- **Smaller things.** "With the same floor" made explicit in PLAN §7.2 for T's one-second comparison, which it cannot change, since T is about 0.8 µM in every state; odour grids checked before anything is allocated; comments corrected.
- **Left for the PR that drops odour sources.** The current jumps where T and C both reach 0, and a jump in AWC's current doesn't restart BDF2. Neither can happen while the field is steady: its least concentration inside the dish is 0.33 µM.

**Safari.** The maintainer's run of the parity page, and the script's, fail one state: the trial values' one-second state at t = 11.0 s, where the GPU's voltage error is 9.87× the threshold in the maintainer's run, before the review's fixes, and 9.97× in the script's, after them. Everything else passes, the brain, the API and all 159 one-step states included, 62 of 66 one-second states graded. The whole step runs at 17.9× real time in Safari.

- **The GPU agrees across browsers.** In Chrome the same state's error is 9.47×, but there it isn't graded: the CPU reference against itself, the well-posed rule's test, is 1.150 in Chrome, 0.993 in Safari (0.979 in the maintainer's run) and 0.917 in Node, all after the fixes. The states are built by the CPU in each browser's JavaScript engine, which round Math functions differently in the last place, and 11 s of the loop turns that into slightly different states. This state amplifies the difference, so whether it is graded depends on the engine.
- **The body, not AWC, makes it sensitive.** On the CPU, in Node, storing the brain and muscles as f32 after every step moves it 0.12× the threshold over the second, and an error in T as large as f32's 0.019×. Jostling the body's velocities by up to 1% at random each step, the one-step velocity tolerance, moves it 4.0×, the most of the nine states tried. The well-posed rule tests sensitivity to the solver's tolerance only, which is far gentler than the body's f32 errors.
- **Decided by the maintainer: the rule stays.** A rule changed after a failure would be fitted to it. Safari's parity is recorded as failing at this one state, which the rule grades in some engines and not others; the check can flip on such a state again. Considered: jostling the body in the well-posed test, which targets the cause, and grading only states whose reference agrees with itself within half the threshold.
- **Safari's long runs: not yet done**, as the maintainer decided. The script's first attempt stopped after five minutes of the long runs, because Node's `fetch` gives up waiting for a response's headers after five minutes; the driver now uses `node:http`, which doesn't. The second attempt stalled: for the rest of the runner's hour, Safari's page and GPU processes used no CPU. The display hadn't slept; the likeliest cause, unconfirmed, is that Safari's automation window was covered while the maintainer worked, and Safari paused a page it wasn't showing. Safari was already slow in that session: parity took 34 s, against 9.3 s in the first run, and the CPU reference ran at 20.4× real time, against 48.8× in Chrome. The next attempt should keep the window uncovered, the display awake and the Mac otherwise idle.
- **Safari's long runs, finishing after the pull request merged.** The maintainer ran `npm run gpu:parity:safari -- --long` with the window uncovered, starting about 30 s before the merge, in about 16 minutes, and they pass. The mid-body curvature's SD is 0.2148 on the CPU and 0.2147 on the GPU (equivalent within ±5%, p = 2.2 × 10⁻¹⁵). Its frequency is 0.1656 Hz and 0.1659 Hz (p = 0.0013). No solve failed to converge on either side. Safari's CPU gives a mean frequency a little different from Chrome's, 0.1677 Hz, most likely because its engine rounds differently in states this sensitive; each GPU is held to its own browser's CPU. Reported, not graded: the GPU's variance over the CPU's is 1.001 for the SD (p = 0.99) and 1.19 for the frequency (p = 0.16).

**Status.** Built and revised after review. GPU parity passes in Chrome, the long runs included, and on CI's SwiftShader. In Safari it fails the one state above, and its long runs, finishing after the merge, pass.

## 2026-09-27 — Touch

**Decision.** Milestone 4's third part is touch (PLAN §4.2), on the CPU and the GPU alike, with a way to tap the worm in the app. PLAN already fixes where a tap acts, the receptive fields from the c302 morphologies, and how strong it is: a 500 ms step holding each receptor 10 mV above rest, its current computed once from the receptor's input conductance in the intact wiring. That linear estimate holds: on the connectome alone, each receptor's current raises it 10.02 to 10.12 mV at steady state, and within the 500 ms.

Three choices PLAN left open were put to the maintainer and settled before any touch ran:

- **Repeated taps.** A receptor's stimulus is on or off, never stronger: a tap turns it on for 500 ms from that step, so a second tap on a receptor already stimulated restarts its 500 ms. Considered: ignoring taps on a receptor while it is stimulated, and adding each tap's step, which would drive a receptor 20 mV or more above rest, beyond the stimulus PLAN fixes.
- **In the app.** A click on the worm's body without dragging taps its nearest point; "Touch front" and "Touch back" buttons tap the middle of the ALM and PLM fields, s = 0.2 and 0.8, so touch works by keyboard and screen reader too; a brief ring marks each tap. Considered: tapping only.
- **GPU parity for touch.** The GPU times each pulse itself, so both sides switch the current on and off at the same step and restart BDF2 there, as at the head switch. Under the loop's thresholds, unchanged: copies of the trial values' states with an anterior and a posterior tap starting at the state, graded one step and one second, and an API check that a pulse ends at its 200th step on both sides. Considered: the API check alone.

**Built** (as revised after review, below).

- **The receptors and their sets** (`src/sim/touch.ts`). The six neurons that sense along their processes, ALML, ALMR, AVM, PLML, PLMR and PVM, with their fields from the data; and for each of the seven sets of them a tap can reach, the currents that hold them all 10 mV up together, 2.23 to 8.82 pA, computed once per data set from their responses to one another in the intact wiring. A receptor reached alone gets 10 mV times its input conductance, as PLAN first had it.
- **The world.** `World.touch(s)` starts a 200-step pulse, 500 ms, at its set's current, on every receptor whose field covers s and isn't lesioned, and returns them. Each step adds each receptor's pulse current to its input, and restarts the brain's integrator whenever any receptor's current changes: switching on, switching off, or taken anew from a tap at another point. Each receptor's steps left, pulse current and last current join the world's state, and `World.restore` refuses a state of other receptors before changing anything.
- **The GPU.** A receptor's steps left and last current live in its neuron's two spare state words, and its pulse current in a spare constant, written with each tap, so no buffer is added. The kernel counts the neurons whose current changes in the workgroup-wide sum it already takes for the head switch's gate, so every invocation restarts together. `GpuWorld.touch(s)` writes the pulses, taking effect from the next dispatch, and returns the receptors reached.
- **The app.** A primary click or tap on the worm's body, within its radius plus the pointer's slop, touches the nearest point of the midline as last read back (`nearestOnMidline`, tested); a drag, a pinch, a right-click or a Ctrl-click doesn't, and a double-click touches once and follows. "Touch front" and "Touch back" tap s = 0.2 and 0.8, their accessible names beginning with their visible ones. A ring opens where the tap lands, only fading when motion is reduced, and a live region names the receptors reached, cleared first when the words repeat.

**Parity** (Chrome on an M5 Max, after review). Every check passes, with the loop's thresholds unchanged.

- **One step.** All 243 states pass: the 42 tapped copies, whose worst voltage error is 0.013 of its tolerance, and the 42 whose pulse ends at the first step, the same. The pulses agree at every state.
- **One second.** All 71 graded states of 76 pass, all 10 tapped copies among them; the pulses agree at every sample of every state.
- **The API.** A world with a pulse under way goes in and comes back, and a run split across dispatches is the same run, pulses included. Tapped front through `GpuWorld.touch` and `World.touch`, three receptors each, a pulse has 1 step left and is on after 199 steps, none left and on after 200, and is off after 201, on both sides.
- **Speed.** 25.0× real time, as before.
- **Safari** (`npm run gpu:parity:safari`). Everything passes, the touch API and all 243 one-step states included, except the one-second state at t = 11.0 s recorded in the AWC entry, 9.97× with the reference at 0.993, as before.

**The harness.** Checkpoints 0 and 1 never touch the worm, so no pulse ever starts: the eight trial worlds of the AWC entry step bit for bit as on `main`, and VALIDATION.md stands.

**Review: a tap's size, settled by the maintainer before any touch results.** The entry's opening said the linear estimate holds, 10.02 to 10.12 mV. It does, but only for a receptor stimulated alone, which a tap does only between s = 0.0403 and 0.0549 (AVM) or 0.3901 and 0.4994 (PVM). A tap reaches every receptor whose field covers it at once, and the receptors are coupled, AVM to ALMR by 0.33 nS against input conductances near 0.55 nS. Tapped together on the connectome alone, the receptors rise well past 10 mV: at s = 0.2, the "Touch front" button's point, ALML, ALMR and AVM rise 14.0, 16.2 and 17.9 mV; at s = 0.8, PLML and PLMR rise 10.8 and 11.0 mV, so the front is struck about 1.6 times as hard as the back.

- **Decided: currents per covered set.** For each of the seven sets of receptors a tap can reach, the currents that hold every receptor in the set 10 mV above rest together are computed once, in the intact wiring, and serve every brain and lesion. Checked on the connectome alone before the change: all positive, and each receptor rises 10.09 to 10.18 mV, whatever the tap. "Touch front" becomes 4.50, 3.75 and 2.28 pA for ALML, ALMR and AVM, against 5.68, 5.52 and 5.18 pA alone. A receptor tapped again while on takes the new tap's current, and a change in its current restarts the integrator as a switch does. Considered: keeping each receptor's own current, the same physical current wherever it is tapped, with co-stimulated receptors rising 11 to 18 mV.
- **Parity, made stricter.** Every tapped copy started with its pulse switching on, so no one-step case saw a pulse switch off, and a GPU that skipped that restart would pass: emulated on the CPU, its one-second errors, 0.016 to 0.507 of the threshold, match the reference against itself. Copies whose pulse ends at the first step are added to the one-step check, where the same fault shows at 396 to 1,564 times the tolerance, emulated with the set currents, on every copy but the rest state's, which has no history for a restart to discard. This is stricter than the rule set, so it is logged here.
- **Wording.** The buttons' points, s = 0.2 and 0.8, lie inside the ALM and PLM fields and clear of PVM's; they are not the fields' middles, 0.22 and 0.735, as PLAN and this entry had said.

- **The app, from the same review.** Restarting while paused left the worm untappable and the buttons ringless until Play, since only a step read the body back; restarting now reads it. The buttons' accessible names didn't contain their visible text, which voice control needs. A Ctrl-click, a Mac's right-click, and a pen's barrel button touched the worm; only a primary press does now. A double-click touched it twice as well as following; the second tap is taken for the double-click's. A repeated announcement wasn't cleared, so a screen reader might not read it again. The controls' group, holding the touch buttons, was labelled "Time"; it is "Controls". The tap's geometry, written inline, is now a tested function using the camera's own transforms.
- **Smaller things.** `GpuBrain.restore` clears the pulses, which share the neurons' state, and says so; a parity run without `--long` no longer deletes the last long runs' results, as one did Safari's for AWC, whose numbers survive in this entry.

**Status.** Built as revised; GPU parity passes in Chrome and, but for the state recorded before, in Safari.

## 2026-09-27 — Dropping food

**Decision.** Milestone 4's last feature is the spec's "Food: click to drop or drag an odour source" (spec §6). PLAN §5.2 already fixed the field's physics and that the app would step it on the GPU in explicit sub-steps of at most 4 ms once it could change. Four choices it left open were put to the maintainer and settled before any food was built:

- **What a dropped source is.** A lawn like the app's first: a 1 cm disc releasing at the assay spot's total rate. Up to eight in all, the first among them. The field changes only by stepping: dropping a lawn starts its release; moving or removing one stops its release there, and what it released diffuses and decays, falling by e in about 100 s, λ²/D. Considered: point sources like the assay's spot, sharper near a drop but unlike the app's lawn; and re-solving the field's steady state at each change, instant but not physical, odour appearing and vanishing across the dish at once.
- **Placing food.** "Add food" arms placing: the next click on the dish drops a lawn there, Enter drops it at the view's centre, and Escape cancels. Dragging a lawn moves it, dragging it off the dish removes it, and "Clear food" removes them all. Other clicks pan or touch as before. Considered: a click on bare agar dropping a lawn at once, fewer steps but a stray click drops food.
- **GPU parity for the field.** The GPU's stepped field against `OdourField.step`, from the app's steady lawn field with a second lawn just dropped at the dish's centre. After one 4 ms sub-step, every cell within 10⁻⁵ of the field's largest concentration; after one simulated second, 250 sub-steps, every cell within 10⁻⁴ of it, and the change in the total odour within 10⁻⁴ of the CPU's, which the explicit scheme makes exactly what the sources released less the loss. Run in CI with the rest. Considered: the one-second comparison alone.
- **Food in the URL, now.** `?food=x,y;…` in millimetres from the dish's centre: the setup a link reproduces, its field starting steady for those lawns. The rest of the shareable URL, lesions, the brain and the versions, comes with milestone 5. Considered: leaving the URL for one piece with the rest.

The worm senses the field as it stood when each of its dispatches began, at most 128 steps, 0.32 s, before; the app draws the field it steps. The harness keeps its fixed fields: trials drop no food.

**Built** (as revised after review, below).

- **The field on the GPU** (`src/gpu/field.ts`, `fieldShader.ts`). One dispatch a sub-step, OdourField.step's scheme in its order, between two r32float textures that take turns; cells beyond the wall hold −1 in both, as the brain's texture has them, and the sources are a third texture. Time is split into sub-steps by the rule OdourField.step now shares, `substeps`, so both sides take the same ones. A grid for stepping must have its outermost ring beyond the wall, which the kernel's unchecked reads of each cell's neighbours rely on, and is refused otherwise.
- **The worm senses it.** The brain binds whichever texture holds the field, lent by the field and kept bound per texture. The app advances worm and field together in blocks of 64 of the worm's steps, 0.16 s, at multiples of its step count: the worm senses the field as it stood when the block began, and at the block's end the field steps through 40 sub-steps of 4 ms. A run thus depends only on its steps, not on how frames divide them, as it did before the field stepped.
- **The plate draws it.** The agar shader reads the field's concentrations, interpolating between the cells inside the dish with their weights renormalised, as the brain's sampling does, and takes log₂(C/K) itself. This replaces the level texture the CPU built once, and the rings it copied past the wall to keep the isolines from crowding there. It draws up to eight lawns, their places packed by `packFrame`, which a test holds to the WGSL struct's layout.
- **The lawns** (`src/sim/env/dish.ts`). Each is a lawn source at the spot's rate; `OdourField.setSources` replaces the sources and keeps what the old ones released. Lawns are placed to a tenth of a millimetre, pulled inside where rounding would push them past the wall (`snapLawn`), so the URL holds them exactly. The app's startup, and Restart and New worm, start from the lawns' steady field, solved once for each set of lawns and kept while they are unchanged: a Restart then takes about 10 ms, the first after a change about 0.8 s in Chrome for two lawns.
- **The app.** "Add food" arms placing, shown pressed, and focuses the dish: a click drops a lawn, Enter drops it at the view's centre, Escape cancels; held down, Enter drops one. A press takes hold of a lawn only while it looks small on screen, its radius under 60 px, and keeps the offset where it was pressed; zoomed in further, drags pan. A lawn let go on the dish stays, and dragged off it goes. A click on a lawn, not on the worm, picks it up, marked in the inset, and the next click or Enter puts it down; Escape leaves it and Delete removes it, and Delete alone removes the lawn nearest the view's centre. "Clear food" removes them all and hands the keyboard to "Add food", and both buttons disable themselves when there is nothing for them to do. A lost release or a restart gives a drag up. The live region says what happened, re-read when the words repeat, including when an eighth lawn fills the dish and when a link's food can't be read. The sources are worked out when the lawns change and sent to the GPU once a frame. The URL carries the worm's seed and the lawns (`plateUrl`), the first lawn alone left out. The page's lede says the worm smells food but won't slow on it or dwell there, as spec §5 asks, and so does the README.

**Parity** (Chrome on an M5 Max). Every check passes. The field's, from the app's steady lawn field with a second lawn dropped at the centre: after one sub-step, the worst cell is 0.005 of its tolerance, 5 × 10⁻⁸ of the largest concentration; after one second, 8.4 × 10⁻⁴ of its tolerance, 8 × 10⁻⁸ of the largest, and the total odour's change 0.013 of its tolerance. With the kernel made to ignore its sources, the same checks fail at 67 and 1,317 times their tolerances. Two API checks: a world built without odour, lent a field's texture, runs 150 steps identically to one built with the field, and fails if lending changes nothing; and a grid 100 cells square, whose rows the read-back pads, comes back as it went in. The worm's checks are as before, 243 one-step states and 72 graded of 76 one-second ones, and the whole step runs at 25.0× real time. Safari (`npm run gpu:parity:safari`) passes everything but the one-second state at t = 11.0 s recorded in the AWC entry, the field's numbers the same.

**The app's speed.** With the field stepping, the plate holds 60 frames a second at 1×, 10×, 20×, 30× and 50× real time, and the worm keeps the speed asked (`npm run plate:bench`, headless Chrome on an M5 Max, which paces its own frames). In windows at `/?stats=1`, with three lawns dropped besides the first and speeds up to 10×, the maintainer saw Chrome hold 120 frames a second and Safari 60, their displays' rates.

**Visual tests.** The eight views still match their baselines: the renormalised interpolation moves no line far enough to count. A ninth view, `food`, shows three lawns from the URL and their steady field; its baseline is CI's own capture, from run 36294040752 at the commit that added the view.

**The AWC notes the AWC entry left for this piece, settled after review.**

- **The current where T and C reach zero.** A run can start with none: after "Clear food", or from a link with `?food=` empty, the field is exact zeros and T is 0. The first trace of a dropped lawn's odour to reach the worm then drives AWC-ON almost fully down at once, the form's limit at T = 0, as the review above records; the integrator restarts there. With food cleared during a run, the concentration falls by e in about 100 s and reaches f32's smallest normal numbers only after about 2.4 hours; T lags it by about a fifth, so AWC-ON carries about +0.09 g_AWC meanwhile.
- **Restarts at AWC's jumps.** The integrator restarts when AWC-ON's current changes by more than 1% of g_AWC in one step, on both sides, as at the head switch's and touch's jumps. On a fixed field it never does: every parity state and trial is unchanged by it but for the copies moved or pressed against the wall, whose first step both sides now restart alike. In the app it does when the stepped field changes fast at the nose.

**The harness.** Trials drop no food and read their fixed fields, so checkpoints 0 and 1 are unchanged: the eight trial worlds of the AWC entry still step bit for bit as on `main`.

**Review: decisions, settled by the maintainer before the fixes.** Three reviews of the branch found:

- **An empty dish, then food.** After "Clear food", or from a link with `?food=` empty, Restart gives a field of exact zeros, and AWC-ON's threshold T is 0. The first trace of a dropped lawn's odour to reach the worm, 1.6 × 10⁻³⁶ µM for a lawn 45 mm away, then turns (T − C)/(T + C) from 0 to about −1 in one step: AWC-ON takes almost the whole −g_AWC. It stays at or below −0.83 until the odour reaches 10⁻³ µM, 11 s later. That is the form's limit at T = 0, as fixed; the note below, that the concentration never reaches zero within a run, was wrong for a run that starts at zero. Decided: record it, and restart the integrator when AWC-ON's current changes by more than 1% of g_AWC in one step, as at the head switch's and touch's jumps; on a fixed field that never happens. Considered: recording it alone; and a detection floor, (T − C)/(T + C + C₀), a rule change and a new fixed parameter beyond the budget of 14.
- **Dragging over a lawn moved it instead of panning.** A press anywhere on a lawn's disc grabbed it, so at the default view, a few millimetres across, a lawn under the view left no way to pan, and a stray drag moved the food. The lawn also jumped to put its centre under the pointer. Decided: a press grabs a lawn only while it looks small on screen, its radius under 60 px, keeping the offset where it was grabbed; zoomed in further, drags pan. Considered: a "Move food" mode.
- **A single lawn could be moved or removed only by dragging**, with no keyboard route and no single-pointer one (WCAG 2.1.1 and 2.5.7). Decided: a click on a lawn picks it up and the next click puts it down, Escape leaves it and Delete removes it; with the dish focused, Delete removes the lawn nearest the view's centre, and a lawn moves by keyboard as Delete, then Add food. Considered: a list of the lawns with Remove buttons.
- **The URL, and when a run can repeat.** A link held the lawns but not the seed, so it drew a new worm, which AWC is ON included, and a lawn placed near the wall could round off the dish and void the whole list. And the field's sub-steps and the worm's lag depended on how frames divided the worm's steps, so one link on one GPU gave different runs, where on `main` it gave the same. As recommended and agreed: the URL carries `?seed=` too, lawns are placed to a tenth of a millimetre inside the dish, and the field steps in blocks of 64 of the worm's steps at multiples of its step count, halving the lag to at most 0.16 s. The rest of the URL comes with milestone 6's URL state, not milestone 5 as this entry said. **Changed (2026-09-30):** lesions and the brain came with milestone 5 after all; the versions stay with milestone 6 ("Milestone 5: lesions and the brain swap, live in the app", 2026-09-30).

- **Smaller things, fixed as recommended.** A lost mouse release left a drag half done, committed by the next click, which also swallowed a tap; and a drag given up by "Clear food" or a restart could resume. After "Clear food" by keyboard, focus fell to the page. The crosshair went while placing was still armed. Each drag event rebuilt the sources, about 4 ms. The lent-texture check passed even if lending changed nothing. Nothing held the plate's frame struct to its packing, or read back a grid with padded rows. Stale text in PLAN §1, §5.2 and §8, CLAUDE.md and the parity page's and script's headers; this entry's "at most 0.32 s", now 0.16 s, and its "8.4 × 10⁻⁴ of it", which meant of the tolerance. PLAN's rule that the field changes only by stepping now says it holds during a run, a run starting from its lawns' steady field.

**Status.** Built and revised after review; GPU parity passes in Chrome and, but for the state recorded before, in Safari.

## 2026-09-27 — Checkpoint 0 in full

**Decision.** Milestone 4 closes by running checkpoint 0's touch and chemotaxis clauses on the silenced network, now that touch and odour exist. The clauses fix what must not happen, not how to look: a silenced network doesn't crawl, so checkpoints 2 and 3's "during forward crawling" can't apply, and checkpoint 4's CI didn't say what "total" counts. Two choices were put to the maintainer and settled before either clause ran (PLAN §7.4):

- **Touch: touched twins of the trials.** Checkpoint 0's 20 trials are run again, the same seeds and postures, with 5 touches each, 20 s apart from t = 20 s, alternating front (s = 0.2) and back (s = 0.8), odd seeds starting at the front: 50 anterior and 50 posterior. The untouched trials give each touch a matched spontaneous window, at the same seed and time. The clause passes if neither reflex reaches its checkpoint's partial level: a reversal starting within 2 s follows fewer than 40% of anterior touches, or doesn't follow them more often than it starts in the matched windows (Fisher's exact test); and the mean forward speed over the 2 s after posterior touches doesn't rise significantly over the 2 s before (Wilcoxon signed-rank test). Considered: 100 trials of one touch each at t = 20 s, the spontaneous windows each trial's own 2 s before its touch; more trials, and no matched twins.
- **Chemotaxis: every worm counted, each starting at the centre.** The CI's total is every worm run, as Bargmann et al. count every animal on the plate, so with no arrivals the CI is 0; checkpoint 4 now says so too. 30 worms, seeds 1 to 30, each run alone for 60 min in checkpoint 4's layout and field, start with the centroid at the dish's centre, where §5.2 puts the worm, from a real posture turned at random, drawn by its seed as the trials draw theirs, and are stopped within 0.5 cm of either spot. The clause passes if the CI lies within ±0.1 of zero. Considered: counting arrivals only, the CI undefined with none, and the clause then reported as not measurable rather than graded.

**Details, settled with the code, before either clause ran.** The rules left four things open. None can change which way a result falls for a network that barely moves, but checkpoints 2 to 4 will inherit them. (Written before the run: the posterior clause's p = 0.051 later showed that the speed windows could matter.)

- **When a touch acts, and what follows it.** A touch at time t starts with the step after t. A reversal follows it if its first backward sample lies from t to t + 2 s, in the touched trial and the matched window alike.
- **The speed before and after.** The mean of the velocity samples whose centred 1 s windows lie within the 2 s before t and the 2 s after it, so that neither straddles the touch. Considered: every sample in each 2 s, whose windows would reach 0.5 s across the touch.
- **The tests' sides.** PLAN §7.1 fixes α = 0.05 but not the sides of Fisher's and Wilcoxon's tests. Both are one-sided, in the reflex's direction: the rules ask whether reversals follow touches "more often" and whether speed "rises". For a clause that passes when no reflex is found, this is the harder test to pass, for any effect in the reflex's direction. The signed-rank test drops zero differences, ranks ties by their average, and takes its p-value from the exact distribution.
- **What counts as reaching a spot.** A worm is caught when any part of its body comes within 0.5 cm of a spot's centre, as sodium azide stops a worm any part of which reaches it. The part is measured at the rods' centres along the midline, 21 µm apart. This holds for checkpoint 4 too, whose row now says so. Considered: the nose alone, where AWC senses, which a worm arriving backwards would reach last; and the centroid.

Checkpoints 2 to 4 stay "not reached": they need forward crawling, which checkpoint 1's crawl gate guards until research track R brings checkpoint 1 to at least partial (PLAN §7.4, §9).

**Built.**

- **Touched trials** (`src/validation/trial.ts`). A trial takes touches, each starting with the step after its time, and records the receptors each reached.
- **The assay** (`src/validation/chemotaxis.ts`). A worm's trial posture, moved so its centroid sits at the dish's centre, with AWC-ON adapted there, on the assay's steady field; the run stops when any rod's centre comes within 0.5 cm of a spot's centre.
- **The grading** (`src/validation/checkpoints.ts`). The touch schedule, the reversal and speed windows, the two tests and the CI; checkpoint 0 passes if all three clauses pass. Fisher's exact test and the exact signed-rank test, both one-sided, are in `src/sim/stats.ts`, checked against SciPy 1.18.1 and, for ties and zeros, against every sign flip.
- **The harness** runs checkpoint 0's 20 trials untouched and touched and its 30 worms, the longest first, each worker solving the assay's field once: about 100 s on 18 cores. The untouched trials are unchanged, and the eight fingerprinted worlds step bit for bit as on `main`.

**Results** (run at `67dbcda`, and again after review at `a633c02` with the same results, VALIDATION.md). Checkpoint 0 passes every clause:

- **Crawling**, as before: no forward bout, and no reversal.
- **Anterior touch.** No reversal followed any of the 50 anterior touches, and none started in the 50 matched windows; p = 1.
- **Posterior touch.** p = 0.051: over the 50 posterior touches, the speed rose after 31, by 4 × 10⁻⁶ body lengths per second on average. The untouched twins give the same rank sum, 808, over the same windows, so the near-significance is the silenced worm's creep at those moments: its backward creep dying away, as the review found (below). No receptor either touch reaches has a neuromuscular junction. A touch reaches the body only through the numerics, chiefly the integrator's restarts at the pulse's edges, and moves no velocity sample by more than 2.7 × 10⁻⁷ body lengths per second. (This entry first said that with the restarts off a touched world stepped bit for bit as its twin; corrected after review, below.) The first run was at `b38277c`; the twins' test and that largest change were added to the report after it, at `67dbcda`, as context, not graded. The grading is unchanged, and the run repeated at `67dbcda` gave the same results.
- **Chemotaxis.** None of the 30 worms reached either spot: CI 0. No centroid moved more than 0.17 mm from its start in the hour, and no body came nearer than 44.44 mm to either spot's centre.

**An observation for the maintainer.** The posterior test compares a worm with itself before and after, with no control for its own trend, and the silenced worm's creep alone brought it within 0.001 of α. Checkpoint 3 uses the same test during crawling, where a worm's speed can trend too. Whether to grade it against matched windows, as checkpoint 2 grades reversals, is for the maintainer to decide before checkpoint 3 runs. Decided the same day: against sham-touched twins (below).

**Status.** Set before either clause ran; built and run, and checkpoint 0 passes.

## 2026-09-27 — Checkpoints 2 and 3 grade each touch against a sham-touched twin

**Why.** Checkpoint 3 graded a posterior touch by the rise in forward speed from the 2 s before to the 2 s after, with no control for the worm's own trend. Checkpoint 0's silenced worm showed the cost: its touches reach no muscle, yet its creep alone gave p = 0.051, within 0.001 of α, and the untouched twins gave the same p over the same windows. A crawling worm's speed changes on its own too, and in a deterministic model touched at chosen moments, those changes needn't average out: touching once a worm has crawled forward for 2 s, as the protocol does, can catch it still speeding up after a reversal.

**Decision** (PLAN §7.4, set before checkpoint 2 or 3 ran; revised after review the same day, below). The maintainer agreed the recommendation, a sham-touched twin for every touch, and settled two choices it raised: one touch a trial, and checkpoint 2's matched windows.

- **A sham-touched twin for every touch.** At the touch the world forks from its state. One copy is touched; the other takes a sham touch, which restarts the integrator at the pulse's edges as a touch does, with no current. The noise is drawn by seed, step and neuron, so the two draw the same, and a restored world steps bit for bit as the original. The copies differ only by the touch's current; on the silenced network, whose touches reach no muscle, their bodies would part only at rounding level.
- **Checkpoint 3's test.** The touched copies' mean speed over the 2 s after the touch against the sham twins', paired by touch with the one-sided signed-rank test. It passes at 10% or more above; significantly above by less is partial. A before-and-after rise, as the cited papers measure the response, is reported, not graded. PVC's lesion row reads this response.
- **One touch per trial.** Seeds 1 upwards, trials of 120 s, each touched once at the first sample from t = 12 s at which the 2 s before were forward throughout, until 50 touches, up to 100 seeds. Touches from different worms are independent, as the tests assume of their pairs. Considered: several touches a trial, at least 10 s apart, which needs fewer trials, but touches on one worm aren't independent, and one touch's aftermath can shape the next.
- **Checkpoint 2's matched spontaneous windows are the sham twins'.** This is the same worm at the same moment, at no extra cost; the test stays Fisher's exact, with its thresholds. Considered: untouched twin trials, as checkpoint 0 used, which differ from the touched copy through the restarts alone (below).

Considered for checkpoint 3: keeping the before-and-after test; and untouched twins, without the sham's restarts. On the silenced network such twins differ from the touched copy by up to 2.7 × 10⁻⁷ body lengths per second through the restarts alone, and a crawling network may amplify that; a significance test could find it, so the partial band would need an effect floor.

**Checkpoint 3 is marked as changed** in PLAN: its test is changed before any of its trials, but the change was prompted by checkpoint 0's result. Checkpoint 0's posterior clause keeps the before-and-after rule it ran under; §7.4's paragraph on it states that rule itself, and changing it now would be a change after results. After review the same day, checkpoint 0's reruns take sham twins too, and checkpoint 2 is marked as well (below).

**Status.** Rules only, set before checkpoint 2 or 3 ran and revised after review the same day (below); the sham touch and the trials are built when they first run, after track R. The sham touch and checkpoint 0's twins were built for its rerun (2026-09-30, below); checkpoints 2 and 3's three-way fork waits for them.

## 2026-09-27 — After review: sham twins for checkpoint 0's reruns, a random touch time, paired tests and an effect floor

**Why.** Three reviews of the branch found the following, and the maintainer agreed a change for each:

- **Checkpoint 0's posterior near-miss is systematic.** In 30 of the 50 windows before a posterior touch the worm crept backward, and its speed rose after 26 of them. That is the silenced worm's backward creep dying away, which PLAN expects of the A-type oscillators and reports rather than fails. A fallback that brings backward activity back could fail the clause on creep alone.
- **"The first eligible moment from t = 12 s" narrows the touches.** Every worm crawling from the start would be touched at 12.0 s, in its start-up transient, and every other just after it ended a reversal. The sham cancels the trend at those moments, but the touches would probe only those states.
- **The sham pairs are matched.** Fisher's test treats the touched and sham copies as independent groups and is conservative on paired data. McNemar's exact test is the paired one.
- **The sham matches its copy only to rounding.** The touch current enters the voltage solve's sums over every neuron, so even with the same restarts the copies part. On the silenced network a sham twin differs from its touched copy by up to 1.2 × 10⁻⁸ body lengths per second. A significance test could find a difference that small, which would put it in checkpoint 3's partial band.

**Decision** (PLAN §7.1, §7.4). Each is marked "Changed after results", and each was made before any trial it applies to:

- **Checkpoint 0's reruns grade touches against sham twins.** From its next run, each touch forks a sham twin, and the touched line runs on.
  - The anterior reflex counts as found at 40% or more of touches, with more reversals than in the twins (McNemar's exact test).
  - The posterior reflex counts as found if the touched copies' speed over the 2 s after is significantly above the twins', by at least 0.0012 body lengths per second on average. That is checkpoint 3's 1% floor, taken of the slowest crawling speed checkpoint 1 passes, since a silenced worm has no speed of its own to scale by.
  - The run of 2026-09-27 stands under the rule it ran under.
  - Considered: keeping the rule, with the mechanism recorded and a fail that the untouched twins' p matches read as creep.
- **A random earliest time for checkpoints 2 and 3.** Each seed draws an earliest time uniformly between 20 and 100 s, on a hash lane of its own. The touch comes at the first moment after it with 2 s of forward crawling.
  - The world then forks three ways, front, back and a shared sham, so the two checkpoints touch the same worms at the same moments.
  - The sham restarts the integrator wherever the touched copies' currents switch. A copy whose touch reaches no receptor, as after a lesion, is paired with a sham that doesn't restart either.
  - Considered: the first eligible moment from t = 12 s.
- **McNemar's exact test for checkpoint 2.** It is one-sided, over the pairs in which one copy reversed and the other didn't, and keeps the ≥ 70% and 3× thresholds.
  - Checkpoint 2's response is the touched copies' share of reversals less the sham twins'. The lesion rows read it as touch-evoked reversals.
  - The lesion rows compare lesioned worms with intact ones, which are independent groups, so their comparisons are unchanged.
- **A 1% floor for checkpoint 3.** Partial needs the response at 1% or more as well as significance. A response under 1%, or an unmeasured one, fails, and PVC's row is unmeasured, and fails, if either response is.
- Considered for the statistics: McNemar's test alone, the floor alone, and neither.

Checkpoint 2 is now marked as changed too, and its "at least 10 s apart", empty with one touch a trial, is dropped. §7.1 names McNemar's test beside Fisher's. Checkpoint 0's anterior result is unaffected: with no reversal in either copy, both tests give p = 1.

**Corrected after review.**

- **The restarts.** The entry above first said that a touch reached a silenced body only through the integrator's restarts, and that with them off a touched world stepped bit for bit as its twin. That held for the seed first tried, not in general.
  - With the restarts off, 11 of the 20 touched trials still part from their twins, by up to 1.7 × 10⁻⁹ body lengths per second, through the voltage solve's sums.
  - The restarts are still the main path, at up to 2.7 × 10⁻⁷.
  - A test now holds a touched silenced body within 10⁻¹⁰ m of its twin over 3 s, where an intact one moves more than 10⁻⁹ m.
- **The harness.**
  - A touch at a trial's last step could be dropped silently.
  - The report garbled failing clauses and shortened runs: "each touched 4.75 times", empty lists of receptors, and wrong plurals. Each reflex is now graded as measured or not on its own touches, and the report says why one went unmeasured.
  - Checkpoint 0 refuses trials too short for any touch.
  - The records are written before they are graded, so a failure in grading loses no run.
  - The report now prints how many posterior touches the speed rose after, and by how much.
- **The docs.** Stale text in PLAN §7.1 and §8, and wording that overstated or read ambiguously in PLAN, VALIDATION.md and the two entries above. The registry lists checkpoint 0 against every AWC and touch component it exercises.

**A known weakness, to settle before any fallback rerun.** Checkpoint 0's chemotaxis band, ±0.1 over 30 worms, isn't a controlled test. A worm that moves but has no bias fails it by chance 15% of the time if a fifth of the worms reach a spot, 37% if half do, and 58% if all do. The silenced worm doesn't move, so the run of 2026-09-27 isn't affected.

**Status.** The rules are revised before any trial they apply to. The report and harness fixes are built, and checkpoint 0, run again at `a633c02`, which has them, gives the same results (VALIDATION.md).

## 2026-09-27 — Track R, round 1: the proposal

**Why now.** Milestone 4 closed with checkpoints 2 to 4 not reached, and milestone 5's checkpoints would be too: everything from checkpoint 1 on needs forward crawling. No held-out checkpoint has run, so R's model changes can't turn a result into a fitted one (PLAN §10). The maintainer chose R over milestone 5, and approved this proposal, which PLAN §9 requires before anything runs. Compute isn't the constraint: at the 1.4 CPU-minutes per worm-hour measured for checkpoint 1's trials (2026-09-26), 2,000 evaluations of 4 trials of 120 s, about 267 worm-hours, take about 6 CPU-hours, under half an hour on 18 cores.

**Decision** (PLAN §6.2, §7.1, §7.2, §7.3, §7.4, §9's "R's first round" and §10). Four questions were put to the maintainer, the recommendation first each time, and all were agreed: the gains' floor, the budget, the spec deviations, and "the rest", which covered everything else below and was offered with the option of adjusting it. The proposal was revised after review the same day (below).

- **Calibrate the planned model first.** §7.3's CMA-ES procedure is built and run on the eight calibrated parameters as they stand. If that reaches checkpoint 1's partial band, R needs no model change; if not, the fit is the baseline.
- **R's model:**
  - **Neuromuscular drive relative to each muscle's own range**, as the go/no-go's script scales it.
  - **Three calibrated parameters.** Each comes from a rung of the ladder (2026-09-26):
    - a gain on the SMDs' neuromuscular junctions past the first 0.3 body lengths, whose full reach took the B-type chain out of the partial band;
    - the B-types' own oscillator excitability, the oscillators having done the same;
    - a gain on the B-types' gap junctions, which halved the chain's speed.
  - **The spec deviations, signed off:** relative drive gives each muscle its own scale by one shared rule, against spec §1.1's same layer for every muscle. As first approved, an A-type resting offset of 18.5 mV, departing from PLAN §3.3's threshold rule, was signed off too; it was dropped after review (below).
  - Considered: rectifying the AVA–A-type gap junctions as well (Liu et al. 2017), with the A-type side taken explicitly to keep the solve symmetric; relative drive alone; and neither.
- **Gains no lower than 0.1.** The fit can weaken the two connection classes tenfold but can't cut them. Fallback 3's cut B-types did cut them, and were the only setting at the go/no-go that reached the partial band without a forced head. A model that crawls by disconnecting the connectome would undercut the project's claim and the wiring test. The oscillator is an intrinsic layer, and may reach 0. Considered: a floor of 0.3, stricter; and 0, which lets the fit cut a class.
- **2,000 evaluations a fit, not §7.3's 400.** 400 is about 36 CMA-ES generations for eleven parameters, thin for it to converge. It is marked "Changed after results" on checkpoints 1 and 6, since checkpoint 1 has results and R's parameters come from the go/no-go's, and every null gets the same budget. Considered: keeping 400; and 4,000.
- **The rest, as drafted:**
  - the fit's trials on seeds 1001 to 1004, so no checkpoint's own trials are fitted;
  - §7.3's search settings, measures and bounds, as revised below;
  - one pre-registered fit: if checkpoint 1 stays below partial, R ends, and a further round needs a new proposal;
  - the free-parameter budget from 14 to 17, the code's constant rising when the parameters land.
- **Checkpoint 0's chemotaxis clause, for reruns. Changed after results.** ±0.1 over 30 worms isn't a controlled test. A worm that moves but has no bias fails it by chance 15% of the time if each worm has a one-in-five chance of reaching a spot, 37% at one-in-two, and 58% if every worm reaches one. R is a fallback, so checkpoint 0 runs again after it, and from that run the clause is graded by the exact binomial test on arrivals, made two-sided after review. The run of 2026-09-27 stands under the rule it ran under. Considered: keeping ±0.1.

**Left out:** the RMDs in the head switch, which helped a little at the go/no-go (0.041 against 0.027) but which no source puts there, making them an unsourced spec deviation; and rectification, as above.

**Revised after review, the same day.** Three reviews of the branch, of its science, of whether it can be built as written, and of its docs, found the following, and the maintainer agreed four further decisions, the recommendation first each time:

- **The A-type offset is dropped.**
  - It clashed with the A-types' own oscillator, which reads the same threshold. With the oscillators on, the A-types sat only 5 to 9 mV below threshold, not 18.5.
  - Keeping the oscillator centred on the old equilibrium restores about 22 mV. But relative drive's baseline, taken at the midpoint, then starts each muscle below its own rest.
  - In a probe of R's model with the gains at their floors, 96 of the go/no-go's draws of 30 s each with the noise off:

    | Offset                                                | Best speed, head switch free | Best speed, head forced at 0.3 Hz |
    | ----------------------------------------------------- | ---------------------------- | --------------------------------- |
    | As drafted                                            | 0.046                        | 0.065                             |
    | Oscillator centred, baseline at the A-types' own rest | 0.077                        | 0.110                             |
    | None                                                  | 0.081                        | 0.142                             |

  - Liu, Chen & Wang's −71.7 mV is VA5's down state, from which it alternated with an up state, and the same paper puts VD5 7.4 mV above VB6, while the D-types got no offset.
  - Considered: keeping it, done right; and keeping it as drafted.
- **The noise ceiling is 0.169 pA·√s, not 0.089.** At 0.089, set by a lone neuron, the network's median neuron spreads 3.0 mV at rest and AVA 0.9, so noise could hardly reach the reversal target. The new ceiling is where the neuron that spreads most at the intact network's rest, IL2DL, reaches 20 mV, with AVA about 1.6. A σ_n that ends at its ceiling is reported as limited by it. Considered: the median neuron at 16 mV, the sigmoid's working width, about 0.47, at which the least-coupled neurons would spread about 56 mV; and keeping 0.089.
- **Checkpoint 0's chemotaxis test is two-sided,** since odour-driven avoidance in a silenced worm would be the glue's behaviour too. The report gives the number of arrivals; with 5 or fewer the test can't fail. Considered: one-sided, as drafted.
- **Everything else, as recommended:**
  - **The objective.**
    - Each target's relative error is capped at 2, and an unmeasured one takes the cap. Before, a wavelength of 4 body lengths from a near-standing wave scored worse than having no bout at all.
    - The frequency takes the cap when there is no bout. At the go/no-go, 6 to 12 of 95 still draws in each variant of the planned model had crossing frequencies in the pass band, from bends as small as κL 5 × 10⁻⁴, and silenced ones from rounding alone.
    - A candidate with a trial that leaves the finite numbers ranks last.
    - The gap between the objective and checkpoint 1's bout clause is acknowledged.
  - **The final parameters.** The ten best evaluated candidates and the final mean are run again on 16 fresh seeds, 1005 to 1020, and the best there is final, for every null too. Otherwise a candidate could be chosen for its luck on four seeds.
  - **The search.** Each parameter's mapping is named, the seed is 1, a candidate outside the bounds pays the squared distance it lay outside, and CMA-ES updates from the candidate as sampled.
  - **Relative drive's baseline** is the midpoint, the model's own rest without the offset. It is computed once, from the intact map with κ_SMD applied, the same for every brain and lesion, so that a lesion's lost drive shows.
  - **Thresholds.** Each κ_gap,B candidate is a rewired brain with its own thresholds, as at the go/no-go. The AWC gains and touch currents stay as built on the intact wiring.
  - **θ_osc from −28 mV.** The silenced head's drive is −28.47 mV. At the go/no-go's −30 the silenced head gate could open, held shut in a review's probe only because the SMDs alone can't bend the head to P_th.
  - **The markers** are "Changed after results" throughout, as the sham twins' entry above has them, and checkpoint 0's §7.2 row carries one.
  - **The text** now covers:
    - κ_SMD's exact muscles, each quadrant's from the ninth on;
    - κ_gap,B's scope, 92 pairs, 7 of them with A-types, and SMDVL's with VB1;
    - the kernel work the oscillator split and relative drive need;
    - the planned model kept as a switch, and R's provisional values;
    - the risk that R won't reach partial, and the fairness notes;
    - §7.5's tuning cost.
  - Considered and not adopted: restarts with a growing population (IPOP), and whole-window speed in the objective.
- **Corrections to the first draft.**
  - The budget was first 10, raised to 14 (PLAN §0).
  - The 63× real time had no record, and gives way to the measured 1.4 CPU-minutes per worm-hour.
  - Only two of the three parameters came from rungs that took the chain out of the band.
  - The A-types' junctions drive the muscles about as much as the B-types' ventrally (318 against 338 EM sections) and twice as much dorsally (346 against 170), not "at least as much" everywhere.
  - The ±0.1 rates hold when each worm reaches a spot with that probability, not for exactly that many arrivals.

**What R's fit won't show.** R's parameterisation comes from experiments on the real wiring, the ladder, a design step the nulls don't get, and checkpoint 6's report will say so. PLAN §9 lists the rest.

**Status.** Approved, and revised after review; nothing in it has run. The order is: the calibration procedure, and the planned model's fit; then R's model, on the CPU and the GPU with parity; then R's fit, checkpoint 1, and checkpoint 0's rerun, with its sham twins built first.

## 2026-09-27 — Calibration: the procedure, as built

**Decision.** PLAN §7.3's procedure is built as it fixes it (`npm run calibrate`), and run first on the planned model's eight parameters, track R's first step (PLAN §9). What §7.3 leaves to the implementation was set with the code, before the fit ran (a timing run of 20 evaluations came first, and its two generations match the fit's):

- **CMA-ES** (`src/validation/cmaes.ts`), as Hansen's tutorial gives it ("The CMA Evolution Strategy: A Tutorial", arXiv:1604.00772), with its default settings:
  - the (μ/μ_w, λ) strategy with μ = ⌊λ/2⌋ and positive weights proportional to ln(μ + ½) − ln i;
  - cumulative step-size adaptation, and the rank-one and rank-μ covariance updates, with the tutorial's default constants and its stall of the rank-one path, h_σ;
  - no active update with negative weights, which the tutorial's later versions add;
  - the covariance decomposed every generation, by Jacobi rotations, which suits eleven dimensions or fewer.

  Its samples come from the neural noise's counter-based hash, from seed 1, the generation and the candidate, so a run replays exactly. On standard test functions in eight dimensions it reaches 10⁻¹⁰ in about 1,200 evaluations on the sphere, about 4,000 on an ellipsoid of condition 10⁶, and about 4,000 on Rosenbrock's function. A review found pycma, without its active update, close: about 1,160, 3,920 and 3,500.

- **The search** (`src/validation/calibration.ts`, `scripts/calibrate/run.ts`).
  - Each candidate is evaluated at its point clipped into the bounds, on seeds 1001 to 1004. The search ranks it by its objective plus the squared distance it lay outside.
  - A generation the budget cuts short is evaluated but doesn't update the search.
  - The final mean is the mean after the last update.
- **The final check.**
  - It runs the ten best distinct candidates again on seeds 1005 to 1020, ranked by their objective as evaluated, which the search's penalty doesn't enter, and the final mean too.
  - The lowest objective there is final, the better on the fit's seeds on a tie.
- **The measures** are pooled over each candidate's trials: the kinematics over their forward bouts, with checkpoint 1's own functions, and the reversal rate over their measured windows.
- **The bounds** go into the registry now, before the fit, as §7.3 sets them.
- **The fit's values go into the registry unrounded**, so that checkpoint 1 and the app run on exactly the parameters the check chose; `FIDELITY.md` shows them rounded.
- **The app and the harness then run on the calibrated values,** as PLAN §6.2 says they will once calibration sets them, the provisional ones staying beside them.

**Cost.** A short run of 20 evaluations took 90 s on 18 cores, final check included. With the noise on, a trial of 120 s takes about 5.4 CPU-seconds, about 22× real time: slower than the 1.4 CPU-minutes per worm-hour measured on the provisional parameters, whose noise is off. The full fit takes about 45 minutes.

**Results.** The fit ran at `4b17c57` and took 59 minutes: 2,000 evaluations over 200 generations, and the final check.

- **The search settled against two bounds.** Corrected after review: this entry first said it converged.
  - The best objective on the fit's seeds fell from about 10 in the first generation to 1.15 by the 400th evaluation.
  - It reached 0.81 at generation 120, and didn't improve after. The step size fell from 0.3 to about 0.01.
  - From generation 100 the search's mean lay beyond the neuromuscular gain's upper bound, so each of the last 800 candidates ran at g_nmj = 5. From generation 120 it sat on the head-switch gain's.
  - The speed term, 0.74 of the pick's 0.87, never moved. The search stopped at its budget.
- **The final check changed the pick.**
  - The best candidate on the fit's seeds, 0.81, scored 0.90 on the 16 fresh ones.
  - The final pick came from generation 180: 0.83 on the fit's seeds, and the lowest on the fresh ones, 0.87. The top four there lay within 0.03 of each other.
- **The calibrated values,** to three significant figures:
  - g_osc = 2140 pS, τ_w = 2.51 s and θ_osc = −12.9 mV;
  - g_sw = 371 pA and g_p = 0.308 pA;
  - g_nmj = 5 per EM section and θ_nmj = 3.74 EM sections;
  - σ_n = 0.0834 pA·√s.
- **The neuromuscular gain ended on its upper bound,** 5 per EM section, so it is reported as limited by it. **The head-switch gain ended near its own,** 371 of 400 pA, where the search's mean sat. Every other value ended inside its bounds, the noise at about half its ceiling. Corrected after review: this entry first said the fit wanted more muscle drive. Raised past its bound, the gain lifts the frequency, not the speed (below).
- **On the 16 fresh seeds,** with 7 forward bouts of 10 s or more between them, the pick bends at 0.200 Hz, with a wavelength of 0.56 body lengths, and reverses 1.85 times a minute. It moves at 0.031 body lengths per second, against a target of 0.22.
- **Checkpoint 1, on seeds 1 to 20** (`4a5c087`, VALIDATION.md), fails. The provisional parameters' run of 2026-09-26 is given for comparison:

  | Clause                             | Calibrated | Grade       | Provisional |
  | ---------------------------------- | ---------- | ----------- | ----------- |
  | Frequency (Hz)                     | 0.185      | **Partial** | 0.045       |
  | Wavelength (body lengths)          | 0.58       | **Pass**    | 5.82        |
  | Speed (body lengths/s)             | 0.030      | **Fail**    | 0.029       |
  | Posture variance, four eigenworms  | 95.1%      | **Pass**    | 99.5%       |
  | Trials with a forward bout of 20 s | 0%         | **Fail**    | 0%          |
  - The provisional column's frequency and wavelength came from one crossing of the mean a bout, and described no undulation (2026-09-26).
  - The worm moves forward 62–75% of the time and reverses about 2.0 times a minute.
  - Its forward runs end at the head switch's flips: no forward run lasted longer than 13.6 s. Corrected after review: this entry first put it down to dips under the motion floor.

- **What it means for track R.** Calibration alone doesn't bring checkpoint 1 to partial, so R goes on to its model (PLAN §9, step 2). This fit is the baseline R is measured against.
  - Over its bouts a bend travels from head to tail, but the body is led by the head switch's slow cycle, and its reversals are that switch's slips (below). What it lacks most is speed, and with it the 20 s bouts.
  - The fit pushed the neuromuscular and head-switch gains as far as the bounds let them, for the frequency term, not the speed.
- **Cost.** The fit took 59 minutes on 18 cores, not the 45 estimated: each generation's 40 trials ran in three rounds on the 18 workers. R's fit, on eleven parameters, will take about as long, and so will each null's.

**Also changed.** The app and the harness run on the calibrated values. `FIDELITY.md` shows them to three significant figures, and the harness's report names them. Checkpoint 0's section still describes its run on the provisional parameters, and it runs again after whichever fit ends R.

**Status.** Run; checkpoint 1 fails, and track R goes on to its model.

## 2026-09-27 — After review: what the planned model's calibration found, and checkpoint 1's diagnostics

**Why.** Three reviews of the calibration found that the fit ran correctly and as pre-registered, but that its first reading, in the entry above, misdescribed the calibrated worm. The findings were reproduced before this entry was written:

- **The reversals are the head switch's slips.** Over seeds 1 to 8 on the calibrated parameters, all 29 reversals began between 1 s before and 3 s after a flip of the head switch to one side, and none near a flip to the other. AVA's activation changed by 0.0007 on average over them, against a standard deviation of 0.006. In a review's sweep the reversal rate fell and rose irregularly with the noise: the calibration's 1.8 a minute was met by the noise sparing some flips their slip, not by the network reversing.
- **The frequency and wavelength mix two waves.** The mid-body curvature's spectrum over checkpoint 1's trials peaks at 0.073 Hz, the head switch's slow cycle, with 61% of the power below 0.12 Hz and 19% between 0.2 and 0.45 Hz. The measured 0.185 Hz and 0.58 body lengths average that slow wave with a weaker ripple near 0.37 Hz, so neither describes one wave.
- **The speed deficit is structural.** The neuromuscular gain is the slope of the muscles' response, not the strength of their pull. Raised past its bound to 20, it lifted the frequency (0.41 Hz on four fresh seeds) and not the speed (0.034). The speed never exceeded 0.035 in 2,000 evaluations. Proprioception is inert: at 0.001 pA the pick behaves as at 0.31. The bouts break once per cycle of the head switch, every 10 to 14 s, not by jitter at the motion floor.
- **The search settled against two bounds; it didn't converge on the objective.**
  - From generation 100 its mean lay beyond the neuromuscular gain's upper bound, so every one of the last 800 candidates ran at 5. From generation 120 it sat on the head-switch gain's.
  - The speed term, 0.74 of the pick's 0.87, never moved.
  - The objective is rugged: on four seeds of their own the pick made no forward bout of 10 s and scored 8.85, against 0.87 on sixteen.

**Decision** (PLAN §7.4, §9), agreed by the maintainer, the recommendation first each time:

- **Checkpoint 1's report adds diagnostics, reported and not graded,** set before track R's fit: the mid-body curvature's spectral peak and its share of power in 0.2–0.45 Hz; the share of reversals starting within 3 s after a head-switch flip; and AVA's activation change over reversals. R's model is then judged on whether it crawls, not only on whether it scores. Considered: also stopping head-switch slips from counting toward the calibration's reversal rate, a change to the objective after results that would need a rule reading network state; and neither.
- **Checkpoint 6's reversal term is an open question,** to settle before any null is tuned, with R's fit in hand. R's own fit doesn't depend on it. Considered: settling it now, with less evidence.
- **Everything else, as recommended:** the entry above's reading is corrected in DECISIONS, VALIDATION, PLAN and README; the runner is made robust; a compact summary of the fit is committed, with a test that the registry matches it; CMA-ES gains guards that can't change this fit's replay. The fit isn't rerun: none of this changes its result.

**Built and run.**

- **The diagnostics** (`src/validation/checkpoints.ts`). Each trial records when the head switch flipped and AVA's activation. On checkpoint 1's trials of the calibrated model (VALIDATION.md):
  - the mid-body curvature's spectrum peaks at 0.073 Hz, with 19% of its power between 0.2 and 0.45 Hz;
  - all 73 reversals started within 3 s after a flip of the head switch;
  - AVA's activation changed by 1.2 × 10⁻³ over them on average, against a standard deviation of 8.3 × 10⁻³.
- **The runner.**
  - Its search moved into `calibrate()` (`src/validation/calibration.ts`), tested on a synthetic objective: the budget, a last generation cut short, the final check, and a resumed run.
  - It rewrites its record after every generation, and `--resume` replays a stopped run, each candidate checked bit for bit.
  - It records its commit, settings and unconverged solves, runs the final check in parallel, and prints the final values unrounded.
  - Its worker pool no longer hands work to a worker that died while idle.
  - Replaying the recorded fit through the new code reproduces all 2,000 candidates, its generations, its finalists and its pick exactly. A new short run matches the old one's evaluations and pick.
- **The record.** `data/calibration/planned.json` is the fit's summary, without its evaluations, committed. It was assembled from the run's output and log, since the runner didn't yet record its commit, date or time. `tests/calibration.test.ts` holds the registry's values and bounds to it.
- **CMA-ES's guards.** It now refuses NaN values, a tell with no generation asked, a population under 2, and a covariance gone degenerate. None of them fires in the recorded fit, whose replay they leave unchanged.
- **The app's speed.** With the calibrated noise on, the app in headless Chrome holds 60 frames a second at 10× and 20×, but saturates at about 21–23× real time, down from about 60× on the provisional parameters. On the CPU, the noise alone costs about 40%: 55× real time without it, 34× with it, on one core. The 10× target still holds.

**Status.** Built and run; the fit isn't rerun, since nothing here changes it.

## 2026-09-27 — GPU parity grades a one-second state only when the CPU leaves room for f32 (changed after results)

**Why.** Track R's model (the next entry) adds a set of states to the loop's parity check: the trial values with R's switches on, κ_gap,B and κ_SMD at 0.5, the B-types oscillating at half the A-types' gain, and a neuromuscular gain and threshold of 10 and 0.2 in relative drive, chosen by hand. In Chrome on the M5 Max, every check passes but one of their one-second states:

- **The state.** At track R's t = 3.5 s, the GPU's voltage error is 1.38 times the threshold. The CPU reference, rerun at the GPU's solver tolerance, drifts from itself by 0.57 of it. That is inside the rule of 2026-09-26, which grades a state whose reference stays within the threshold of itself, so the state is graded, and fails.
- **Sensitivity, not a fault.** R's 11 states pass one step, the voltage's worst error at 0.008 of its tolerance and the muscles' 3 × 10⁻⁴ of theirs. Rounding the brain's starting state to f32, as the GPU holds it, moves the CPU's own second by 0.002 of the threshold at most. What differs is the second's arithmetic, which this state amplifies as it amplifies the solver's tolerance.
- **How far f32 goes beyond the tolerance.** Over the loop's 59 graded states whose reference drifts by at least a hundredth of the threshold, the GPU's voltage error runs from 0.11 to 4.7 times the reference's own drift, with a median of 1.0. Where the drift exceeds a tenth of the threshold, it is at most 3 times it among graded states (2.95, R's t = 5.0 s). The gating variant's t = 3.0 s runs at 2.43 times, and passes at 0.69 of the threshold only because its drift is 0.28.
- **Corrected after review:** this entry first called Safari's recorded failure at t = 11.0 s the same case, and the margin of 3 the most seen. Neither holds. There the GPU's error is 10.0 times the reference's drift in Safari (9.97 against 0.993) and 8.2 times in Chrome (9.47 against 1.15), where the old rule had already set it aside. So the margin is a heuristic from the graded states, not a bound. This entry also left out that the change reverses the AWC-ON entry's decision that the rule stays; the after-review entry below records it.

**Decision** (PLAN §7.2, marked changed after results). The maintainer chose the recommendation:

- **A one-second state is graded only if the CPU reference, rerun at the GPU's solver tolerance, stays within a third of the threshold of itself,** not the whole of it. For the whole loop, that is within a third of each of its thresholds, with the same head-switch state throughout. A state at the bound then passes with up to 3 times its reference's drift, the most seen among graded states where the drift is large enough to matter. The quarter-of-states guard is unchanged.
- **Considered:**
  - keeping the rule and recording the failure, as Safari's is recorded, which would leave `npm run gpu:parity` failing in Chrome;
  - passing a graded state whose error is within 3 times the reference's drift, which would pass GPU errors above the threshold;
  - setting R's parity values by mapping the planned model's through the median muscle's range, as R's provisional values are, a change to a fixture after seeing it fail that might not clear the state.

**What it sets aside,** on the run that found it: 14 of the 87 loop states, 16%, under the quarter, up from 4, 3 of them R's; and 2 of the 21 brain states, up from 1, adding t = 5.0 s, whose reference drifts by 0.73 of the threshold. In Chrome t = 11.0 s was already set aside; in Safari, where its reference drifts by 0.993, the new rule sets it aside too. No state graded under the new rule fails, and the largest graded voltage error is 0.69 of the threshold.

**Status.** Rule set; the code follows in the same pull request.

## 2026-09-27 — Track R's model, as built

**Why.** The planned model's calibration left checkpoint 1 failing (above), so track R goes on to its model, step 2 of its first round (PLAN §9), as approved and revised after review. The maintainer chose to build it in one pull request and fit it in the next, and to have the registry describe R's model from now on, the planned model kept beside it.

**Built** on the CPU reference and the GPU, applied to every brain:

- **Relative drive** (`src/sim/muscles.ts`). Each muscle's rest and range come once from the intact neuromuscular map, with κ_SMD applied: its rest has every presynaptic activation at the midpoint, 1/11, and its most every excitatory one at 1/6 and every inhibitory one at 0. The weights are divided by the range, and the rest over the range becomes an offset the activation subtracts, so `g_nmj` and `θ_nmj` act on (u − u_rest)/(u_max − u_rest). Lesions keep the intact ranges. Over the 95 muscles the range runs from 0.67 to 11.0 EM sections, with a median of 4.41; the median rest is 3.45.
- **κ_gap,B** (`scaleGap`, `src/sim/brain/network.ts`) scales the 92 gap junctions with a VB or DB neuron on either side, both directions of each, before the thresholds are set.
- **κ_SMD** scales the SMDs' 32 junctions onto muscles starting 0.3 body lengths along or beyond, 312 of their 582 sections.
- **g_osc,B.** Each oscillator carries its own gain, its class's; at 0 the B-types have none.
- **On the GPU.** The kernel's oscillator flag became each neuron's gain. The muscle stage subtracts each muscle's offset, stored after the neuromuscular weights, into which the range folds. The parameter block grew to 60 words.
- **The planned model stays as a switch.** Left out of the loop's parameters, each of R's settings takes the value that gives the planned model, which still runs as before, bit for bit wherever checked. Eight worlds, four seeds intact and silenced, stepped for 10 s on its provisional values with the noise off, end in the same state as on `main`, hashed; the reviews found the same with the noise on and with lesions (the after-review entry). No committed test holds it. `plannedParams` maps the planned model's values, and `src/science/planned.ts` records them, its provisional ones and its fit's, which a test holds to `data/calibration/planned.json`. The go/no-go's tests and the harness's run on it.
- **The registry** (`src/science/params.ts`) is R's: eleven calibrated parameters, their values null until R's fit, within the bounds approved; the neuromuscular gain and threshold per unit of relative drive and in it, with bounds of 2 to 40 and −0.3 to 0.8; the budget at 17. `FIDELITY.md` shows each as not yet calibrated, with its provisional value. `npm run calibrate` now fits R, writing `data/calibration/r1.json`.

**Provisional values,** set before any run of R's model and to three significant figures. R's model runs on them until its fit, never taken for calibrated (PLAN §6.2):

- the planned model's calibrated values for the parameters it shares: g_osc and g_osc,B 2140 pS, τ_w 2.51 s, θ_osc −12.9 mV, g_sw 371 pA, g_p 0.308 pA, σ_n 0.0834 pA·√s;
- κ_gap,B and κ_SMD at 1, which change nothing;
- g_nmj and θ_nmj mapped onto relative drive through the medians of the muscles' rests and ranges, taken separately: 5 × 4.409 = 22.0, and (3.738 − 3.455)/4.409 = 0.0642. A first mapping gave 22.2 and 0.0638: its median range left out the one muscle whose rest is 0, vBWMR24, and took the upper of the two middle values. It was corrected before any run, and a test now derives both values from the data.

With these, R's model differs from the planned model's fit, beyond rounding, only in taking each muscle's drive relative to its own range rather than the medians'. That keeps little of the fit, added after review. Its muscles were all or nothing: at the model's rest, 25 of the 95 were above 0.95 activation and 41 below 0.05, and 28 never reached half activation even at their most drive, 27 of them 0.55 body lengths or more along the body. So it crawled with a passive rear body. With relative drive every muscle is at 0 at rest and 1 at its most, so no one gain and threshold can reproduce that.

**What it does.** On checkpoint 1's twenty trials, for a look, not recorded in VALIDATION.md, R's model on its provisional values barely moves. The look ran on the code before it was committed; a review reran its trials at `f8ed2f6`, bit for bit. Over the trials it is forward 16–25% of the time, paused 65–73% and backward 9–12%. Its mean velocity is 0.005 to 0.008 body lengths per second, and its longest forward run 3.2 s. It reverses 143 times, 3.9 a minute, every reversal within 3 s after a flip of the head switch. The mid-body curvature's spectrum peaks at 0.082 Hz, with 22% of its power between 0.2 and 0.45 Hz.

The planned model's fit moved forward 62–75% of the time, at a mean velocity of 0.019 to 0.023 over each trial. Corrected after review: this entry first set its speed over forward bouts, 0.030, against R's over whole trials. In operation R's relative drive sits about 0.19 below the model's rest, so about half its muscles average under 0.1 activation. So relative drive costs the planned fit most of its forward motion; R's fit is what tests the model. Until then the app and the harness run it as it stands.

**Parity** (Chrome 153 on an M5 Max, Metal). The loop's parity gains a set of R's states (the entry above). Every check passes under the one-second rule as changed there:

- one step: all 11 of R's states, the voltage's worst error 0.008 of its tolerance and the muscles' 3 × 10⁻⁴ of theirs, and every other state as before. The nearest miss in the run is R's: at t = 6.5 s, a rod's velocity at 0.936 of its tolerance;
- one second: 73 of 87 loop states graded and 19 of 21 brain states, with none failing.

The brain steps at 29.9× real time and the whole loop at 25.0×, as before. On CI's SwiftShader every check passes too, the same states not graded.

**Safari** (26.6, `npm run gpu:parity:safari`). Every check passes, the first full pass in Safari since AWC-ON's entry. The state at t = 11.0 s that failed there, its reference at 0.993, is no longer graded; 13 of 87 loop states and 2 of 21 brain states are not. The whole loop ran at 9.6× and 13.8× real time in two runs, below the 17.9× recorded before. `main`, run the same way the same day, gave 9.4× and 13.6× (read off, not saved). So R's model shows no cost there that Safari's spread from run to run, 44% between its own two runs, would reveal; in Chrome the loop runs at 25.0× before and after. The drop's cause wasn't looked into.

**Status.** Built; R's fit is the next pull request.

## 2026-09-27 — After review: R's model, the parity rule's reversal, and where R's fit starts

**Why.** Three reviews of R's model found no fault in its code. It matches PLAN §9, the GPU mirrors the CPU, and two of them reran the planned model against `main`, 20 worlds with noise and lesions between them, and found it identical. But they found three things to decide, as well as corrections to the two entries above:

- **The parity rule's change reverses a decision.** When the change was put to the maintainer, the question left out that the AWC-ON entry had decided "the rule stays", because "a rule changed after a failure would be fitted to it", and had rejected a bound of half the threshold. It also rested on a claim that held only over graded states:
  - The GPU's error at the trial values' t = 11.0 s is 8.2 times its reference's drift in Chrome and 10.0 times in Safari, so a third leaves no room for a state that sensitive: it passes such a state only if its drift is too large for it to be graded.
  - The bound was chosen after seeing Chrome's figures. Half would have passed Chrome but failed Safari, at R's t = 2.0 s, by 1.008 times the threshold.
  - The share of states not graded exceeds a quarter within two setups. On the run that found it, those are 3 of R's 11 and 2 of the 5 moved and turned copies. The other setups: 5 of the trial values' 21, 3 of the 15 wall copies, 1 of the 10 touched copies, and none of the flipping and gating variants' 25. The guard pools every setup.
- **R's fit would start where its muscles are nearly silent.** At the centre of the search box, where §7.3 started the planned model's fit, R's relative drive sits about 0.16 below rest and moves by 0.04. So the muscles' activation averages 0.026, varying by 0.008, and 9 of the 95 average above 0.1 (40 s, seeds 1 to 3). At R's provisional values the drive moves by 0.14, and 44 or 45 muscles average above 0.1.
- **The runner can no longer calibrate the planned model.** Its parameters and bounds are R's now. PLAN §9 gives each null the procedure of whichever fit ends R, so if that is the planned model's fit, the nulls will need the planned model's path back.

**Decision** (PLAN §7.3, §9), the maintainer's, the recommendation each time:

- **The parity rule stays at a third, recorded as a reversal** of the AWC-ON entry's decision. The reasoning changed with where the failure is. Then it was one Safari state at the edge of its rule, and Chrome, the browser parity runs in locally and on CI, passed. Now it was in Chrome, where `npm run gpu:parity` would fail on every run. And R's model, which its fit moves across wide bounds, brings states as sensitive. The margin of 3 is a heuristic from the states graded, not a bound. Considered: reverting to the whole threshold and recording the failures, with CI's SwiftShader passing (R's t = 3.5 s is 0.36 there); and a well-posed test that jostles the body at f32's scale, which targets the cause the AWC-ON entry found but would be new, and set after results too.
- **R's fit starts from R's provisional values,** and so does every null's (PLAN §7.3), with the same step of 0.3. Set before R's fit runs. The two connection gains start at their upper bound, 1, so about half their samples lie outside and are penalised, which moves them down, as the review's probe of the round's proposal favoured. That start comes from the planned model's fit on the real wiring, a design step the nulls don't get, and checkpoint 6's report says so. Considered: the centre, as the planned model's fit started; and moving θ_nmj's bounds down so the centre moves the muscles, which would change bounds approved.
- **The planned model's calibration path waits until a null needs it** (PLAN §9). Its bounds and settings are in `data/calibration/planned.json`. Considered: adding it to the runner now.
- **Everything else, as recommended.** The two entries above are corrected in place, and PLAN, README and VALIDATION where they were wrong or unclear. A guard, stale comments and tighter tests go into the code.

**Built** (`58eb9da`):

- **The search's start.** `calibrate()` starts from the registry's provisional values unless given another point, and the run records them in its settings. A test checks the first generation's mean.
- **Oscillators.** Both brains refuse an oscillator whose gain isn't above 0, or whose shift and gain don't match its neurons. The GPU skips such a neuron where the CPU would not, so a class without an oscillator must be left out, as `World` already did.
- **Tests.**
  - The GPU gets R's muscle offsets and weights exactly as the CPU uses them.
  - Relative drive is 0 at rest and 1 at its most with κ_SMD applied too.
  - A lesion's surviving junctions keep their weights.
  - Gain 0 leaves the 21 A-types alone.
  - κ_SMD reaches exactly 32 junctions.
  - A muscle with no range is refused.
  - The runner's record names R's round and `r1.json`.
  - The report's calibrated path is tested again, with the registry's values stood in.
  - Once R's fit is committed, the registry must match it.
- **Smaller things.** `scaleGap` no longer sits under `lesion`'s comment, the shader's vacant parameter slot is named so, and stale comments now describe R's model.
- **Parity** in Chrome, rerun on this code, gives the same results as before, every check passing.

**Status.** Decided and built; R's fit is the next pull request, from R's provisional values.

## 2026-09-27 — How the real wiring's final fit is chosen

**Why.** PLAN §9 gives the real wiring two fits, the planned model's and R's, and the choice between them, but didn't say how the choice is made. The chosen fit is what the app and the harness run, what checkpoint 0 reruns on, and whose procedure every null gets. So the rule is set now, before R's fit runs.

**Decision** (PLAN §9, step 3). The maintainer chose the recommendation. The better checkpoint 1 grade wins; on a tie, the fit with more clauses graded pass, then more graded partial; then the one with the lower objective on the final check's 16 seeds, 1005 to 1020, which each fit already reports. Checkpoint 1 is the gate R's stopping rule uses, and its bout and eigenworm clauses test what the objective doesn't, which the head switch's slips can't game. It chooses on checkpoint 1's own trials, and its report says so.

- **Considered:** the lower objective on the fresh seeds alone, the criterion each fit uses for its own final candidate, which keeps checkpoint 1's trials out of the choice. The planned fit scored 0.87 there, partly by counting the head switch's slips as reversals, which R's fit could exploit as well. Also R's fit by design, whatever it scores.
- **The planned fit's standing** (VALIDATION.md): Fail, with the wavelength and eigenworm clauses graded pass and the frequency partial, and 0.87 on the fresh seeds.

**Status.** Set before R's fit.

## 2026-09-27 — Track R's fit: closer, still failing at the 2.5 ms step (corrected after review)

**The fit** (`npm run calibrate` at `8d00b76`; `data/calibration/r1.json`). 2,000 evaluations from R's provisional values took 60 minutes on 18 cores, and no solve failed to converge.

- **On the fit's seeds,** the best objective fell from 9.00 in generation 0 to 0.78 by generation 20 and 0.56 by generation 60. It reached 0.510 in generation 114, and stayed there.
- **On the 16 fresh seeds,** the pick is generation 114's candidate 0, the lowest of the eleven rechecked, at 0.591; the final mean scored 0.595 and the planned fit 0.865. It makes 27 forward bouts of 10 s or more, at 0.247 Hz, 0.55 body lengths, 0.060 body lengths per second and 1.98 reversals a minute. Its speed term, 0.53 of the 0.59, dominates again.
- **A narrow pick,** added after review. It beat three other candidates by 0.003 to 0.008, and made the fewest forward bouts of the eleven, 27 against 32 to 50. Generation 114's candidate 7 scored 0.899, its reversals at 0.75 a minute. The objective moves with the reversal rate more than the fit's precision can resolve.

**The values,** to three significant figures:

- g_osc 5000 pS and g_osc,B 0 pS: the B-types have no oscillator;
- τ_w 1.36 s, θ_osc −28 mV, g_sw 400 pA and g_p 1.64 pA;
- κ_gap,B 0.228, g_nmj 40, θ_nmj −0.172 and κ_SMD 0.158;
- σ_n 0.127 pA·√s.

Five of the pick's eleven are on a bound: g_osc, g_sw and g_nmj on their upper ones, g_osc,B and θ_osc on their lower. Corrected after review: the search's mean ended beyond only two of them, g_osc,B and g_nmj, and the pick's other three come from a sample clipped into the box. And θ_osc does nothing in the intact worm, whose head-switch drive stays above it: at −12.9 mV the probes' trials are identical.

**Checkpoint 1** (`7c8ff61`, VALIDATION.md) fails, closer than the planned fit:

| Clause                             | R's fit | Grade       | Planned fit        |
| ---------------------------------- | ------- | ----------- | ------------------ |
| Frequency (Hz)                     | 0.232   | **Pass**    | 0.185, **Partial** |
| Wavelength (body lengths)          | 0.59    | **Pass**    | 0.58, **Pass**     |
| Speed (body lengths/s)             | 0.063   | **Partial** | 0.030, **Fail**    |
| Posture variance, four eigenworms  | 97.3%   | **Pass**    | 95.1%, **Pass**    |
| Trials with a forward bout of 20 s | 40%     | **Fail**    | 0%, **Fail**       |

- **Its motion.** It moves forward 43–83% of the time, and its mean velocity over each trial is 0.022 to 0.049 body lengths per second. Its longest forward runs last 11 to 44 s.
- **The diagnostics,** reported and not graded. The mid-body curvature's spectrum peaks at 0.155 Hz, with 30% of its power between 0.2 and 0.45 Hz; the planned fit's peaked at 0.073 Hz, with 19%. All 78 reversals started within 3 s after a flip of the head switch. AVA's activation changed by −4.1 × 10⁻⁴ over them on average, against a standard deviation of 3.7 × 10⁻³.

**The choice** (PLAN §9, step 3, set before the fit). Both fits fail checkpoint 1. R's has three clauses graded pass against the planned fit's two, so it is the real wiring's final fit, and the app and the harness keep running it. The choice used checkpoint 1's own trials. The alternative considered, the objective on the fresh seeds, would choose it too, 0.591 against 0.865, and it grades at least as well on every clause.

**At the 2.5 ms step R's first round would end.** Checkpoint 1 stays below partial, on its bout clause alone: 40% of trials against the partial band's 50%. **Suspended after review** (the entry below): at half the step the same fit reaches partial, so R is suspended, not ended. Checkpoints 2 to 6 stay not reached behind the crawl gate.

**What carries it** (corrected after review). This section first read the A-types' oscillators as the source of the forward rhythm. Its probes gave the B-types an oscillator at the fit's θ_osc of −28 mV, which pins them far below threshold, and they counted the head switch's flips over 120 s but divided by 110 s. Rerun with lesions, on checkpoint 1's seeds 1 to 8, 120 s each, measured as the calibration measures them, with the flips and the mid-body curvature's spectral peak taken over the measured windows. Reported, not graded:

| Change from the fit            | Bouts | f (Hz) | λ (body lengths) | v (body lengths/s) | Reversals a minute | Flips a minute | Peak (Hz) |
| ------------------------------ | ----- | ------ | ---------------- | ------------------ | ------------------ | -------------- | --------- |
| None                           | 12    | 0.225  | 0.62             | 0.067              | 2.26               | 17.9           | 0.15      |
| A-types lesioned               | 25    | 0.169  | 0.59             | 0.042              | 0                  | 19.8           | 0.16      |
| B-types lesioned               | 0     | —      | —                | 0.010              | 0                  | 42.7           | 0.35      |
| AVAL and AVAR lesioned         | 28    | 0.167  | 0.71             | 0.063              | 0.34               | 19.6           | 0.16      |
| g_p 0.001 pA                   | 0     | —      | —                | 0.016              | 0.21               | 24.9           | 0.20      |
| A-types' g_osc 0.3 nS          | 0     | —      | —                | 0.002              | 11.0               | 22.5           | 0.19      |
| g_osc,B 0.5 nS                 | 0     | —      | —                | 0.010              | 0.14               | 40.9           | 0.34      |
| g_osc,B 0.5 nS, θ_osc −12.9 mV | 19    | 0.269  | 0.61             | 0.057              | 0                  | 26.4           | 0.22      |
| θ_osc −12.9 mV                 | 12    | 0.225  | 0.62             | 0.067              | 2.26               | 17.9           | 0.15      |
| g_sw 200 pA                    | 24    | 0.245  | 0.53             | 0.059              | 0.07               | 16.0           | 0.13      |
| Noise off                      | 11    | 0.138  | 1.06             | 0.080              | 3.28               | 18.4           | 0.15      |
| κ_gap,B 1                      | 22    | 0.102  | 0.71             | 0.037              | 0                  | 3.9            | 0.06      |
| κ_SMD 1                        | 27    | 0.125  | 1.40             | 0.061              | 2.26               | 14.4           | 0.12      |
| g_nmj 80, past its bound       | 12    | 0.204  | 0.69             | 0.065              | 4.58               | 17.7           | 0.15      |
| g_sw 800 pA, past its bound    | 8     | 0.176  | 0.76             | 0.091              | 0                  | 20.9           | 0.17      |
| g_osc 10 nS, past its bound    | 22    | 0.174  | 0.80             | 0.071              | 0.62               | 17.8           | 0.15      |

- **The B-types carry the crawl,** without the oscillator the fit took from them, through proprioception: with them lesioned, or proprioception at 0.001 pA, the worm makes no bout. With the A-types lesioned it still crawls. A B-type oscillator of 0.5 nS keeps the crawl at θ_osc −12.9 mV; at the fit's −28 mV it pins the B-types below threshold, as a lesion does.
- **The A-types and AVA make the reversals.** With the A-types lesioned the worm never reverses, and with AVAL and AVAR lesioned it reverses 0.34 times a minute against 2.26. With the A-types' gain at 0.3 nS it reverses 11 times a minute. Those reversals depend on the time step (the entry below).
- **The body undulates at the head switch's cycle.** It flips 17.9 times a minute, a cycle at 0.15 Hz, where the spectrum peaks, and a harmonic near 0.30 Hz carries about a third of the peak's power. Checkpoint 1's frequency, 0.232 Hz, counts crossings of that waveform and falls between the two, so it describes no one wave, as with the planned fit. Without noise the harmonic weakens, and the crossing count falls to 0.14 Hz while the peak stays at 0.15.
- **Its reversals are the head switch's slips,** as in the planned fit. With the switch's gain at 200 pA the worm crawls about as fast with almost none. So the calibration's reversal term is met by slips again: the open question for checkpoint 6 (PLAN §9).
- **Pushed one at a time past three of its bounds,** g_nmj, g_sw and g_osc, on seeds 1 to 8, the worm moves no faster than 0.091 body lengths per second, short of the pass band's 0.12, and each scores worse on the objective (1.12 to 2.99, against the fit's 0.61). The bout clause wasn't measured there.

**The app.** On R's fit it holds 60 frames a second at 10× and 20× real time and saturates at about 21–24×, as before (`npm run plate:bench`, headless Chrome on an M5 Max).

**Status.** R's fit run and chosen. At the 2.5 ms step R's first round would end with checkpoint 1 failing on its bout clause; after review, R is suspended instead, since the grade depends on the step (the entry below).

## 2026-09-28 — After review: R's fit depends on the time step, and R is suspended

**Why.** Three reviews of R's fit found that it ran as pre-registered and reproduces bit for bit, on the fresh seeds and on all 20 of checkpoint 1's trials. But two of the entry above's findings don't hold.

- **Checkpoint 1's grade depends on the time step.** Checkpoint 1's 20 trials were run again for both fits with the neural step halved and quartered. At 2.5 ms both reproduce their recorded grades exactly. No solve failed to converge at any step.

  | Step     | R's fit                                                                  | Planned fit                                                                   |
  | -------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
  | 2.5 ms   | **Fail**: 20 s bouts in 40% of trials; 78 reversals                      | **Fail**: no 20 s bout; 73 reversals                                          |
  | 1.25 ms  | **Partial**: 20 s bouts in 85%, graded pass; 14 reversals                | **Fail**: no 20 s bout; 171 reversals                                         |
  | 0.625 ms | **Partial**: 20 s bouts in all; frequency 0.185 Hz, partial; 2 reversals | **Fail**: no 20 s bout; frequency 0.230 Hz, wavelength partial; 103 reversals |
  - The fit's A-types' oscillators sit at 5 nS, whose fast time scale, C/g_osc = 1 pF / 5 nS, is 0.2 ms, twelve times shorter than the step. With the A-types lesioned, a review found the model barely depends on the step.
  - So the fit's reversals, which met the calibration's reversal target, are largely made by the step. So is the bout clause's failure, which would have ended R.
  - PLAN §7.2's comparison at dt and dt/2 would have caught this, but it waited until checkpoint 1 reached partial.

- **The mechanism reading was wrong.** Probes on seeds 1 to 8 show that the B-types carry the crawl, and the A-types and AVA make the reversals:
  - with the A-types lesioned, the worm makes 25 bouts against the fit's 12 and never reverses; with the B-types lesioned it makes none;
  - with AVAL and AVAR lesioned, it reverses 0.34 times a minute against 2.26.

  The entry above said the forward rhythm came from the A-types' oscillators. Its probes gave the B-types an oscillator at the fit's θ_osc of −28 mV, which pins them far below threshold. At −12.9 mV, a B-type oscillator of 0.5 nS keeps the crawl. The split the fit shows matches the literature cited. Fouad et al. 2018 found that ablating the A- and VC-type motor neurons did not prevent the secondary rhythm they induced by paralysing the neck, and that ablating DB and VB together virtually eliminated it.

- **Smaller corrections** follow in the entry above: the body's cycle, the flip rates, the frequency and the bounds.
- **For checkpoint 0's rerun.** On R's fit the silenced network's head switch stays gated, its drive at −28.49 mV, 0.49 mV below θ_osc. But the silenced worm now moves: noise excites the A-types, and a review counted 18 reversals over the 20 silenced trials. And its B-types, left with only their leak, swing by about ±480 mV under proprioceptive current, the review found, which is unphysiological.

**Decision** (PLAN §7.2, marked changed after results; PLAN §9). The maintainer chose the recommendation each time:

- **R is suspended, not ended.** The fit and checkpoint 1 at 2.5 ms stand as run, with the step comparison beside them.
  - Next comes a convergence study of both fits and of the oscillator alone, then a fix set as a rules decision: a smaller step, a stably treated oscillator, or a bound on g_osc.
  - R's fit then runs again under the fixed numerics, a refit forced by a defect, and checkpoint 1 grades it.
  - PLAN §7.2's comparison at dt and dt/2 runs now, not after checkpoint 1 reaches partial.
  - Considered: recording R as ended at 2.5 ms, the rule applied at the step the model runs at; and grading at 1.25 ms now, which isn't converged either, and would choose the step after seeing results.
- **This pull request lands, corrected,** keeping the fit, its record and the choice between the fits. The numerics study and the refit come in their own pull requests. Considered: holding it until the refit.
- **The app's notice is corrected in this pull request,** with its visual baselines refreshed from CI. Considered: leaving it until the numerics change the worm anyway.
- **Everything else, as recommended.** The entry above and PLAN, VALIDATION and README are corrected where they were wrong. The GPU parity check gains the registry's own values as a setup. The inspector no longer calls the B-types oscillators when the fit leaves them out. The tests read the fit's values from the registry rather than pinning them.

**Built** (`e6b693b`):

- **GPU parity** gains a setup on the registry's own values, so whatever a fit sets is checked on the GPU. On R's fit its 22 checks pass in Chrome, none ungraded.
- **The app** stops saying what the fit made untrue.
  - The inspector calls a B-type an oscillator only when the parameters give it one.
  - The notice says the worm crawls in bouts, slowly, and that how well depends on the time step. It needed no new baselines, contrary to what the decision above expected: the visual tests capture each pane's canvas alone, and on CI all nine views match their baselines exactly.
- **The ledger's caveats** say the B-types run without oscillators, and that the A-types' reversals depend on the step. The fidelity page counts the values on a bound instead of naming a number.
- **The tests** read the fit's values from the registry instead of pinning them, and give the report a stand-in registry instead of changing the real one. They also hold the committed fit to the settings the code has now: its procedure, start, search space, objective and a clean commit.

**Status.** R suspended; the convergence study is next.

## 2026-09-28 — The convergence study: its design, set before it runs

**Why.** R's fit fails checkpoint 1 at the 2.5 ms step and reaches partial at half of it, so R is suspended until the numerics converge (the entry above). A study comes first, then a fix set as a rule. So that the study can't be shaped by its results, its measures and criterion are set here, before it runs.

**What it measures.**

- **Both fits in the loop.** Checkpoint 1's 20 trials, and the calibration's 16 fresh seeds, 1005 to 1020, at steps of 2.5, 1.25, 0.625 and 0.3125 ms. Each fit is run with its noise as fitted and with the noise off, since noise drawn at a different step is a different realisation and can move a metric by chance. The measures are:
  - checkpoint 1's five clauses and its grade;
  - the reversal rate and the head switch's flips a minute;
  - the calibration's objective on the fresh seeds.
- **The oscillator alone.** A lone neuron with its leak and one oscillator, held by a constant current where it cycles. g_osc is 0.3, 1, 2.14 and 5 nS, τ_w is 1.36 s and 2.51 s, and each is run at the same four steps. Its period and its voltage's course over a cycle are measured against an RK4 solution at 10 µs. With the fitted noise and no current, the rate of noise-excited excursions is measured at each step.
- **Cost.** The CPU's and the GPU's speed at each step, in real time.

**The criterion.** PLAN §7.2's: checkpoint 1's metrics agree within 2% at dt and dt/2. The largest step at which a fit meets it, against the step below, is that fit's converged step. With the noise on, where trials differ by chance, the comparison is made on the noise-off runs, and the noise-on runs are reported beside them.

**Then.** The results, and the fixes they leave open, go to the maintainer: a smaller step, a stable treatment of the oscillator, or a bound on g_osc. The chosen fix is set as a rule before R's fit runs again.

**Status.** Set before the study runs.

## 2026-09-28 — The convergence study: neither fit converges, through the noise and the oscillators (corrected after review)

**Corrected after review.** This entry first concluded that the A-types' oscillators alone carry the step dependence, and that 2.5 ms resolves them up to 1 nS. The reviews showed neither holds (the after-review entry below). It is rewritten from a rerun at `aaacc70`, whose loop results match the first run's.

**Run** with `node scripts/experiments/convergence/run.ts` at `aaacc70`: 704 trials in 11 minutes on 18 cores, every record set from that commit, and its summary written to `harness-out/convergence/summary.json`. It follows the design above, with these differences:

- The lone oscillator's voltage is compared over three cycles, not one.
- Its noise-excited excursions are counted from below x = −1 to above +1, a change made after review. As built first, the count took upward crossings of x = 0, which a noise-driven voltage makes more often the finer the step, without limit; those are reported beside them.
- The GPU's speed was projected from the CPU's, not measured.
- Two parts were added after the designed runs: one locating the cause, and each record set's chance variation, from resampling its trials.

**The oscillator alone.**

- **Held where it cycles,** its period at 2.5 ms is within 0.71% of RK4's for every gain and τ_w. It converges at roughly first order up to 2.14 nS, and not steadily at 5 nS. Its voltage's course over three cycles is 7.6–11.9% off at 2.5 ms, as its fast jumps fall early or late, and 2.8–4.9% off at 0.3125 ms.
- **Excited by noise,** its excursions rise as the step shrinks, at every gain. With τ_w 1.36 s, from 2.5 to 0.3125 ms, they go from 343 to 1,272 a minute at 0.3 nS, 61 to 592 at 1 nS, 31 to 121 at 2.14 nS, and 22 to 38 at 5 nS. A lone neuron has only its leak besides the oscillator, so noise moves it far more than in the network, but the rise shows that a coarse step damps the noise's effect.

**Both fits in the loop,** on checkpoint 1's 20 trials, with the objective on the 16 fresh seeds. No solve failed to converge.

| Fit, noise      | Step (ms) | Grade       | 20 s bouts | f (Hz) | λ    | v     | Reversals a minute | Objective |
| --------------- | --------- | ----------- | ---------- | ------ | ---- | ----- | ------------------ | --------- |
| R's, off        | 2.5       | **Fail**    | 75%        | 0.136  | 1.08 | 0.081 | 3.52               | 2.08      |
| R's, off        | 1.25      | **Partial** | 100%       | 0.150  | 0.98 | 0.078 | 0.74               | 1.33      |
| R's, off        | 0.625     | **Fail**    | 0%         | 0.153  | 0.96 | 0.081 | 0.11               | 1.69      |
| R's, off        | 0.3125    | **Fail**    | 0%         | 0.162  | 0.90 | 0.082 | 0.11               | 1.64      |
| R's, fitted     | 2.5       | **Fail**    | 40%        | 0.232  | 0.59 | 0.063 | 2.13               | 0.59      |
| R's, fitted     | 1.25      | **Partial** | 85%        | 0.229  | 0.60 | 0.064 | 0.38               | 1.28      |
| R's, fitted     | 0.625     | **Partial** | 100%       | 0.185  | 0.73 | 0.072 | 0.05               | 1.56      |
| R's, fitted     | 0.3125    | **Partial** | 100%       | 0.202  | 0.66 | 0.065 | 0                  | 1.63      |
| Planned, off    | 2.5       | **Fail**    | 0%         | 0.196  | 0.52 | 0.031 | 4.66               | 3.23      |
| Planned, off    | 1.25      | **Fail**    | 0%         | 0.280  | 0.36 | 0.030 | 3.87               | 2.63      |
| Planned, off    | 0.625     | **Fail**    | 0%         | 0.325  | 0.32 | 0.029 | 4.31               | 2.75      |
| Planned, off    | 0.3125    | **Fail**    | 0%         | 0.342  | 0.32 | 0.029 | 4.28               | 2.65      |
| Planned, fitted | 2.5       | **Fail**    | 0%         | 0.185  | 0.58 | 0.030 | 1.99               | 0.87      |
| Planned, fitted | 1.25      | **Fail**    | 0%         | 0.194  | 0.56 | 0.028 | 4.66               | 3.12      |
| Planned, fitted | 0.625     | **Fail**    | 0%         | 0.230  | 0.44 | 0.030 | 2.81               | 1.20      |
| Planned, fitted | 0.3125    | **Fail**    | 0%         | 0.244  | 0.40 | 0.029 | 3.30               | 1.67      |

- **How much of that is chance.** Resampling each set's 20 trials 100 times, one standard deviation of the pooled frequency and wavelength is:
  - for R's fit without noise, 1.0% at 2.5 ms, 0.7% at 1.25 ms and 0.4% below, since its trials barely differ;
  - for R's fit with its noise, 1.8% to 3.7%;
  - for the planned fit, 3% to 13%, with a set at 1.25 ms too degenerate to resample.
- **Neither fit converges by the criterion, at any step down to 0.3125 ms.** R's fit without noise still moves by 5% in frequency and 7% in wavelength between 0.625 and 0.3125 ms, far beyond its chance. Its bout clause goes from 75% to 100% to 0% as the step shrinks: below 1.25 ms, without noise, its runs end regularly at 15.5 s, so no trial reaches 20 s.
- **At 2.5 ms, R's fit's reversals come from the step,** noise or not: 3.52, 0.74, 0.11 and 0.11 a minute without noise, and 2.13, 0.38, 0.05 and 0 with it. Without them its objective on the fresh seeds rises from 0.59 to between 1.28 and 1.63. So the fit found its reversals almost entirely through the step.

**The cause,** a part added after the designed runs, on seeds 1 to 8: R's fit with its A-types lesioned, or their g_osc lowered, at 2.5 and 0.625 ms. The velocity is each trial's mean, alike in every row; bouts are forward bouts of 10 s or more, counted over the 8 trials.

| Variant of R's fit     | Noise  | Step (ms) | Bouts | Mean velocity | Reversals a minute |
| ---------------------- | ------ | --------- | ----- | ------------- | ------------------ |
| A-types lesioned       | off    | 2.5       | 8     | 0.0324        | 0                  |
| A-types lesioned       | off    | 0.625     | 8     | 0.0324        | 0                  |
| A-types lesioned       | fitted | 2.5       | 25    | 0.0333        | 0                  |
| A-types lesioned       | fitted | 0.625     | 17    | 0.0314        | 0                  |
| A-types' g_osc 0.4 nS  | off    | 2.5       | 0     | 0.0020        | 11.02              |
| A-types' g_osc 0.4 nS  | off    | 0.625     | 0     | 0.0019        | 11.02              |
| A-types' g_osc 0.4 nS  | fitted | 2.5       | 0     | 0.0023        | 10.95              |
| A-types' g_osc 0.4 nS  | fitted | 0.625     | 0     | 0.0020        | 10.95              |
| A-types' g_osc 1 nS    | off    | 2.5       | 0     | 0.0023        | 11.09              |
| A-types' g_osc 1 nS    | off    | 0.625     | 0     | 0.0024        | 11.09              |
| A-types' g_osc 1 nS    | fitted | 2.5       | 0     | 0.0028        | 10.74              |
| A-types' g_osc 1 nS    | fitted | 0.625     | 0     | 0.0027        | 10.68              |
| A-types' g_osc 2.14 nS | off    | 2.5       | 0     | 0.0057        | 10.13              |
| A-types' g_osc 2.14 nS | off    | 0.625     | 1     | 0.0054        | 10.06              |
| A-types' g_osc 2.14 nS | fitted | 2.5       | 28    | 0.0470        | 1.37               |
| A-types' g_osc 2.14 nS | fitted | 0.625     | 20    | 0.0243        | 4.11               |

- **Without noise, R's fit converges once its A-types are gone.** With the A-types lesioned it gives the same measures at both steps, to every figure shown. With its noise it doesn't: 25 bouts against 17.
- **The lower gains show little.** At 0.4 and 1 nS the worm doesn't crawl, so checkpoint 1's metrics can't be compared. It reverses about 11 times a minute at both steps, and its mean velocity moves by 4–13%.
- **At 2.14 nS, measured alike,** the two steps agree without noise and differ with it. This entry first compared a mean velocity with a bout's speed there.
- **That is all this part shows.** The reviews found more (the after-review entry below): the loop doesn't converge at the refit's start under a 1 nS bound, and the noise's effect depends on the step in every neuron.

**Cost.** On one CPU core the loop runs at 32.6, 17.9, 9.7 and 5.2 times real time at the four steps. The GPU's speed wasn't measured. If its cost per step is fixed, the app's 21–24× at 2.5 ms would fall to about 11–12× at 1.25 ms and 5–6× at 0.625 ms, so its 10× target survives only at 1.25 ms or above.

**Status.** Run, and corrected after review. The fix comes from a second study (the after-review entry below).

## 2026-09-28 — R's refit bounds both oscillator gains at 1 nS (changed after results, withdrawn after review)

**Withdrawn after review** the same day, before anything ran under it: the loop doesn't converge under the bound (the entry below).

**Why.** The convergence study (above) found that the 2.5 ms step resolves the A-types' oscillators up to 1 nS, whose fast time scale, C/g_osc, is 1 ms, and not at 2.14 nS or above. The rest of the loop is converged at 2.5 ms. R's fit, at 5 nS, and the planned fit, at 2.14 nS, both lie above that, and neither converges.

**Decision** (PLAN §7.3, §9, marked changed after results). The maintainer chose the bound, the first of the three options:

- **From R's refit on, g_osc and g_osc,B are bounded above at 1 nS,** not 5. Their lower bounds stay at 0.3 and 0 nS, and nothing else changes: the step, the solver, the other bounds, the procedure and its start, R's provisional values carried over and clipped into the new bounds. The bound is set for a numerical reason, not a biological one, and PLAN and the ledger say so.
- **The choice between fits** admits only a fit whose oscillator gains lie within the bound, so the planned fit, unconverged at 2.14 nS, drops out, and R's refit is the only candidate.
- **The refit is a new pull request:** the bounds in the registry, R's fit run again (about an hour), checkpoint 1 on it, and the choice. This pull request lands the study and the rule.
- **Considered:**
  - an accurate treatment of the oscillator at high gain, on the CPU and the GPU with parity, which doesn't constrain the model for a numerical reason but is substantial work and uncertain until shown to converge;
  - halving the step to 1.25 ms, at twice the cost everywhere, which the study shows doesn't converge at R's gains.

**What it costs the model.** R's fit found its reversals, and its score, at 5 nS partly through the step's artefact, so the refit loses that. At 1 nS, with the fit's other values, the worm reverses about 11 times a minute and doesn't crawl; the refit will find what the bounded space allows.

**Status.** Set before R's refit.

## 2026-09-28 — After review: the 1 nS bound is withdrawn, and the numerics have two causes

**Why.** Three reviews of the convergence study found that its conclusion, and the rule drawn from it, don't hold. The two findings that decide it, the loop at the refit's start and the noise's damping, were reproduced before this entry was written; the reviews' other figures are attributed to them.

- **The loop doesn't converge under the bound.** At the refit's own start, R's provisional values with both oscillator gains clipped to 1 nS, with the noise off, seeds 1 to 8 reverse 5, 25 and 31 times at 2.5, 1.25 and 0.625 ms. A review's 20 seeds give 17, 71, 80 and 83 down to 0.3125 ms. Each oscillator class alone converges there, and the pair doesn't. And in R's fit, with the noise off, the A-types at 2.14 nS do converge: a review found 9.91, 9.91 and 9.94 reversals a minute over three steps. So whether 2.5 ms converges depends on the whole parameter set, not on g_osc alone.
- **The evidence for 1 nS was weak.** At 0.4 and 1 nS the worm doesn't crawl, so checkpoint 1's metrics couldn't be compared, and on 8 seeds the mean velocity still moved by 3–11% between steps. The cause table's 2.14 nS row set a mean velocity (0.0057) against a bout speed (0.0520): measured alike, the two steps agree. The B-types' bound rested on no loop evidence.
- **The noise's effect depends on the step everywhere.** With R's fitted noise, the network's noise-driven voltage spread at 2.5 ms is a median 0.80 of its spread at 0.156 ms, ranging from 0.57 to 0.99; AVA's is 0.60 mV against 1.03 mV. At 0.625 ms the median is 0.94. The implicit solve damps white noise in any neuron whose time constant the step doesn't resolve. So the calibrated σ_n means what it means only at 2.5 ms. And R's fit with its A-types lesioned, converged without noise, isn't converged with it: a review's 20 seeds give bouts of 20 s in 55%, 60% and 70% of trials over three steps.
- **The study's noise measure hid a real effect.** Its crossings of x = 0 were rightly discarded. But full excursions of the lone oscillator, from below −1 to above +1, also rise steeply as the step shrinks, at every gain: 343 to 1,531 a minute at 0.3 nS, and 22 to 48 at 5 nS, from 2.5 ms to 0.156 ms (a review's count).
- **A 1 nS bound would also stop three A-types cycling at all.** DA8, DA9 and VA12 have input conductances of 1.28 to 1.43 nS, more than the bound lets an oscillator overcome. DA9 is the cell Gao et al. 2018 describe leading the A-type rhythm.

**Decision** (PLAN §7.3, §9, the withdrawal marked). The maintainer chose the recommendation each time:

- **The 1 nS bound is withdrawn,** and so is the change that would have dropped the planned fit from the choice between fits. PLAN's bounds and choice rule stand as before, and R stays suspended. The choice of 2026-09-27 stands for what the app and the harness run, and is made again when R resumes. Considered: keeping the bound and requiring the refit's start and finalists to pass PLAN §7.2's comparison, which the start already fails.
- **Next, a second study of real fixes,** designed and committed before it runs. It tests a fix for each cause:
  - a coloured noise current, an Ornstein–Uhlenbeck process with a correlation time fixed in advance, whose effect a step much shorter than that time resolves. That time is a new free parameter, so the budget would rise to 18, with approval;
  - an accurate treatment of the oscillators, or a finer step for the neural solve alone.

  Each is judged by PLAN §7.2's criterion at several points of the search space, not one: the refit's start, R's fit and the box's corners, with the noise paths paired between steps. The maintainer then chooses a rule. Considered: adopting a 0.625 ms step now, at four times the cost, with the app's 10× target lowered to about 5× and convergence not shown; and pausing track R.

- **This pull request lands corrected,** keeping the study and trials' lesions, with its results entry corrected and its code and docs fixed. The second study is its own pull request.
- **Everything else, as recommended:** the study script records what each record set ran on, and checks it; each step's tree asserts its step; the lone oscillator's samples line up; the pool reports failures fully and writes records whole; the figures and wording the reviews found wrong are corrected.

**Built** (`aaacc70`), and the study run again from scratch there:

- **The study records what each record set ran on.** A manifest names the git trees its trials depend on and its settings, and a set whose manifest doesn't match runs again. The study refuses a dirty tree, and each worker checks its tree's step.
- **Its records are written whole.** A failure names its trial and stops new ones.
- **The lone oscillator's samples line up** with the reference's; they were a step late. Its noise excursions are counted with hysteresis.
- **Each set's chance variation and the CPU's speed** are computed by the study, where they came from scratch scripts before.
- **World refuses a lesion it can't name,** silenced or not.

The rerun, 704 trials in 11 minutes, matches the first run's loop results exactly; the results entry above is rewritten from it.

## 2026-09-28 — The second numerics study: its design, set before it runs

**Why.** The convergence study found that neither fit converges at any step down to 0.3125 ms, for two reasons (the entries above). A coarse step damps the white-noise current in every neuron. And the oscillators' stiff dynamics carry an error that depends on the whole parameter set. This study tests a fix for each, at several points of the search space, so that the maintainer can choose a rule from evidence gathered widely. Its candidates, τ_n and points are set here as the maintainer chose them, and its criterion as proposed with them, before anything is built or run.

**The candidates.** Each is added to the CPU reference as an option whose default leaves the model as it is, bit for bit.

- **A coloured noise current.** Each neuron's noise is an Ornstein–Uhlenbeck current with correlation time τ_n, τ_n dη = −η dt + σ_n dW, updated exactly at each step. Its intensity σ_n keeps its meaning, since the current tends to the present white noise as τ_n goes to 0. τ_n is the model's synaptic decay time, 1/a_d = 0.2 s, from Kunert's rates in the registry, so that the noise stands for fluctuating synaptic input. It is not a new free value, and would join the registry only if the fix is adopted.
- **Neural sub-steps.** The brain steps k times at dt/k within each loop step, the loop's inputs held across them, while the muscles, the body and the rest step once. k is 1, 2 or 4.

**The points.** Each candidate is judged at seven:

- R's provisional values, the refit's start;
- R's fit;
- the planned fit;
- the four corners of the two oscillator gains, g_osc at 0.3 or 5 nS and g_osc,B at 0 or 5 nS, with the start's other values.

**What runs.**

- **At every point,** each combination of noise model and k runs checkpoint 1's 20 trials at the loop's step of 2.5 ms and at 1.25 ms, with the brain's sub-step halved alongside: 42 candidate-points, with the noise as fitted. The three values of k also run with the noise off, which doesn't depend on the noise model.
- **Noise paths are paired between the two steps.** Both draw their noise from one path on a grid at the finer run's brain step. White noise's increment over a step is the sum of the grid's, and the coloured current is the path's value at the step's end. So a difference between the steps is the numerics' and the dynamics', not a new draw's.
- **A gain sweep at each point,** with the noise off, for each k. It varies g_osc, with g_osc,B at the point's value, and then g_osc,B, with g_osc at the point's, over 0.3, 0.6, 1, 1.5, 2.14, 3 and 5 nS; the planned fit has one gain, swept alone. It runs 8 trials at each step, since without noise the trials barely differ by chance.
- **Cost.** The CPU's speed for each k. The GPU's is projected from it, since no candidate is on the GPU yet.

**The criterion.**

- **Converged:** checkpoint 1's five clause values each agree within 2% at 2.5 and 1.25 ms (PLAN §7.2), with the same grade, as the dt and dt/2 of that candidate.
- **Only where the worm crawls.** A setting is judged only if the worm makes at least 3 forward bouts of 10 s or more at both steps; where it doesn't, it is reported as not exercised, with its reversal rate and mean velocity beside.
- **With chance beside it.** Each set's chance variation, from 100 resamplings of its trials, is reported with it.

The study reports, for each candidate, the points where it converges and where it doesn't, and from the sweep the largest gains at which it converges at each point.

**Then.** The maintainer chooses a rule from the results. Adopting the coloured noise would put τ_n in the registry, taken from a_d, and recalibrate σ_n with the rest. Adopting sub-steps would cost about 1.8 times the CPU's and the GPU's time at k = 2, and 3.4 times at k = 4, which would take the app below its 10× target. Either lands on the GPU with parity before R's fit runs again.

**Status.** Set before anything is built or run.

## 2026-09-28 — The second numerics study: coloured noise stays within chance at R's fit; nothing meets 2% (corrected after review)

**Run** with `node scripts/experiments/fixes/run.ts` at `a5e763f`, a clean commit: 6,888 trials in 77 minutes on 18 cores, then its grading, with every record set from that commit. Its summary is written to `harness-out/fixes/summary.json`. It followed the design above, with these differences, noted after review: its grading ran on one core for 88 minutes after the trials; the gain sweep's sets have no chance beside them; and the rule that a setting is judged only where the worm makes 3 bouts was proposed with the design, not put to the maintainer.

**Where the worm crawls.** Only two of the seven points make the 3 bouts of 10 s the criterion needs, at both steps: R's fit, and the planned fit in some settings. The start, R's provisional values, and all four corners of the oscillator gains never make 3 bouts at a step, with any candidate. Their reversal rates and mean velocities are in the summary; a review read them as agreeing between steps at all five with the coloured noise, while white noise's mean velocity at the start moved by 24% at k = 2. So the criterion was applied at R's fit and, where it was exercised, the planned fit.

**At R's fit.** For each candidate, the change in checkpoint 1's frequency, wavelength and speed between 2.5 and 1.25 ms, each beside the chance of the difference, the two sets' resampled chance combined:

| Noise    | k   | Frequency    | Wavelength   | Speed        | 20 s bouts  | Reversals a minute | Verdict       |
| -------- | --- | ------------ | ------------ | ------------ | ----------- | ------------------ | ------------- |
| Off      | 1   | 9.0% (1.2%)  | 10.0% (1.2%) | 3.4% (0.5%)  | 75% / 100%  | 3.52 / 0.74        | Not converged |
| Off      | 2   | 5.1% (0.8%)  | 4.6% (0.7%)  | 0.2% (0.3%)  | 100% / 0%   | 1.85 / 0.11        | Not converged |
| Off      | 4   | 1.7% (1.2%)  | 2.6% (1.2%)  | 1.0% (0.5%)  | 0% / 0%     | 1.17 / 0.14        | Not converged |
| White    | 1   | 6.1% (4.6%)  | 6.9% (5.0%)  | 1.0% (3.2%)  | 55% / 85%   | 1.31 / 0.38        | Not converged |
| White    | 2   | 18.8% (3.7%) | 13.3% (4.0%) | 11.6% (2.1%) | 90% / 100%  | 0.30 / 0           | Not converged |
| White    | 4   | 8.0% (3.3%)  | 10.1% (3.7%) | 9.3% (1.9%)  | 100% / 100% | 0.11 / 0           | Not converged |
| Coloured | 1   | 0.4% (2.8%)  | 2.9% (3.3%)  | 1.3% (2.1%)  | 55% / 65%   | 3.93 / 3.90        | Not converged |
| Coloured | 2   | 2.5% (2.1%)  | 6.2% (3.1%)  | 3.3% (1.6%)  | 40% / 55%   | 4.66 / 3.74        | Not converged |
| Coloured | 4   | 0.7% (3.4%)  | 2.8% (4.3%)  | 2.0% (2.6%)  | 20% / 55%   | 4.17 / 3.76        | Not converged |

- **No candidate converges by the criterion.** The nearest is k = 4 without noise, 2.6% at worst, beyond its chance of 1.2%.
- **The coloured noise's changes are within their chance** at k = 1 and k = 4, but for the bout clause at k = 4, 20% against 55%. At k = 2 all three exceed it, the wavelength's twice over. Corrected after review: the chance here combines the two runs' as if independent. A review found the pairing makes it smaller, 1.8%, 2.3% and 1.1% at k = 1, which the wavelength's and speed's changes exceed; another found the trials' paths part within the trial, so pairing buys little. Either way the coloured noise's changes are within 1.96 times their chance. Its reversal rate holds across the steps, 3.93 and 3.90 a minute at k = 1, where white noise's all but vanish at the finer step. White noise's changes are well beyond their chance at k = 2 and 4; at k = 1 they are 1.3 to 1.4 times it, and its speed's within it.
- **Without noise, the deterministic error shrinks with k**, from 10% at k = 1 to 2.6% at k = 4, but doesn't reach 2%.
- **The criterion itself can't be met with the noise on.** The chance of the difference between two runs of 20 trials is 1.6–5.0%, so a candidate whose runs at the two steps differed only by chance would still fail 2% on most comparisons. Its bout clause, a share of 20 trials, moves in steps of 5%, and its grade flips at a band's edge: the coloured k = 1 runs grade partial and fail, the fine run's wavelength 1.02 against the partial band's 1.0.

**At the planned fit** it crawls rarely, with 0 to 39 bouts across the settings, and was exercised without noise at every k, and with either noise at k = 4. There its worst change in a setting runs from 2.9% to 45%, and is within chance only without noise at k = 4, whose 2.9% is under its chance of 9%.

**The gain sweep,** without noise, on 8 trials. Of its 273 settings, 16 were exercised, all at R's fit or the planned fit.

- At R's fit, the sweep crawls only with the A-types' gain at 3 or 5 nS, the fit's own 5 included, and converges there only at k = 4, on 8 trials; on 20, in the table, 5 nS at k = 4 doesn't. No B-type gain from 0.3 to 5 nS crawls there.
- At the planned fit, with its one gain at 0.3 nS, it converges at every k; at 0.6 nS and above it converges at no k.
- At the other points no setting crawled, so the sweep found no gain at which a setting stops converging there.

**Cost.** On one CPU core, the loop on R's fit runs at 32.8, 20.2 and 12.1 times real time at k = 1, 2 and 4. The GPU runs no candidate yet. Scaled from the app's 21–24× at k = 1, it would run at about 13–15× at k = 2, keeping the 10× target, and about 8–9× at k = 4, below it.

**Status.** Run. What it leaves for the maintainer: which fix, if any, to adopt, and how PLAN §7.2's criterion should treat runs whose metrics vary by chance more than it allows.

## 2026-09-28 — The noise becomes coloured, and §7.2 judges noisy runs against chance (changed after results, revised after review)

**Revised after review** the same day, before any use (the entry below): §7.2's tolerance is replaced by an equivalence test on 200 trials, and τ_n is calibrated, not fixed at 1/a_d.

**Why.** The second numerics study (above) found the coloured noise current the only candidate whose between-step changes at R's fit stay within chance at the model's own step, with its reversals holding. It also found that PLAN §7.2's 2% can't be met by any candidate with the noise on, since 20 trials' pooled metrics vary by 2–5% by chance.

**Decision** (PLAN §3.5, §7.2, §9, marked changed after results). The maintainer chose the recommendation each time:

- **From track R's refit on, the noise is an Ornstein–Uhlenbeck current.** Each neuron's noise follows τ_n dη = −η dt + σ_n dW, updated exactly each step, with τ_n the synapses' decay time, 1/a_d = 0.2 s, taken from Kunert's rates. It supersedes the white noise of 2026-09-25.
  - τ_n is set by that rule, so it isn't a free parameter, and the budget stays at 17.
  - σ_n keeps its units and is calibrated again in the refit.
  - Spec §1.1's noise layer, independent seeded noise for each neuron, is unchanged.
  - Without noise, R's fit still changes by 9–10% in frequency and wavelength between 2.5 and 1.25 ms. With the coloured noise its changes were within chance, but at 20 trials the tolerance couldn't show an error that size. Sub-steps shrink it to 5.1% at k = 2, which keeps the 10× target, and 2.6% at k = 4, which doesn't. Corrected after review: this first said the error stayed within the noise's chance, and that sub-steps cost the app its target.
  - Considered: the coloured noise with 4 neural sub-steps, which would lower the app's target to about 8×; and adopting nothing, with R left suspended.
- **With the noise on, PLAN §7.2's comparison at dt and dt/2 asks each clause to agree within 2%, or within 1.96 times the two runs' combined chance, whichever is larger.** The chance is taken by resampling each run's trials, and the grades needn't match, since a grade flips at a band's edge by chance. Noise-off runs keep the plain 2%. Considered: keeping 2% with enough trials that chance falls below 1%, which a review put at about 130 to 215 a step, 6.5 to 11 times the cost; and keeping 2% as it is, which no candidate could meet with the noise on.
- **Then R resumes,** in two pull requests:
  - the coloured noise on the CPU reference and the GPU, with parity, and in the registry;
  - R's fit run again, σ_n included, then §7.2's comparison under the new criterion, which it must pass before its checkpoint 1 result is final.

**Status.** Set before the coloured noise is built into the model.

## 2026-09-28 — After review: an equivalence test for §7.2, and τ_n calibrated

**Why.** Three reviews of the second numerics study found that its code runs as built, with the model's defaults bit for bit as on `main`, but that the rule drawn from it doesn't hold. Each finding that decides it was reproduced, or read from the study's own summary, before this entry was written; the reviews' other figures are attributed to them.

- **The adopted §7.2 rule passes the defect it was meant to catch.** Within 2% or 1.96 times the two runs' combined chance, on 20 trials, white noise at k = 1 passes every clause. Its changes are 6.1%, 6.9% and 1.0% against tolerances of 9.0%, 9.8% and 6.3%. A review found the case that suspended R, R's fit with its white noise at 2.5 against 1.25 ms, failing only its bout clause, and by 0.1 of a percentage point. On 100 trials that review found white noise's step bias real: about 5% in frequency and wavelength, with the share of 20 s bouts going from 46% to 88% and reversals from 1.58 to 0.39 a minute. At 20 trials the tolerance is too wide to see it, and it widens as trials fall. And the reversal rate, the defect itself, wasn't a clause.
- **τ_n is a potent choice, not a derived one.** On 20 seeds of R's fit at 2.5 ms, τ_n of 0.02, 0.05 and 0.2 s give 20 s bouts in 95%, 90% and 15% of trials, and 1.88, 2.81 and 4.50 reversals a minute. a_d is the synapses' deactivation rate, not a measured property of neural noise. PLAN §6.2 counts a value set by a rule as ours, and the entry withdrawing the 1 nS bound called τ_n a new free parameter.
- **At the same σ_n, the coloured current moves a neuron far less than white noise.** A review found each neuron's voltage spread at 0.06 to 0.39 of white's, a median of 0.12, and AVA's from 0.93 to 0.10 mV. So σ_n's bound, set for white noise by a 20 mV rule, no longer means what it did.
- **The coloured noise converges at R's fit, but the evidence is narrow.** A review ran it on 200 trials at three steps and found it within about 1%. But at a σ_n of 0.06 it showed a 4% bias in frequency and wavelength, so convergence depends on σ_n too.
- **The coloured current's state isn't in a snapshot,** so a restored world parts from an unbroken one by up to 5.8 mV, a review found. The GPU's guard also misses the path that loads one world into another.

**Decision** (PLAN §3.5, §6.2, §7.2, §7.3, §9, each marked). The maintainer chose the recommendation each time:

- **§7.2's comparison with the noise on becomes an equivalence test.** It runs 200 trials at each step. Each clause's 95% interval for the difference between dt and dt/2 must lie within a margin set now:
  - ±3% of the value at dt/2 for the frequency, wavelength and speed;
  - ±0.10 for the share of trials with a 20 s bout;
  - ±0.3 a minute for the reversal rate, which the comparison now checks.

  The interval comes from resampling the seeds 1,000 times, the same seeds at both steps. The grades needn't match, and noise-off runs keep the plain 2%. It replaces the rule set earlier today before any use.
  - Considered: the same test with ±2% margins on about 300 trials a step; and keeping the replaced rule.

- **τ_n is calibrated, level 1, from 0.02 to 0.2 s, mapped logarithmically,** and the budget rises to 18, which the maintainer approved. Both ends converged at R's fit, 0.2 s on 200 trials and 0.02 s in a review's runs. The refit tunes it with the rest, as every null's fit will, so no one chooses it after seeing its effect. σ_n's bound is derived again for the coloured noise by §7.3's 20 mV rule before the refit.
  - Considered: fixing τ_n at 0.2 s, counted at level 0; and fixing it at 0.02 s, where R's fit crawls in most trials, a choice made after seeing that.
- **Everything else, as recommended.** The earlier entries are corrected in place. PLAN, README, VALIDATION, the ledger and CLAUDE.md say one thing about R's status. The GPU's guard covers the path that loads one world into another. The study records its own settings in its manifests, and the difference in each clause in its verdicts, and draws its resamplings from the model's own hash. The coloured current's state is carried in snapshots, on the CPU and the GPU, when the noise lands.

**Then R resumes,** in two pull requests:

- The coloured noise lands on the CPU reference and the GPU, with parity and its state in snapshots, together with τ_n in the registry and σ_n's new bound.
- R's fit runs again on twelve parameters, then §7.2's equivalence test, which it must pass before its checkpoint 1 result is final.

## 2026-09-28 — The coloured noise's bounds and start, set before it is built (changed after review)

**Changed after review** the same day, before any use (the last entry below): σ_n's bound is white noise's 0.169, not 0.472, since at 0.472 the silenced network crawls.

**Why.** The coloured noise lands in the model before track R's fit runs again (the entries above). Its intensity's bound and both its parameters' provisional values, where the refit starts, are set here first. The maintainer chose the recommendation each time.

- **σ_n's upper bound is 0.472 pA·√s.** By §7.3's rule, derived by the same linear analysis of the intact network at rest that gave white noise's 0.169, which it reproduces to 0.1687. It is the intensity at which the widest neuron, IL2DL, reaches 20 mV with τ_n at its upper bound, 0.2 s. So every τ_n in the range can reach the rule's 20 mV. At τ_n's lower bound, 0.02 s, the same ceiling would let IL2DL reach 43 mV; the rule at that end alone would give 0.219. Considered: 0.219, which would cap IL2DL at about 9 mV when τ_n is 0.2 s; and calibrating the widest neuron's spread in σ_n's place, exact at every τ_n but needing a mapping for each brain.
- **The provisional values are τ_n = 0.0632 s and σ_n = 0.148 pA·√s.**
  - τ_n is the geometric middle of its range, where its logarithmic mapping puts the middle of the box.
  - σ_n gives IL2DL the same voltage spread there, 9.89 mV, that the white noise gave it at the old provisional 0.0834, so IL2DL's spread carries over as the other provisional values carry the planned fit's. AVA's spread falls from 0.82 to 0.18 mV, since coloured noise moves the network's fast neurons less. Corrected after review (the last entry below): this first said the noise's scale carries over, but the other neurons spread less and the current's power at low frequencies is 3.15 times white noise's.
  - Considered: τ_n = 0.2 s, the study's value, on its upper bound, with σ_n matched the same way at 0.233. Corrected after review: this first said 0.236.
- **Until R's fit runs again, the app runs R's provisional values.** With τ_n uncalibrated the registry holds R's model uncalibrated, as it did before R's first fit, and at those values the worm doesn't crawl. The refit follows in the next pull request. Considered: building the noise and refitting in one pull request.

**Status.** Set before the coloured noise is built into the model.

## 2026-09-28 — The coloured noise, built

**Built** on the CPU reference and the GPU, by the rules above:

- **The current carries in a snapshot.** Each neuron's coloured current is part of the brain's state on both sides: the CPU's `BrainState` and the GPU's ninth state word. A world restored from a snapshot goes on as the unbroken one, bit for bit on the CPU. A review had found such a world parting by up to 5.8 mV.
- **The GPU runs it.** The kernel updates the current exactly each step, from the same hashed draws as the CPU, with τ_n in the parameter block's vacant slot. GPU worlds take τ_n on creation and on load, and the GPU still refuses the second study's neural sub-steps and noise grids.
- **The registry is R's refit's.**
  - τ_n is calibrated from 0.02 to 0.2 s, mapped logarithmically, provisionally 0.0632 s.
  - σ_n runs from 0 to 0.472 pA·√s, provisionally 0.148. Changed after review to white noise's 0.169 (the entry below).
  - The budget is 18.
  - R's twelve calibrated values are null until the refit. R's first fit, with white noise, stays recorded in `data/calibration/r1.json`.
  - `npm run calibrate` now writes `data/calibration/r2.json`, which a test will hold the registry to.
- **The planned model** keeps its white noise, unchanged.

**Checked.**

- **Parity in Chrome.** GPU parity passes on an M5 Max, the loop gaining a setup with the trial values and the coloured noise. The registry's setup is now R's provisional values with the coloured noise. The coloured setup passes all 11 one-step states and all 10 of its graded one-second states, and the registry's setup passes every state it has. Across the loop, 15 of 109 one-second states aren't graded, 14%, and the speed is as before: the brain at 29.8 times real time and the whole loop at 24.9.
- **Parity in Safari** passes too, on the same machine's GPU: 15 of 109 one-second states aren't graded, and the brain runs at 15.0 times real time and the whole loop at 11.1.
- **The app.** In headless Chrome on the same machine it holds 60 frames a second at 10× and 20× and saturates at about 24–29× (`npm run plate:bench`).
- **The worm until the refit.** On R's provisional values with the coloured noise, on 8 of checkpoint 1's seeds, it moves forward 16–22% of the time, with no forward run past 4.5 s and 52 reversals in all. So until the refit, the app's worm doesn't crawl: on 20 seeds a review found its mean forward velocity 0.005 body lengths per second, as with the noise off. Corrected after review: this first said it barely crawls.

**Status.** Built; R's fit runs again next.

## 2026-09-28 — After review: σ_n keeps white noise's bound, and only a converged fit is chosen

**Why.** Three reviews of the coloured noise found it built as the entries above set it. The model's defaults run bit for bit as on `main`, the GPU's white-noise path is unchanged, and every figure of the bound's derivation reproduces but one. But the bound itself lets the silenced network crawl. Each finding that decides it was reproduced before this entry was written; the reviews' other figures are attributed to them.

- **At 0.472 the silenced network crawls.** §7.3's 20 mV rule looks at the intact network alone. A silenced neuron has only its leak, whose 100 ms is slower than every mode of the intact network, so it keeps far more of a coloured current's variance: at 0.472 a lone neuron's voltage spreads 61 mV with τ_n at 0.2 s and 96 mV at 0.02 s, against 38 mV at white noise's 0.169. With R's first fit's other values, checkpoint 0's silenced trials, 20 of 120 s on its seeds, give these forward bouts of 10 s or more; checkpoint 0 allows none:

  | Noise                                                                                   | Trials with a 10 s bout | Longest bout     |
  | --------------------------------------------------------------------------------------- | ----------------------- | ---------------- |
  | White, 0.169                                                                            | 0                       | 7.2 s            |
  | Coloured, 0.472, τ_n = 0.02 s                                                           | 14                      | 17.1 s           |
  | Coloured, 0.472, τ_n = 0.2 s                                                            | 7                       | 14.5 s           |
  | Coloured, a lone neuron held to 38 mV: 0.185, 0.216, 0.293 at τ_n = 0.02, 0.0632, 0.2 s | 0, 0, 1                 | 8.8, 8.8, 10.0 s |
  | Coloured, 0.169, τ_n = 0.02, 0.0632, 0.2 s                                              | 0, 0, 0                 | 8.9, 4.0, 3.0 s  |

- **The fit could be drawn there.** In R's model the noise lowers the reversal rate rather than raising it. On 20 trials of R's first fit, a review found 3.53 reversals a minute with the noise off, 2.14 at its fitted white noise, 0.63 at white noise's 0.169 and 0.33 at the coloured 0.472 with τ_n at 0.02 s. So §7.3's premise, that noise may not reach the reversal target at any plausible level, runs the other way in R's model.
- **The start carries IL2DL's spread, not the noise's scale.** At τ_n = 0.0632 s and σ_n = 0.148, a review found the median neuron's spread at 0.36 of what white noise at 0.0834 gave it, AVA's at 0.22 and the other hubs' at 0.19–0.29, while the current's power at low frequencies is 3.15 times white noise's. White noise at the 2.5 ms step gave AVA about 0.39 mV, not the 0.82 of the continuous-time analysis, so its fall is about 2.2-fold. At the provisional values the choice changes nothing: on 20 seeds, with the noise off, white at 0.0834 and coloured at 0.0834 or 0.148, the worm moves forward 20–22% of the time, with no forward run past 4.5 s. None of the 8 trials the entry above ran has a 10 s forward bout, so the refit starts where the frequency and wavelength aren't measured, as R's first fit did.
- **The planned fit's result can't be final.** §7.2 takes no fit's checkpoint 1 result as final until the loop meets it, and the planned fit's, with white noise, doesn't; yet §9's choice would weigh it against R's refit.
- **Smaller findings.** The considered σ_n for τ_n = 0.2 s is 0.233, not 0.236. With synapses free rather than held at rest, the network has a slow mode of about 0.24 s, inside τ_n's range, and at 0.472 IL2DL would reach about 22 mV, a review found. Parity's allowance for the noise's rounding still assumed white noise, and the GPU's noise current was never compared with the CPU's. The study scripts would now run R's provisional values where they say R's fit, and the coloured noise where they say white. The app's notice and several comments still describe the white noise or R's first fit, PLAN §9 said the app still runs that fit, and R's status was stated four ways.

**Decision** (PLAN §3.5, §7.3, §9, each marked). The maintainer chose the recommendation each time:

- **σ_n keeps white noise's bound, 0.169 pA·√s, for the coloured noise too.** The coloured current's power at frequency f, σ_n²/(1 + (2πfτ_n)²), lies below white noise's of the same intensity, σ_n², at every frequency. So in the linear analysis no neuron, in any network, intact, silenced, lesioned or a null, spreads more than white noise at its bound let it. The argument doesn't cover the nonlinear dynamics; at 0.169 the silenced trials above found no bout of 10 s at any of τ_n's three points. The 0.472 of the entry above is withdrawn before any use.
  - Considered: holding a lone neuron to white noise's 38 mV, σ_n ≤ 0.169·√(1 + τ_n/100 ms), from 0.185 to 0.293, which still gave a bout of 10.0 s at τ_n = 0.2 s; keeping 0.472 and grading the finalists on checkpoint 0 before the choice, which would stop checkpoint 0 being independent evidence; and keeping 0.472 with the risk recorded.
- **The start stays at τ_n = 0.0632 s and σ_n = 0.148**, inside the bound. The entry above is corrected to say that IL2DL's spread carries over, not the noise's scale. Considered: σ_n = 0.0834, white noise's provisional intensity, the same power at low frequencies.
- **Only a fit that passes §7.2's comparison enters §9's choice.** From R's refit on, a fit's checkpoint 1 result must pass §7.2's comparison at dt and dt/2 before the choice weighs it. The planned fit is tested as it stands, with its white noise, on the harness R's refit needs. A fit that fails it can't be chosen; if neither passes, no choice is made and R stays suspended. Considered: fitting the planned model again with the coloured noise; dropping the planned fit from the choice; and setting the rule in the refit's pull request.
- **Two risks, noted before either can show.**
  - Checkpoint 5. A lesion that slows a hub's partners raises their spread more under the coloured noise than white noise did. In a review's linear analysis at rest, lesioning AVA raises the A-types' spread 4.9-fold, against 2.4-fold with white noise, and AVB with PVC the B-types' 3.0-fold, against 1.7-fold. Noise-driven backward activity could then work against the AVA rows.
  - Checkpoint 6. σ_n's bound is the same for every brain, but each wiring's neurons spread differently under it: in a review's own rewirings, not the project's nulls, the widest neuron's 20 mV intensity at τ_n = 0.2 s ranged from 0.39 to 0.67. Checkpoint 6's report gives each null's widest neuron's spread at its fitted noise. The analysis behind these figures and the bound's first derivation ran in scratch scripts; it is committed as code when that report is built.
- **Everything else, as recommended.** Parity's allowance for the noise scales with τ_n, the one-step check compares the noise current itself, and the round trip and the long runs use the coloured noise. The study scripts pin R's first fit and white noise, so a rerun reproduces their tables. The app's notice, the comments, R's status across PLAN, README, VALIDATION and the ledger, and the entries above are corrected, and Safari's parity is recorded.

**Checked** at 7e298b8, on the M5 Max:

- **GPU parity passes in Chrome and in Safari.** The coloured current's worst one-step error is 1.4% of its bound in both, and the round trip and split dispatches carry it on both coloured setups. Of 109 one-second states, 15 aren't graded in Chrome and 14 in Safari. The brain runs at 29.8 times real time in Chrome and 15.4 in Safari, the whole loop at 24.9 and 11.0.
- **Long-run parity passes in Chrome on the registry's values,** 265 seeds a side for 60 s each. The SD of κL differs by −0.0013 against a margin of ±0.0483 (p = 2.4 × 10⁻⁷), and the frequency by 0.00087 Hz against ±0.0114 (p = 1.7 × 10⁻⁴), with no unconverged solve. On the CPU over 40 seeds, the registry's spreads need 101 and 169 seeds a side for 90% power, against 45 and 281 on the trial values.
- **The studies' pinned points** equal the registry's on `main` exactly, R's first fit and its start alike.

**Status.** Set before the refit, which runs next with σ_n bounded at 0.169.

## 2026-09-28 — §7.2's equivalence test: its details, set before it first runs

**Why.** §7.2's comparison with the noise on was set after review by its trials, margins and resampling (the entries above), but not every detail a harness needs. They are set here, before the test or R's refit has run, so that neither result can shape them.

**Decision** (PLAN §7.2, the paragraph after the table):

- **The trials** are 200 of 120 s at each step, seeds 1 to 200, each starting from its seed's posture as checkpoint 1's do, at 2.5 and 1.25 ms, the whole loop stepped at each. Each run draws its noise as the model does, with no path shared between the steps, since the test judges the model as it runs and the GPU has no shared path. Considered: the second study's grid, which lets the two steps share their noise and narrows the interval, but tests a model the app doesn't run.
- **The measures** are checkpoint 1's frequency, wavelength and speed over the bouts of 10 s or more, the share of trials with a 20 s bout, and reversals per minute over the measured windows.
- **The interval** is a percentile interval of the difference, the value at dt less the value at dt/2: the 26th to the 975th of 1,000 resampled differences, sorted, each resample drawing the 200 seeds with replacement, both steps' trials together, from the model's own hash. The margins are §7.2's, the relative ones taken of the full 200 trials' value at dt/2. Considered: resampling each step's trials apart, which ignores the pairing, and a bias-corrected interval, which adds machinery for little at 200 trials.
- **An unmeasured clause fails.** A clause unmeasured at either step over the 200 trials fails, and a resample in which it is unmeasured at either step counts as a difference outside the margin, so a worm that seldom crawls can't pass by chance. A trial that leaves the finite numbers at either step fails the comparison too, as it fails checkpoint 1. Corrected after review: that rule was added the same day, before the test was built or ran but 4.5 minutes after R's refit started (the last entry below). **Changed after results** the same day (the last entry below): an unmeasured resample counts against both tails.
- **Both fits take it:** R's refit on the registry's values, and the planned fit as it stands, with its white noise, as the choice now requires (§9). Each result is written to `data/equivalence/<fit>.json` and to VALIDATION.md.

**Status.** Set before the test was built or ran, and all but the non-finite rule before R's refit started (corrected after review).

## 2026-09-28 — R's refit converges and fails checkpoint 1: it is chosen, and R ends

**What ran,** by the rules above, each set before it ran.

- **The refit** (`npm run calibrate` at d946b9f, 2,000 evaluations in 53 min of wall time on 18 cores, which the planned fit's comparison shared for 7 of them, from R's provisional values). The final pick, from generation 152, scores 1.207 on the fresh seeds 1005 to 1020, against R's first fit's 0.591. It measures 0.100 Hz, 0.70 body lengths, 0.029 body lengths per second and 1.78 reversals a minute, against targets of 0.30, 0.65, 0.22 and 1.8. The three candidates best on their own 4 trials made no bout of 10 s on the fresh seeds and scored 8.8 to 8.9. Five of the twelve values sit on a bound: g_osc at 5 nS and κ_gap,B at 1, their tops; θ_osc at −28 mV and θ_nmj at −0.3, their floors; and τ_n at 0.2 s, its top. σ_n ends at 0.0594 pA·√s, about a third of its bound, and g_osc,B at 3.90 nS. Corrected after review: this said the B-types keep their oscillator, but with θ_osc at its floor its gain clamps them below threshold (the last entry below). The registry takes the values unrounded (`data/calibration/r2.json`).
- **Checkpoint 1 fails** (`npm run harness -- --checkpoint 1` at f9954de):

  | Clause                            | Measured | Grade |
  | --------------------------------- | -------- | ----- |
  | Frequency (Hz)                    | 0.099    | Fail  |
  | Wavelength (body lengths)         | 0.71     | Pass  |
  | Speed (body lengths/s)            | 0.029    | Fail  |
  | Posture variance, four eigenworms | 98.4%    | Pass  |
  | Trials with a 20 s forward bout   | 0%       | Fail  |

  The frequency falls just under partial's 0.10 Hz. In every trial the worm moves forward 79–82% of the time, but no forward run lasts past 10.3 s. All 54 reversals began within 3 s after a flip of the head switch, whose cycle puts the mid-body spectrum's peak at 0.082 Hz, with 1% of its power between 0.2 and 0.45 Hz. Over its 12 bouts of 10 s the mid-body crosses its mean twice a bout, one undulation a run, so the graded frequency is the switch's. Because the switch ends forward runs at about 10 s, right at the 10 s a bout needs to be measured, a candidate can make no measurable bout on other seeds, as the three best on their own trials did on the fresh seeds.

- **§7.2's comparison** (`npm run equivalence -- --fit <refit|planned>`), 200 trials at 2.5 and 1.25 ms each, each clause's 95% interval for the difference against its margin:

  | Clause                           | R's refit, dt → dt/2 | Interval         | Margin  | The planned fit, dt → dt/2 | Interval         | Margin  |
  | -------------------------------- | -------------------- | ---------------- | ------- | -------------------------- | ---------------- | ------- |
  | Frequency (Hz)                   | 0.0995 → 0.0995      | −0.0002, +0.0003 | ±0.0030 | 0.198 → 0.255              | −0.097, −0.025   | ±0.0077 |
  | Wavelength (body lengths)        | 0.703 → 0.705        | −0.0043, +0.0004 | ±0.0211 | 0.555 → 0.406              | +0.082, +0.218   | ±0.0122 |
  | Speed (body lengths/s)           | 0.0288 → 0.0288      | −0.0001, +0.0001 | ±0.0009 | 0.0313 → 0.0302            | +0.0003, +0.0020 | ±0.0009 |
  | Share of trials with a 20 s bout | 0 → 0                | 0, 0             | ±0.10   | 0 → 0                      | 0, 0             | ±0.10   |
  | Reversals a minute               | 1.51 → 1.58          | −0.22, +0.07     | ±0.3    | 1.71 → 4.48                | −2.88, −2.67     | ±0.3    |
  | **Result**                       | **Pass**             |                  |         | **Fail**                   |                  |         |

  R's refit ran at f9954de and the planned fit at eb76387, and no solve failed to converge in either. Corrected after review: the table first gave the refit's reversals at dt/2 as 1.59, where the record's 1.5849 rounds to 1.58. Before the planned fit's full run, a look of 4 trials ran at 06aeabb; that commit was then amended into eb76387 to print an unbounded interval end, and the test's own code didn't change. So R's checkpoint 1 result is final, and the planned fit's, whose frequency, wavelength, speed and reversals all move with the step, isn't.

**Decision,** by the rules set before the refit (PLAN §9, 2026-09-27 and after review 2026-09-28):

- **R's refit is the real wiring's final fit.** Only a fit that passes §7.2's comparison enters the choice, and only R's refit passes it. The app and the harness run it.
- **R ends.** Its checkpoint 1 result stays below partial, and is final. A further round needs a new proposal the maintainer approves (§9).
- **Step 4 follows on the chosen fit:** checkpoint 0 runs again, with the sham twins' harness code and the binomial test on arrivals (§7.4). Checkpoints 2 to 6 stay behind checkpoint 1's crawl gate.

**Checked** on the refit's values, at f9954de, on the M5 Max:

- **GPU parity passes in Chrome and in Safari.** The registry's setup, now the refit, passes all 11 of its one-step states and all 11 of its one-second states, all 11 of which are graded. The coloured current's worst one-step error is 2.0% of its bound in both. Of the 109 one-second states across all setups, 15 aren't graded in Chrome and 14 in Safari. The brain runs at 29.8 times real time in Chrome and the whole loop at 24.9; in Safari, at 22.6 and 17.8, faster than Safari's run on the provisional values the same day, at 15.4 and 11.0, on the same machine.
- **Long-run parity passes in Chrome,** 265 seeds a side for 60 s each: the SD of κL differs by −0.0003 against ±0.0372 (p = 5.7 × 10⁻¹⁵⁸) and the frequency by 0.00004 Hz against ±0.0043 (p = 2.1 × 10⁻²¹), with no unconverged solve.
- **The app** holds 60 frames a second at up to 30× in headless Chrome, and at 50× gives 34 (`npm run plate:bench`, read off, not saved).

**Status.** Done: R has ended. Step 4 is next; a further round of R needs a new proposal.

## 2026-09-28 — After review: the refit crawls by its head switch, and R's second round fixes the calibration

**Why.** Three reviews of R's refit, and a study of what is left for R, found the refit, the test and the choice run as built, and R's end right by its rules as they stood. But the refit's motion, the objective and the choice need saying plainly. Each finding that decides it was reproduced before this entry was written; the reviews' other figures are attributed to them.

- **The refit's forward motion is the head switch's.** Over 20 trials, removing the switch (g_sw = 0) stops the worm, forward 0% of the time. Lesioning all 18 B-types leaves it forward 72% of the time, against 81% intact, at 0.018 body lengths per second against 0.022. A review found the B-types held about 30 mV below threshold by their 3.9 nS oscillator with θ_osc at its floor, and the A-types never leaving the oscillator's fixed point: the fit keeps the motor circuits quiet, and each value on a bound pushes the same way. So "the B-types keep their oscillator" said less than it seemed: they keep its gain, which clamps them.
- **Its frequency can't pass 0.100 Hz.** Each bout of 10 s holds one undulation, the mid-body crossing its mean twice (24 crossings in 12 bouts), so the graded frequency is one over the mean bout's length. A review found the forward runs piled at 9.7–10.1 s, around the bouts' 10 s floor. That is why a candidate's kinematics could vanish on other seeds, and why the objective, capped where a measure is missing, has a cliff there.
- **§7.2's pass is real, but weak evidence here.** Recomputed from the records it is the same, and a review found the ungraded switch cycle agreeing too, 0.0841 Hz at dt and 0.0840 at dt/2. But with the frequency pinned and no 20 s bout at either step, two clauses can't fail, and the A-types' stiff jumps, behind the first fit's step bias, never happen. The pass is the refit's, and speaks for no lesion or null.
- **The gate decided the choice.** Under step 3's ranking alone, the planned fit, two clauses at pass and one partial, would beat the refit, two at pass and none partial; both fail. §7.2's gate excludes the planned fit. It was set after review before the refit, but with the planned fit's step dependence already known (the entries above).
- **R's model reaches partial inside its bounds.** The go/no-go's draw 0, with R's three gains at their floors and its other values inside the bounds, grades partial on checkpoint 1's 20 trials:

  | Noise                   | Frequency (Hz) | Wavelength (body lengths) | Speed (body lengths/s) | Trials with a 20 s bout | Objective |
  | ----------------------- | -------------- | ------------------------- | ---------------------- | ----------------------- | --------- |
  | Off                     | 0.295          | 0.42                      | 0.080                  | 100%                    | 1.53      |
  | Coloured, 0.06 at 0.2 s | 0.261          | 0.48                      | 0.076                  | 100%                    | 1.51      |

  The objective scores it worse than the refit's 1.21 because it makes no reversal. A study for this review found the calibration sampling two such worms in a shortened run, and passing them over.

- **Lesioning AVA raises the refit's reversals,** from 1.42 to 5.41 a minute over 40 trials, where checkpoint 5's AVA rows ask for a fall.
- **Smaller findings.**
  - The non-finite rule was committed 4.5 minutes into the refit's calibration, not before it. It governs only the comparison, which it makes stricter, and no trial left the finite numbers.
  - An unmeasured resample counted against the upper tail alone.
  - The switch's current is unbounded, and a review found it holding the SMDs up to about 210 mV from threshold (PLAN §3).
  - In the code: an unbounded interval end was lost in the JSON and shown as −∞; any rerun at a new commit, even a look, deleted the records behind the committed results; some of a trial's inputs weren't in the tree's hash; concurrent runs shared their trees; and a mistyped argument ran the full comparison.
  - In the docs: 1.59 for 1.58; long-run parity claimed for Safari in a commit message and the pull request; stale passages in PLAN and README; and wording that overstated how each run ends and how far inside its margin each interval lay.

**Decision** (PLAN §3, §7.2, §9, each marked). The maintainer chose the recommendation each time:

- **R's second round fixes the calibration, not the model:** its reversal term, its search, and its score where no bout is measured. Its rules come in their own pull request, for approval, with a cheap probe before any full run, and no new parameter or layer. Considered: RMDs in the head switch with an agar P_th, a spec deviation and a 19th parameter, which passed checkpoint 1 in the study's probe but let 4 of the study's 5 untuned rewirings pass too; both, the calibration first; and no second round.
- **An unmeasured resample counts against both tails** (PLAN §7.2, changed after results). Neither fit had one, so neither result changes. Considered: leaving the rule as it ran, with its side said.
- **The findings are recorded:** the mechanism in VALIDATION and the ledger, the gate's part in the choice here, and two risks in PLAN §9, AVA's lesion for checkpoint 5 and the switch's forward motion in the open item on nulls. R's first round stays ended: its checkpoint 1 result is below partial and final by the rules as they stood.
- **Everything else, as recommended:** the code fixed and tested, and the docs corrected, each correction marked.

**Status.** Set after review; R's second round is proposed next.

## 2026-09-28 — R's second round: its procedure, set before it runs

**Why.** R's first round ended below partial, but a review found R's model reaching partial inside its bounds, where the calibration ranked it below the refit for making no reversal (the entry above). Two things stood in the way. The reversal term let the head switch's slips outrank crawling. Most candidates made no bout of 10 s and sat at the error cap, a plateau the search can't read. The search also never left the regime it started in. The second round changes the calibration, not the model; its rules are set here, before any of it runs.

**Decision** (PLAN §7.3's new bullet and §9, marked changed after results on checkpoints 1 and 6). The maintainer chose the recommendation each time:

- **Two stages.** Stage 1 fits all twelve calibrated parameters on the frequency, wavelength and speed alone. Stage 2 then fits σ_n and τ_n alone on all four targets, the other ten held at stage 1's values, over 200 evaluations, its final check including stage 1's own values. Reversals can then be bought only with the noise, never with the crawl, and if no noise level brings any, the miss is reported. Considered: dropping the reversal term and reporting the rate, which leaves σ_n with no target of its own; and keeping it as a tie-breaker among candidates near the best, which needs a tolerance chosen now.
- **A worm without a bout is scored by its spectrum.** With no forward bout of 10 s in the 4 trials, the frequency is the mid-body spectrum's peak above 0.02 Hz, as checkpoint 1's diagnostics find it, if the worm moves forward on average above the motion floor; otherwise it takes the cap. The speed stays the mean forward velocity, and the wavelength keeps the cap. Considered: adding a fifth term for the share of trials with a 20 s bout, which would close §7.3's acknowledged gap but make checkpoint 1's bout clause a calibration target rather than a prediction; and keeping the cap.
- **CMA-ES restarts** with its population doubled when its step falls below 0.01 or its best stalls for 20 generations, from the same start, within the same 2,000 evaluations. The start stays R's provisional values; a start at the gains' floors, where the review's partial draw lies, would be a design choice made on the real wiring, and isn't taken. Considered: the same with 4,000 evaluations; four plain searches of 500 from seeds 1 to 4; and the search unchanged.
- **A probe first.** Stage 1 runs four times at 400 evaluations, with seeds 11 to 14. The full run goes ahead if any pick grades at least partial on 20 trials of its own, seeds 2001 to 2020, never checkpoint 1's. Otherwise the round stops and reports before spending its budget. Considered: no probe; and eight probe runs needing two partial picks.
- **Then, as before:** the fit, written to `data/calibration/r3.json`, takes checkpoint 1 and §7.2's comparison. Step 3's choice is made again among the fits that pass the comparison, R's refit and this one. If checkpoint 1 stays below partial, R ends. If this fit is chosen, every null gets its two-stage procedure, so the open item on slips meeting the reversal term is settled for it.
- **The targets are unchanged,** although the speed target, 0.22 body lengths per second, is faster than a wave at 0.30 Hz and 0.65 body lengths travels, at 0.195. The study for the last review put a real worm's speed on agar at about 0.8 of its wave speed. That citation isn't yet checked against its source, and changing a target would need approval of its own.

**Status.** Set before any of it runs; the code comes next, then the probe.

## 2026-09-29 — R's second round: the probe finds the crawl, the full run doesn't, and the round ends (corrected after review)

**What ran,** by the rules of R's second round (the entry above), each set before it ran.

- **The probe** (`npm run calibrate -- --probe` at 6b387b2, 45 min). Stage 1 ran four times at 400 evaluations, each pick graded by checkpoint 1's grading on 20 trials of its own, seeds 2001 to 2020:

  | CMA-ES seed | Kinematic objective, seeds 1005–1020 | Frequency (Hz), seeds 2001–2020 | Wavelength (body lengths) | Speed (body lengths/s) | 20 s bouts | Grade   |
  | ----------- | ------------------------------------ | ------------------------------- | ------------------------- | ---------------------- | ---------- | ------- |
  | 11          | 0.985                                | 0.164                           | 0.73                      | 0.044                  | 0%         | Fail    |
  | 12          | 1.079                                | 0.138                           | 0.65                      | 0.025                  | 0%         | Fail    |
  | 13          | 0.813                                | 0.246                           | 0.41                      | 0.038                  | 0%         | Fail    |
  | 14          | 0.354                                | 0.343                           | 0.50                      | 0.104                  | 100%       | Partial |

  Seed 14's pick lies in the region the review's draw 0 pointed to: the B-types' oscillator off, κ_gap,B at its floor, κ_SMD near its own, g_sw at its top and θ_osc at its floor, with no reversal. By the rule, the full run went ahead. The probe's picks decide only that: none enters the choice or takes checkpoint 1 or §7.2's comparison, since picking one after seeing its grade would select on results.

- **The full run** (`npm run calibrate` at f064b07, seed 1, 55 min) didn't find it.
  - Stage 1's 2,000 evaluations restarted twice, at populations of 22 and 44, and settled where the refit did, slipping at the head switch: its body follows the switch's 0.082 Hz, as the refit's does, though with θ_osc at −9.1 mV rather than its floor and more slips. Its pick measures 0.169 Hz, 0.036 body lengths per second and 4.8 reversals a minute on the fresh seeds, and scores 0.89 on the kinematics, against seed 14's probe pick's 0.35. Corrected after review: this said it settled in the first round's regime, without the evidence.
  - Stage 2 couldn't bring the slips down to the target. Its pick, from its second generation, scores 3.02 on all four targets, with 4.4 reversals a minute.
  - The values are in `data/calibration/r3.json`.
- **§7.2's comparison fails the round's fit** (`npm run equivalence -- --fit round-2` at 6f52402). The frequency moves from 0.157 Hz at dt to 0.174 at dt/2, the interval −0.0329 to −0.0024 against a margin of ±0.0052. The wavelength moves from 0.666 to 0.594, +0.0161 to +0.1322 against ±0.0178. Both are measured on bouts piled at the 10 s floor, while the body's own rhythm, the switch's 0.082 Hz, doesn't move with the step (the entry below). The speed, the bout share and the reversal rate pass.
- **Checkpoint 1 fails it.** Its trials, seeds 1 to 20 at 2.5 ms, are the comparison's first 20 at dt, so they were graded from those records by checkpoint 1's grading, not by the harness, and the registry kept the refit. The same route reproduces the refit's harness result to every digit shown, a review found:

  | Clause                            | Measured | Grade   |
  | --------------------------------- | -------- | ------- |
  | Frequency (Hz)                    | 0.156    | Partial |
  | Wavelength (body lengths)         | 0.66     | Pass    |
  | Speed (body lengths/s)            | 0.036    | Fail    |
  | Posture variance, four eigenworms | 97.8%    | Pass    |
  | Trials with a 20 s forward bout   | 0%       | Fail    |

  All 168 of its reversals began within 3 s after a flip of the head switch, and its mid-body spectrum peaks at 0.082 Hz, with 9% of its power between 0.2 and 0.45 Hz.

**Decision,** by the rules set before the round (PLAN §7.3, §9):

- **R's refit stays the real wiring's final fit.** The round's fit fails §7.2's comparison, so it can't enter the choice, though step 3's ranking alone would have preferred it, with a partial clause to none, a frequency measured on bouts at the 10 s floor.
- **R's second round ends.** The chosen fit's checkpoint 1 result is below partial and final. The round's fit depending on the step doesn't suspend R, as the first fit's did: the refit passes §7.2's gate and is chosen, and at dt/2 the round's fit fails checkpoint 1 too, a review found, at 0.172 Hz, 0.036 body lengths per second and no 20 s bout. A further round needs another proposal, which the maintainer approves; one followed (the entry below).
- **What the round showed.** The calibration can find R's crawling region: one search in five did, and graded partial on seeds of its own. But which regime a search settles in turns on its seed, and the full run's seed missed. Any further proposal would be designed knowing that, which it would have to say. Review added that the noise and the objective changed the landscape too: R's first fit, from the same start and seed, ended in the crawling corner (the entry below).
- **The app and the harness run R's refit,** unchanged, and step 4, checkpoint 0 on it, follows.

**Status.** Done: the second round ended below partial; a third, R's last, was chosen after review (the entry below).

## 2026-09-29 — After review: what round 2's fits are, and a last round

**Why.** Three reviews of R's second round, and an evaluation of whether a third is worth running, found the round's rules set before every result they govern, every search replaying bit for bit, and every figure right. The refit stays chosen, and the round ended by its rules. But the explanations need correcting, some code fails in cases no run met, and one probe pick matters more than the record said. Findings reproduced before this entry was written say so; the rest are attributed.

- **Probe 14's pick is a converged partial crawler.** The evaluation ran §7.2's comparison on it over seeds 1 to 200, and it passes: 0.342 Hz at dt and 0.336 at dt/2, the interval +0.0043 to +0.0073 against ±0.0101; 0.501 and 0.505 body lengths; 0.104 and 0.103 body lengths per second; a 20 s bout in every trial, and no reversal, at both steps. On checkpoint 1's own seeds 1 to 20 it grades partial: 0.341 Hz, 0.50 body lengths, 0.103 body lengths per second, 93.6% for the eigenworms and 20 s bouts in every trial. Both were recomputed here from its records, three of which were rerun and match field for field. It can't be chosen: the probe decides only whether the full run goes ahead, and choosing one of its picks after seeing its grade would select on results.
- **What carries it,** the evaluation found. The head switch paces the body, flipping 40.8 times a minute; the B-types turn that into thrust, and lesioned, the worm moves forward half the time with no bout, at 0.011 body lengths per second. It never reverses: none in 400 trials, AVA's activation above its threshold level in 0.01% of samples. It sits in a corner of the box, with no B-type oscillator, κ_gap,B at its floor, κ_SMD near its own and g_sw at its top. Most nudges of one value by ±0.05 in the mapped units keep it partial, but none of ten random nudges of all of them did. In the evaluation's own untuned rewirings, not the project's nulls, all ten crawled forward, but only one graded partial, their waves shorter.
- **Round 2's fit has no frequency of its own.** A review found its partial 0.156 Hz, and its §7.2 failure, measured on bouts piled at the 10 s floor, a median of 10.1 s, while its mid-body spectrum peaks at the head switch's 0.082 Hz at both steps, as the refit's does. With the switch removed it moves forward 0.1% of the time; with the B-types lesioned, 77%. So step 3's preference for it, and a frequency that moves with the step, describe the bout floor, not the worm.
- **Why seed 1 missed.** A review found every candidate in the round that crawled in that corner. The start sits on both connection gains' upper bounds, so a review put the chance of one draw from it landing there near 2 × 10⁻⁵: a restart from the start can't jump there, and a search must drift, as seed 14's did. R's first fit, seed 1 from the same start with white noise, ended in the same corner (`r1.json`), so the noise and the objective changed the landscape, not the seed alone.
- **The round's new pieces didn't help,** a review found. Every restart came from the stall rule, on a plateau where a candidate without a bout can't score below 4, and none bettered the first search's best; the last restart's final mean was an unconverged point near the start. The spectral score led searches to worms wiggling near 0.3 Hz without crawling. Stage 2's noise has no lever on the slips: all 200 of its candidates reversed 4.4 to 4.9 times a minute, whatever σ_n.
- **Smaller findings.**
  - In the code:
    - a stage-2 candidate tying stage 1's values won the tie, against the rule;
    - round 1's scoring could no longer run, though the nulls get the refit's procedure;
    - a resumed run would rank a non-finite candidate first, JSON having turned its Infinity into null;
    - the probe lost its grades on a failure and couldn't resume, and a resumed run briefly lost stage 2's evaluations from disk;
    - the probe's committed record gives the full run's budget rather than its own.
  - In the docs:
    - PLAN §7.3 still gave the nulls the two-stage procedure;
    - passages went stale when the comparison's runner began reading R's fits from their records (f735089, committed two minutes into the full run, before any result it governs);
    - how checkpoint 1 graded the round's fit wasn't said precisely;
    - 6b387b2's message says round 1's behaviour is untouched, which held for the search but not the scoring.

**Decision.** The maintainer chose the recommendation each time:

- **R gets a third round, its last.** Five independent searches of 400 evaluations each, their starts drawn across the box from a fixed hash, with one final check across them: the same 2,000 evaluations, and the same procedure for every null. It is designed after seeing probe 14 find the corner and the full run miss it, and says so. Its rules come in their own pull request, before any of it runs, and if its fit stays below partial, R ends for good. Considered:
  - no third round, with probe 14 recorded as exploratory and step 4 next. The evaluation recommended this: the crawlers don't reverse, so checkpoint 5's AVA rows can't pass, and at one search in five, checkpoint 6 would partly measure luck;
  - estimating how often a search finds the corner first;
  - ten searches a wiring on double the budget.
- **Probe 14's pick is recorded as exploratory:** converged, partial, and not choosable.
- **Everything else, as recommended:** the code fixed and tested, the explanations corrected, and the stale passages brought up to date.

**Status.** Set after review; paused before round 3's rules were written (the entry below).

## 2026-09-29 — Before R's third round: an investigation, and the currents come first (corrected after review)

**Why.** Before designing R's third round, the maintainer asked for a thorough investigation, covering the literature, the design of the search and the science of its likely target. Three investigations reported. The findings marked "checked here" were reproduced before this entry was written; the rest are attributed. Corrected after review: this said every finding that decides it was checked here, but the bounded switch's loss of the crawl wasn't.

- **The corner's crawl rests on impossible voltages.**
  - Checked here, over 60 s from a straight body at seed 5001: probe 14's pick holds the SMDs between −268 and +254 mV and the B-types between −211 and +178 mV. At each 0.1 s sample, 33 neurons on average sit outside the model's reversal range, −48 to 0 mV.
  - The refit, which the app runs, holds its SMDs at ±210 mV, with 16 neurons outside.
  - Two currents take them there, the head switch's and proprioception's. Each is a current source, the same at any voltage, with no reversal potential to stop it: the switch injects a fixed ±g_sw/2, ±200 pA at the corner and ±156 pA in the refit, and proprioception a current in proportion to curvature.
  - A review of this entry separated them at the corner, removing each current's part with the conductances held: the 32.9 neurons outside fall to 15.1 without the switch's, 20.7 without proprioception's and 2.7 without both, and the B-types' swings are proprioception's. In the refit they are the switch's: its 15.7 fall to 1.0 without it. Corrected after review: this laid the corner's voltages on the head switch alone, and called both currents unbounded, when what they lack is a reversal potential.
  - The investigation found that the crawl needs those swings: they leak through gap junctions and recruit RMD and SMB. At the corner the switch's gate is open 99.92% of the time, and lesioning AVB changes nothing.
  - The investigation found that a head switch that is a conductance, driving towards 0 and −48 mV, loses the crawl at every gain tried, 1 to 50 nS, and on a 24-point grid of g_nmj, θ_nmj, κ_SMD and g_p. A review spot-checked four of those gains, with the driven side's reversal at 0 and at +30 mV, and every setting failed.
  - The two published head switches keep their units bounded: Ji et al. 2021's muscle moment switches between fixed values, and Li et al. 2026's units are binary, with the muscles' activation clipped.
- **The model has no backward mode.**
  - Checked here in the runtime data: nothing lets the backward command module (AVA, AVD, AVE, RIM and AIB) inhibit the forward one (AVB, PVC and the B-types). By the transmitter rule, AVA→AVB (9 sections) and AVA→PVC (77) are excitatory, and so are AVB→AVA (47) and, within the backward module, AVA→A-types (282). By expression, so are RIM→AVB (41) and AIB→AVB (34).
  - The only inhibition between the modules runs from the forward side onto AVE and AIB, by expression: PVC→AVE 21 sections, AVB→AVE 4, the B-types→AVE 1, and 3 onto AIB. Corrected after review: this said every chemical connection between the modules is excitatory.
  - The investigation drove AVA with up to 400 pA at probe 14's values and got no reversal. Within the bounds, no parameter brings reversals without breaking the crawl; the "reversals" some settings make are dithering at the head switch's flips.
  - In the animal, AVA sits in quasi-stable depolarised states (Roberts et al. 2016; Meng et al. 2024), and Roberts et al. recorded currents between AVA and AVB that reverse as inhibitory synapses' do. Corrected after review: this called AVA bistable, which Roberts et al.'s model assumes and neither paper measured.
- **At the corner, the held-out checkpoints look settled in advance.** The investigation's stimulations and lesions were outside the checkpoints' protocols, on exploration seeds; the checkpoints themselves weren't run. They point to:
  - checkpoint 2 failing, with no reversal;
  - checkpoint 3 likely failing, since stimulating PLM slows the worm;
  - checkpoint 4 failing: the worm circles at about 27° per mm, and driving AWC-ON at its full gain changes its speed by at most 0.6%;
  - checkpoint 5 passing at most one row;
  - checkpoint 6 unable to tell wirings apart, since the crawl runs through parts no null rewires.
- **The literature,** a search of work to 2026 with its identifiers checked on Crossref:
  - Li et al. 2026, read in its bioRxiv version, find forward undulation on agar paced from the head by SMD and SMB, with RMD adding head casts. That is consistent with a head-paced crawler, but with bounded units. Corrected after review: this named RMD among the pacers.
  - Karbowski et al. 2006 measured worms crawling on food at 0.79 of their wave's speed, the wavelength taken in the lab's frame rather than along the body, as PLAN's is. At 0.30 Hz that is about 0.15 body lengths per second in either frame: 0.154 at the targets' 0.65 body lengths, and 0.147 at Karbowski et al.'s own 0.62, a review found. The calibration's speed target of 0.22 exceeds even the targets' own wave speed, 0.195.
  - Reimers et al. 2026, a preprint, benchmarked _C. elegans_ connectomes as reservoirs for computing tasks and found randomised null wirings often outperforming them. It is a different test from checkpoint 6's, but "no evidence" is a live outcome for checkpoint 6. Corrected after review: this described it as about other animals' connectomes.
  - Li et al. 2026 find that ablating RMD, SMD or SMB raises the reversal rate, as Gray et al. 2005 found for SMD and RMD, and for SMB to a lesser extent. Gray et al. read this as the head circuit suppressing reversals rather than making them. Corrected after review: this gave that reading to Li et al. too.
- **The search,** as the investigation mapped it:
  - The corner covers about 7 × 10⁻⁴ of the face where g_osc,B = 0, and 237 of 256 points spread across the box (92.6%) make no forward bout or rhythm.
  - At the one measured rate, one search in seven (the four probes and the full run's three starts; 95% interval 0.004–0.58, every one from the provisional start), the chosen five searches of 400 find the corner about half the time. The entries above counted one in five, the full run as one. Sixteen searches of 250 from a Latin hypercube would find it about nine times in ten, on 4,000 evaluations a wiring.
  - Its maps ran 4,748 trials on the real wiring, 4,568 of them on the calibration's seeds 1001 to 1004, about 1,140 evaluations' worth.
- **An exploratory point passes checkpoint 1.** Probe 14's pick with τ_w at 0.34 s passes every clause on seeds 2001 to 2020, reproduced here: 0.308 Hz, 0.58 body lengths, 0.128 body lengths per second and a 20 s bout in every trial. It makes no reversal and has the same impossible voltages, and it can't be chosen.
  - Added after review: the investigation swept each parameter through probe 14's pick on the calibration's seeds, where τ_w's lowest values crawled fastest, then graded nine crawlers on seeds 2001 to 2020, where this one alone passed. So its pass there was picked on those seeds.
  - A review ran it on checkpoint 1's own seeds, 1 to 20, where it passes too: 0.306 Hz, 0.58 body lengths and 0.128 body lengths per second, just inside the speed's pass band, which starts at 0.12.

**Decision.** The maintainer chose the recommendation each time:

- **R's third round is paused, and the currents come first.** The head switch's and proprioception's currents become conductances, driving towards the model's reversal potentials. That changes the form of two §1.1 layers rather than adding one. It is proposed in a rules pull request of its own, for approval, and the bounded model's behaviour is looked at before R's future is decided; the refit's own motion may not survive it. Considered: round 3 on the corner as it is, with sixteen searches of 250 and the voltage caveat declared; the same within the budget, eight of 250; and ending R now.
- **The command circuit's signs are audited** against their sources: a data investigation, reporting what the evidence supports before any change. Any change would go through the pinned data pipeline. Considered: auditing only after the currents are bounded; and leaving the signs, with no backward mode as a known limit.
- **Checkpoint 1's report gains a voltage diagnostic** (PLAN §7.4, added after results): how many neurons sit outside the reversal range at each sample, and the voltages' extremes. It is reported, not graded. FIDELITY gains a caveat on the two currents. Considered: recording the findings with no diagnostic.
- **The speed target stays, for now.** Its inconsistency and Karbowski's measured ratio are recorded, and the target is decided, with the maintainer's approval, when the next calibration's rules are set. Considered: changing it now to about 0.15; and leaving it for good.
- **Whatever follows must disclose:**
  - that the corner's crawl and the pass point were found by exploring the real wiring;
  - the investigation's 7,244 trials on it: the search's 4,748, of which 4,568 were on the calibration's seeds 1001 to 1004 and 180 on the probe's grading seeds 2001 to 2020; the science investigation's 2,476, on exploration seeds 5001 to 5020; and 20 reproduced here. Corrected after review: this counted only the search's;
  - its stimulations and lesions outside the checkpoints' protocols, which foreshadow checkpoints 2 to 5;
  - added after review: its trials of the bounding's own choices, on seeds 5001 to 5020. The switch as a conductance was tried with its driven side's reversal at +30 and +60 mV. Proprioception as a conductance kept a partial crawl at 0.05–0.1 nS in a push-pull form and lost it rectified. With A-type proprioception turned off, the corner graded pass. The rules for bounding the currents are designed after seeing them.

**Status.** Set, then corrected after review (the entry below).

## 2026-09-29 — After review: two currents, the signs' direction, and a rule for the held-out checkpoints

**Why.** Three reviews of the investigation's record, and the sign audit it set, found its decisions sound and its reproduced voltages right. But some of its claims were wrong or too broad, the voltage diagnostic's code fails at 200 trials, and the investigation's previews of checkpoints 2 to 5 need a rule. Findings reproduced before this entry was written say so; the rest are attributed.

- **Corrected in the entry above:**
  - the direction of the command circuit's only inhibition;
  - both currents at the corner, not the head switch alone;
  - what the currents lack, a reversal potential, rather than a bound;
  - four citations;
  - the trials run on the real wiring;
  - how the pass point was found.
- **What the currents lack matters for what comes next.** A current of fixed amplitude, clipped or lowered, would still take a neuron past any reversal potential; only a driving force bounds the voltage.
- **The voltage diagnostic:**
  - It throws at 200 trials, since its maximum spreads every sample as an argument, and §7.2's comparison grades 200. Checked here: 219,200 samples throw.
  - It prints "−0" for a voltage just below zero. Checked here.
  - It reads the voltages every 0.1 s, missing peaks between the samples: in the refit, the B-types reach −93.7 mV at single steps, against −54.5 at the samples, a review found.
  - Its count mixes the swings with small excursions. In the refit only the four SMDs lie far outside, while about 12 neurons sit 1–14 mV past 0 mV, a review found. Oscillator, touch and AWC-ON currents can take a neuron a few mV past the range, and gap currents from a neuron already past it can pull its neighbours after it.
- **The sign audit has reported.** It is recorded in a pull request of its own (corrected 2026-09-30: that pull request came later, as `docs/sign-audit.md`). Its exploratory probe re-signed up to 102 connections at R's refit and found no backward mode under any of them: driving AVA, or the A-types directly, never moved the worm backward, so the mode is missing below the command neurons too.
- **The real wiring was explored further,** which whatever follows must also disclose:
  - The reviews ran 79 trials: the pass point on checkpoint 1's own seeds 1 to 20 and on 2001 to 2020; 32 with a conductance switch on seeds 2001 to 2004; 3 driving AVA on seed 2001; and four 60 s voltage runs on seed 5001.
  - The sign audit's probes ran 1,700, on seeds 7001 to 7010 and 8001 to 8010, with signs changed and command or motor neurons driven.

**Decision.** The maintainer chose the recommendation each time:

- **A held-out checkpoint is reported as fitted if a change its preview prompted follows** (PLAN §10). Spec §1.2 reports a checkpoint as fitted when its result prompts re-tuning. The previews aren't the checkpoints' results, but they foreshadow them, so the rule covers them too.
  - A change a preview prompted marks the checkpoints that preview foreshadows as fitted rather than predicted. Whether a change was prompted by one is recorded when the change is proposed.
  - A sign change from the audit, which the missing backward mode prompted, would mark checkpoint 2 and checkpoint 5's rows that read reversals.
  - Bounding the currents was prompted by checkpoint 1's voltages, not by the previews, so on its own it marks none.
  - Every report of checkpoints 2 to 5 names the previews either way.
  - Considered: labelling checkpoints 2 to 5 as informed by the previews whatever follows; and disclosure alone.
- **The voltage diagnostic gains a count beyond 10 mV** (PLAN §7.4, added after results): the neurons more than 10 mV outside the reversal range, beside the count outside it at all. The 10 mV is ours, and the count is reported, not graded. The extremes are taken at every step of the measured windows, and PLAN §7.4 names what else can take a neuron past the range. Considered: splitting the count by neuron group; and documenting it alone.
- **Everything else, as recommended:**
  - the entry above corrected;
  - the code fixed and tested;
  - checkpoint 1's section regenerated;
  - the stale passages brought up to date.

**Status.** Set after review; the rules for bounding the currents followed (the entry below), and the sign audit's record comes later. It followed on 2026-09-30 (`docs/sign-audit.md`).

## 2026-09-29 — The currents become conductances: push-pull, bounded by rule, and a survey before R's future (changed after review)

**Why.** The investigation found two currents with no reversal potential, and the review of its record separated them (the entries above). The corner's crawl rests on both, the head switch's and proprioception's. The refit's motion rests on the switch's alone. Both currents become conductances driving towards the model's own reversal potentials, E_exc = 0 mV and E_inh = −48 mV. That changes the form of two §1.1 layers, which the maintainer asked to approve before it is built. The rules are set here, before any of it is built or runs. They follow checkpoint 1's results and the investigation's previews of these forms at the corner, and they say so.

Checked here, from the runtime data and the pinned postures, with no simulation. A target's load is its passive conductance: its leak, its gap junctions, and its chemical synapses at the resting activation, with its partners held and the oscillators off. κ_gap,B scales the B-types' gap junctions and so their loads and thresholds; κ_SMD scales only neuromuscular junctions (corrected after review: this said the figures spanned κ_SMD's bounds too).

- **The neurons' headroom.** Each neuron rests at its threshold. Over κ_gap,B's range, 0.1 to 1:
  - the A- and B-types' thresholds sit 4.2 to 15.0 mV below E_exc, and the SMDs' 5.2 to 8.3 mV;
  - so a conductance towards E_exc, which can't take a neuron past it, can lift a neuron's sigmoid from 0.5 to at most 0.63–0.87, and the SMDs' to 0.66–0.74;
  - one towards E_inh can shut a neuron almost off;
  - the switch as a current drove the SMDs' sigmoids to 1.
- **The loads.** At rest, the SMDs carry 0.86 to 1.15 nS, and the A- and B-types with proprioceptive fields 0.050 to 1.63 nS. So about 10 pA moves the least-loaded B-types by 200 mV; at the corner they reached −211 and +178 mV. Corrected after review: this gave the leak's 0.01 nS as the cause, and the largest load as 1.64 nS, which belongs to VA12, a neuron with no field.
- **The curvature.** Over the 6,655 pinned postures, the magnitude of the signed mean scaled curvature κL over each A- and B-type's proprioceptive field has a median of 4.2 and a 95th percentile of 8.3. These come from the postures' 100 tangent angles; the model's 48-segment body reads 8.2, which gives the same rounded bounds, a review found.
- **The previews, disclosed** (the entries above). Before these rules, the real wiring was explored in these forms:
  - The investigation found a switch conductance losing the crawl at the corner at every gain from 1 to 50 nS, on a 24-point grid of g_nmj, θ_nmj, κ_SMD and g_p, and with its driven side's reversal at +30 or +60 mV. The switch's form set here is the one that lost the crawl.
  - The investigation found proprioception as push-pull conductances at 0.05–0.1 nS keeping a partial crawl while the switch stayed a current, and rectified proprioception losing it.
  - The investigation found the corner grading pass with A-type proprioception turned off. The rules keep it on, since spec §1.1 names it.
  - The review of the investigation's record ran 32 trials with a conductance switch on seeds 2001 to 2004, all of which lost the crawl.
  - Added after review: the last three weren't listed here.

**Decision.** The maintainer chose the recommendation each time, and again after review:

- **Both become push-pull conductances** (PLAN §4.3).
  - **The head switch.** The switch's state h names the side it drives: at h = 1 the dorsal SMDs. While the gate is open, both SMDs on that side get g_sw towards E_exc, and both on the other side get g_sw towards E_inh. With the gate shut, neither side gets a conductance. Each SMD gets the whole g_sw, where the current form gave each ±g_sw/2.
  - **The gate is unchanged.** It reads the drive from the SMDs' partners and leak, not their own voltages, so the conductance doesn't enter it directly. Through the partners it moves the drive by 1 to 2 mV, against the refit's current's 5.7 mV, a review found with the activations held. θ_osc's bound keeps the silenced network's gate shut, by a margin of 0.47 mV, and it stays as it is.
  - **Proprioception.** For each A- and B-type, K_f is the signed mean κL over its field, positive when the body bends towards the neuron's own side. The neuron gets g_p·max(K_f, 0) towards E_exc and g_p·max(−K_f, 0) towards E_inh.
  - **In the voltage solve.** Both conductances take the curvature and the switch's state at the step's start, as the currents do, and only the voltage they multiply is implicit, on the solve's diagonal. The BDF2 restarts at the switch's flips and gating stay. Proprioception's conductance passes through 0 as K_f changes sign, without a jump, so it needs no restart. Where the current form records the switch's current, the conductance form records the signed g_sw while the gate is open and 0 while it is shut.
  - **The asymmetry, added after review.** Push-pull isn't symmetric here: E_inh lies 33–44 mV below the targets' thresholds and E_exc 4–15 mV above, so the inhibitory half's small-signal gain is 2 to 10 times the excitatory's. On average, then, the layers inhibit. A review found:
    - the SMDs' mean activation over the switch's two states falling by 36% at any g_sw from 1 to 50 nS, where the refit's current lowers it by 9%;
    - the A- and B-types' mean activation falling by 20–33% under proprioception at median curvature;
    - at the box's top, proprioception all but clamping weakly coupled B-types, which keep about 1% of their network input.

    Every synapse in the model has the same asymmetry. No balanced variant will be added after results. A shunt diagnostic is reported beside the voltage diagnostic (PLAN §7.4).

  - **Other injected inputs keep their forms.** These are:
    - the oscillators, whose cubic limits their own excursions;
    - touch, which holds its receptors 10 mV above rest;
    - AWC-ON's current, which is bounded (PLAN §4.1, §4.2);
    - the noise, whose bound lets IL2DL spread 20 mV at rest (§7.3).

    Checkpoint 1's trials have no touch or odour, so there the voltage diagnostic reports the oscillators' and the noise's excursions.

  - **Levels and budget.** The forms are ours (level 0), and the gains calibrated (level 1). The reversal potentials are the synapses' (level 3), and their use for these channels is ours (level 0). The SMDs' stretch-sensing TRPC channels (Yeon et al. 2018) suit the excitatory half, and nothing is cited for either inhibitory half. g_sw and g_p stay one parameter each, since a fit uses one form, so the budget stays 18. Every null gets the chosen fit's form.
  - **Spec §1.1.** It needs no rewording, since its layers name inputs, not currents. Neither form is a deviation: each is per class, shared by every brain, and reads only curvature and h.
  - **The previews and PLAN §10.** Checkpoint 1's voltages prompted the change, not the previews of checkpoints 2 to 5, so it marks none of those checkpoints as fitted. Push-pull followed the investigation's previews of the crawl, which checkpoint 1, a calibration target, grades.
  - Considered: push-pull for the switch with rectified proprioception, which the preview found losing the crawl; and excitation alone for both, the weakest drive given the headroom. After review: balancing the inhibitory half by each target's headroom.
- **Their bounds come from a 1 mV rule** (PLAN §7.3).
  - For each target, with G its load at rest, V_th its threshold and E each reversal potential in turn, over κ_gap,B's bounds: the lower bound is the least of G / (|E − V_th| − 1), and the upper bound the greatest of G·(|E − V_th| − 1). At the lower bound no target moves more than 1 mV at rest; at the upper, every target is held within 1 mV of the reversal potential it is driven towards.
  - For proprioception, both are divided by 8.3, the 95th percentile of real worms' curvature over the fields.
  - Rounded outward to one significant figure, g_sw runs from 0.02 to 50 nS (the rule gives 0.022–48), and g_p from 0.0001 to 8 nS per unit of κL (0.00017–7.8). Both are searched logarithmically. Their provisional values are the log midpoints, 1 nS and 0.028 nS. The other ten parameters keep R's provisional values.
  - The rule holds for the intact network at rest. With every chemical input at its maximum, the tops would be 71 nS and 8.6 nS, a review found. In the silenced network, where an A- or B-type's load is its 10 pS leak, the same conductance acts up to 160 times more strongly:
    - at g_p's lower bound, a silenced B-type moves 2.5 to 3.3 mV;
    - at the provisional g_p and median curvature, a silenced B-type bent towards its side is pulled from the leak's −35 mV to about −3 mV, past its threshold, a review found;
    - the current form, at the refit's g_p, went to about +80 mV.

    Checkpoint 0, which runs again on the chosen fit, is the guard.

  - The code pull request adds a test that recomputes the rule's values from the data and the postures.
  - **θ_nmj's box, declared after review.** Relative drive's range assumes every excitatory synapse at its greatest activation, a_r/(a_r + a_d) = 1/6, which no neuron held at or below E_exc reaches. With every excitatory input at its ceiling, a muscle's drive reaches 0.46–0.82 of its range, a review found. So above about 0.46, θ_nmj leaves some muscles out of reach. The box keeps its top of 0.8, the same for every wiring.
  - Considered: a 1% rule, in which no target moves more than 1% of the way to its reversal potential at the lower bound, about a decade wider for each. After review: narrowing θ_nmj's box, which would draw on the investigation's finding that the crawl sits at low θ_nmj.
- **A survey decides R's future** (PLAN §9). It is exploratory, on the real wiring, and disclosed. Changed after review: this was four searches of 400 from spread starts. A review found that at the one measured rate, one search in seven, four would miss a crawling region 54% of the time, and that 0 of 4 would bound the rate only below 0.53. About 70% of random starts sit on dead ground, where a restart to the same start stays.
  - **The searches.** Stage 1 of round 2's procedure, on the kinematics alone and all twelve calibrated parameters, runs sixteen times at 250 evaluations, with CMA-ES seeds 11 to 26. Each search has its own final check on seeds 1005 to 1020. The survey takes about 2 hours on 18 cores.
  - **The starts.** The starts form a Latin hypercube in the mapped units, from `hash` and `uniform` (src/sim/brain/rng.ts) with seed S = 0x53555256, which no trial seed reaches. For search j from 0 to 15 and parameter k, in `CALIBRATED`'s order, a_jk = uniform(hash(S, j, k)) and b_jk = uniform(hash(S, j, 64 + k)). With π_k(j) the rank of b_jk among the sixteen, the start is u_jk = (π_k(j) + a_jk)/16. A search's r-th restart starts afresh from uniform(hash(S, 16r + j, k)), with round 2's step and population rules. Each start is recorded.
  - **The grading.** Each pick is graded by checkpoint 1's grading on 20 trials of 120 s, on fresh seeds 3001 to 3020. Changed after review: this used seeds 2001 to 2020, which the investigation and its review had already run. "Partial" means checkpoint 1's overall grade, every clause at least partial, as round 2's probe read it. The voltage and shunt diagnostics are reported, not graded, and can't overrule a grade.
  - **Its standing.** No pick can be chosen, or takes checkpoint 1's own trials or §7.2's comparison. The survey's record is `data/calibration/survey.json`, committed.
  - **If any pick grades at least partial,** R's third round, its last, runs on the bounded model. Its procedure is proposed in a rules pull request of its own, for the maintainer's approval, and every null gets it. The five searches of 400 set for it earlier are withdrawn.
  - **If none does,** R ends. Sixteen misses bound the rate at which a search finds a crawl below 0.17 (one-sided 95%); at one in seven, sixteen searches all miss 8% of the time. The bounded model is then calibrated once by the refit's procedure, from the provisional values, and its record is `data/calibration/r4.json`.
    - If that fit passes §7.2's comparison, it replaces the refit whatever their grades, since the refit's voltages lie outside the model's range; that sets step 3's ranking aside for this choice. It becomes the real wiring's final fit, which the app and the harness run, and every null gets its form and procedure.
    - If it fails the comparison, it can't be chosen (step 3), and the refit stays, with its form and procedure for the nulls. Corrected after review: this said no choice is made.
  - **The speed target.** The survey keeps the present target of 0.22, since it asks only whether the bounded model reaches partial, which checkpoint 1's grading judges. The target is decided, with the maintainer's approval, before whichever calibration follows the survey. That reads the investigation's "when the next calibration's rules are set" as the calibration after the survey, and a changed target may move the survey's hit rate.
  - **The signs.** The survey runs on the signs as they stand, and the sign audit's record changes none. A sign change, if one is ever proposed, is a model change. It would need its own calibration, and since the missing backward mode prompted the audit, it would mark checkpoint 2 as fitted (PLAN §10).
  - Considered: calibrating once and ending R, with no survey; and round 3 straight away. After review: four searches, then four more; and a screen of 256 points, then eight searches.
- **How a result reads, set with the survey.**
  - **A miss.** If no pick grades partial, the survey found no crawl; it doesn't show that none exists. R's ending then speaks to the model as bounded:
    - its rest thresholds, set at the midpoint activation (§3.3) with Kunert et al.'s constants, which leave 4–15 mV below E_exc;
    - these layers' forms;
    - the search, its bounds and its starts;
    - the speed target;
    - the signs as they stand.

    It says nothing about whether the wiring can pace a crawl from the head.

  - **A hit.** A partial pick is exploratory and can't be chosen. It says little about the wiring, since R's crawl runs through parts no null rewires (§9).
  - Changed after review: this read a miss as the bounded model being unable to crawl.
- **Both forms are kept until a bounded fit is chosen.**
  - The conductance form lands beside the current one, on the CPU reference and the GPU.
  - The loop's parity checks it under §7.2's thresholds, with setups that flip and gate the switch at gains inside the new box. One setup sits at the box's upper corner, where the solve's relative tolerance loosens as the conductances grow: to about 0.02 mV on the CPU and 0.2 mV on the GPU in the weakest row, a review estimated.
  - **The registry.** g_sw and g_p each keep their current-form entry as it stands, for the refit, and gain a conductance-form entry beside it, with its unit, bounds and provisional value.
  - **The records.** Each fit's record names its form, and a record without one, as every record so far, is the current form. The survey and the bounded model's calibration are new modes of the calibration's runner, which leave round 2's as they are.
  - The app and the harness run the refit as it stands; the survey and any calibration use the bounded form. FIDELITY shows both forms while both exist.
  - The current form is removed once a bounded fit is chosen.
  - Considered: replacing it now, with the app on the uncalibrated provisional values.

**After review.** Three reviews found the rules' figures reproducing, but the survey too weak to end R on a miss, and push-pull inhibiting on average. They also found several choices left open that could have been made after results, and errors in the record. The maintainer chose the recommendation each time: sixteen searches of 250 from a Latin hypercube; push-pull kept, its asymmetry stated and a shunt diagnostic reported; θ_nmj's unreachable top declared; and every other fix.

**Status.** Set after review, before any of it was built; built next, then the survey, which found a crawl (the entries below).

## 2026-09-29 — The conductance form, built (its parity setups changed after results; revised after review)

**Why.** The entry above set the conductance form of the head switch and proprioception before any of it was built. It is built here, on the CPU reference and the GPU, beside the current form the refit runs. No fit uses it yet; the survey's runner comes next.

- **What was built.**
  - **The brain.** It takes, per neuron, a conductance and the current it would carry at 0 mV, Σ g·E, on the solve's diagonal and right-hand side, as it takes a synapse's. Left at 0, a step is the same bit for bit: a test holds five current-form worlds (the registry's values, the provisional values, trial values, a lesioned network and the silenced one) to sums of their state after 400 steps made on main before any of this, and a review found them identical by hash after 2,000 steps.
  - **The form.** A fit names its form in its parameters, and every function that turns values into a fit's parameters, bounds or start now requires one, so none can fall back to the current form unasked. Changed after review: they defaulted to the current form, and `calibrate()`, the calibration's runner and the equivalence script passed none.
  - **The records.** The calibration's runner records its form, round 2's the current, and a record that names none is read as the current form, as every record so far. The equivalence script reads a fit's form from its record and checks its bounds in that form. Added after review.
  - **The world.** It opens the switch's conductance on the four SMDs and proprioception's on the A- and B-types with fields, as the rules set.
  - **The GPU.** Its kernel does the same while looping. The form is a flag in a word of the uniform block that was padding, and the reversal potentials are the registry's, written into the shader. The switch's side is chosen from h, as on the CPU. Changed after review: it was chosen from the sign of the recorded conductance, which agrees for any g_sw above 0.
  - **The registry.** g_sw and g_p each gain a conductance entry with the rule's bounds and start. A registry without one is refused in the conductance form rather than read as the current form's. FIDELITY shows both forms, and gains a component for the conductance form, tested by checkpoints 0 and 1 as well as the unit tests.
  - **The report.** Checkpoint 1's report gains, in the conductance form, each layer's shunt, a mean of per-target ratios, and how often a second the head switch's gate turns on or off (PLAN §7.4). A trial records their sums and its sample count, not every sample. Changed after review: it recorded both shunts at every sample, about 40 KB a trial.
  - **The curvature.** The data build now reports the 95th percentile of the postures' curvature over the model's fields, 8.34, and a unit test holds the registry's 8.3 to it, so `data:check` guards it in CI. Changed after review: a unit test computed it only where the postures were cached, which CI's aren't.
- **Checked.**
  - **The bounds.** A unit test recomputes the rule from the runtime data: 0.0215–47.9 nS for g_sw, and 0.000168–7.83 nS per unit of κL for g_p, which round outward to the registry's.
  - **The range.** In parity's corner setup (seed 1, white noise of 0.01 pA·√s, θ_osc −1 mV) over its 5 s, the SMDs stayed between −47.6 and +0.06 mV. A test with no noise and θ_osc at −3 mV holds them within half a millivolt of the range over 3 s. With oscillators and noise off, a review found no neuron leaving it over 8 s in either setup; the conductance setups' excursions past it are the A-types' oscillators'.
  - **The overshoot.** A lone neuron's conductance takes it past its steady state by up to 2.9% of the step, near 3 nS, where x = G·dt/C is about 7: BDF2's first step after an implicit-Euler start overshoots by (0.5 − 2/(1 + x))/(1.5 + x) of it, L-stable but not monotone. From rest that is 0.91 mV past E_exc at 3 nS and 0.13 mV at 50 nS. A test sweeps 0.02 to 1,000 nS and bounds it at 3%. Corrected after review: this said micro-volts, true only above about 1,000 nS.
  - **GPU parity.** It passes in headless Chrome, in Safari on the Mac's GPU and on CI's SwiftShader, both forms, with three setups in the conductance form, their state's round trip and runs split across dispatches included:
    - gains inside the box, 1 nS and 0.05 nS, the gate open and the head flipping;
    - the box's upper corner, 50 nS and 8 nS, the gate open, so BDF2 runs at the largest conductances (added after review);
    - the upper corner with θ_osc at −1 mV, where the gate turns on or off on about half the steps.

    P_th is 0.05 in all three, where the head flips in that form. Corrected after review: this said the gate turned "every few steps".

  - **The solve's tolerance.** At the corner the CPU reference solved at its own tolerance differs from itself at the GPU's by up to 17.7 shares of the one-step threshold, reported and not graded. Large conductances raise ‖b‖, against which the solve's tolerance is relative; but the registry's setup, in the current form, reaches 31.3 in the same run, so the corner isn't the outlier. Corrected after review: this called it the conductances' doing, as a review had estimated.
- **Changed after results: the parity setups' values.** In the first run, the two setups then in the conductance form failed the one-step velocity check, at 1.1 to 2.1 shares, every other check passing.
  - Before: track R's parity values with θ_nmj at 0.2, P_th 0.05, and θ_osc −3 mV at gains inside the box and −1 mV at the corner. Their muscles barely activated, at most 0.25, and the body crept at under 5 µm/s, so the check, 1% of the largest velocity with a floor of 10⁻⁴ segment lengths a second, graded f32 rounding in the body's solve.
  - After: θ_nmj at −0.2, inside R's box, the rest unchanged; they pass, and parity's thresholds are unchanged (PLAN §7.2). Considered: a floor scaled to the body's forces, a threshold change after results; and leaving the setups and reporting the failure.
  - **To revisit.** A bounded fit that barely moves would fail the registry's setup the same way, so the velocity floor is to be revisited, in an entry of its own, before any bounded fit reaches the registry.
- **Exploration, disclosed.**
  - **Choosing the setups' values:** four worlds of 5 to 7 s at P_th 0.5; twelve at P_th 0.05 to 0.2 with θ_osc at −1 or −3 mV; and twelve more with θ_nmj at −0.2; all on seed 1 in the assay's field at track R's parity values, with each parity setup's body speeds and the parity runs themselves.
  - **The reviews:** short runs at track R's parity values and at the provisional values in the conductance form, over seeds 1 to 3, of 2 to 20 s. They found that the conductance form's provisional values give no head rhythm, the head never flipping over 3 seeds × 20 s where the current form's flipped 2 to 3 times; the survey starts elsewhere, but the bounded calibration, should R end, starts there.
  - **The gate.** Within about 1 mV of θ_osc, where a network's drive sits, the gate turns on or off on most steps, in either form: 602 times in 800 steps at the corner, a review found, and 459 to 590 in the current form on track R's parity values. The loop then runs by implicit Euler, and its result depends on the step; so the survey's picks report their gate's toggles (PLAN §7.4), and only §7.2's comparison would catch a final fit there.

**After review.** Three reviews found the build matching the rules on every point, the current form unchanged, and no bug in the model; but the search itself not taking the form, several claims wrong or unsupported, and the curvature unguarded in CI. The maintainer chose the recommendation each time: the form threaded through and required now; a gate-open corner added to parity; the curvature computed by the data build; and every other fix.

**Status.** Built; the survey's runner followed (the entries below).

## 2026-09-29 — The survey's runner, built

**Why.** The survey of the bounded model, and the bounded model's calibration should the survey find no crawl, were set before either was built (the entries above). Their runner is built here, before either runs; no rule changes.

- **The survey** (`npm run calibrate -- --survey`). Stage 1 of R's second round, on the kinematics alone and with its spectral frequency for a worm without a bout, runs sixteen times at 250 evaluations in the conductance form, with CMA-ES seeds 11 to 26, each with its final check. Each pick is graded by checkpoint 1's grading on seeds 3001 to 3020, and the record keeps each search's start, its pick, its grade and its diagnostics, the shunt and the gate's toggles among them. It is written to `data/calibration/survey.json`, and a stopped survey resumes with the searches it had graded. Corrected after review: until the runner's fix (the entry below), each generation's save dropped the graded runs, so a resumed survey would have graded them again, to the same result.
- **Its starts.** They are the Latin hypercube the rules give, computed by `surveyStart` in `src/validation/calibration.ts`; a tie in the ranks, which never arose, would go to the lower search's number. A search's restarts, by round 2's rules on its step and its stalls, start from fresh points of the same hash rather than its own start again, through a new option of the search. Tests hold the starts to one cell a parameter for each search, strictly inside the box, and a restart to the point it is given.
- **The bounded calibration** (`npm run calibrate -- --bounded`). The refit's procedure in the conductance form: one search of 2,000 evaluations on all four targets, without the spectral frequency or restarts, from the conductance form's provisional values, with the final check. It is written to `data/calibration/r4.json`, and it runs only if the survey finds no crawl, after the speed target is decided (PLAN §7.3). The equivalence script gains its fit when it has a record.
- **Round 2's modes are unchanged.** The probe's search and grading now share the survey's code, and its record is the same.

**Status.** Built; the survey ran (the entry below).

## 2026-09-29 — The survey finds a crawl in the bounded model, so R's third round runs (revised after review)

**Why.** The survey ran as its rules set (the entries above): `npm run calibrate -- --survey` at 1f574a1, on 14 workers, in 2 h 16 min, from a clean commit and without a resume. It ran 19,136 trials on the real wiring:

- 16,000 on the calibration's seeds 1001 to 1004, 4,000 evaluations of 4 trials;
- 2,816 on the final check's seeds 1005 to 1020, 176 finalists on 16 seeds each, which round 3 and every null reuse;
- 320 on the survey's grading seeds 3001 to 3020.

The result:

- **Two partial picks.** 2 of the 16 picks grade partial by checkpoint 1's grading on seeds 3001 to 3020, those of searches 7 and 15 (CMA-ES seeds 18 and 26). The hit rate is 2 of 16, 0.125 (95% interval 0.016–0.383), consistent with the one in seven the current form's searches found, though those differed in form, start and budget.

  | CMA-ES seed | Frequency (Hz) | Wavelength (body lengths) | Speed (body lengths/s) | Eigenworms | 20 s bouts | Reversals |
  | ----------- | -------------- | ------------------------- | ---------------------- | ---------- | ---------- | --------- |
  | 18          | 0.129          | 0.84                      | 0.061                  | 98.6%      | 100%       | 0         |
  | 26          | 0.186          | 0.49                      | 0.061                  | 97.8%      | 100%       | 0         |
  - **How they crawl.** Both crawl slowly: their speed sits at partial's floor of 0.06, and their frequency is well below the target's 0.30 Hz. Their mid-body spectra peak at 0.119 and 0.164 Hz, with 18% of the power in 0.2–0.45 Hz.
  - **Where they sit.** Both have the B-types' oscillator off (g_osc,B = 0, at its bound) and κ_gap,B low, at 0.15 and 0.17. Their θ_nmj of −0.12 and −0.10 and g_nmj of 33 and 30 lie near probe 14's corner's −0.14 and 28 (the investigation's entry above). Unlike the corner, their κ_SMD sits mid-box, at 0.31 and 0.33 against 0.11; their θ_osc sits at −16.5 and −15.6 mV against its floor of −28; and they crawl more slowly, at 0.061 against about 0.10 body lengths per second. Their g_sw is 1.9 and 14 nS, and their g_p 0.015 and 0.066 nS per unit of κL. Seed 26's σ_n sits on its bound, 0.169 pA·√s. Two failing picks, seeds 13 and 19, also have g_osc,B = 0. Corrected after review: this called it the region where the corner lay.
  - **Their diagnostics,** reported and not graded:
    - **Voltages.** Seed 18's ran from −37.7 to +7.2 mV, with 0.1 neurons outside the reversal range on average. Seed 26's ran from −73.3 to +29.8 mV, with 3.5 outside and 0.04 more than 10 mV past.
    - **Shunt.** Seed 18's switch conductance came to 1.9 times its SMDs' passive loads, and seed 26's to 14 times, all but clamping them. Proprioception's came to 0.13 and 0.59.
    - **The gate.** Each gate stayed open throughout.

- **The fourteen that failed.** Every one failed the speed clause. The eleven with a forward bout of 10 s moved at 0.019 to 0.034 body lengths per second. Three, seeds 15, 22 and 24, made no such bout, so their kinematics went unmeasured; two of them wiggled at 0.265 Hz with most of their power in the band.
  - **Reversals.** Nine reversed. In seven of them every reversal began within 3 s after a flip of the head switch: slips. In the other two, 115 of 125 and 8 of 90 did.
  - **The gate.** Seed 23's gate turned on or off 88 times a second, about one step in five. Corrected after review: this miscounted the groups and left out the speed.
- **No search restarted.** None went 20 generations without a better best (the longest went 13), and none's step fell below 0.01 (the smallest was 0.092). Corrected after review: this said 250 evaluations end before the restart rules fire.

**After review.** Three reviews found the survey run exactly as its rules set: an independent implementation reproduced every start, every search replays, and every recorded number reproduces. But the result is weaker than the verdict alone says. Checked here from the full run record:

- **A ceiling, not a floor.**
  - The fastest of all 4,000 evaluations reached 0.064 body lengths per second, and only 3 of them combined a bout with a speed of 0.06 or more.
  - 3,341 of the 4,000 (84%) had no bout and a speed of 0.01 or less, the objective's plateau. Only 1 of the 176 first generations' candidates made a bout.

A review found, in trials of its own:

- **At the floor.**
  - On fresh seeds both picks stay partial, at 0.061, with trial-bootstrap intervals of about ±0.001.
  - At half the step, seed 18 is partial by 0.00001, at 0.060010.
  - Raising its g_nmj from 33 to 40, inside the box, fails it, at 0.058.
- **The step.** Seed 26's frequency and wavelength moved by 6% and 8% at half the step, outside §7.2's margins. Twenty trials can't test equivalence, but a fit like it could fail §7.2's comparison.
- **The head switch paces the crawl, running unconditionally.**
  - With θ_osc at −16 mV, far below the intact network's drive, the gate stayed open throughout in 15 of the 16 picks: the network never gates the head's rhythm.
  - Seed 18's switch flips 14.5 times a minute, half of which is 0.121 Hz, against its spectral peak of 0.119.
  - With g_sw at its lower bound, both picks stop.
  - With the 18 B-types lesioned, or the 21 A-types, the crawl is lost. With AVBL and AVBR lesioned, seed 18 stays partial and seed 26 falls just short of the speed floor.
  - This meets spec §1.1's letter, since the silenced network's head is gated off, but not its intent. It bodes ill for checkpoint 5's AVB and PVC row and for what checkpoint 6 can say.
- **Reach, not ranking.** Rescoring all 4,000 evaluations with a speed target of 0.15, or with the kinematics from at least 4 bouts, changes no search's best candidate. So the survey is no evidence about the speed target, which rests on the wave-speed argument alone. The spectral frequency held two searches on a plateau of wiggling for 10 to 15 generations, as round 2's review found.

**Decision.** The survey's verdict follows the rules set before it ran; nothing was chosen here. After review, the maintainer chose the recommendation each time:

- **R's third round, its last, runs on the bounded model, the caveats above recorded.** Its procedure is proposed in a rules pull request of its own, for the maintainer's approval, and every null gets it. Its rules state in advance:
  - how a fit that is partial only at the speed floor reads;
  - that a pass is likely out of reach in this form;
  - the diagnostics, reported and not graded, that show what paces the crawl: the gate's open share, and runs with the switch weakened and with the B-types, the A-types and AVB lesioned.

  Round 3's rules are designed after these results, and say so. Considered: stopping R now, overriding the rule; and raising the bar round 3's fit must clear.

- **The picks are exploratory.** They can't be chosen, and they took neither checkpoint 1's own trials nor §7.2's comparison.
- **Round 3's rules also:**
  - decide the speed target, with the maintainer's approval (PLAN §7.3);
  - name round 3's record, since `r4.json` is the bounded calibration's;
  - add its fit to the equivalence script.
- **The velocity floor** of GPU parity is revisited before any bounded fit reaches the registry (the build's entry above).
- **The bounded calibration is guarded.** `npm run calibrate -- --bounded` refuses to run unless the survey's record says no pick graded partial, since the survey found one. A later rule that calls for it lifts the guard. Considered: removing the mode.
- **The runner is fixed** (after review):
  - a resumed survey or probe now keeps the runs it had graded, where each generation's save had dropped them;
  - its records are written whole or not at all;
  - a trial running past 300 s is killed, and each worker's heap is capped at 2 GB;
  - a resume refuses another commit or a finished run, and its time carries on;
  - its options refuse names that aren't modes.

  Tests now hold the starts to the rules' formula, restarts to their index with a replay, and the record to its settings and its clauses. The survey itself met none of these faults: it ran through once.

- **Disclosed.** For its findings the science review ran 177 trials of 120 s on seeds 9001 to 9020, at the two picks' values in the conductance form:
  - 80 at the step and at half of it;
  - 80 with the switch weakened, proprioception at its lower bound, and the B-types, the A-types or AVB lesioned;
  - 16 with g_nmj at 40;
  - 1 for timing.

**Status.** Done: the survey found a crawl, and round 3's rules followed (the entry below). Round 3 ran, and none of its picks passed §7.2's comparison (the entries below).

## 2026-09-29 — R's third round: its rules, set before any of it runs (revised after review)

**Why.** The survey found a crawl in the bounded model (the entry above), so R's third round, its last, runs on it, by rules of its own. They are set here, for the maintainer's approval, before any of it is built or runs, and were revised after review. They are designed after the survey's results on the real wiring, and they say so:

- **The four best held both partials.** Ranked by their final checks' objective, the survey's four best searches were those of CMA-ES seeds 26 (0.71), 14 (0.91), 18 (0.96) and 25 (1.00), which include both partial picks. So four searches continue.
- **The searches ended unconverged.** Every search's step still stood at 0.09 to 0.24, so the continued searches run longer. They won't converge by 750 evaluations either: in the earlier runs of 2,000, the step stood at 0.039 to 0.096 after about 750 evaluations and neared 0.01 only at generations 160 to 180, a review found.
- **The crawls came late.** The partial picks' searches made their first bouts at generations 8 and 10, so every search runs its 250 evaluations before any is dropped.
- **Most of the budget went on the plateau.** 84% of the evaluations sat on it, with no bout and a speed of 0.01 or less, and 92% had no bout. So the phases spend most of the budget where a crawl was found. Corrected after review: this said 84% had no bout.
- **The spectral frequency held searches on wiggling.** It kept two of them on a plateau of wiggling for 10 to 15 generations, so it is dropped.
- **No search restarted.** So the restart rule the survey ran by is kept for phase 1, where it has done no harm.

**The survey's limits** (added after review). What the survey says about round 3 is limited:

- **Round 3 won't retrace it.** Under round 3's objective, every search's ranking of its candidates changes by its eighth generation, five of them in their first, and seeds 26's and 18's before their first bouts, a review found: the steeper speed term trades differently against the out-of-box penalty. The survey's trajectories and first bouts describe paths round 3 won't take, and the real wiring gets no head start from the survey's seeds.
- **On the plateau the objective barely points anywhere.** 70% of the survey's evaluations without a bout moved at 0.001 body lengths per second or less, where the spread of four trials' mean speed is about as wide as the candidates' own. In the generations with no bout, the ranking CMA-ES used follows the out-of-box penalty's, with a median Spearman correlation of 0.85, against 0.50 for the speed term's. That pulls away from the box's faces, where both partial picks sit. First bouts came as jumps, and the speed gives the search a direction only once a worm creeps at about 0.005 body lengths per second or more. No plateau signal is added: one would be untested, and the survey found its crawls without one.
- **The chance of a crawler.** At the survey's rate of 2 in 16, phase 1 finds at least one partial crawler with a probability of 0.88. Over that rate's 95% interval, 0.016 to 0.38, the probability runs from 0.23 to above 0.999, and the rate under round 3's objective is unknown.
- **Rescoring.** With the target of 0.15, the survey's final checks change one search's pick, 17's, by 0.0025, and none of the four best. With the spectral frequency dropped as well, search 15's changes too. Under round 3's objective the four best are 26 (0.53), 18 (0.79), 14 (0.81) and 25 (0.90), both partials first and second, the fourth ahead of the fifth, 21's 0.902, by 0.003. Corrected after review: this said the rescoring changed no search's pick.

**Decision.** The maintainer chose the recommendation each time, before review and after it:

- **Two phases, 6,000 evaluations a wiring, for the real wiring, and for every null if round 3's fit is chosen** (PLAN §7.3). If the refit stays, every null gets the refit's procedure, its speed target of 0.22 and its reversal term included.
  - **Phase 1.** The survey's design, with round 3's objective: stage 1 on all twelve calibrated parameters in the conductance form, sixteen searches of 250 evaluations with CMA-ES seeds 11 to 26, each from its point of the survey's Latin hypercube (`surveyStart`, from seed 0x53555256), each with its final check on seeds 1005 to 1020. Phase 1 grades nothing: the survey's grading on seeds 3001 to 3020 isn't part of it.
  - **Phase 2.** The 4 searches with the lowest objective on their final check continue, ties going to the lower CMA-ES seed. Each is the same search run to 750 evaluations. Its first 250 are read from phase 1's record, not run again, and replayed exactly, the 23rd generation cut short included. Corrected after review of the build: this said the 22nd; the code counts it from 0, as generation 22. A replay that parts from the record stops the round as a defect. Each continued search's final check replaces its phase 1 check, and adds phase 1's pick, listed first so it is kept on a tie.
  - **The picks.** Each continued search's pick is the lowest objective on seeds 1005 to 1020 in its final check. The four are ranked by that objective, ties going to the lower CMA-ES seed, and a pick whose trials leave the finite numbers ranks last. These seeds aren't fresh for the picks: they chose phase 2's four, and the survey used them on the real wiring.
  - **Restarts. Changed after review.** Phase 1 keeps the survey's rule. A search restarts, its population doubled, from its next point of the survey's hash (`surveyStart(j, r)` for restart r), when its step falls below 0.01 in the mapped units, or when the restart's best objective, without the out-of-box penalty, hasn't fallen at all for 20 generations. Phase 2 makes no restart after the 250th evaluation, so a continued search stays in the region it was chosen for.
    - As first proposed, a search restarted when its best hadn't fallen by at least 1% of itself over 20 generations, in both phases.
    - A review found that 1% below the objective's noise: a candidate's objective on four seeds differs from its objective on sixteen by a median of 4.4%.
    - Replayed on round 2's full run, it would have restarted at generation 38, where that run's rule waited until 87, before the best fell from 1.17 to 0.84.
    - It could be read three ways, each moving the search differently.
  - **Where it differs from the survey.** The real wiring's phase 1 runs afresh, not replayed from the survey, since the objective differs.
  - **Records.** The round is recorded in `data/calibration/r5.json`, since `r4.json` is the bounded calibration's: the sixteen searches of phase 1, their ranking, the four continued searches, the picks in their order and the comparisons they took. The equivalence script takes the chosen pick as `round-3`. Built (the entry below): the comparisons are recorded apart, in `data/equivalence/round-3-pick-N.json`, and the chosen pick's report in `data/calibration/r5-chosen.json`.
  - **Changed after results.** The budget was 2,000 evaluations (PLAN §7.3); this is marked on checkpoints 1 and 6.
  - **Cost.** About 27,500 trials, some 920 worm-hours, taking about 3.3 hours a wiring on 14 workers, and 36 hours for the real wiring and the ten primary nulls.
  - Considered: sixteen searches of 500, 8,000 a wiring; two phases continuing the best 2; and, after review, the 1% rule in both phases with its reading fixed, or restarts in phase 2 from the search's own best at a smaller step.
- **The objective reads the crawl alone** (PLAN §7.3). Changed after results, as a whole, and marked on checkpoints 1 and 6.
  - **The speed target is 0.15 body lengths per second.** It was 0.22, above the targets' own wave speed of 0.195. Karbowski et al. 2006 measured adult wild-type worms crawling on food, a layer of bacteria on agar, at 0.79 ± 0.26 of their wave speed (Table 2, N = 58, checked against the paper), and 0.79 × 0.30 Hz × 0.65 body lengths ≈ 0.154. The code pull request registers the paper in `citations.ts`. Done, with the other targets' sources (the entry below).
  - **The spectral frequency is dropped.** A worm without a bout of 10 s scores its frequency and wavelength at the cap, and its speed by its mean forward velocity, which gives the search a direction once the worm creeps (the survey's limits, above).
  - **The reversal rate stays out,** as in round 2's stage 1. With a reversal term in, the head switch's slips could meet it, while the bounded model's crawlers don't reverse, so the term would favour slipping over crawling. That settles, for round 3's procedure, the item PLAN §9 left open: slips can't meet a reversal term the calibration doesn't have. If the refit stays, the item stays open for the refit's procedure.
  - **Acknowledged after review: no stage 2 follows,** unlike round 2. So round 3 fits no wiring's reversal rate, though spec §1.2 names it among the calibration's targets, and it tunes σ_n and τ_n on the kinematics alone, without a target of their own, an option round 2's rules considered and set aside (2026-09-28). Each wiring's reversal rate is reported as a prediction.
  - Considered: a speed of 0.15 with the spectral frequency kept; the survey's objective unchanged; and, after review, a stage 2 on the noise against all four targets, as round 2 had, and a plateau signal, such as the longest forward run's shortfall from 10 s.
- **The choice, and how a partial at the speed floor reads** (PLAN §9).
  - **The comparison, down the four. Changed after review.** The first-ranked pick takes §7.2's comparison; if it fails, the next takes it, and so on down the four. The first to pass is round 3's fit. If none passes, the refit stays, with its form and procedure for the nulls (step 3).
    - As first proposed, a failure of the one fit kept the refit.
    - The review found the risk real: at half the step, seed 26's pick moved 6% in frequency and 8% in wavelength, outside §7.2's margins.
    - Only the real wiring takes the comparison, so its fit may be its round's second to fourth pick, where each null's is its first.
  - **It replaces the refit whatever the two grade,** since the refit's voltages lie outside the model's range. That sets step 3's ranking aside for this choice, as the bounded calibration's rule did (the survey's rules, above).
  - **Checkpoint 1.** Its trials, seeds 1 to 20 at 2.5 ms, are the comparison's first 20 at dt. So round 3's fit is graded from those records by checkpoint 1's grading, as round 2's was, and VALIDATION.md's section follows once the harness runs the fit from the registry.
  - **Adoption.**
    - The registry takes all twelve of the fit's values and names the conductance form. The current form's g_sw and g_p go back to no value, since no fit ran them beside round 3's other ten; the refit stays in `data/calibration/r2.json`.
    - The app, the harness and GPU parity then run the fit. Parity runs again in Chrome and in Safari, where a failure is a defect to fix, not a reason to keep the refit.
    - If the fit grades partial, §7.2's long runs compare its crawling frequency and speed. Each run's are measured as checkpoint 1 measures them, over that run's forward bouts of 10 s or more; a run without one is left out and counted. The code measuring them is built before any long run on the fit.
    - Checkpoint 0 runs again on the fit, and its result is reported without undoing the choice: the refit hasn't taken it either.
  - **R ends after round 3 either way.**
  - **The speed's margin.** Checkpoint 1's grade stands as graded. Its report adds the speed's 95% interval, drawn as §7.2 draws its intervals.
    - The pooled speed is recomputed as checkpoint 1 computes it, over 1,000 resamples of the 20 trials with replacement, drawn by `hash` from §7.2's resampling seed.
    - The interval runs from the 26th to the 975th of the sorted values, a resample with no bout counting below every value.
    - A partial is reported as partial at the speed floor when that interval reaches below 0.06, or when the pooled speed of §7.2's 200 trials at dt/2 lies below 0.06; the review found the step and the gains move the speed more than the seeds do. Added after review: the dt/2 speed and the interval's definition.
    - The label changes no grade, and not checkpoint 6's crawl gate.
  - **What paces the crawl,** reported and not graded, for round 3's fit and, in checkpoint 6's report, for every null's, on checkpoint 1's seeds 1 to 20 of 120 s:
    - the share of the measured steps with the head switch's gate open; the head-switch drive less θ_osc, its mean and standard deviation over the measured steps; and the switch's cycle rate, half its flips a second, beside the spectral peak. The drive and the cycle rate were added after review, since the gate was open throughout in 15 of the survey's 16 picks.
    - checkpoint 1's trials run again with g_sw at 0, the switch off, and at its lower bound of 0.02 nS; with the 18 B-types lesioned; with the 21 A-types lesioned; and with AVBL and AVBR lesioned. Each is graded by checkpoint 1's grading, with its forward share and mean forward velocity beside the grade. Changed after review: g_sw at 0 was added, since its lower bound moves the SMDs by up to 1 mV.
    - The run with AVBL and AVBR lesioned previews checkpoint 5's held-out AVB + PVC row. Checkpoint 5's report names it, and no choice depends on it (PLAN §10).
  - Considered: counting a partial only if its speed's interval clears 0.06; and, after review, the bounded calibration as the fallback, as the survey's rules had it for a miss.
- **GPU parity's velocity floor is raised now,** before any bounded fit exists (PLAN §7.2). This is the revisit the conductance form's entry promised, made in these rules rather than in an entry of its own.
  - **The change.** The rods' centres' linear floor becomes 10⁻⁴ body lengths a second, 1% of the motion floor and 48 times the old 10⁻⁴ segment lengths a second. The angular floor, 10⁻⁴ rad/s, and the relative threshold, 1% of the largest velocity, are unchanged; the end points, reported, take the same floors.
  - **Changed after results.** The conductance form's first parity run failed on bodies creeping at under 5 µm/s (the build's entry above).
  - **Checked after review.** Parity ran on the Mac's GPU in headless Chrome, with the conductance setups' θ_nmj put back at 0.2, as in that first run. Under the old floor, 13 states failed, the worst at 2.14 shares. Under the new floor every check passed, the worst linear share 0.045. The setups keep θ_nmj at −0.2, where their bodies move fast enough to exercise the relative threshold.
  - **Its scope.** The floor binds wherever a body's largest rod-centre velocity lies below 0.01 body lengths a second. That includes most of the present setups' states, whose checks it loosens by a median of 1.7 to 3.3 times, a review found. Faster bodies are checked as before.
  - Considered: deciding it when a bounded fit arrives.
- **Everything else stays:** the model, its bounds, the free-parameter budget of 18, the final check's size, and checkpoint 1's grading.

**Exploration, disclosed.** The reviews ran 60 trials of 120 s on the real wiring, on seeds 9021 to 9040, at three of the survey's candidates without a bout, to size the plateau's noise. They also rebuilt the loop parity's states on the CPU, and ran GPU parity with the first setups' values under both floors.

**Status.** Set before any of it was built, and revised after review; built (the entry below). The round ran, and no pick passed (the entries below).

## 2026-09-29 — R's third round, built (revised after review)

**Why.** Round 3's rules are set (the entry above). This builds them, so the real wiring's round can run.

**Decision.**

- **The runner** (`npm run calibrate -- --round-3`).
  - Phase 1 runs the sixteen searches of 250 from the survey's starts, each with its final check, and ranks them by that check's objective, ties to the lower CMA-ES seed.
  - Phase 2 continues the four best to 750 each. It replays each search's first 250 evaluations from phase 1's record, then completes the generation phase 1 cut short, and restarts nothing after the 250th evaluation. Phase 1's pick joins each continued search's final check first, so it is kept on a tie.
  - The objective takes a round's own targets, so checkpoint 1's, which the committed records pin, stay as they are.
  - A resumed run keeps every search it had finished, its final check included, and replays a stopped search's evaluations. Changed after review: a resumed phase 2 replays phase 1's record until its own is longer, so no evaluation of phase 1's is scored again. As first built, a stop during phase 2's replay, or in the generation that crosses the 250th evaluation, would have scored some of them again: 8 in that generation, or 19 after a restart.
  - **Guards, added after review.** The runner refuses to start afresh over a stopped run, which only `--resume` takes up. It runs round 3 once, and only after a survey that found a crawl. It writes the committed record before it marks its working file complete, so a stop between the two leaves a run that `--resume` can finish.
- **The record.** `data/calibration/r5.json` holds:
  - the round's settings;
  - each phase 1 search's pick and restarts;
  - phase 1's ranking (added after review);
  - the four continued;
  - the four picks in the order they take §7.2's comparison;
  - every search's generations and final check, without its evaluations.

  The comparisons are recorded apart, as the next bullet says, where the rules had them in `r5.json`.

- **The comparison, down the four** (`npm run equivalence -- --fit round-3 --pick N`).
  - A full run of pick N is refused until picks 1 to N − 1 have failed it, at the values `r5.json` holds for them.
  - Each result is `data/equivalence/round-3-pick-N.json`, and VALIDATION.md's section shows them after the other fits.
  - A shortened run takes any pick, for a look, and writes only to `harness-out/`.
  - The comparison's workers, and the numerics studies', now get the calibration's cap of 2 GB each and its limit of 300 s a job (added after review).
- **The chosen pick's report.** The full run of the first pick to pass also writes `data/calibration/r5-chosen.json`, and prints it as Markdown for DECISIONS.md:
  - checkpoint 1, graded from the comparison's first 20 trials at dt;
  - the speed's interval, and the partial-at-the-floor label, which a grade other than partial doesn't carry;
  - the five runs that show what paces the crawl, each graded by checkpoint 1's grading, the lesioned classes named by the step tree's own runtime data.

  VALIDATION.md's checkpoint 1 section waits until the harness runs the fit from the registry.

- **What paces the crawl.** Trials now record, over the measured steps and in either form:
  - how many steps' gates were open;
  - the head-switch drive less θ_osc that each step's gate read, its sum and the sum of its squares.

  Changed after review: the gate is read from that margin, open above 0, not from the switch's current. Otherwise a switch at 0 would read as a gate always shut, and the open count would sit a step off the margin. The shunt diagnostic's older count of the gate's turns still reads the switch's current, which gives the same count wherever g_sw is above 0.

  Checkpoint 1's diagnostics report the open share, the margin's mean and standard deviation, and the switch's cycle rate: half its flips a second within the measured windows, beside the spectral peak. They appear in every fit's checkpoint 1 report from now on, the refit's included when the harness next runs it, and grade nothing.

- **GPU parity's linear velocity floor** is 10⁻⁴ body lengths a second, as the rules set. Changed after results: CI's GPU job timed out on this pull request, its checks running past their limit of 600 s on CI's software GPU. Its passing runs had taken 462 s on this pull request and 599 s on main, and the code the checks run hadn't changed. So the checks' limit is now 900 s and the job's 25 minutes. The checks' thresholds are unchanged.
- **The targets' sources are registered**, as the rules said, and more widely.
  - Changed after review: the build first left Karbowski et al. 2006 out of `citations.ts`, since no registry entry cited it, nor the other targets' sources, and a test fails on a registered citation nothing uses.
  - The code uses their values, though, which CLAUDE.md's rule covers. So Fang-Yen et al. 2010, Ramot et al. 2008 and Karbowski et al. 2006 are registered, each checked against Crossref, and Karbowski's Table 2 against the arXiv preprint, not the published version.
  - A new registry list, `CALIBRATION_TARGETS` in `src/science/validation.ts`, gives each target's source, Gray, Hill & Bargmann 2005's for the reversal rate among them. FIDELITY.md shows it, and a test holds its values to the calibration's.
- **Noted, not built.**
  - A search the stall rule restarts late in phase 1, from evaluation 231 on, carries its restart's fresh region into phase 2, though its pick, which ranked it, may come from restart 0. The rules continue the same search, and the picks' origins name their restarts. No survey search restarted.
  - Adopting round 3's fit still needs two things. §7.2's long runs need their bout-based measure, which the rules set before any long run on it. And the registry's note on what the calibrated parameters were tuned against (`CALIBRATION_TARGETS` in `params.ts`) names the reversal rate, which round 3 leaves out.

**Checked.**

- **Unit tests.** 538 pass, among them:
  - a search continued from 250 to 750 evaluations equals a fresh one of 750, bit for bit, its final check included, with and without a restart in phase 1; continued from phase 1's record, it scores only the 500 new;
  - phase 2's resume choosing phase 1's record over a shorter one of its own;
  - a stalled search restarting before the 250th evaluation and never after;
  - the ranking, round 3's objective, and the run guards;
  - the speed's interval, a resample with no bout counting below every value, and the floor's label;
  - the pacing diagnostic, and the gate record against a world stepped independently, a switch at 0 included;
  - the refusal of a pick out of turn;
  - the diagnostic runs against the runtime data: 18 B-types, 21 A-types, AVBL and AVBR;
  - the registry's targets against the calibration's.
- **GPU parity** passes with the new floor in headless Chrome and in Safari, both on the Mac's GPU.
- **Two smoke runs, each in a scratch copy of the tree,** with round 3 cut to three searches, two continued, trials of 30 s and three candidates rechecked.
  - **The first, as first built,** ran searches of 22 evaluations continued to 44. It went through a stop in phase 2 and a resume, and phase 2 replayed phase 1 exactly. In one search phase 1's pick outscored phase 2's own and was kept. Its first pick then took the comparison on 20 trials at each step and failed, and the chosen pick's report was forced: every part of it came out. Its budgets were whole generations, and its stop came just after phase 2's replay, so it tried neither a generation cut short nor the stop the review found.
  - **The second, after review,** ran searches of 25 continued to 47. Phase 1 cut its third generation at 3 of 11, and phase 2 completed it and replayed phase 1 exactly. The record held phase 1's ranking, and the run-once guard refused a second start. The comparison and the forced report came out as fixed, the report without a floor label for its failing pick.
  - The values were the smoke runs', and nothing from them is kept.

**Exploration, disclosed.** The smoke runs' trials ran on the real wiring, at the values of picks no rule chooses:

- the first: 792 recorded trials of 30 s on the calibration's seeds, and 6 to 44 more in the generation its stop cut off; and 140 of 120 s on checkpoint 1's seeds 1 to 20, 40 for the comparison, 20 at each step, and 100 for the diagnostic runs;
- the second: 828 of 30 s on the calibration's seeds, and 140 of 120 s as in the first.

**Status.** Built. The round ran, and no pick passed (the entry below), so the adoption steps noted above are moot.

## 2026-09-29 — R's third round: no pick holds at half the step, so the refit stays and R ends (revised after review)

**Why.** R's third round, its last, ran on the real wiring by the rules set before it (the entries above). This records its search, its four picks' comparisons with §7.2, and what the rules make of them.

**The search** (`npm run calibrate -- --round-3` at 7aa7a9f; 3.2 hours on 14 workers; `data/calibration/r5.json`).

- **Phase 1.** Sixteen searches of 250 evaluations; none restarted. Ranked by their final checks' objective, the best four were those of CMA-ES seeds 12 (0.711), 23 (0.716), 14 (0.726) and 18 (0.869). The survey's two partial searches, seeds 18 and 26, ranked fourth and fifth. The picks of two searches, seeds 15 and 22, made no bout in their final checks.
- **Phase 2.** The four continued to 750 evaluations each, with no restart. In each, the final check preferred a candidate of phase 2's to phase 1's pick.
- **The picks,** in the order they took the comparison, measured on the final check's seeds 1005 to 1020, on which they were chosen:

  | Pick | CMA-ES seed | From                       | Objective | Frequency (Hz) | Wavelength (body lengths) | Speed (body lengths/s) |
  | ---- | ----------- | -------------------------- | --------- | -------------- | ------------------------- | ---------------------- |
  | 1    | 12          | generation 64, candidate 2 | 0.366     | 0.189          | 0.57                      | 0.081                  |
  | 2    | 14          | the final mean             | 0.375     | 0.180          | 0.61                      | 0.081                  |
  | 3    | 18          | generation 61, candidate 3 | 0.552     | 0.217          | 0.46                      | 0.057                  |
  | 4    | 23          | generation 67, candidate 1 | 0.592     | 0.149          | 0.62                      | 0.063                  |

- **Where they sit.** Picks 1, 2 and 4 turned the B-types' oscillator off (g_osc,B at 0). Picks 1 and 4 also have g_sw and g_nmj at the tops of their boxes. Pick 1 has κ_gap,B at its floor, pick 2 has σ_n at 0, pick 4 has τ_n at its floor, and pick 3 has τ_w at its top.
- **Trials.** 27,568 of 120 s: 6,000 evaluations of 4, and 223 candidates rechecked on 16 seeds each.

**The comparison, down the four** (`npm run equivalence -- --fit round-3 --pick N`, at 8358a9a, 4042820, d888332 and c5539c3). Every pick failed on its frequency and wavelength; each one's speed, share of trials with a 20 s bout and reversals passed:

| Pick | Frequency, dt → dt/2 | Interval (margin)            | Wavelength, dt → dt/2 | Interval (margin)            | Checkpoint 1 over the 200 trials, dt and dt/2 |
| ---- | -------------------- | ---------------------------- | --------------------- | ---------------------------- | --------------------------------------------- |
| 1    | 0.1846 → 0.1886      | −0.0072 to −0.0006 (±0.0057) | 0.5931 → 0.5809       | +0.0010 to +0.0234 (±0.0174) | Partial, partial                              |
| 2    | 0.1796 → 0.1896      | −0.0137 to −0.0065 (±0.0057) | 0.6088 → 0.5665       | +0.0316 to +0.0533 (±0.0170) | Partial, partial                              |
| 3    | 0.2091 → 0.2001      | +0.0002 to +0.0170 (±0.0060) | 0.4754 → 0.4991       | −0.0453 to −0.0005 (±0.0150) | Fail, fail                                    |
| 4    | 0.1500 → 0.1579      | −0.0113 to −0.0046 (±0.0047) | 0.6129 → 0.5878       | +0.0122 to +0.0386 (±0.0176) | Partial, partial                              |

- Pick 1 failed narrowly: its differences, −2.1% in frequency and +2.1% in wavelength, lie within their margins, but their intervals reach past them.
- Picks 1, 2 and 4 made a forward bout of 20 s in every one of their 200 trials at both steps; pick 3 in 92% and 96%. On checkpoint 1's own seeds, 1 to 20, the first 20 of these trials, picks 1, 2 and 4 grade partial and pick 3 fails.
- Pick 3 fails checkpoint 1 on its speed alone, 0.0569 and 0.0573 body lengths a second against partial's floor of 0.06, as it did on the final check's seeds. Had it passed the comparison, the rules would have had it replace the refit while failing checkpoint 1.
- **Added after review: pick 2 is noiseless.** Its σ_n is 0, so its trials differ only by their starting postures, and §7.2 holds a noise-off run to the plain 2% rule (the entry of 2026-09-28). By that rule its speed, 2.8% apart between the steps, fails too; the noise-on reading used here passes it, its interval 0.00215 to 0.00224 against a margin of 0.00237. It fails either way.
- No pick passed, so the chosen fit's report, checkpoint 1 on its own trials, the speed's interval and the runs that show what paces the crawl, was not written.
- **Corrected after review:** the messages of commits d888332 and c5539c3 give the direction at dt/2 backwards; the records and this entry are right. The history stays as it is, so that the commits the records name remain on main.

**Decision.** By the rules:

- **The refit stays** the real wiring's final fit, with its form, and with its procedure for any null tuned later (PLAN §9, step 3). Any such null would take the refit's speed target of 0.22, which PLAN §7.3 notes exceeds the targets' own wave speed.
- **R ends,** after its third round, as the rules said it would either way.
- **The consequences carry over.** The refit's voltages lie outside the model's range (the investigation's entry above), and that stands. The item PLAN §9 left open, whether the head switch's slips can meet the calibration's reversal term, stays open for the refit's procedure, to be settled before any null is tuned.

**Reported, not acted on. Corrected after review:** the first of these read the wave's speed as holding, when the measure fixes it.

- **What moves with the step is the counted frequency.** Checkpoint 1's wavelength is the rods' separation over the frequency times the lag between them (`kinematics` in `src/validation/motion.ts`), so the frequency times the wavelength is the separation over the lag, and the two clauses fail together by construction. The lag itself holds: its product's intervals run −0.6% to +0.6%, +1.8% to +1.9%, −1.9% to +1.0% and −1.5% to −0.4% in picks 1 to 4, a review found. The frequency, a count of crossings of each bout's mean, moves by 2.1% to 5.3%, and the wavelength follows it, by up to 7.5%. The mid-body spectrum's peak, at a resolution of 0.009 Hz, doesn't track the count: 0.155 at both steps in pick 1, 0.182 to 0.173 in pick 2, 0.091 at both in pick 3 and 0.119 to 0.128 in pick 4. The entry after this one looks into why.
- **The head switch runs unconditionally.** In every pick, at both steps, its gate was open on every measured step and never turned, the head-switch drive sitting 2.2 to 9.6 mV above θ_osc with a spread of about 0.5 mV; and in picks 1, 2 and 4 the spectrum's peak lies at the switch's cycle rate, half its flips a second: at dt, 0.155 and 0.154 Hz, 0.182 and 0.179, and 0.119 and 0.122. Pick 3's peak, 0.091 Hz, lies below its switch's 0.142. These are the chosen fit's diagnostics, which the rules ask of no unchosen pick; a review read them from the comparison's uncommitted trial records.
- **Picks 1 and 2 crawl faster than the survey's.** Over the comparison's 200 trials at dt they move at 0.081 body lengths per second, a third above the survey's two partial picks, graded at 0.061 on seeds of their own. Pick 4 moves at 0.063, about the survey's speed, and pick 3 at 0.057, below it. All stay below a pass, 0.12.

**Exploration, disclosed.** The comparisons ran by the rules on seeds 1 to 200, checkpoint 1's own 20 among them: 1,600 trials of 120 s, 400 a pick.

**Status.** Done: track R has ended, and the refit remains the real wiring's final fit. The refit's checkpoint 1 stays a fail, so checkpoints 2 to 6, which need forward crawling, stay not reached (milestone 0c's outcome, PLAN §9). The nulls' procedure, and the open item on the reversal term, come into play only if checkpoint 6 is ever reached. An assessment of the paths left followed (the entry below).

## 2026-09-30 — After R: its last crawl is the head switch's, and the negative result is the headline

**Why.** R ended below partial (the entry above). The maintainer asked for a holistic look at whether any path to the project's goals is left: how likely each is to succeed, and whether another day or more of evaluations would be worth it. Three investigations ran on it: the numerics of round 3's step dependence, what drives its best pick's crawl with a preview of the wiring test, and the model's structural gaps against its history and the literature.

**The step dependence is mostly the frequency's measure.**

- **The counted frequency.** Checkpoint 1 counts crossings of each bout's mean, and these gaits linger near it: 17% to 23% of the crossings in picks 1 and 4 are pairs under 1 s apart, how many depending on the noise and the step. The count is the frequency that moves with the step (the entry above).
- **The rhythm.** The head switch's cycle, where the body's spectral peak lies, moves 1.4% to 1.8% from 2.5 to 1.25 ms and 0.7% or less at each halving after, in picks 1, 2 and 4, over steps down to 0.3125 ms.
- **Where the error lives.** In the brain's integration: sub-steps of the brain alone reproduce the finer loop, and sub-steps of the body don't. The gate's chatter is ruled out, since it never turned, and so is the solver's tolerance. The oscillators couldn't be separated from the rest: without the A-types' the worm doesn't crawl at all. With its noise off, pick 4 is independent of the step to four figures; its coloured noise, at τ_n's floor, brings in both the step dependence and most of the short crossings.
- **Exploratory, and not acted on.**
  - Pick 1 passes every clause of a comparison of 1.25 against 0.625 ms on the rule's 200 seeds, its frequency interval −0.0029 to +0.0041 against ±0.0056. The other picks' counts don't converge at any step tried.
  - Counting only crossings that leave a band of ±0.5 κL around the mean would pass the frequency clause for picks 1, 2 and 4 at 2.5 against 1.25 ms, though not pick 3's.
  - Either would change the rules after results: the model's step, which §7.2's comparison of 2026-09-28 declined to choose after results, or checkpoint 1's measure.
  - An inference, untested: the calibration's objective reads the same count against a target of 0.30 Hz, so the search may have been rewarded for short crossings. At 2.5 ms, picks 1, 3 and 4 count 21%, 114% and 22% more crossings than their rhythm makes.

**What drives the crawl** (pick 1, checkpoint 1's seeds 1 to 20, at dt; pick 4 alike unless noted):

| Run                                   | Grade   | Speed (body lengths/s)  | Forward share | Switch's cycle / spectral peak (Hz) |
| ------------------------------------- | ------- | ----------------------- | ------------- | ----------------------------------- |
| As picked                             | Partial | 0.082                   | 99.6%         | 0.152 / 0.155                       |
| g_sw at 0, or at 0.02 nS              | Fail    | none, −0.001 on average | 0%            | 0 / 0.027                           |
| SMDs lesioned                         | Fail    | none                    | 4%            | 0 / 0.027                           |
| 18 B-types lesioned                   | Fail    | 0.014 on average        | 61%           | 0.301 / 0.301                       |
| Proprioception at its floor, or 0     | Fail    | 0.021 on average        | 71%           | 0.138 / 0.137                       |
| 21 A-types lesioned                   | Fail    | 0.024                   | 93%           | 0.146 / 0.146                       |
| AVBL and AVBR lesioned (pick 4 fails) | Partial | 0.076                   | 99%           | 0.167 / 0.164                       |
| Every chemical synapse cut            | Fail    | 0.038                   | 93%           | 0.114 / 0.109                       |
| The B-types' chemical inputs cut      | Partial | 0.088                   | 100%          | 0.139 / 0.137                       |

- **The pace.** The head switch sets it: its gate is open throughout, its conductance about 50 times the SMDs' passive load, and the body's peak follows its cycle in every run.
- **The wave.** It travels tailward by a proprioceptive relay. The switch bends the front through the SMDs' junctions, and the B-types, locked to the switch's cycle, carry each bend back to their own muscles: their phase runs from VB1 to VB11 along the body. With proprioception off they unlock, and the tail stops undulating.
- **The network's part.** It sets the relay's operating point and the speed: AVB, and the B-types' chemical inputs, aren't needed.

**A preview of the wiring test** (exploratory; not checkpoint 6's protocol, which tunes each null).

- **The nulls.** Ten primary nulls were built in a scratch copy: directed double-edge swaps of the chemical synapses, as the sibling project's degree-preserving rewiring does them, keeping each neuron's in- and out-degree, each presynaptic neuron's sections and signs, the autapses, the gap junctions and the neuromuscular map. Each null has its own thresholds, κ_gap,B applied.
- **Untuned.** At pick 1's values, 2 of the 10 grade partial on seeds 1 to 20, and in every null the gate stays open and the body follows the switch.
- **Nudged.** One nudge of one parameter, the best of six by a fixed rule on seeds 4001 to 4010, brings 6 of the 10 to partial: the 2 already there, and 4 more, each by tripling g_p.
- **At pick 4's values** none of five reaches partial, pick 4 itself sitting just above the floor.
- **How it would read.** The verdict map reads 5 or more crawling nulls as no evidence. An untuned run understates how many nulls a tuned search would make crawl, so the wiring test would most likely read no evidence, a judgement of about 65%, against about 10% for "wiring matters".

**The structural gaps.**

- **No backward mode.** The sign audit's probe re-signed up to 102 connections and found none (the entry of 2026-09-29), so checkpoints 2 and 4, which need reversals, and checkpoint 5's reversal rows would fail even with a converged crawl.
- **The parameter budget** of 18 free parameters is spent (PLAN §6.2).
- **The literature.** Crawling models built from connectome data have fitted their weights or polarities, per connection or in reduced circuits. Examples are Olivares, Izquierdo & Beer 2018 (Network Neuroscience 2:323–343) and 2021 (Frontiers in Computational Neuroscience 15:572339), Rakowski & Karbowski 2017 (PLoS Computational Biology 13:e1005834), and Chung & Kim 2026 (Scientific Reports 16:21630), which optimised the connectome's weights. Each was checked against Crossref. The spec (§1.2) forbids such fitting.

**The paths weighed** (the investigations' coarse judgements, not measurements):

| Path                                                                                               | Effort                                                                                           | A converged checkpoint 1 partial | Checkpoints 2 to 6 then informative                                                     |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------- |
| A numerics round: recalibrate at 1.25 ms, or with a debounced count                                | About a week with reviews; 6.4 h on the real wiring, about 72 h with the nulls                   | 50% to 70%                       | 10% to 20%: the wiring test probably reads no evidence, and checkpoints 2, 4 and 5 fail |
| A backward mode: autonomous A-types, the head gated by the command state, inhibitory command signs | Weeks; past the budget of 18, and possibly against the spec; marks checkpoints 2 and 5 as fitted | 25% to 40%                       | 5% to 15% overall                                                                       |
| Accept the negative result                                                                         | A day or two of write-up                                                                         | —                                | Not reached                                                                             |

**Decision.** The maintainer chose the recommendation: **the negative result is the headline.** The connectome, with its anatomical weights, class-level gains and the layers the spec permits, doesn't crawl at the level set in advance. Its best crawl is paced by the head switch, relayed by proprioception, and largely indifferent to the chemical wiring.

- Checkpoints 2 to 6 are reported as not reached.
- Round 3's picks, and the findings here, stay on record as exploratory.
- Next come checkpoint 0's rerun on the refit (PLAN §9) and the sign audit's record, which never landed, each in its own pull request.
- Considered:
  - a numerics round, likely to buy a formal partial and nothing about the wiring;
  - a backward-mode track, weeks long, with poor odds;
  - showing pick 1 in the app as a labelled exploratory crawler.

**Exploration, disclosed.** The investigations ran 2,178 trials of 120 s, at most 3 workers each:

- **The numerics:** 788 on the real wiring at the picks' values, on seeds 1 to 200, checkpoint 1's own among them, at steps from 2.5 to 0.3125 ms, with cause variants on seeds 1 to 12.
- **The mechanism:** 448 on the real wiring on seeds 1 to 20, the lesion runs among them. They are diagnostics on checkpoint 1's measures, not checkpoint 5's protocol, run on picks no rule chose.
- **The preview:** 942 on the scratch nulls, on seeds 1 to 20 and 4001 to 4010.

No held-out checkpoint's protocol ran. The fairness list's count of the real wiring's exploration grows by these 1,236 trials, and by round 3's own (PLAN §9).

**Status.** Done: the negative result stands as the headline, and checkpoint 0's rerun on the refit and the sign audit's record come next. Both followed (the entries below).

## 2026-09-30 — Checkpoint 0's rerun: its sham twins and binomial test, built (revised after review)

**Why.** Checkpoint 0 runs again on the chosen fit, the refit (PLAN §9, step 4). Its reruns grade touches against sham twins, and chemotaxis by an exact binomial test on arrivals, by rules set on 2026-09-27 after its first run (PLAN §7.4). Neither was built.

**Decision.**

- **The sham touch.** `World.sham(s)` restarts the integrator at the two steps where a touch at s would switch its receptors' currents on and off, with no current of its own. Where a touch would reach no receptor, or give none it reaches a current, the sham does nothing, just as that touch wouldn't restart the integrator. A restored world has no sham under way. Only the harness uses it, so the GPU has none, and the loop's parity is unchanged.
- **The fork.** With `shams`, `runTrial` copies the world at each touch, from its snapshot and with its seed, so the copy draws the same noise. The copy takes a sham touch in the touch's place and runs 3.5 s on, sampled on the touched line's grid, while the touched line runs on to its next touch. Each twin's velocity comes from the touched line's positions up to the touch and its own after, until 3 s after it, where the touch's windows end. The harness forks a twin at every touch of checkpoint 0's touched trials. Added after review: `runTrial` refuses a touch that leaves its twin under 3.5 s before the next touch or the trial's end, where the touched line would take a touch its twin doesn't; the schedule's touches are 20 s apart.
- **The grading.**
  - **Anterior:** found if a reversal follows 40% or more of the touches and McNemar's exact test, one-sided, finds more of them after the touches than after the twins.
  - **Posterior:** found if the signed-rank test, one-sided and paired, finds the touched copies faster than their twins over the 2 s after, by at least 0.0012 body lengths per second on average: 1% of checkpoint 1's passing floor of speed, 0.12.
  - **Chemotaxis:** fails only if the exact binomial test at one half finds one spot reached significantly more often. Its index is still reported.
- **What the build settled that the rules left open.**
  - The two-sided binomial test doubles the larger count's upper tail, which at one half is the same as summing the outcomes no more likely than the one seen.
  - Each touch is compared with its twin over the twin's samples. Those cover every sample the rules read, so the choice changes no grade; corrected after review, which found the reason first given described a case that can't arise.
  - A twin that leaves the finite numbers fails its reflex, as a broken trial does, and the report counts twins with the trials and worms, their unconverged solves included (added after review).
  - The report no longer gives the first run's figures against the untouched trials, its largest touched-against-untouched change and its test over the untouched windows. The before-and-after test the first run graded by is reported beside the paired test, not graded.
- **Corrected after review:** a touched trial that broke between touches, stopping with fewer touches than its schedule, would have made the grading throw, since the schedule was checked before whether the trial stayed finite. It fails the clause now, as on main.
- **Checked.**
  - A sham restarts at exactly a touch's two steps and applies no current.
  - Forking twins leaves the touched line's record unchanged, sample for sample.
  - With the touch receptors lesioned, so that neither touch nor sham does anything, the intact refit's twin matches its touched line bit for bit, coloured noise and head switch included (added after review). In the silenced network, whose touches reach no muscle, a twin matches its touched line exactly on the planned model's provisional values with the noise off; corrected after review: on the refit it matches to rounding (the entry below).
  - McNemar's and the binomial test match their exact tails, worked by hand; a review checked both against exact tails for n up to 200.
  - 547 tests pass.
- **Exploration, disclosed.** Before the run, a shortened run of 3 trials of 44 s went through end to end, at ee592e4 with the code uncommitted, on checkpoint 0's own seeds 1 to 3 and with 3 worms; every clause passed. Only the report's wording changed after it.

**Status.** Built, and revised after review; checkpoint 0 ran on the refit (the entry below).

## 2026-09-30 — Checkpoint 0 passes on the refit, and says little (revised after review)

**Why.** Checkpoint 0 runs again on the chosen fit (PLAN §9, step 4), by its reruns' rules (the entry above).

**The run** (`npm run harness -- --checkpoint 0 --checkpoint 1 --jobs 14` at 1b398c9, 209 s; first at cd8a671, before the review's fixes, with the same grades; the harness dates both 2026-09-29, in UTC). It ran 20 trials of 120 s untouched and 20 touched, 5 touches each with a sham twin apiece, and 30 worms in the assay for up to 60 min. Every trial, twin and worm stayed finite, and no brain solve failed to converge, the twins' included. Every clause passes:

| Clause          | Measured                                                                                                                                                                          | Grade |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Crawling        | No forward bout of 10 s or more                                                                                                                                                   | Pass  |
| Anterior touch  | A reversal after none of 50 touches, and after none of their twins; p = 1                                                                                                         | Pass  |
| Posterior touch | Over the 2 s after 50 touches, the touched copies and their twins alike at −0.0001 body lengths per second: a mean difference of 5.5 × 10⁻¹⁸, and none over 1.7 × 10⁻¹⁶; p = 0.42 | Pass  |
| Chemotaxis      | No worm reached either spot, so the test can't fail; p = 1                                                                                                                        | Pass  |

Checkpoint 1 ran again beside it, on the same refit, with the same grades and measures; its section now carries the diagnostics of what paces the crawl, which its last run predated.

**How it reads.**

- **The crawling pass follows from a bound, not from the wiring.**
  - The intact refit makes forward bouts of 10 s, 12 of them over checkpoint 1's 20 trials, and it moves by its head switch alone (the entry of 2026-09-28).
  - Intact, the switch's gate is open on every measured step: its drive sits 26.2 mV above θ_osc on average, with a standard deviation of 4.9 mV. The switch cycles at 0.084 Hz, beside the body's spectral peak at 0.082. So the network never gates the rhythm; it supplies a steady drive.
  - Silenced, with every partner cut, the drive is a constant, the SMDs' leak less their thresholds. It sits 0.47 mV below θ_osc on every step, and the gate stays shut.
  - θ_osc sits at its floor of −28 mV, which was set to keep a silenced head switch shut (PLAN §7.3), so the gate would stay shut for any θ_osc within its bounds. For any fit inside them, the clause couldn't fail through the switch.
  - This meets spec §1.1's letter but not its intent, as the survey's picks did (the entry of 2026-09-29).
- **The touch and chemotaxis clauses** ask a silenced worm that barely moves to show no reflex and no chemotaxis. No worm's centroid got more than 0.19 mm from its start in the hour, so those passes would mean something only alongside passes of checkpoints 2 to 4, which stay not reached.
- **The touched copies and their twins match to rounding,** as expected where the touches reach no muscle. The posterior test's p-value ranks rounding errors and carries no information; the floor of 0.0012 body lengths per second, some 13 orders of magnitude above the differences, decides the clause.
- **Noted after review.**
  - The silenced refit makes no backward move. R's first fit made 18 reversals over the 20 silenced trials, its A-types excited by the noise (the entry of 2026-09-28), and the checkpoint allows for such activity; the refit's A-types stay quiet.
  - The touched receptors reach +854 mV in the silenced network, against +10.5 mV at most untouched. A touch's current is sized for a receptor's load in the intact network, and a silenced receptor keeps only its leak. It moves no muscle and changes no grade.

**Status.** Done: checkpoint 0 passes on the refit. The sign audit's record comes next; it followed (the entry below).

## 2026-09-30 — The sign audit's record (revised after review)

**Why.** The investigation of 2026-09-29 set an audit of the command circuit's signs against their sources, a data investigation that changes nothing ("Before R's third round: an investigation…", 2026-09-29). It reported the same day, and its record was promised a pull request of its own. The entry making the negative result the headline ("After R", 2026-09-30) named it next.

**What it found.**

- **Direct physiology contradicts four signs the transmitter rule sets +:** AIB→RIM, PVP→AVA, AVB→AVA, and AVA→AVB on the fast timescale.
  - AIB→RIM and PVP→AVA rest on patch clamp with receptor rescue in the named cell.
  - AVA⇄AVB rests on functional recordings that may be polysynaptic, and AVB→AVA is contested by Meng et al. 2024.
- **Calcium imaging contradicts two more,** AIB→RIB and SAA→RIM.
- **Receptor genetics contradicts two that expression sets +,** RIM→AVB and RIM→AVA.
- **Seven weaker rows** rest on expression, inference, or indirect or metabotropic effects.
- **Several signs are supported as they stand,** and some are unresolved.
- **The audit's two probes,** at R's refit in the current form, found no backward mode under any set of signs.
  - The chemical synapses have little leverage beside the command neurons' gap junctions.
  - Driving the A-types directly, with the B-types held down, made no backward motion either.
  - So the missing mode lies in the motor layer, and the signs are a question of fidelity, not the fix.

**Decision.** The maintainer chose to adopt none and to put the audit on record:

- **The record** is `docs/sign-audit.md`, the audit's report as it was made on 2026-09-29, with a status note at the top. Revised after review:
  - errors and lines since overtaken are corrected in place, each marked "Corrected 2026-09-30";
  - its source table gains two papers its body cites, both checked against Crossref by the audit's earlier run;
  - its §9 is rewritten to say what stayed local, keeping the list as made.
- **Its working folder stays local,** `harness-out/sign-audit/`, which is gitignored. It holds the retrieved full texts, which are the publishers' copyright; third-party data that aren't pinned, such as the CeNGEN 2021 matrices and a copy of `funatlas.h5`; and the scratch scripts that read them. Added after review: the probes' per-trial records and variant data, which had been left only in a session's temporary folder, were copied into it, so the disclosed trials can still be checked.
- **No sign is adopted.** The negative result stands as the headline.
  - The physiology rows would go through the overrides file, each citation checked and registered.
  - The genetics and expression rows need the maintainer's decisions first: a sign source for genetics, tyramine's scope, and a CeNGEN rule (the audit's §7).
  - Any of them would make the refit stale and call for a new calibration.
  - It would also mark checkpoint 2 and checkpoint 5's reversal rows as fitted, since the missing backward mode prompted the audit (PLAN §10).
  - No change is proposed, so no checkpoint is marked.
- Considered: adopting the signs the audit's direct physiology supports, for fidelity alone.

**Exploration, disclosed.** The audit's two probes ran 1,700 trials on the real wiring: §6's 520 on seeds 7001 to 7010, and the earlier, superseded probe's 1,180 on 7001 to 7010 and 8001 to 8010. They were disclosed when it reported ("After review: two currents, the signs' direction…", 2026-09-29). Nothing ran for this record.

**Status.** Done: the audit is on record in `docs/sign-audit.md`, and PLAN §2.4, §9 and §10 point to it.

## 2026-09-30 — Milestone 5: lesions and the brain swap, live in the app (revised after review)

**Why.** Track R ended below partial, so checkpoints 2 to 6 stay not reached (the entry "After R", 2026-09-30). The maintainer chose to build what milestone 5 and then milestone 6 deliver regardless: spec §6's lesion and brain swap, and the parts of its shareable URL they need. This entry covers milestone 5's interaction; its checkpoints, 5 and 6, stay not reached and nothing ran on them.

**Decision.** The maintainer settled the design before the build, and three points of it after review (below):

- **The contrast brain is PLAN §3.5's primary null,** ported from nematode's directed double-edge swap to `src/sim/brain/rewire.ts`.
  - The chemical graph alone is rewired. Each connection keeps its presynaptic neuron, EM sections, sign and the sign's source; only where it lands changes. Every neuron keeps its numbers of inputs and outputs, and its outgoing strength and mix of signs.
  - **Changed after review:** signed and unsigned connections swap apart, sharing one check for repeats, so every neuron also keeps its numbers of signed inputs and outputs, the connections the model gives an effect. Swapped together, as nematode's single swap moves them, they changed the signed inputs of 221 of the 302 neurons in rewiring 1, by up to 6. The rule is set before checkpoint 6 has run (PLAN §3.5).
  - The 38 autapses are held, as nematode's `preserve_autapses` holds them. Gap junctions, the neuromuscular map and every neuron's identity are unchanged.
  - Nematode's defaults: 10 accepted swaps per connection, and up to 100 attempts per swap wanted.
  - There are ten rewirings, numbered 1 to 10. Rewiring k draws from the project's counter-based hash at a fixed seed, "null" in ASCII, on lane k, so no rewiring is one of nematode's. These are checkpoint 6's ten primary nulls if it is ever reached. They aren't the preview's scratch nulls ("After R", 2026-09-30), which swapped only the signed connections, with draws of their own, so none of these ten had run before this build. The gap-junction null stays out of the app.
  - They are made in code from their seeds, not baked into the runtime file, which keeps its sources' data alone and needs no larger download. This departs from a first sketch that put them in the data build. A rewiring follows the runtime data's list of chemical connections, so a data build that changed the list would change all ten, and what a link to one shows; added after review, a test pins them, so no such change passes unnoticed.
- **Its values are the refit's, untuned,** and the app says so. Checkpoint 6 would tune each null by §7.3's procedure; the app's contrast is a viewer's control, not a null's result. Its thresholds are its own rest, κ_gap,B applied (PLAN §3.3, §9). AWC-ON's gains and the touch currents stay as built on the intact real wiring, the same for every brain (§4.1, §4.2).
- **A change takes effect live.** `World.carry` moves a running worm into a world with the new wiring.
  - **Changed after review:** every neuron keeps its voltage relative to its threshold, with its activation and noise current, so a worm at its old brain's rest lands at the new brain's. A lesion leaves the thresholds where they were (§3.3), so its carry is as before. A swap moves them, in rewiring 1 by up to 29.4 mV and for 12 neurons by more than 2/β, 16 mV; carried absolute voltages threw those neurons off their rest and moved the oscillators' phase.
  - Each oscillator both worlds share keeps its recovery, and each touch receptor both share its pulse. The body, muscles, head switch, AWC-ON and the step count carry over whole.
  - An oscillator new to the world, as when a lesioned B-type is restored, starts on its nullcline at its neuron's voltage, as a new world's do. A restored receptor starts untouched.
  - The new wiring holds from the next step, which restarts the integrator, as after any jump in the input.
  - A lesion keeps the brain's intact thresholds (§3.3); a swap brings the new brain's own. Lesions carry across a swap.
  - The plate reads the GPU's state back, carries it and builds a GPU world from the result in the old one's place, holding the worm meanwhile. Changes made during one wait, and only the latest is made; a restart waits too, and, added after review, so does a tap.
- **Where the controls are.** The graph's inspector ablates and restores the selected neuron (spec §6: "select any neuron in the neural view"). The plate's controls hold the brain, since it runs the worm.
  - **Changed after review:** a line at the foot of the plate's controls says what the experiment changes, with "Restore all", in a short form on a short pane such as a phone's half. In the plate's header it ran into the controls on a phone, where a tap on "Restore all" landed on a speed button.
  - With the graph alone, a note under its title lists the lesions, with "Restore all" (added after review).
  - The graph draws lesioned neurons hollow, with a key in its legend, and their links faint; the inspector strikes through the connections a lesion cuts.
- **Provenance.** A connection the rewiring moved is badged "Rewired", level 0, never with its sign's source; the badge's text names the real connection whose sections and sign it keeps, and that connection's source. The 13 to 24 connections a rewiring leaves where they were keep their own badges. Corrected after review: the badge said such a connection was seen in no animal, but 334 to 366 moved connections in each rewiring land on a pair of neurons the real wiring also joins, with sections and a sign of its own, and now it says so. The ledger gains a subsystem of its own, the contrast brain at level 0, so the real anatomy's range stays 5–4.
- **The URL** carries the experiment as `?brain=rewired-3` and `?lesions=AVAL+AVAR`, left out when the brain is the real wiring and nothing is lesioned. A brain it can't read runs the real wiring, and names that aren't neurons are left out; the app says both. The data and model versions stay with milestone 6's URL state. This corrects "Dropping food" (2026-09-27), whose review moved all of the rest of the URL to milestone 6.

**Review: decisions, settled by the maintainer before the fixes.** Three reviews found no defect in the simulation: the port matches nematode's swap, `World.carry` maps the state correctly, and every figure above checked out. They found:

- **Three design points,** settled as recommended: signed and unsigned connections swap apart, voltages carry relative to their thresholds, and the experiment's status moves into the plate's controls (above).
- **Fixed as recommended:**
  - the badge's wording (above);
  - a tap made during a swap was announced but lost, since it reached the old GPU world after its state was read; it now waits for the world that runs on;
  - "Restore all"'s accessible name lacked its visible label (WCAG 2.5.3);
  - a change that failed dropped focus from the inspector, and its last word was that the change was made; now focus stays, the graph's word on it is dropped, and the plate says what was undone;
  - with the graph alone, nothing in text said which neurons were lesioned;
  - restoring the last lesion from the inspector was announced twice; the new buttons and the brain control were small on touch screens; a replacement GPU world that failed to take its field wasn't destroyed; a link's brain had to be lower case; the plate could speak after it stopped;
  - guards: a world refuses rewired data, whose touch currents would come from the rewiring (§4.2), and a carry refuses a state from another world;
  - tests: the rewirings pinned, the signed degrees, the nullcline by its formula, the refusals, and the parity case found by name;
  - stale text: FIDELITY.md's status, PLAN §1 and §5.2, and the visual view's comment, which gave DD3 a link to VB6 it doesn't have.
- **Found and left.** The first commit's message puts the swap's pause "well under a frame's worth", where 7 to 26 ms reaches past a frame at 60 a second; pushed history isn't rewritten. While a swap builds its GPU world, a GPU validation error from elsewhere would fall in its error scope and be reported as the swap's failure; nothing is known to raise one.
- **Changed after results: GPU parity's contrast-brain case.** The review asked for AWCL, AWC-ON at the case's seed, among its lesions, to check a lesioned AWC-ON on the GPU against the CPU. With it, on the new rewiring 1, the state at 6.5 s failed its one-second check: the GPU's voltages ended 2.33 times their threshold away.
  - Traced: VB8, a B-type, fires near step 385 on both sides, and whether VB7 fires after it turns on 0.01 mV. CPU runs with every voltage nudged by ±0.01 mV at step 370 fired VB7 in 3 of 6, each ending at −34.2 mV, where the GPU's VB7 ends. The GPU's usual differences are of that size.
  - The rule's reference, the CPU at the GPU's solver tolerance, moved VB8's firing by 2 steps without tipping VB7, so the state was graded.
  - With the maintainer's approval, AWCL was dropped: the case keeps its four lesions, which pass. A lesioned AWC-ON stays checked on the GPU by the loop's API, whose odour then reaches no neuron. The rule is unchanged.
  - Considered: grading only states that such nudges leave alone, a rule change for every setup; and moving AWCL to another setup.

**Built.**

- **Checked.**
  - Each of the ten rewirings makes all of its 31,410 signed and 5,300 unsigned swaps, in 37,866 to 38,169 and 6,897 to 7,069 attempts, moving 3,647 to 3,658 of the 3,671 connections that aren't autapses. Tests check each one's degrees, signed and all, its neurons' outputs, the autapses, that no self-loop or repeated connection appears and no signed connection swaps with an unsigned one, that it draws as pinned and apart from the others, and that the cap stops a graph with no swap to make.
  - `World.carry` into the same brain is a restore with the integrator restarted; into a lesioned brain it keeps every neuron and the survivors' oscillators and pulses; back into the intact brain it starts a restored oscillator on its nullcline; into the contrast brain it keeps each neuron where it was against its threshold, lands a resting worm at rest, and runs 1 s on without a failed solve.
  - The experiment's URL, its store and the inspector's rows each have tests; 625 tests pass.
  - GPU parity gains a case: the registry's values on rewiring 1, with AVBL, VB6, ALML and SMDDL lesioned, so the GPU runs a rewired network, fewer oscillators and receptors, and an SMD down. It passes, with every other check, in headless Chrome on the Mac's GPU and on CI's software GPU.
  - In headless Chrome on an M5 Max, a lesion, swaps, a burst of four swaps and "Restore all" run with no error, and a swap holds the worm for 7 to 26 ms. Corrected after review: headless Chrome paces its own frames, so its 60 frames a second after them says the page kept up, not what a display shows; the check in a window (CLAUDE.md) wasn't made. A tap during a swap reaches the new world's buffers, and a change made to fail leaves focus on the inspector's button, the URL as it was, and one word on it. At 390 × 844 the controls clear the header.
  - The visual tests gain a view, `experiment`: VB6 selected on rewiring 1, with two gap-junction partners, a rewired partner and a neuron it doesn't connect to lesioned. On its first run every other view matched its baseline exactly, and this one had none; its baseline came from that run's artifact. After review, rewiring 1 and the view's lesions changed, and its baseline was taken again from CI.

**Status.** Built and revised after review. Checkpoints 5 and 6 stay not reached. A pull request of its own declutters the app on small screens next.

## 2026-09-30 — The app, decluttered for small screens

**Why.** On a phone held upright each view had half the screen, about 330 to 420 px, and the plate's twelve controls wrapped into four rows of 44 px buttons over its notice and its worm; on the smallest phone they hid the notice altogether. On a phone on its side they covered most of the plate. The maintainer asked for a pull request of its own after milestone 5 to declutter the app and improve it overall.

**Decision.** The maintainer chose among the options set out before the build:

- **Both views stay on screen,** stacked on a phone held upright and side by side otherwise, each compacted to fit. Considered: one view at a time behind a switch.
- **The controls are a bar and the rest.** The bar shows play, the speed and the worm's time, and on a wide pane the seed. The rest sit in labelled groups: Restart and New worm; Touch, Front and Back; Food, Add and Clear; and Brain.
  - On a pane wider than 34rem they show inline, the speed as one segmented control.
  - On a narrower pane, a phone's or half of a phone on its side, the speed becomes a menu, the seed is left out, and the rest sit in a panel behind More that opens above the bar. Escape, a press outside the controls or any action in it closes the panel, the keyboard's place going back to More unless the action moved it.
  - Each button's visible label stays within its accessible name, as "Front" within "Touch front, where ALM and AVM sense".
  - Considered: the bar and More on every screen, which would cost a desktop a click for Touch and Food; and every control inline, smaller, which still takes a phone two or three rows.
- **The notice keeps to its first sentence and its link on a narrow or short pane:** "Crawling doesn't yet emerge. Why". The rest of the sentence stays on wider panes, and the link still leads to VALIDATION.md, so the app says from its first view of the body that crawling doesn't emerge, as milestone 0c's outcome asks (PLAN §9). A pane under 36rem tall, such as a tablet's half, also leaves out the lede.
- **The graph on a short pane** gives the brain it shows in a short form, and folds its key behind a Key button.
- **The credits on a narrow or short graph pane** keep to one line, "Connectome: Cook et al. 2019 (CC BY 4.0). All credits", the button showing the rest in place and "Fewer" folding it again. CC BY 4.0 lets attribution be given in any reasonable manner for the medium, and the connectome's source and licence stay on show. Added at the maintainer's request after the first push, where the credits took three lines on a phone; considered: the rest in a modal, a layer further from the page.
- **Tidied throughout:** the grouped controls and segmented speed above, one style for the selects, and the long and short forms of the experiment's status shared by both views.

**Checked.** In headless Chrome at 375 × 667, 390 × 844, 844 × 390, 768 × 1024, 1024 × 768, 1280 × 800 and 1440 × 900, in the split, the plate alone and the graph alone: the header and the controls clear each other at every size, by 53 px at the least, on the tablet held upright. The panel opens and closes by keyboard and by touch, and an action in it closes it. The speed menu and the speed buttons stay in step, and no page reports an error. The credits take one line on a phone and on a phone on its side, three when opened, and three on a desktop, where they aren't folded. The visual tests capture the canvases alone, so their baselines stand.

**Status.** Built.

## 2026-09-30 — The glow: GCaMP6s kinetics on the model's activation (set before its build; revised after review)

**Why.** Milestone 6 opens with the glow (spec §7): "render neuron activity as a calcium-imaging-style glow … Filter model activity through published GCaMP kinetics (e.g. Chen et al. 2013). Label it as simulated, never as imaging data, and document how it is normalised." The maintainer set the order of milestone 6's pull requests: the glow; then "About the science"; then the rest of the URL state, the data and model versions and the note that trajectories differ across GPUs; then performance and the Safari check; then the docs and a complete `VALIDATION.md`. The maintainer also chose the glow's source, its scale and what the graph alone does, before any of it was built.

**Decision.** The rules are in PLAN §1 ("The glow"). In short:

- **The source is each neuron's activation φ(V − V_th),** the model's own measure of how active a neuron is, as calcium in graded neurons tracks depolarisation. Considered: the synaptic activation s, which the synapses have already smoothed, so the filter would smooth it twice; and the voltage above rest, unbounded, so the SMDs at ±210 mV would set the scale.
- **The filter is GCaMP6s's,** an indicator widely used in whole-brain _C. elegans_ imaging: Nguyen et al. 2016 (PNAS, doi 10.1073/pnas.1507110112), Venkatachalam et al. 2016 (PNAS, doi 10.1073/pnas.1507109113), Hallinen et al. 2021 (eLife, doi 10.7554/eLife.66135), Yemini et al. 2021 (Cell, doi 10.1016/j.cell.2020.12.012) and Randi et al. 2023 (Nature, doi 10.1038/s41586-023-06683-4); a research pass checked each paper's variant and DOI, the DOIs against Crossref. Corrected after review, which found no count behind "mostly": others use GCaMP5K (Schrödel et al. 2013), 6f (Kaplan et al. 2020) or 7f (Atanas et al. 2023), and the five above come from three labs.
  - Chen et al. 2013's Supplementary Table 3 gives GCaMP6s, after one action potential in mouse V1 in vivo, a rise to peak of 179 ± 23 ms and a half-decay of 550 ± 52 ms (read from the PMC author manuscript's supplement, and confirmed by a review; the error bars are s.e.m.).
  - Two first-order stages in series reproduce both with time constants of 70.6 and 686.0 ms, derived here, taking the half-decay from the peak; the text read doesn't say where it is measured from. Measured from the action potential, they would be 98 and 380 ms; a review read Chen et al.'s Fig. 3d, whose mean trace stays near half its peak about 0.8 s after it, as favouring the peak, by eye. A single stage with the half-decay alone, 793 ms, would have no rise.
  - The kinetics are the cytosolic indicator's in mammalian neurons with action potentials, in mice warmed to 37 °C (corrected after review: the cortex's own temperature isn't reported). Hallinen et al. 2021 and Randi et al. 2023 image a nuclear-localised GCaMP6s, where Chen et al. measured the cytosolic indicator.
  - Corrected after review, which found the first wording too broad: single-cell biophysical models of worm neurons compute calcium from their channels, as Nicoletti et al. 2019 do for AWCon and RMD (PLOS ONE, doi 10.1371/journal.pone.0218738), but no published mapping takes the voltages of a graded network model like this one to a worm neuron's calcium. Randi et al. 2023 fitted ΔF/F linearly to a Kunert-style model's peak ΔV, with no kinetics. Worm neurons' GCaMP6s signals decay over seconds, in ALM at 8.4 ± 5.0 s (Ding et al. 2023, now registered), which is the cell's calcium as well as the indicator. The ledger says so, and the app labels the glow as simulated.
- **One fixed scale:** every neuron on the same scale, brightness as the square of the filtered activation, so quiet neurons look quiet and brightness compares across neurons and over time. Considered: each neuron scaled to its own recent range, as imaging displays often are (Nguyen et al. 2016 normalised the ratio of GCaMP6s to RFP by its lower 20th percentile, corrected after review from "F0"; Yemini et al. 2021 took F0 as the 5th percentile), which makes small wobbles look as large as real activity.
- **The graph alone runs the worm unseen,** so it glows as it does beside the plate. Considered: no glow there.
- **Presentation, not model.** The glow reads the model and feeds nothing back, so its constants are display choices outside the parameter budget (§6.2), recorded with their source in the ledger's presentation notes.
- **The visual tests** keep their graph views on class colours, and gain one of the glow from a paused worm at a fixed seed and time.

**Built.**

- **What the build settled that the rules left open.**
  - The glow's value is kept in f64: in f32 each stage stalled about 10⁻⁶ short of a steady input, where its change per frame fell below the value's rounding.
  - A lesioned neuron, which keeps running cut off from the network, has no halo, its synapses aren't lit, and the inspector gives its activity as "none, lesioned".
  - The inspector gives the selected neuron's activity as a share of full activation, marked as simulated (spec §6: "current activity").
  - The glow's halo is a soft disc of GCaMP green added in a pass of its own, reaching 3.2 of the neuron's radii from its centre (corrected after review from "three radii across"); a neuron's brightness runs from 6% of the green at no activity to all of it.
  - The plate's readiness waits for the glow's first reading, so a paused worm's glow shows, and the graph takes up a reading published before it started.
  - `?colour=class` starts the graph on class colours; with the graph alone it also leaves the worm unrun, as the visual tests' class views need.
- **Checked.**
  - The filter peaks 179 ms after a brief pulse and falls to half 550 ms later, and holds a steady activation as itself.
  - In headless Chrome on an M5 Max, the split view and the graph alone glow, a selected neuron's activity reads in the inspector, and a phone's layout keeps its room; no page reports an error. The plate holds 60 frames a second at 1× and at 10×, the worm keeping pace, as before the glow; headless Chrome paces its own frames, so that says the page keeps up, not what a display shows.
  - The visual tests' graph views stay on class colours, so their baselines stand; the glow's view took its baseline from CI's first run, at 3ac6933.

**Review: decisions, settled by the maintainer before the fixes.** Three reviews found the kinetics, the derivation, the sigmoid, the readback and the halo's pipeline sound, and every DOI right. They found:

- **Three design points,** settled as recommended:
  - **The glow at high speeds.** The glow is read once a frame, and each reading was held over the frame, the second stage advanced from the first's new value: at 10× a reading spans about one GCaMP rise, and a step's response erred by up to 0.22 of full scale. Now the filter holds the mean of two readings and advances both stages exactly for it: at most 0.09 at 10× and 0.01 at 1×, measured against the exact response to a step landing anywhere within a frame, and tested at a true 10× frame. The limit is stated in PLAN §1. Considered: filtering at every step on the GPU, exact at any speed but a change to the brain's kernel and its parity checks for a display.
  - **Neurons findable while glowing.** At rest a neuron's brightest pixel stood at 1.96:1 against the background, and about 230 of 302 sit at or below rest, so the connectome's shape and the neurons a viewer clicks faded out. Every neuron now has a faint neutral rim while the graph glows, its fill still on the one fixed scale. Considered: raising the glow's floor, which compresses the scale.
  - **The glow asked for with no worm running.** With the graph alone on class colours no worm ran, and choosing Activity did nothing; now it starts the worm unseen. Considered: disabling the choice.
- **Fixed as recommended:**
  - a lesioned neuron's hollow outline, drawn at the glow's floor, measured 1.03:1 against the background; it is drawn in the rim's grey;
  - the inspector showed no activity for a neuron selected by the URL, since it was rebuilt before its activity was set; and it rewrote the activity sixty times a second, now only when the words change;
  - the plate's readiness waited for ever if the first reading failed; with the graph alone, a change that couldn't be made was undone silently, and the graph waited for the unseen worm before it drew;
  - the claims above, and Ding et al. 2023 registered for the ledger's note;
  - the loading page's "will glow", the halo's size, "±200 mV", the order of milestone 6's pull requests, the ledger's visuals subsystem and FIDELITY.md's status line;
  - tests: the rise against the two stages' exact response, the error at a true 10× frame, the activation against the model's rest, the scale's brightness and halo, the activity channel, and the glow's green agreeing wherever it is written;
  - the Colour-by control a fieldset with visible focus, "simulated" kept on the folded key, the legend's ramp following the brightness, and the graph's description naming its colours; halos with no glow culled before any fragment, and the graph's buffers grown by half again.
- **Found and left.** With the plate alone, the glow is still read each frame though nothing draws it; the cost is a copy of 11 KB a frame.

**Status.** Built and revised after review.

## 2026-09-30 — About the science: the ledger in the app (set before its build; revised after review)

**Why.** Spec §1.3: "Surface the same registry in the app. An 'About the science' view shows each subsystem's level". It is milestone 6's second pull request (the entry on the glow). The maintainer chose its form and content before it was built; this entry was written with the build.

**Decision.**

- **A dialog over the views.** An "About the science" link in the plate's header, or in the graph's when it is alone, opens a native modal dialog over the running worm, full screen on a phone held upright. Escape, Close or a press on the backdrop closes it, and the keyboard's place goes back to the link that opened it. `?about=science` opens it from a link, and the URL carries it while it is open. Considered: a page of its own, `?view=about`, replacing the views.
- **The whole ledger, folded.** From the same registry and the same helpers as FIDELITY.md (`src/science/ledger.ts`, moved out of the page's builder so both use them):
  - the scale, each level with its meaning and example;
  - every subsystem with its levels, what's solid, what isn't and what would raise it, and its components folded beneath it, each with its basis, caveats, upgrade, checks and linked sources;
  - the biology left out and the presentation's choices, with their sources;
  - what the model is tuned and tested against: the calibration's targets and the checkpoints' reference data, folded (added after review);
  - the free-parameter count against the budget, with every parameter folded by group, its value, level, notes (its rule, what it is calibrated against, its bounds and its conductance form's entry), upgrade and sources (widened after review from a table of value, unit and level);
  - the works the ledger cites, with their DOIs, and links to FIDELITY.md, VALIDATION.md, DECISIONS.md and PLAN.md.

  Considered: the subsystems alone, with a link to FIDELITY.md for the rest.

- **One status, shared.** The status that heads FIDELITY.md heads the view too, from one function, `ledgerStatus` in `src/science/ledger.ts`, which also works out the calibrated values it names, so the two can't drift. It was rewritten to read as a summary where the old one was a log of track R's rounds: what the model and the app do; that crawling as checkpoint 1 asks for it does not yet emerge; that no fit R's rules could choose reaches partial, the chosen refit holding at half the time step but failing checkpoint 1 and round 3's crawlers changing at half the step, while one probe search found a partial crawler that holds, which the rules didn't let R choose; that the negative result is the headline, and what it is, a best crawl paced by the head switch, relayed by proprioception and largely indifferent to the chemical wiring; where checkpoints 0 and 1 stand; and that "Tested by" lists planned checks. FIDELITY.md keeps one sentence of its own after it, on its figures. Considered: no status, a link to VALIDATION.md only.
  - Corrected after review: the first rewrite said R found no model both crawling as checkpoint 1 asks and holding at half the step, which the probe's crawler contradicts (the entry "After review: what round 2's fits are", 2026-09-29); it said "does not emerge" where the notice, the ledger and VALIDATION.md say "does not yet emerge"; its "AWC-ON's sense of odour and touch" read as though AWC-ON sensed touch; and it left out the caveat on "Tested by", which the app then lacked.

**Built.**

- The registry's text carries three marks, **strong**, _emphasis_ and `code`; a pure tokenizer in `src/science/ledger.ts` reads them, emphasis only where no letter, digit or underscore of any script stands beside it, so symbols such as κ_gap,B stay as written, and the view makes elements of them. A level, a range such as 5–4 or a tag shows as a badge like the inspector's, whose face assistive technology doesn't read; it hears "Levels 5 to 4" instead.
- The app now imports the ledger, so CI redeploys the site and runs the visual tests when it changes; its tests of which jobs run say so, where they had held that no page imports it.
- **Checked.** In headless Chrome at 1440 × 900, 390 × 844 and 320 × 640, from the link and from `?about=science`, in the split view and with the graph alone: every subsystem, 11, and every component, 40, is shown; the body takes focus on opening, so Space scrolls it; a drag across the dialog's edge leaves it open while a press on the backdrop closes it; Escape closes it, clears the URL and gives the keyboard's place back to the link, or to the page when a link opened it; nothing overflows sideways with every fold open; no page reports an error. FIDELITY.md opens with the shared status, which a test checks against the page; the tokenizer is tested on every text the view shows; and `?about=science` is read and written by tested helpers. The visual tests capture the canvases alone, so their baselines stand.

**Review: decisions, settled by the maintainer before the fixes.** Three reviews found the refactor clean, FIDELITY.md changed only in its status, every count right and every DOI resolving. They found:

- **One design point,** settled as recommended: the view showed less than "the whole ledger", without the calibration's targets, the reference data or each parameter's source, bounds and notes, so a calibrated value never said what it was tuned to, and 13 of the works it listed were attached to nothing it showed. They are added, folded. Considered: keeping the view lean and saying so.
- **Fixed as recommended:** the status (above); the body, not Close, takes focus on opening, since Space pressed Close and the arrows couldn't scroll; a drag from inside the dialog to its backdrop closed it; the view overflowed sideways on a phone and at 320 px, where the scale's labels squeezed their meanings; the link sat against the search field with the graph alone; a click before the views were ready could lose the link that opened it; badges read as bare glyphs; Close and the link were small to touch; the graph's `/` was held back inside the dialog; links opening a new tab now say so; the dialog is built within the start's failure handling; and "from each view's header" in README and PLAN, which holds only with the graph alone.

**Status.** Built and revised after review.

## 2026-09-30 — The shareable URL: the versions, and what a link can't promise (set before its build; revised after review)

**Why.** Spec §6: "Shareable URL: encode lesions, brain, food positions, random seed, and model and data version, so people can link to an experiment. A link reproduces the setup, but the trajectory can differ across GPUs; the app says so." The URL has carried the food and the seed since milestone 4, and the brain and the lesions since milestone 5 (corrected after review, which found the seed a milestone earlier); the versions and the note are milestone 6's third pull request (the entry on the glow). The maintainer chose what the model version is, what a link from another version does, where the note on GPUs goes, and that a link's notes are shown, before any of it was built. A survey before the choice found that what a link held and the app couldn't read, food or a neuron's name, was announced to screen readers alone, and with the graph alone the food's note not at all (corrected after review from "not at all": the graph alone announced the rest itself).

**Decision.** The rules are in PLAN §1 ("The shareable URL"). In short:

- **The model version is a number the code keeps,** `?model=1`, raised whenever a change moves how the worm behaves in a setup on the same data. A test guards it (corrected after review from "holds it to that") with a fingerprint of five short runs of the app's world on the CPU reference, each pinned with the model and data versions it was taken at, and no pinned entry is ever changed. It changes only when the behaviour does, and reads as a version. Considered: the build's commit, exact and checkable, but new with every deploy, so every older link would warn though nothing that matters changed; and the last commit to touch the simulation's sources, which a comment's edit also moves, and which CI's shallow checkouts can't find.
- **The data version is a digest,** `?data=` and the runtime file's `meta.version`: the first eight hexadecimal digits of the SHA-256 of the file's neurons, muscles and connections, which hold everything the model reads, so a change to `meta` alone, its references, licences and input digests, leaves it. Corrected after review: it said "what the model reads", but the connections' citations, the neurons' positions for the graph and the like are in it too. It is written by the data build, which can compute a SHA-256 where the browser can't always (a page served over plain HTTP has no `crypto.subtle`). Considered: the schema's version, `wormlight/1`, which a rebuild from new pins would keep.
- **A link from another version runs, and says so.** Its setup runs on this version, and a note names both versions: the worm may behave differently from when the link was made. The address bar then carries this version. A link with no versions, such as one made before they were added, is taken as it is. Considered: asking before running, when only one version is ever deployed, so the answer could only be to run it; and recording the versions without comparing them.
- **The note on GPUs** sits beside a new "Copy link" among the plate's controls, behind More on a narrow pane (corrected after review from "in the More controls"), and in a short part of About the science on links, which also names the versions running. Considered: About the science alone, which few who share a link would read; and a line whenever a link is opened, on every shared visit.
- **A link's notes are shown.** What a link held and the app couldn't give, food it couldn't read, a brain or neurons it lacks, another version, is shown in one line in the plate's header, or the graph's when it is alone, which can be dismissed, and announced as before. Considered: showing the version's note alone.

**Built.**

- **What the build settled that the rules left open.**
  - The model version starts at 1, pinned with data `4dc6ffca`. The fingerprint's runs are 2 s each, on seeds 1 to 5: the intact worm on the first lawn's field; the third rewiring with AVAL, AVBR and SMDDL lesioned; a touch at 0.1 of the body after 0.5 s, which reaches ALML, ALMR and AVM; the nose set at the wall and facing it, which holds its centre about 5 µm inside, a radius from the wall; and an empty dish. Each array of the state is summed as it stands and weighted by place, so that values trading places show too. The test takes under half a second on an M5 Max. Changed after review (below): the runs, and the parts of the state summed.
  - The data build writes the data's version into `meta` after the schema, and the runtime file changes in that line alone.
  - A version a link gives that isn't a number or eight hexadecimal digits is called unreadable and isn't repeated, so a link can't put words into the note; an empty one counts as none.
  - "Copy link" copies the address bar's link. The note beside it reads "Same setup; the path can differ on another GPU." A copy also says, for eight seconds in the link's note, "Link copied. It sets up this experiment afresh; on another GPU the worm's path can differ.", since on a narrow pane the copy closes the panel that holds the button. Where the page can't reach the clipboard, as over plain HTTP, it says the address bar holds the link. Changed after review (below): a copy is confirmed on the button, and the panel stays open for it.
  - The note's text sits in a status region that is in the page from the start, so it is announced when it appears. Dismissing it from its button gives the keyboard's place to About the science's link. The notes the plate announced now come from the app's start, which shows them once the views are up. Changed after review (below): the note is one line, with Details.
- **Checked.**
  - Each of the twelve calibrated parameters, changed by one part in a million, moves the first run's print. Nudging every seventh neuron's voltage and one rod's position by a last bit leaves the first run's print on each of seeds 1 to 20 as it was.
  - In headless Chrome on an M5 Max, at 1440 × 900, at 390 × 844 and with the graph alone: a link with other versions, food it couldn't read and a name that isn't a neuron shows all three notes in one line, and in the split view the address bar then holds this version and drops what couldn't be read; a plain link and one with these versions show none. Dismissing gives the keyboard's place to About the science; "Copy link" puts the address bar's link on the clipboard; on a phone the copy closes the panel and the note says so for eight seconds, while a link's note stays. About the science names model 1 on data `4dc6ffca`. Nothing overflows sideways, and no page reports an error.
  - One link run twice to 20 s, paused, in headless Chrome on the same Mac drew the plate identically, pixel for pixel; another seed didn't. That is one GPU and one browser, not a promise across them.
  - The visual tests capture the canvases alone, so their baselines stand.

**Review: decisions, settled by the maintainer before the fixes.** Three reviews found the digest, the rounding, the wall's run, the order of the URL's writers and the version notes sound, and every figure checked right but those corrected above. They found:

- **Three design points,** settled as recommended:
  - **The note was too big.** Its full text, up to about 290 characters, covered the worm on a laptop at 1366 × 768, ran under the controls on a phone, was cut off at 320 px wide, and with the graph alone pushed Find under the footer. It is now one line, whose Details unfold the whole, and shorter still on a short pane, "Link from another version." or "Link partly unreadable."; unfolded, the details lie over the controls and scroll within a third of the pane. Considered: the full text in a header of capped height, and a short form on small panes alone.
  - **A copy wiped a link's note.** The copy's timed note replaced the link's and then cleared, moved the keyboard's place when it expired and ignored a pointer over it. A copy is now confirmed on the button, "Copied" for 3 s, and announced; a failure says why beside the button; on a narrow pane Copy link leaves the panel open, so its button is seen. The link's note is left alone. Considered: the timed note, bringing the link's note back after it.
  - **An edited pinned entry passed.** The test caught only a repeated pair of versions, and with one entry its rule never ran. The entries moved to `tests/model-versions.json`, and a step in CI's checks job fetches `main` and fails unless every entry `main` pinned is still there, unchanged (`scripts/ci/versions.ts`). Considered: calling it a convention kept by review.
- **Fixed as recommended:**
  - a link could put its own words on the page: an unknown brain and every word of the lesions were repeated, at any length, once only announced and now shown. The note now repeats nothing but up to three words shaped like a neuron's name, and breaks any long word;
  - with the graph alone, the link's note was announced twice, by the graph's own live region too;
  - with `?about=science` the note was never announced, filled as the dialog hid the page from assistive technology; it now appears when the dialog closes;
  - the runtime data was fetched through the browser's cache, which GitHub Pages lets keep it ten minutes, while the code is named by its hash: after a deploy, a returning visitor could run the new code on the old data, which lacks `meta.version`, and fail to start. The data is now checked with the server on every load;
  - More's accessible name now lists the link; Copy link's name is its visible text; its width holds on a touch screen;
  - the open More panel on a phone spilled above the pane at 320 × 640, 360 × 740 and 844 × 390, hiding Restart and New worm; it now stops at the pane's top and scrolls, and the hint wraps beside Copy link rather than beneath it;
  - the fingerprint hashed the state's field names and bookkeeping, so a refactor moved it; it now sums parts named in the test. It missed a touch at the back, lesioned motor neurons, touch receptors and AWC-ON, and the field's stepping after food changes: its second run now lesions VB6, DA5, AWCL, AWCR and ALML beside the rest and touches the front, the third touches the back after the front, and the fifth drops a lawn 2 mm ahead of the nose after 0.48 s, the field stepped in the app's blocks. The prints were taken again before any merge;
  - `?model=` with leading zeros past nine digits read as unreadable;
  - the wording: "the worm's path" for "the path"; "model version" and "data version" in the note; "The app runs" in About the science's part on links, now called "Sharing a link";
  - this entry, as marked above; PLAN §1 and §6.1, and CLAUDE.md.
- **Found and left.** With the graph alone on class colours the plate never starts, so no seed is written, and food that couldn't be read stays in the address bar until the viewer asks for the glow. With the graph alone there is no Copy link, and About the science alone says what a link can't promise. At 1366 × 768 the note's line still covers the top of the worm, which sits at the pane's centre; it can be dismissed. A change to both the model and the data can keep the model version without the test noticing, which is left to review.
- **Checked after review.**
  - Each of the twelve calibrated parameters, changed by one part in a million, moves the first run's print, and last-bit nudges leave it on each of seeds 1 to 20. The second run's touch reaches ALMR and AVM, ALML lesioned, and its AWC-ON, AWCL, is lesioned; the third's reach ALML, ALMR and AVM, then PLML and PLMR; the fifth's lawn lies in the dish, and AWC-ON takes current once its odour arrives.
  - In headless Chrome on an M5 Max, at 1366 × 768, 390 × 844, 320 × 640 and 844 × 390, and with the graph alone at 1440 × 900 and 320 × 640: the note is one line on the phones, clear of the controls, and two on the laptop; its Details unfold it; none of a link's own words appears; nothing else announces it; with `?about=science` it appears when the dialog closes; dismissing it gives the keyboard's place to About the science. The open panel stays within the pane, and after Copy link it stays open, reading "Copied", the keyboard's place on the button.

**Status.** Built and revised after review.

## 2026-09-30 — Performance and the Safari check (set before their runs; run; revised after review)

**Why.** Spec §3: "Target: steady 60 fps on an Apple M-series laptop in Chrome and Safari, with simulation running at least real time. PLAN.md also sets a fast-forward target sized so a typical chemotaxis run … plays in a couple of minutes." PLAN §1 sets that target at 10× real time, sustained in Chrome, and milestone 6's exit asks for it met or its shortfall logged, and for a Safari check (PLAN §8: milestones 3 and 6 each include one). The benchmark so far runs in headless Chrome, which paces its own frames, so it says what the GPU and the page sustain, not what a display shows: on `main` at e5fe79b it holds 60 frames a second from 1× to 30× and reaches about 35× when asked for 50× (run before these rules were set, as the survey that prompted them). Safari's whole step alone ran at about 11× at milestone 3, and the app has not been timed in it. Parity in Safari ran at milestones 3 and 4 and through track R, last on 2026-09-29, but not at milestone 5, whose lesioned contrast brain it had never run (corrected after review from "at every milestone since the third"); the app's pages in Safari have been checked by nobody but the maintainer's eye. This is milestone 6's fourth pull request. The maintainer chose the check's scope, how the frame rate is measured and what a shortfall means before any of it ran.

**Decision.**

- **The frame rate is measured in real windows.** `npm run plate:bench` gains a visible Chrome window, `--window`, and Safari, `--safari`, through safaridriver (`scripts/safari.ts`), beside headless Chrome. Each loads the built app in its default split layout at 1×, 10×, 20×, 30× and 50×, lets it settle for 3 s and reads the plate's rates each second for 6 s, as the benchmark already does. A browser holds a speed if every one of those seconds has at least 57 frames and the worm's time runs within 2% of the speed asked. The spec's frame rate is judged at 1× in both browsers, and PLAN's fast-forward target at 10× in Chrome; the rest are recorded. Considered: headless Chrome, with the maintainer reading `/?stats=1` in each browser by hand.
- **The Safari check has two parts,** both scripted, on the Mac's GPU:
  - GPU parity's short checks, `npm run gpu:parity:safari`, every setup, the contrast brain's lesioned one among them, passing as they must in Chrome;
  - the app, `npm run app:safari`, new. It drives the built app in Safari through safaridriver: the split view, the plate alone and the graph alone; a link with lesions and a rewiring, and one with food; About the science from a link; a link's note; a touch from the controls; the brain swapped live; a neuron lesioned live from the inspector; and Copy link. It passes if every page becomes ready and reports no error once it is (corrected after review from "no error": the driver can't see what a page logs while it loads), the worm's time advances, and each scenario's own check holds: the dialog opens, the note shows, a swap or a lesion takes effect, and so on. It saves a screenshot of each for the maintainer to look over.

  Long-run parity in Safari, last run at milestone 4 (2026-09-27, "AWC-ON senses butanone"; corrected 2026-09-30, with the docs, from "milestone 3"), isn't run again. Considered: long-run parity too, 20 to 40 minutes with Safari's window kept uncovered; and parity alone, as at earlier milestones.

- **A shortfall is logged.** The 10× target is set for Chrome (PLAN §1). Safari's rates are recorded whatever they are. A shortfall in either browser is logged rather than paid for with accuracy, and only measured wins that leave the model alone are taken, such as not reading the glow back while nothing draws it. Considered: optimising until Safari holds 60 frames a second at 10×, which could reach the kernels and their parity.

**Results.** On an M5 Max, with the app's code as on `main` at e5fe79b, before the cap the review brought (below), in Chrome 154.0.8037.59 and Safari 26.6.2.

- **The frame rate,** `npm run plate:bench` in the split layout: frames a second, and whether the speed is held.

  | Speed asked | Headless Chrome                 | Chrome, a window                | Safari, a window                 |
  | ----------- | ------------------------------- | ------------------------------- | -------------------------------- |
  | 1×          | 60, held                        | 120, held                       | 60, held                         |
  | 10×         | 60, held                        | 120, held                       | 60, held                         |
  | 20×         | 60, held                        | 120, held                       | 60, held                         |
  | 30×         | 60, held                        | 120, held                       | 8.2, the worm at 24.6×: not held |
  | 50×         | 36, the worm at 35.0×: not held | 42, the worm at 38.8×: not held | 4.9, the worm at 24.6×: not held |

  Each window runs at the pace its browser keeps on the Mac's 120 Hz display: 120 in Chrome, 60 in Safari. The spec's frame rate at 1× holds in both browsers, and PLAN's 10× in Chrome; Safari holds it too, and 20×.

- **No shortfall; Safari's collapse beyond the target, recorded** (relabelled after review from "The shortfall, logged": both targets are met). Asked for more than the GPU can step, the worm runs slower than asked, as the pacer intends (2026-09-26, "The plate view"; `src/ui/pacing.ts`), but in Safari the frames collapse too: asked for 30× or 50×, it steps about 25× and draws 5 to 8 frames a second, where Chrome, saturated, still draws 36 to 42. A review found where it starts: Safari holds 23×, draws 38 frames a second at 24×, and 10 at 25×. The pacer lets a frame run up to a tenth of a second's worth of steps at the speed asked, 1,200 at 30× and 2,000 at 50×, and its frames then come about 120 and 205 ms apart, one as each batch finishes, most likely waiting for a drawable, which wasn't profiled. The app's own speeds stop at 10×, so only a link's `?speed=`, there for benchmarks, reaches it. Left: holding the frames there would take a pacer that budgets each frame by the GPU's measured throughput, with feedback that can oscillate, which isn't a cheap win. **Wrong, as a review showed by measuring (below): a plain cap on a frame's batch holds them, and is taken.**
- **The cheap win tried, and not taken.** The plate alone draws no glow, but reads the neurons back for one each frame. With the plate alone and that reading left out, headless Chrome asked for 50× stepped 35.0× against 37.1× with it, and Safari asked for 30× stepped 25.1× against 24.5×, one run each: no measured win, and the change was not kept. A review measured the spread that one run couldn't (added after review): headless Chrome stepped 35.0× to 37.2× with the reading over 12 runs and 35.0× to 35.6× without it over 6, and Safari 24.5× to 25.0× with it and 24.5× to 25.1× without, 6 runs each.
- **Parity in Safari,** `npm run gpu:parity:safari`, passes: the brain's 21 one-step states, and 19 of its 21 one-second states, 2 not graded (corrected after review from "40 of its 42", a count that took in the checks beside them); the loop's 312 one-step states, and 131 of its 145 one-second states, 14 not graded, under the quarter; and the odour field's three checks. The contrast brain's lesioned case passes at every sample. The whole step alone runs at 17.8× real time in dispatches of 67 steps, as it did on the refit on 2026-09-28; it was about 11× at milestone 3, on the provisional values (corrected after review, which found the figure already recorded). The app steps faster, 24.6×, as in Chrome: the benchmark's state and its dispatches of 67 are heavier than the app's (2026-09-26).
- **The app in Safari,** `npm run app:safari`, passes all eleven scenarios: the split view, the plate alone and the graph alone; lesions and a rewiring from a link, and food; About the science from a link; a link's note, whose Details unfold; a touch from the controls, announced with ALM; the brain swapped live, the worm running on; a neuron lesioned live from the inspector, which showed its activity first; and Copy link, which copies. Every page became ready and reported no error from then on, and the worm's time advanced (corrected after review from "without an error"). The screenshots show the worm, the glow beside the plate and alone, the lesioned neuron drawn hollow with "none, lesioned", About the science over the views, and the note unfolded.
  - **Changed after a result:** Copy link's first run clicked the button from a script, which Safari doesn't take as a gesture, so it declined to copy and the page said so beside the button, as built; the check, which then took either outcome, passed on the refusal. Clicked through WebDriver's own click, as a viewer's, it copies; the check now clicks that way and asks for "Copied".

**Review: decisions, settled by the maintainer before the fixes.** Three reviews reproduced the table, the app's eleven scenarios and parity in Safari, and found the pacer described rightly. They found two statements above wrong, and gaps in the scripts.

- **A cap on a frame's batch, taken; its rule set before its runs.** The entry said that holding Safari's frames past what its GPU steps "would take a pacer that budgets each frame by the GPU's measured throughput", and that nothing else was tried. That was reasoned, not measured, and wrong: a review capped one frame's batch at 256 steps in a scratch copy, the rest staying owed, and Safari drew 61 to 64 frames a second asked for 30×, 50× and 100×, the worm at about 22×, where it had drawn 5 to 8 at 24.6×. Frames that find the GPU busy run nothing, so capped batches alternate with idle frames and none holds a frame back. It cost saturated speed: Chrome's window stepped about 31× asked for 50×, at 120 frames a second, where it had stepped about 38× at 42, and no longer held 35×. Speeds up to 30× were unchanged in both.
  - **The rule.** A frame runs at most a cap of steps, and what it leaves stays owed within the debt's limit. The cap is the larger of 384 and 256 steps at which Safari's window draws at least 57 frames in every second read, asked for 30×, 50× and 100×; if neither does, no cap is taken. The larger is preferred because a cap is also a ceiling: at 60 frames a second, 256 steps a frame allows 38.4× and 384 allows 57.6×, whatever the GPU. A run depends only on its steps, not on how frames divide them (PLAN §5.2), so the model is untouched.
  - Considered: a pull request of its own; and logging the numbers and keeping the fastest saturated speed.

  - **What its runs gave** (the split layout, Safari's window). At 384 steps Safari's least second had 59.7 frames asked for 30×, 56.7 for 50× and 59.7 for 100×: under 57 at 50×, so 384 fails the rule, by one run and narrowly, and it wasn't run again. At 256 the least were 62.6, 61.7 and 62.7. The cap is 256 steps, `FRAME_CAP` in `src/ui/pacing.ts`, with tests.
- **Fixed as recommended:**
  - the benchmark read the app's own rates, which cover only up to the last frame drawn, so a page whose frames had stopped, as a covered window's do, read as held. It now counts the page's frames itself each second, and the steps the GPU ran over the seconds read; a speed is held by both, and by the app's own rate each second;
  - the Safari check's scenarios could pass on little: the graph alone without checking its worm, a lesion by its URL alone, the lesions' link by one name of two. Every page must now have its GPU go on running steps, read from the GPU, and each view shown draw more than a flat colour, read back from its canvas; the live lesion must show "none, lesioned", the swap its announcement, and both lesions be listed. A failed scenario keeps its screenshot, and a page that couldn't start gives its own reason;
  - "without an error" claimed more than was checked: the driver listens only once a page is ready, so what a page logs while it loads goes unseen. The rules and results now say "no error once it is ready";
  - both scripts idled 50 s after finishing, on a timer the shared time limit never cleared; and the benchmark took any option and any view;
  - this entry, as marked above, and PLAN §1, §8 and §10, where "manual" no longer described a scripted check and the target was called met in Safari, which has none.
- **Checked, not a fault.** Two reviews read the Chrome window as drawing at a device scale of 1 against Safari's 2. Measured, its canvases are 1440 × 1800 and 1438 × 1800 pixels, the display's own, beside Safari's 1440 × 1696 and 1438 × 1696; headless Chrome's are 720 × 900. The benchmark now prints them.

**Results after review,** with the cap, on the same machine and browsers.

- **The frame rate,** in the split layout: frames a second, and whether the speed is held; where it isn't, the worm's speed.

  | Speed asked | Headless Chrome | Chrome, a window | Safari, a window |
  | ----------- | --------------- | ---------------- | ---------------- |
  | 1×          | 60, held        | 120, held        | 60, held         |
  | 10×         | 60, held        | 120, held        | 60, held         |
  | 20×         | 60, held        | 120, held        | 60, held         |
  | 30×         | 60, held        | 120, held        | 63, at 21.8×     |
  | 50×         | 60, at 33.0×    | 119, at 30.8×    | 63, at 21.7×     |

  The least second had 59.7 frames or more in headless Chrome, 119.5 or more in Chrome's window at the speeds held and 117.6 past them, and 59.6 or more in Safari. Safari holds 23×, and asked for 24× steps 21.8× at 63 frames a second; Chrome's window asked for 35× steps 30.9× at 119. Past what a GPU can step, the frames now hold and the worm runs a little slower than it did: Safari 21.7× for 24.6×, Chrome's window 30.8× for 38.8×, headless Chrome 33.0× for 35.0×.

- **The app in Safari** passes all eleven scenarios under the stronger checks. Run in headless Chrome, the common checks fail as they should on a paused page, whose GPU runs no step, and on the graph alone with no worm.
- **Found and left.** The cap is a ceiling too: at 60 frames a second it allows 38.4×, so a GPU that could step faster is held to that by a link's `?speed=`; the app's own speeds stop at 10×. The drawing check reads each view back as the visual tests do, which shows the GPU can draw it, not what reached the screen; the screenshots show that. Why Safari draws no frame while a long batch runs wasn't profiled.

**Status.** Both checks pass. The spec's frame rate holds at 1× in both browsers, and the fast-forward target is met in Chrome; Safari, where no target is set, holds 10× and up to 23×. Past what its GPU steps, each browser now keeps its frames and runs the worm slower than asked. Revised after review.

## 2026-09-30 — The docs, a complete VALIDATION.md and an audit against the spec (set before its work; built; revised after review)

**Why.** Milestone 6 ends with the docs (spec §9, §10) and its exit asks for `VALIDATION.md` complete (PLAN §9); it is the milestone's fifth pull request, and the project's last planned one. A survey found `VALIDATION.md` with checkpoints 0 and 1 in full, §7.2's comparison, and every graded quantity labelled as a calibration target or predicted, but nothing for checkpoints 2 to 6, no list of known simplifications, which spec §9 asks of it, and nothing on the GPU's checks; its prose follows how the project unfolded, so a reader meets track R's rounds before the result. The README's status is a log of those rounds, and it has no explanation of the science, the modelling hypothesis or what the model leaves out, which spec §9 asks of it, nor the food behaviours that won't emerge (spec §5). The maintainer chose how far each goes, that the checkpoints are run again, and that the milestone closes with an audit, before any of it was written.

**Decision.**

- **`VALIDATION.md` is completed and reordered.** Added: checkpoints 2 to 6, each as not reached, with what it would measure and where its thresholds are fixed; the known simplifications, each with why it was made, those of the measures among them (spec §8: "Where you can only approximate, say so in VALIDATION.md with your reasoning"); and the GPU's checks, parity, the Safari check and the frame rate. Its hand-written prose is reordered so that a reader meets the result first: that crawling as checkpoint 1 asks for it does not emerge, what the chosen fit does, and then track R's rounds as the history behind it. The sections the harness writes stay as it writes them. Considered: adding the missing sections alone.
- **The README becomes a front door,** with a screenshot of the app: what it is; where it stands, the negative result first; the science in brief, the modelling hypothesis, the layers outside the connectome and what is left out, the food behaviours among them; using the app and its link's parameters; running it; a map of the documents; credits and licence. The screenshot is taken by a script, from the built app on the Mac's GPU, and no gate checks it. Considered: the same without an image; and a shorter status with one paragraph on the science.
- **Checkpoints 0 and 1 run again** on the code as it ships, on 6 workers, by the limits set after the machine's panic (2026-09-28). Since their last runs, at 1b398c9, the simulation's code has gained the rewiring, the carrying of a worm into a new wiring and the model's version, and lost nothing, so each figure should come out as it was; a figure that moves is a finding, reported before anything is changed. Considered: keeping the recorded runs and saying the code only gained.
- **An audit against the spec closes the milestone.** `WORMLIGHT_SPEC.md` is walked requirement by requirement, by three reviewers reading the repository and one section of the spec each, and each requirement recorded as met, met in part or not met, with where. What is found missing is fixed in this pull request if it is small, or logged. Considered: the milestone's outcome alone, as earlier milestones have it.

**After the audit: decisions, settled by the maintainer before the fixes.** The three audits found nothing in the code against the spec's core rule, its guards, its data or its app (their record is below). They found one requirement unmet and unlogged, the spec's own text out of step in three places, and gaps in this pull request's drafts.

- **The sensitivity runs are built and run, by the rule PLAN fixed in its second draft, on 2026-09-25, before any code** (corrected after review from "on 2026-09-24", a UTC date). Spec §2.4 asks for "a sensitivity toggle in the harness" for the uncertain signs, and PLAN §2.4 set its four settings before any code; PLAN §3.2 added the shared-connection scales. Neither was built, and nothing logged that. The rule, set here before any of it runs:
  - `npm run harness -- --sensitivity` runs fourteen settings of the real wiring. Thirteen set the 1,986 chemical connections signed by the transmitter rule (1,453) or not at all (533): by the rule, as the model has them; all excitatory; all silent; and ten random draws, each connection excitatory or inhibitory with equal chance, from the project's hash at a fixed seed, "sign" in ASCII, on lanes 1 to 10. The fourteenth keeps the model's signs and takes the shared-connection scales, 0.33 for gap junctions and 0.50 for chemical synapses, in place of 0.2055 and 0.3444.
  - Under each: checkpoint 1's 20 trials, and checkpoint 0's 20 untouched trials of the silenced network, on the refit's values, frozen, with each setting's thresholds at its own rest, as any other brain's are (PLAN §3.3).
  - Reported, not graded: each setting's checkpoint 1 measures with the grade they would get, and its silenced worm's forward bouts. No choice rests on them, and nothing is tuned after them. The first setting is the model's own, and must repeat checkpoint 1's figures.
  - Checkpoint 0's touch and chemotaxis clauses aren't run under them: they take the hour-long assay fourteen times over, and ask only that a worm that barely moves show no reflex.
  - When the choice was put to the maintainer, checkpoint 0 was called unaffected, its network having no synapses. That was wrong: a silenced network keeps its intact thresholds, which the signs move, and the head switch's gate reads them. So its crawling clause runs under each setting too.
  - Considered: a pull request of its own; and logging the toggle as not built.
- **The spec stays as it is.** Its three mismatches are recorded in the audit, and the documents say what was done: neuron classes come from OpenWorm's `cect`, where spec §2.1 names Wang et al. 2024; Berri et al. 2009, which spec §2.3 and §8 name for crawling, was never used; and spec §4's "Without it there are no spontaneous reversals" doesn't hold in track R's model, whose reversals are its head switch's. Considered: amending the three sentences here, for sign-off.
- **The rest is fixed as recommended,** and listed with the audit's record below.

**The audit's record** is `docs/spec-audit.md`: the three reviewers' tables as they were made, 216 rows, a few requirements appearing under two sections, and what followed each finding (corrected after review from "216 requirements"). Of them 167 stood as met, 28 as met in part, 9 as not met and 12 as neither.

- **Not met:** checkpoints 2 to 6, five rows, by the decisions of 2026-09-26 and 2026-09-30; the sensitivity toggle, built here; and three of the documents', two of the README's and one of `VALIDATION.md`'s (corrected after review from "three of the README's"), which this pull request's drafts already met.
- **Met in part,** and left so, by logged decisions but the last: one rule per class with a value per cell, for AWC's gain and the touch currents; two calibration bounds set with the silenced network in view; the oscillators' and the switch's forms, the project's own; a second-order scheme for the network alone; "not reached", which is none of pass, partial or fail; the hour-long assay played in six minutes at 10×; and on small panes, the plate's sentence on the food behaviours and its dish inset, hidden, the inset's hiding recorded here for the first time (corrected after review, which found no entry that had logged it).
- **Met in part, and fixed here or following from the decisions above:** the rest. Milestones 3 to 5 and checkpoint 4's mechanism measures wait on the checkpoints not reached, Berri et al. 2009 on the spec's text, and the others are listed at the record's end (corrected after review from "fixed here").

**Built.**

- **The README,** as a front door, with a picture taken by `npm run docs:screenshot` from the built app in headless Chrome, a link fixing its worm, its time and its neuron; no gate checks it.
- **`VALIDATION.md`,** in the order result, standing, methods, what changed after results, how to read the results, the results, the checkpoints not reached, the GPU's checks and the known simplifications. Its seventeen notes on reading the results are as they were, under three headings, until the review reworded several (below); the sections the harness writes are untouched but for the runs below.
- **The status** that heads FIDELITY.md and About the science says every milestone is closed; the loading page no longer says "under construction".
- **The sensitivity toggle,** `npm run harness -- --sensitivity` (`src/validation/sensitivity.ts`): a setting is a network a trial takes, as a rewired brain is, and `cookNetwork` takes the scales.
- **What the audit asked of the registry, PLAN, DECISIONS and DATA_SOURCES.md,** listed in its record. Twelve early entries' statuses now say they were signed off, by the merges of the pull requests they came in.

**The checkpoints' rerun.** At `4aeb33f`, 90 runs in 319 s on 6 workers. Every figure came out as on 2026-09-29: the two sections differ in their run lines, and in checkpoint 0's sentence on its clauses, which the audit had reworded. After the review they ran again at `80923ff`, 90 runs in 318 s, and differ only in their run lines and in that sentence, reworded again (below).

**The sensitivity runs' results** (at `9d74480`, 560 trials in 276 s on 6 workers; after the review at `80923ff`, in 285 s, with the silenced network's columns reworked and every earlier figure the same; `VALIDATION.md`).

- **Checkpoint 1 would fail every setting,** none making a forward bout of 20 s. The worm moves forward 70% to 81% of the time under thirteen of the fourteen, and 32% with the uncertain signs silent. Only the model's own setting, one random draw and the shared-connection scales make a forward bout of 10 s, at 0.027 to 0.029 body lengths per second. At the refit's values, with nothing tuned again, the negative result doesn't hang on how the uncertain signs are set, or on the choice between the two scales; whether a fit made under other signs would crawl, the runs don't say (revised after review, which found "doesn't hang on" unqualified).
- **The model's own setting repeats checkpoint 1's figures:** 0.099 Hz, 0.71 body lengths, 0.029 body lengths per second, 98.4% and no 20 s bout.
- **The silenced network stirs under the random signs** (revised after review, which found an open gate described as enough to move it). Its gate is shut on every step under the model's signs, all excitatory, and the shared scales, and open on every step under the other eleven. An open gate isn't enough: with the uncertain signs silent the switch flips 0.08 times a minute, and the silenced worm stays still. Under the random draws it flips 0.36 to 1.59 times a minute, each flip set off by the noise, and the worm drifts after each, forward 0.8% to 18% of the time and backward 1.8% to 4.8%; in two draws it drifts forward for 10 s, three bouts in all, where checkpoint 0 asks for none.
  - With the gate open, the silenced network's voltages run to about ±15,600 mV: the switch's current goes into SMDs held by nothing but their leak. The behaviour sees only their saturated activation, but no neuron could hold such a voltage.
  - Checked here, at rest on seed 1: the silenced drive on the SMDs less θ_osc is −0.47 mV on the model's signs, −2.05 mV all excitatory and −0.55 mV at the shared scales; +2.68 mV all silent; and +5.6 to +8.5 mV in the random draws, the SMDs' thresholds lying at −10 to −19 mV where the model's lie at −5 to −8.
  - So θ_osc's floor, set at −28 mV to keep the silenced head switch shut (PLAN §7.3), keeps it shut for this wiring's thresholds, by under half a millivolt, and not for the uncertain signs at large. Checkpoint 0's crawling pass was already recorded as following from that bound; it also depends on the signs the bound was fitted under.
- **Disclosed.** After the rule was written and the mode built, and before the first full run, a look of 2 trials of 30 s a setting ran, to check the mode (clarified after review), and showed a bout under the fifth random draw. The first full run, at `7924197`, reported the silenced network's bouts alone. The columns on how the silenced network moves, and on its gate, were added after those bouts were seen, to show their cause, and the run repeated at `9d74480` with every figure the same. The review then asked for the mechanism in full, and the columns were reworked, a second change after results: the backward share, the gate's margin in millivolts in place of the share of steps it was open, the switch's flips a minute and the range of the voltages. The run repeated at `80923ff`.

**Review: decisions, settled by the maintainer before the fixes.** Three reviews found no fault in the code: the toggle does what PLAN fixed, every figure in the sensitivity table recomputes from its run's record, and the audit's counts and its list of what was fixed hold. They found the prose short of the results in places:

- **Two points,** settled as recommended:
  - **The silenced network's table told less than the prose claimed.** Its gate column could read only 0% or 100%, and an open gate is not enough to move the worm: with the uncertain signs silent the gate is open and the worm stays still, and under the random draws the switch flips now and then, on the noise, the worm drifting after each flip, as far backward as forward in half the draws, while the SMDs run to about ±15,600 mV. The columns were reworked and the runs repeated, marked as a second change after results (above). Considered: keeping the table and correcting the prose, citing the reviewers' scratch runs.
  - **A generated page named a work the registry lacked.** `DATA_SOURCES.md`'s new CeNGEN row names Taylor et al. 2021; it is registered, checked against Crossref, and cited by the synapse signs' component as the newer expression data the sign audit compared against. Kim et al. 2025, named there before the audit, stays the one work a generated page names in text alone, and the audit's record says so. Considered: narrowing the rule to the code, the runtime data and `FIDELITY.md`.
- **Fixed as recommended:**
  - a disclosure was missing from the headline. One exploratory point, the probe crawler's values with τ_w at 0.34 s, passes every clause of checkpoint 1, on the checkpoint's own seeds too; it makes no reversal, drives neurons far outside the range any synapse could take them to, and was picked on the seeds it was graded on. The entry of 2026-09-29 asks that what follows disclose it; `VALIDATION.md`'s result and the README now do;
  - "the uncertain signs don't change the result" claimed more than was run: every setting ran on values fitted under the model's own signs, with nothing tuned again, and the documents now say so;
  - two statements were wrong: the README had a lawn picked up by a click when zoomed in, where both the drag and the click need it zoomed out; and `VALIDATION.md` called the reversal rate a calibration target for every fit, where for round 3's picks it was predicted;
  - the README said the wiring test needs a worm that crawls, where `VALIDATION.md` and the audit say that not running it was the project's choice;
  - nothing tested that a setting reaches a trial's world: had that broken, all fourteen rows would have repeated the first. Tests now hold that it does, that the model's own setting steps bit for bit as the model does, and that the random draws stay the ones the runs drew;
  - PLAN §11 said the nematode logbooks were read when the spec was reviewed, which rests on the session's own notes, not on a record in the repository; it now says so, as does the audit's record;
  - "on 2026-09-24", PLAN's second draft, was a UTC date; the repository's is 2026-09-25;
  - the audit's record: what its reviewers ran and looked up; the count of PLAN's marks; the nematode commit's subject; the pull requests of milestone 6; the dish inset, which no entry had logged; and its list of what was left, now with the "Consulted" rows, the app reviewer's observations and Kim et al. 2025;
  - `VALIDATION.md`: a glossary of the fit, track R, the refit and the head switch; the model's change and a parity change added to what changed after results; checkpoints 2 to 6 marked where their protocols changed after results; the graders built only in part; the nudged nulls' rule; and its wording in places;
  - the app's credit line and the README's put the notices with the export they belong to;
  - the README's wording in places; this entry, as marked; and "216 requirements", which are 216 rows, a few requirements appearing twice.
- **Asked and answered.** The look of 2 trials a setting came after the rule was written and the mode built, and before the first full run; the entry now says so.

**Status.** Built and revised after review. Milestone 6 closes with it, and with it the plan's last milestone (PLAN §9).

## 2026-10-01 — What the audit left: the consulted sources' versions, Kim et al. 2025, Find's flight and Safari's long runs (settled by the maintainer before the work; Find's share chosen by look during it; revised after review)

**Why.** The audit's record (`docs/spec-audit.md`, "What followed") left three of the things taken up here (corrected after review from "left five things"). All but two of `DATA_SOURCES.md`'s seven "Consulted" rows named no version, so a reader couldn't tell which copy was read. Kim et al. 2025 was named there without a registry entry, though the go/no-go's code rebuilds its mechanism, which puts it under the registry's rule. The app reviewer made four observations. A fourth thing comes from `VALIDATION.md` ("The GPU against the CPU reference") and the performance entry of 2026-09-30: Safari's long-run parity last passed on the milestone 4 model and was never run on the refit. With the plan's last pull request merged, the maintainer chose to tidy them in one pull request, and settled the app's three questions and Safari's run before any change.

**Decision.**

- **The consulted rows name their versions,** from the session's records of each fetch and what the sources show now, all looked up without credentials:
  - Randi et al. 2023: `funatlas.h5` in `wormneuroatlas` 0.0.7.3, the latest release on PyPI since 2023-06-29, whose wheel's hash, recorded when it was downloaded on 2026-09-29, is the one PyPI lists.
  - modWorm: the repository's head since 2026-02-19, commit `10912b4e09c7`. Nothing was pushed to it after then, so every fetch, on 2026-09-24 and 2026-09-26, read that commit (corrected after review from "2026-09-25", a UTC date). The row also says what the go/no-go took from it.
  - Boyle et al.'s `worm.cc`: the fetch on 2026-09-24 recorded its repository's head, `fdf2203c0da0`, and the file is unchanged since it was added in 2015 from the paper's supplement. The row names the repository, which nothing did, and the file's terms, non-commercial use, since nothing of it is bundled.
  - Ji et al. 2021's Dryad deposit was never opened: its DOI came from the paper. The row says so, and that Dryad lists one version.
  - Cook et al. 2019's SI 5: the original was read from nematode's copy at its pinned commit, byte for byte WormWiring's; the corrected version's hash, whose first 16 digits were recorded when it was downloaded on 2026-09-25, matches the file WormWiring serves, last modified on 2020-07-09.
  - Considered: pinning only what the repository itself recorded, which would have pinned Randi et al.'s row from `docs/sign-audit.md` and left the other four as they were (corrected after review, which found the sign audit's record overlooked).
- **Kim et al. 2025 is registered,** checked against DataCite and arXiv, since its DOI is arXiv's, with a search of Crossref finding no journal version. It is cited by the B-type proprioception's caveat, which now says the model adds no delay beyond the muscles' and body's own lags (PLAN §4.3), and that on the planned model the go/no-go's delays and Kim et al.'s delayed feedback, rebuilt in place of curvature sensing, gave no crawl. This reverses the review of 2026-09-30, which left Kim et al. the one work a generated page named in text alone. Considered: leaving it so.
- **Find, a double-click and a pick in the inspector fly less close,** and the graph's heading is backed. They flew to a fixed distance of 3.5: a quarter of the distance that frames the whole graph with the graph alone at 1440 × 900, and a sixth in the split there with the inspector's sheet open, so the neuron's neighbours filled what showed of the pane and slid under the heading.
  - **The flight.** They now fly to a third of the distance that frames the whole graph from the default camera, beside the overlays as they stand once the inspector is open, and never farther than the camera already is: a camera already nearer stays where it is (corrected after review from "never nearer", which stated it backwards). A first find flies about as far as a later one; the sheet is shorter for five neurons, whose flights are up to 6% nearer. The default camera is used whatever view a link set, so a link's own camera doesn't change how far a flight goes (added after review, which found a link's target or yaw moving it from 6.9 to as far as 15).
  - **How the share was chosen.** By look, before this entry was written, from Find's flight to AVAL and DB4 at a quarter, 0.35 and a half of the distance that framed the graph before the inspector opened, in the split and the graph alone at 1440 × 900 and on a phone at 390 × 844. A third of the framing with the inspector open, which is 0.34 to 0.40 of that, was then looked at in the split and the graph alone (clarified after review: this said the looks were at shares of the distance it now names).
  - **The backing.** The heading's text, and the notes under it, carry a close halo of the page's colour, so they stay readable over what the camera flies to; Find has its own panel. Revised after review: a block of the page's colour behind the whole heading, fading at its edges, hid the found neuron's ring on a phone with a link's notes shown, dimmed it to under half its brightness in the split at 844 × 390, and fogged neurons beside Find where there was no text.
  - Considered: the backing alone; leaving both.
- **Three observations are left, with reasons:**
  - **The inspector's sheet in the split at 1440 × 900.** Each pane is 720 px wide, under the 56rem at which the inspector becomes a sheet over up to 55% of the pane. A side panel, as at 1920 × 1080, would leave the graph about 310 px wide (corrected after review from 320), and the graph is long and thin, so the sheet costs it less.
  - **The head's density at the default camera.** Most neurons are in the head, and the layout already gives the head's sixth over two fifths of the drawn length; zoom and Find reach it.
  - **A link's note over the worm at 1366 × 768, and its Details.** The note shows only for a link from another version or with an unreadable part, and one click dismisses it.
- **Safari's long-run parity runs on the refit,** `npm run gpu:parity:safari -- --long`, by PLAN §7.2's statistic and margins, 265 seeds a side for 60 s; its result goes here and in `VALIDATION.md`, whether it passes or not. This reverses the performance entry of 2026-09-30, which left them unrun. Considered: keeping the milestone 4 run as the record.

**Safari's long runs pass on the refit.** At `10db33a`, in Safari 26.6.2 on an M5 Max: the whole run took about 14 minutes and the long runs about 12½ (corrected after review from "in about 13 minutes"). The parity records don't carry the commit; the run began 9 s after `10db33a` was committed, on a clean tree.

- the mid-body curvature's standard deviation, 0.74402 on the CPU and 0.74415 on the GPU, differs by 0.00013 against a margin of ±0.0372; the frequency, 0.0857 Hz on each, by −0.00004 Hz against ±0.0043;
- reported: the GPU's variance over the CPU's is 0.947 for the standard deviation and 1.002 for the frequency, and no solve failed to converge on either side;
- the short checks gave the counts of 2026-09-30: all 21 of the brain's one-step states and 19 of its 21 one-second states, 2 not graded; all 312 of the loop's one-step states and 131 of its 145 one-second states, 14 not graded; and the odour field's checks.

**Review: decisions, settled by the maintainer before the fixes.** Three reviews found every hash, commit, version, licence and date in the consulted rows right but one, the Kim et al. entry matching DataCite and arXiv, every figure of Safari's run recomputing from its records, and the flight correct on every path that takes it, with the inspector open and laid out. They found:

- **The backing hid what Find flies to,** on small panes, and dimmed neurons beside Find: replaced by a halo on the text, as above. Considered: keeping the block, fitted to the text and dropped on small panes; and counting the heading as an overlay when a flight is framed.
- **Fixed as recommended:** the flight's limit, stated backwards; a link's camera changing the flight; the looks the share was chosen from; the modWorm fetches' dates; the Considered line on pinning; the reversals, unnamed; the run's duration and the difference its rounded means didn't show; the Why's count and the Status; the proprioception caveat's reference to PLAN §4.3 and to what the go/no-go ran on; and the wording of the modWorm, Cook and Ji rows and of the audit record's status note.
- **Found and left,** both from before this pull request:
  - in the layouts with a sheet, a double-click on a neuron drawn where the sheet will open doesn't fly, since the first click opens the sheet under the pointer and the second lands on it;
  - with the graph alone at 844 × 390 and a link's three notes shown, the open sheet hides Find;
  - Safari's run of the parity page's benchmark read the whole step at 11.4× real time at 67 steps a dispatch, where on 2026-09-28 it read 17.8× on the refit; nothing grades it, and the difference wasn't looked into.
- **Checked, not a fault.** The sources' own dates are given as they state them, in UTC, as the Levy & Bargmann row's are, not moved to the project's local time.

**Status.** Built and revised after review. The three of the audit's leftovers taken up here are settled, the app reviewer's other three observations by leaving them, with reasons; Safari's long runs pass on the refit.

## 2026-10-01 — Releases and a citation: version 0.1.0 (set before its work; built; revised after review)

**Why.** The repository had no release and no way to be cited: `package.json` said 0.0.0, nothing was tagged, and a reader who wanted to cite the project, its negative result or its checkpoints had only its address. With the plan's milestones closed and the audit's leftovers settled, the maintainer chose to number releases with git tags and GitHub Releases, to call the first 0.1.0, and to add a `CITATION.cff` now rather than wait for research to reopen. A DOI, through Zenodo's archive of each Release, is left for the maintainer to reconsider later; Zenodo archives only Releases published after it is switched on, so 0.1.0 will have none (added after review).

**Decision.** The rules are in PLAN §8 ("Releases"). In short:

- **Three versions, three jobs.** The release version (0.1.0) names the software. `MODEL_VERSION` names how the worm behaves, and the data version names the connectome's build; links carry those two (PLAN §1). Each Release's notes give the model and data versions it ships.
- **What a bump means.** A minor release for a new model version, a new data version, new features, or a change that breaks old links or the runtime file's schema; a patch for anything else that ships, such as fixes, the ledger or the data's notes, leaving the model and data versions as they were. Changes to the documents, CI or the harness alone need no release. Releases are cut when the maintainer chooses, and stay below 1.0.0 while the model can still change; when to call one 1.0.0, and the rules after it, are left to the maintainer (revised after review, which found these cases without a rule).
- **Where the version lives.** `package.json` (and its lock file) and `CITATION.cff`, which a unit test keeps equal, with the citation's licence equal to the package's, its release date a real date, and its references works the registry holds. The app names its version in About the science as "X or later", with the commit it was built from, beside the model and data versions: the site deploys from `main`, so between releases it can run code newer than the last release, and the commit says which (revised after review from "This is Wormlight X", which a reader could cite for later code).
- **How a release is made.** A pull request sets the version and the citation's release date, the day of the tag in the repository's local time. After it merges, its merge commit is tagged `vX.Y.Z`, an annotated tag pushed by name, and a GitHub Release made from it with `--verify-tag`, as a draft the maintainer sees before it is published; if the merge slips past the release date, a pull request corrects it, and its merge commit is the one tagged (added after review). The notes give the model and data versions, the checkpoints' status, and what changed since the last release, pointing at `DECISIONS.md` for the detail. Tags and Releases are public, so each waits on the maintainer's go-ahead. No changelog is kept: the Releases' notes and this log cover it.
- **The citation.** `CITATION.cff` (format 1.2.0) names the maintainer as author, with their ORCID and without an email, with the title, an abstract that states the result, keywords, the licence, the repository and the live site. Its message asks for the connectome's papers to be cited too, and its references list Cook et al. 2019 and Emmons 2024, their authors as Crossref has them; after review, Fenyves et al. 2020 and Wang et al. 2024, the works the signs come from, joined them, and the live site's address left it, since a versioned citation should point at the repository, where the tag is. GitHub turns it into a "Cite this repository" entry. The README says how to cite.
- Considered: a changelog file beside the notes; a CI job that checks a pushed tag against `package.json`, left out since tags are made by hand, one a release, and the unit test already holds the files together; waiting for research to reopen before adding the citation.

**Review: decisions, settled by the maintainer before the fixes.** Three reviews found the citation valid against the format's schema and its references matching Crossref field by field, the version reaching the build, the dev server, Vitest and the deployed site as intended, and the Node scripts unaffected. They found:

- **About the science named a release for code that might be later,** settled as recommended: it says "X or later", with the commit. Considered: fetching tags in CI to name the release only on its tagged commit; keeping it.
- **Fixed as recommended:**
  - the release steps: the tag pushed by name, `--verify-tag` (without it, `gh release create` makes a tag missing from GitHub from the default branch), the merge commit found with `gh`, `main`'s CI checked, the Release made as a draft, and the date rule for a merge that slips;
  - the bump rule's gaps: changes that ship but are neither fixes nor features, changes needing no release, links that break, the cadence and 1.0.0;
  - the citation: its abstract said the checkpoints were fixed in advance without saying changes followed, and gave only half the result, now as `VALIDATION.md` gives both; the live site's address, which a versioned citation shouldn't point at; the references' months, and the works the signs come from;
  - the build: git now runs in the project's folder, and only where the project is its own repository, the link takes the full commit, and a build with uncommitted changes outside the documents says so;
  - the wording "a link from another version", which now names the model or data version, the test's reading of the citation's fields, and a test that the citation's DOIs are in the registry;
  - the README's "Citing", which now says how to cite first, and this entry's heading and Status.

**Status.** Built and revised after review. Released on 2026-10-01: on the maintainer's go-ahead, the merge commit `5dbb0c5` was tagged `v0.1.0`, an annotated tag pushed by name, after `main`'s CI and deploy had passed on it, and the Release "Wormlight 0.1.0" was made from the tag as a draft, seen by the maintainer and published (noted 2026-10-01).

## 2026-10-01 — After the result: the tracks left, where each belongs, and what the sister project takes (proposed before any of it runs; for the maintainer's approval; revised after review)

**Why.** With 0.1.0 released and the negative result the headline (the entries of 2026-09-30), the maintainer asked for a deep look at what research could still serve the project's goals within its boundaries: whether crawling is still viable, what else would raise fidelity, which of it belongs here, which in the sister project Quantum Nematode, and which should wait for research to appear. The investigation read this repository's record, the sister project's phase 8 tracker and roadmap, and the literature again, with an eye to what the plan missed and what has appeared since it was written, the last weeks included. Nothing here has run: no trial, no calibration, no change to the model or the data. Every work named below was checked on Crossref by anonymous request, or on arXiv or bioRxiv for a preprint; two works the sweep found could not be checked and are left out. Three reviews then read the draft, for its science and citations, for its reading of this record and its rules, and for its reading of the sister project; what they found is corrected in place, each correction marked, and summarised at the end.

**What the record says.** The refit's crawl is the head switch's alone, relayed tailward by proprioception and indifferent to the chemical wiring; there is no backward mode under any set of signs tried; the budget of 18 free parameters is spent; and the go/no-go named three assumptions at odds with measurement: every neuron rests half-on, every gap junction passes current both ways, and section counts are weights (2026-09-26, 2026-09-29 and 2026-09-30). None of R's levers addressed them as measured; κ_gap,B and κ_SMD scaled section counts per class (corrected after review from "none of R's levers touched"). The one lever R's first round approved against the first of them, an A-type resting offset of 18.5 mV, was dropped after review for three reasons: it clashed with the A-types' oscillator threshold, it gained nothing in a 96-draw probe, where the best speeds fell from 0.081 and 0.142 body lengths per second without it to 0.046 and 0.065 with it as drafted, and Liu, Chen & Wang 2014's −71.7 mV is VA5's down state in an alternation, not a rest (2026-09-27; corrected after review, which found the first draft gave the third reason alone).

**The literature since the plan.** No published model makes Cook's wiring crawl on agar without fitting, as the go/no-go's sweep found, and nothing since changes that. What has appeared is more specific than "fitting is needed":

- **A model that crawls from a connectome-derived motor circuit does it by a segmental negative feedback, not a pacemaker** (corrected after review from "the models that crawl from Cook's motor wiring", which took in Chung & Kim). Zhao, Wang, Rong et al. 2025 (_PLoS Computational Biology_ 21:e1013171; not BAAIWorm's Zhao et al. 2024) build 13 rods and 12 muscle pairs with the B-, D- and SMD classes and premotor interneurons from the connectome, citing Varshney, Jarrell and Cook together, and find that a muscle inhibiting the motor neuron that drives it generates the oscillation, while the anterior-to-posterior coupling does not start it and only stabilises its frequency and amplitude; their weights, time constants and feedback gains were fitted to worms in oils by an evolutionary algorithm. Chung & Kim 2026 (PLAN §11) crawl forward and backward with no pacemaker neuron, but by fitting 3,233 weights, and their 316 added muscle-to-neuron links are excitatory and, in their words, phenomenological: a precedent for "no pacemaker once the weights are fitted", not for negative feedback (corrected after review). Ishimoto, Moreau & Herault 2025 (_Journal of the Royal Society Interface_ 22:20240688) use no connectome and keep a rhythm generator; they show that with mechanosensory feedback the progressive gait is a globally stable orbit over broad parameter regions, a precedent for feedback-stabilised gait rather than for the mechanism. Wormlight's proprioception is Wen et al. 2012's positive front-to-back relay beside a head oscillator; a local negative feedback in the B-types was tried neither at the go/no-go nor in R. The head switch is itself a curvature-threshold negative feedback on the SMDs (PLAN §4.3), so the mechanism is the head switch's principle, untried in the body (added after review).
- **Measured signs exist for the competition R found missing.** Zhang et al. 2025 (_Nature Communications_ 16:4405; `docs/sign-audit.md`) record PVP exciting AVB and inhibiting AVA, and DVC exciting AVA. Roberts et al. 2016 record currents between AVA and AVB that reverse as inhibitory synapses' do, functional and possibly polysynaptic, and AVB→AVA is contested by Meng et al. 2024 (added after review). The audit's probe found these alone make no backward mode at the refit because the command neurons' gap junctions yoke the modules, which points at their rectification: Liu et al. 2017's AVA–A-type junctions pass current from the A-types into AVA, and are already cited for it.
- **Per-class dynamics are measured or fitted to measurements, for a few cells.** Nicoletti et al. 2024 (_PLoS ONE_ 19:e0298105) fit whole-cell models to AVA, AIY, RIM, VA5, VB6 and VD5, fitting VB6 and VD5 to steady-state current–voltage curves. Corrected 2026-10-01: this said that no current-clamp recordings exist for VB6 and VD5, so their rests are model values; Liu, Chen & Wang 2014 measured both rests at zero current, as track S's review found (the entry below). Du et al. 2025 (_PLoS Computational Biology_ 21:e1012318) give the first experimentally constrained model of a body-wall muscle cell. Morrison & Young 2025 (_PLoS Computational Biology_ 21:e1013818; arXiv 2501.00278) reproduce the premotor neurons' forward-and-reverse switching from a connectome-structured model constrained by voltage-clamp and whole-brain data, and find gap junctions and chemical synapses playing different parts in the switching. The model treats each of these as a level 0 or level 3 convention. Added after review: one cell per class has been recorded, and what the model needs, each class's offset between its rest and its release sigmoid's midpoint, is measured for none; the record's values are VA5 at −71.7 mV, a down state, VB6 at −53.2 and VD5 7.4 mV above VB6 (Liu, Chen & Wang 2014).
- **Signed functional weights are released.** Creamer, Leifer & Pillow's connectome-constrained linear model of Randi et al. 2023's data (bioRxiv 10.1101/2024.09.22.614271, v4 of 2026-05-18, still a preprint) captures the perturbations 82% as well as the data's own reproducibility; its code is MIT-licensed, which the sister project reads as covering the weights it vendors, with the caveat recorded that the licence is worded for software (`nematode:data/connectome/PROVENANCE.md`; added after review). Spec §2 forbids their use as strengths and §2.3 asks for their signs as a cross-check, which the data build already reports (`data/reports/sign-crosscheck.md`).
- **Null results are accumulating, and one closed-loop model lays the loss on the gap junctions.** Reimers, Ramstad, Hubin & Nichele (arXiv 2609.30508, 2026-09-24) find randomised nulls often outperforming the real connectomes as reservoirs. Dvali, Seguin, Betzel & Leifer 2025 (_PRX Life_ 3:033021) find the signalling network's modules diverging from the anatomical ones. Sar, Patton, Towlson & Davidsen 2026 (_PLoS Computational Biology_ 22:e1014152, 2026-09-15), on a single-compartment graded model of Wormlight's kind on Varshney et al.'s wiring, find gap junctions shaping the functional communities and the locomotion circuits segregated within them. Added after review, from the sister project's literature watch: Lee 2026 (bioRxiv 10.64898/2026.09.06.749731, posted 2026-09-09, a single-author preprint under CC BY-NC) runs OpenWorm's c302 with six global conductance scales fitted to Randi et al.'s atlas, a 24-segment rod on agar with a Boyle–Berri–Cohen motor layer, and an external evolved policy injecting current into interneurons; shuffling the wiring while preserving weights, counts and signs cut chemotaxis to a fifth, and the loss was carried by the gap-junction layer, the chemical layer's shuffle costing little. The preview of 2026-09-30 put checkpoint 6 reading "no evidence" at about 65% for pick 1's head-switch crawl; that figure is the preview's, for that crawl, not a forecast for any later model (corrected after review). Lee 2026 says where any evidence is likely to lie: in the gap junctions, which the primary null holds fixed.
- **A proprioceptive loop the literature now names is extrasynaptic.** Ji et al. 2023 (_PNAS_ 120:e2219341120) describe a proprioceptive feedback circuit acting through dopamine and a neuropeptide. It belongs with the omitted biology (spec §2.4), and strengthens the case for leaving neuromodulation out here.
- **Nothing is about to arrive that would unblock the crawl.** The sweep found no functional atlas of the ventral cord, no voltage imaging of motor neurons, no per-connection sign table combining Wang et al. 2024 with CeNGEN, no successor to BAAIWorm, and OpenWorm's closed loop still planned. Waiting has little expected yield for the motor layer within a year.

**The sister project.** Quantum Nematode's phase 8a closed on 2026-09-26 with a go (`nematode:docs/experiments/logbooks/076-8a-synthesis.md`), and 8b is ready to start (`nematode:openspec/changes/phase8-tracking/tasks.md`; `nematode:docs/roadmap.md`, "Phase 8"; both read at its `main` of 2026-09-27, `7d5741dd`). It has no body, no biophysical neuron and no kinematic validation: its brain is a settled tanh map, its agent a point with a clamped forward speed, and its behavioural checks the klinokinesis, weathervane and thermotaxis curves of its Logbooks 035 and 036. Its tracker already takes Wormlight's chemical-only null as 8b's primary null (decision D21), says C.3 should adopt Wormlight's thresholds, fixed in advance, where they apply, and writes its C.2a decision as: if Wormlight has passed its go/no-go, C.2's second half and much of C.3 are better served there, and 8b keeps C.1 either way (corrected after review from "cede the body to Wormlight", which it never proposed). Its B.3 is internal state and the modulator field, with a note that Fenyves et al. 2020 is the natural per-connection sign source for a receptor layer (corrected after review from "B.3 names Fenyves as the per-connection sign source"). Its 8a found the measured weights moving its wiring effect under PPO by less than its registered minimum, with the reading learner unresolved (Logbook 073), and that its degree-preserving null had been moving gap-junction placement and strength together, which holding the gap junctions halves, with nothing separating the two (Logbooks 074 and 075; corrected after review from "neither help nor hurt" and from "moving gap-junction strength"). Its records credit Wormlight's review of 2026-09-25 at several sites (added after review).

**The tracks weighed.** The judgements are coarse, in this project's cadence with reviews. "Informative" means checkpoints 2 to 6 could say something about the wiring. The odds were lowered after review, which found the first draft's 10 to 15 points too high: nothing yet has been both converged and partial, S changes nothing that paces or speeds the crawl, and the one feedback precedent fitted every weight.

| Track                                                                                                           | Where                                           | Effort                                | A converged checkpoint 1 partial           | Checkpoints 2 to 6 informative     |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------- | ------------------------------------------ | ---------------------------------- |
| S: measured signs, class offsets from measured differences, rectified AVA–A-type junctions                      | Wormlight; the data through nematode's exporter | 1 to 2 weeks, plus recalibration      | 5% to 15% alone                            | about 5%                           |
| D: a ceiling diagnostic, class-pair gains, exploratory and never shipped                                        | Wormlight                                       | 1 to 2 weeks, up to a week of compute | not a deliverable                          | says whether S and M have a target |
| M: the head switch's principle in the B-types, a segmental negative feedback as the proprioception layer's form | Wormlight                                       | 3 to 5 weeks                          | 20% to 35% on top of S, if D finds a crawl | 5% to 15%                          |
| N: a numerics round on the head switch's crawl                                                                  | Wormlight                                       | about a week                          | 50% to 70%                                 | 10% to 20%                         |
| W: the wiring test's protocol on round 3's pick 1, exploratory                                                  | Wormlight                                       | about a week, 36 h of compute         | not applicable                             | the preview's 65% no evidence      |
| A shared sign table                                                                                             | Wormlight, vendored by nematode                 | 1 to 2 weeks                          | feeds S                                    | feeds S                            |
| Waiting for publications                                                                                        | neither                                         | 6 to 12 months                        | little yield                               | little yield                       |

W's compute is PLAN §7.5's figure for round 3's procedure on the real wiring and ten nulls; the first draft's 72 h was the numerics round's (corrected after review).

- **Track S raises fidelity whether or not it crawls,** which is the project's second goal and the one it can certainly meet. It would adopt the sign audit's physiology rows through the override path spec §2.3 anticipates (`data/sign-overrides.csv`, each citation registered), with Zhang et al. 2025 among them; settle the audit's §7 questions, a sign source for receptor genetics, tyramine's scope and a CeNGEN rule, with CeNGEN's licence checked first, which neither project has done; and rectify the AVA–A-type junctions as Liu et al. 2017 measured them. For the rests, revised after review: no measurement gives a class's offset from its sigmoid's midpoint, so the honest forms are class offsets fixed as the measured differences relative to the B-types, the A-types 18.5 mV below and the D-types 7.4 above, at level 2 with a sensitivity toggle, after the 2026-09-27 analysis of their interaction with the oscillator threshold and relative drive is rerun; or offsets calibrated within measured bounds and counted against the budget. The mapping is ours either way, and the probe of 2026-09-27 is evidence against the offset helping the crawl, which is why S's odds are low. Its risks: it invalidates the refit and raises the model version; class offsets depart from PLAN §3.3's threshold rule and rectification from the spec's bidirectional junctions, so both need the maintainer's sign-off as deviations; and under PLAN §10's rule checkpoint 2 and checkpoint 5's reversal rows are reported as fitted, since the missing backward mode prompted the audit.
- **Track D answers what R could not:** whether this model class, body and set of layers can crawl at all with anatomy's sparsity, if the gains between classes are free. One gain per pair of classes among the command neurons, the A-, B- and D-types, the SMDs and RMDs and the muscles, about a hundred values beside the twelve, searched on the kinematics alone, recorded as exploratory and never in the app or the registry. Revised after review:
  - Its gains keep R's floor of 0.1 and no sign may change, or it re-finds the go/no-go's ladder, where cutting the B-types off reached 0.126 with the head forced, and becomes a sign search.
  - It includes M's one or two feedback gains as dimensions, since class-pair gains don't span a channel the model lacks; without them a null result would speak to S alone.
  - It is staged: the twelve with a dozen pair gains first, then the rest. The survey's rate, 19,136 trials in 2 h 16 min on 14 workers, gives about 50,000 evaluations a day, but 84% of its 12-parameter box lay on a plateau with no bout, and the plateau's share grows with the dimension, so a day is a floor and a week the plan.
  - A null result reads "not found at this budget", conditional on the forms, the measure and the speed target, as the survey's rule read it. A hit is judged by a distance-from-anatomy metric declared before the run.
  - It is a design step the nulls don't get, as the ladder was (PLAN §9, "Fairness to the nulls"), and checkpoint 6's report says so. Running it on two or three nulls as well, at the same budget, makes the ceiling itself a wiring comparison, and is proposed.

  Spec §1.2 forbids shipping such a fit, not running one as a diagnostic that is disclosed as such.

- **Track M is the one untried mechanism, with one modelling precedent** (Zhao et al. 2025; corrected after review from "two independent precedents") and the head switch's own principle behind it. Revised after review:
  - It is confined to the B-types, which spec §1.1 item 2 names; Zhao et al.'s loops through the D-types are left out, so the layer's classes don't change.
  - Its loop is gated by the network's drive, as θ_osc gates the B-type oscillators, so that checkpoint 0 still holds: an ungated segmental loop with the neuromuscular junctions kept would crawl silenced.
  - It can be budget-neutral: every crawling pick R found had g_osc,B at 0, so the feedback gain may take the B-type oscillator's place rather than join it.
  - It amends spec §2.4's sentence "proprioception alone produces no rhythm in any precedent", which Zhao et al. 2025 makes false, and so needs the maintainer's sign-off as a spec change, not only a form change.
  - Wen et al. 2012 constrain it: posterior undulation ceased when the anterior was held straight, where in Zhao et al.'s model the local loop starts the oscillation on its own; Fouad et al. 2018 and Xu et al. 2018 later found posterior rhythms with the anterior silenced. Deng et al. 2021, who found inhibition unnecessary for slow undulation, bear on leaving the D-types out.
  - A backward mode is not part of M (corrected after review, which found the first draft's "A-type backward relay" would mark checkpoint 2 and checkpoint 5's reversal rows as fitted under PLAN §10, as S does). A backward-mode track, if ever proposed, is marked so.
  - Its central risk is R's: the chemical connectome has little leverage because gap junctions set the dynamics, so a crawl may again run through parts no null rewires, and Lee 2026 found the gap junctions carrying the loss in a model of this kind. Its mitigation is set in advance: checkpoint 6 then reports the gap-junction null with verdicts, where today it reports it without (PLAN §3.5), and a gap-junction null that holds each neuron's gap strength while moving its partners, which neither project has, is built for it; the sister project's Logbook 075 leaves the same question open.
- **Tracks N and W are declined.** N would buy a formal partial for a crawl the record already calls the head switch's; W would test the wiring on a crawl indifferent to it.
- **The measure comes first.** Checkpoint 1's frequency counts crossings of each bout's mean, which rewarded short crossings in the calibration and moved with the step (2026-09-30). A debounced or spectral count is a change to the measure after results, logged as such under spec §8. Added after review: it takes up in part an option the entry of 2026-09-30 declined, and that entry found a ±0.5 κL band passing picks 1, 2 and 4 and failing pick 3, so the band is fixed by a rule independent of any pick, from the pinned postures' curvature spread as the 1 mV rule was fixed from the loads; no past grade is revisited, the refit's 0.099 Hz standing; and when it lands it joins PLAN §7.4's clause and `VALIDATION.md`'s "What changed after results".
- **Neuromodulation stays out,** as spec §2.4 says: Ji et al. 2023's loop and the neuropeptide signalling belong in the ledger's omitted biology and in the sister project's B.3 and D.1.

**Decision, proposed.** The maintainer asked for the plan to be captured; nothing in it has been approved or run.

- **In Wormlight: S, then D, then decide on M.** S is certain fidelity and cheap; D says whether M is worth its weeks; M runs only if D finds a crawl exists in the class. Each track comes as a rules pull request of its own, with its thresholds, bounds, budget and disclosures set before anything runs, as R's rounds did, and each run of a search obeys the guard of 2026-09-28: capped workers and heaps, records on disk, one heavy job at a time. Any adopted change raises `MODEL_VERSION` and ships as 0.2.0 (PLAN §8).
- **Fairness.** Every trial these tracks run on the real wiring joins PLAN §9's count of its exploration, and D is named there as a design step. Every null tuned for checkpoint 6 gets the form and procedure of whatever fit is chosen. Checkpoint 6's report also gives, for each wiring, the sister project's training-free hop statistic, how many motor neurons sit one hop from a food sensor, which its Logbook 071 found the real wiring has none of and a rewiring makes about nine (added after review).
- **For Quantum Nematode's 8b,** four suggestions are made to the sister project, whose decisions they are, through its own process (revised after review, which found the first draft's items resting on premises that don't hold there):

  1. **A shared sign table, kept where the signs are decided.** Wormlight's build already joins Fenyves et al. 2020's S1 and S5 Data, the overrides and the Creamer cross-check, and spec §2.3 makes the signs Wormlight's to fill. So Wormlight publishes its resolved per-connection sign table as a pinned, hashed file with its sources, which nematode can vendor as it vendored the Creamer table, rather than nematode building one; its model has per-neuron signs only, and 8a found signs not moving its contrast (Logbook 044). The exporter's version 2 carries only what is connectome data, such as the receptor-based neuromuscular signs both projects now derive apart from Richmond & Jorgensen 1999. Corrected after review from "pull B.3's sign table forward to a MUST".
  2. **One set of kinematic thresholds, and any change to a measure made together.** Both projects grade kinematics by the thresholds PLAN §7.4 fixed, as C.3 already says; nematode validates its own body's kinematics against them, since that is a clause of its landmark; and the debounced frequency measure is taken up by both only once Wormlight has adopted it. Corrected after review from "cedes C.3's kinematic thresholds to Wormlight's harness", and from asking C.3 to adopt a measure Wormlight hasn't.
  3. **Record the two nulls' difference and its mapping.** Wormlight's primary null now swaps signed and unsigned connections apart (PLAN §3.5, 2026-09-30), and Wormlight's port of the single swap had changed the signed inputs of 221 neurons in Wormlight's first rewiring (corrected after review from "nematode's single swap"). Nematode has no unsigned edges, so "exactly" has no meaning there; the nearest analogue preserves each neuron's excitatory and inhibitory input counts under its atlas signs. D21's record would name both variants and the mapping.
  4. **Keep learning through a body in nematode.** Its C.1e under PPO, already a MUST, is the learning-side complement of track D and of checkpoint 6, and the only place a fitted-weights wiring question can be asked without breaking Wormlight's rules. This is an endorsement, not a re-scoping (noted after review).

  Also noted after review: both projects read Nicoletti et al. 2024 for per-class time constants, nematode in B.2a and Wormlight in S, so one reading should serve both; nematode's C.0 has a pending decision on freezing 8b to Emmons 2024's release, which Wormlight's export already pins (spec §2.1); and nematode cites Morrison & Young in its journal version, which the registry should take too.

- **Waiting** is right for neuromodulation and for a ventral-cord functional atlas, and wrong for the crawl: the data that block it, the motor neurons' intrinsic dynamics, the neuromuscular weights and the proprioceptive channel, are not about to be measured.
- **The odds, stated** (lowered after review). A connectome-dependent crawl shipping under the no-fitting rule within S, D and M is judged at 15% to 25%, and informative checkpoints 2 to 6 at 5% to 10%, since those need a backward mode no set of signs has produced. S's fidelity gain and D's ceiling result are near certain, and worth recording either way.
- Considered: showing round 3's pick 1 in the app as a labelled exploratory crawler, considered and not taken on 2026-09-30 and not reopened; a backward-mode track on its own, weeks long at poor odds (2026-09-30), of which S now contains the data-driven part; building the body's kinematics a second time in the sister project; and a central pattern generator outside the allow-list, which is never on the menu (PLAN §10).

**Review: three reviews before the maintainer's decision.** They found the record quoted right, every DOI resolving and the bibliographic details exact, the sister project's structure read right, and the tracks' labelling as deviations correct. They found, and the entry now says:

- **Chung & Kim 2026 is not a negative-feedback precedent:** its added links are excitatory and phenomenological, so M has one modelling precedent, not two, and the literature's heading and M's rationale are reworded.
- **The A-type offset was dropped for three reasons,** the decisive one for S a probe in which it lost speed; "none of R's levers touched" the three assumptions overstated it, since two gains scaled section counts per class.
- **Per-class rest isn't measured as the model needs it:** one cell per class, VA5's a down state (corrected 2026-10-01: this also called VB6's and VD5's rests model values, which Liu, Chen & Wang 2014 measured); S's rests are reframed as measured differences at level 2, or calibrated and counted, and S's odds lowered.
- **D's logic and cost:** class-pair gains don't span M's channel, so D takes M's gains as dimensions; it needs R's floor and fixed signs, or it re-finds the ladder; a day of compute is a floor, a week the plan; a hit needs a declared distance-from-anatomy metric; D is a design step disclosed in checkpoint 6's report, and run on nulls too.
- **M's standing:** it is the head switch's principle in the B-types; it must be gated or checkpoint 0 fails; it amends spec §2.4, not only a layer's form; its backward relay would have marked checkpoint 2 and checkpoint 5's rows as fitted and is dropped from M; it can take the B-type oscillator's place in the budget.
- **The measure change** takes up part of an option declined on 2026-09-30 and is fixed by a pick-independent rule, with no grade revisited.
- **Figures and attributions:** W's compute is 36 h, not 72; the 65% is the preview's figure for pick 1's crawl; the 221 neurons are Wormlight's port's; Zhao et al. 2025 is not BAAIWorm's Zhao et al. 2024; Sar et al. run on Varshney et al.'s wiring; Roberts et al.'s currents are functional and possibly polysynaptic; Creamer's MIT licence covers software; Morrison & Young has a journal version.
- **The sister project:** the C.2a rule was misquoted, Logbook 073's result overstated, Logbooks 074 and 075's finding misattributed to strength alone, and B.3 misdescribed; three of the four suggestions rested on premises that don't hold there and are recast, the fourth is an endorsement; Lee 2026, which the sister project's literature watch found, was missing, and is added here, in PLAN §11 and in M's risk.
- **Odds** 10 to 15 points too high throughout; restated.

**Exploration, disclosed.** None. No trial ran for this entry or its reviews; the citations were checked on Crossref, arXiv, bioRxiv, Europe PMC and PLOS by anonymous requests, the sister repository was read at its `main` of 2026-09-27 (`7d5741dd`; the local checkout stood at 2026-09-26), and this repository was not changed beyond this entry, its pointers in PLAN §9 and §10, and Lee 2026's row in PLAN §11.

**Status.** Proposed, and revised after review. Each track's rules come in a pull request of their own, for the maintainer's approval, before anything runs; the suggestions for the sister project go to it through its process. Approved when its pull request (#51) merged on 2026-10-01; track S's rules followed (the entry below; noted 2026-10-01).

## 2026-10-01 — Track S's rules: the measured signs, the class offsets and rectification (settled by the maintainer before the work and after review; set before any of it is built)

**Why.** The programme after R was approved when its pull request (#51) merged (the entry above), and track S comes first: the measured signs, each class's rest where a measurement gives one, and the AVA–A-type gap junctions rectified as they were measured. Its rules come here, before anything is built or runs. The sign audit left three questions for the maintainer (`docs/sign-audit.md` §7), of which genetics and tyramine were settled as one, and the entry above added two, the offsets' form and rectification: four choices, put to the maintainer before this entry was written. Three reviews of the first draft then raised four more. Each time the recommendation came first, and the maintainer chose it.

**The maintainer's choices, before the work.**

- **The receptor-genetics rows are left out.** RIM→AVA rests on AVR-14's genetics (Li et al. 2023) and RIM→AVB on tyramine through LGC-55 (Pirri et al. 2009), receptor-specific rescue and behaviour rather than a measured synaptic response. They stay caveats. Leaving out RIM→AVB keeps tyramine out of scope, as spec §1.1 and §2.4 and FIDELITY's omitted biology have it, and no new sign source enters the schema. Considered: a level 4 `genetics` source with RIM→AVA alone; the same with both rows, amending the spec's scope for tyramine's fast action at RIM's synapses.
- **No CeNGEN rule.** Fenyves et al. 2020 stays the expression source spec §2.3 names. The audit judged the CeNGEN evidence for its edges weak and cutting both ways, and a rule would re-sign hundreds of connections across the connectome. Checked here: CeNGEN's downloads page (cengen.org/downloads) states no licence for its expression matrices, so they could be cited but not vendored, as Randi et al.'s atlas is. Considered: writing to the CeNGEN team for terms, and revisiting in a later track.
- **The class offsets are measured differences, fixed** (below). No value is calibrated, so the budget stays 18. Considered: offsets calibrated within measured bounds and counted, raising the budget; leaving the offsets out of S.
- **The AVA–A-type gap junctions are rectified** (below).

**The maintainer's choices, after review.**

- **The rectifier reads the model's voltages,** as every other gap junction does, so the model keeps one frame (below). Considered: reading each side's voltage relative to its own threshold, the frame the offsets assume, which would close the junction at rest as in the animal but give these 37 junctions alone a built-in voltage difference; leaving rectification out of S until the model represents per-class voltages.
- **The rectifier is gated at each step's start, both voltages implicit.** The first question named the A-type side explicit; the reviews found that stable and symmetric too, but first order in the rectified coupling, a step-dependence risk of the kind that failed round 3's picks (2026-09-29). Considered: the A-type side explicit.
- **AVA and AVB stay at their midpoints, with a sensitivity setting** (below). Considered: offsets for both from their recordings.
- **S tunes its noise on the kinematics alone,** by round 3's procedure (below). Considered: the refit's one-stage procedure, whose reversal term keeps spec §4's noise sentence as written but can be met by the head switch's slips.

**The measured signs** (PLAN §2.4, step 1).

- **The criterion, fixed before the build.** A sign is adopted where a response was recorded in the postsynaptic cell to a manipulation targeted at the presynaptic cell: patch clamp, or calcium imaging with the presynaptic cell manipulated and, where the source has it, the receptor rescued in the postsynaptic cell. It is adopted whichever way it points, flipping the current sign or confirming it, so that the choice can't follow its effect on reversals. Drivers that reach other cells too are adopted with that caveat: Roberts et al. 2016's promoters, sra-11 among them, which also labels AIY and AIA, and Huo et al. 2024's stimulation, which also reached SMB and RIV. Excluded: metabotropic effects, genetics, expression and inference, and the functional atlas, which spec §2.3 allows only as a cross-check.
- **What it adopts.** Tier A's 25 connections, 326 sections, flipped to inhibitory: AVA→AVB 3, AVB→AVA 4, PVP→AVA 4, AIB→RIM 4, AIB→RIB 2 and SAA→RIM 8 (`docs/sign-audit.md` §6). And the confirmations, their signs unchanged and their level raised to 5: PVP→AVB and DVC→AVA, patch clamp with the receptor rescued (Zhang et al. 2025); AIY→AIZ, AIY→RIB, AIY→RIA and AIZ→RIA, calcium imaging with AIY or AIZ manipulated and the receptor rescued where tested (Li et al. 2014; Liu et al. 2018; Lin et al. 2024); and AVA's synapses onto VA5 and DA4, where Liu et al. 2017 recorded AVA's transmission. AVA's other 38 synapses onto the A-types, and its 16 onto the AS neurons, keep the rule's +, since none was recorded. The build checks each row against its full text before it is listed.
- **What it leaves, and a departure from the audit.** The expression rows (AVA→PVC, AIB→AVB, AVM→AVB, AVD→PVC, AVE→PVC); AIB→SMD, whose silencing and calcium evidence the audit found not shown to be direct; PVC→AVB, by inference; SMD→RIA, through the metabotropic GAR-3; and AVA→AVE and AVE→AVA, from the functional atlas alone. The audit's §7.6 named SMD→RIA and AVA→AVE as signs to adopt so that the choice couldn't follow reversals. The criterion leaves both out, on the evidence's kind rather than its direction: one is metabotropic, the other the atlas's.
- **Where they wait** (after review: the first draft put them in `data/sign-overrides.csv`, which every brain reads, touch's currents, AWC's gains and the sensitivity runs among them). Until S's fit is chosen, they sit in a side file, `data/sign-overrides-s.csv`, with the main file's columns, which the data build parses, checks against Cook's edges and emits as a small generated file with its digest under `data:check`; only S's model applies it. The runtime file, the main overrides, the data's version, touch, AWC and the sensitivity runs don't move, and no link breaks. At the choice the rows move into the main file, and the data's version and `MODEL_VERSION` rise together. Until then FIDELITY and the inspector show the signs the app runs, and S's file is listed in `DATA_SOURCES.md` beside them.
- **Citations,** each checked against Crossref and registered once in `src/science/citations.ts`: roberts2016, zhang2025, piggott2011, wang2020, huo2024, kumar2024, li2014, liu2018, lin2024, and meng2024 and liu2020, which the caveats and the sensitivity setting cite.
- **Caveats,** in each row's evidence, since the schema has no grade: AVA⇄AVB's currents are functional and possibly polysynaptic; AVB→AVA is contested by Meng et al. 2024; AVA→AVB is inhibitory on the fast timescale, and Meng et al. call its slow excitation tonic and extrasynaptic, out of scope under spec §2.4, so the model's one synaptic timescale, a_d's, takes the fast sign; SAA was not isolated in Huo et al.'s imaging.

**The class offsets** (PLAN §3.3).

- **The values.** Liu, Chen & Wang 2014 recorded at zero current "−71.7±2.4 mV in VA5, −53.2±2.5 mV in VB6 and −45.8±1.9 mV in VD5". With Δ = V_th − V_rest, each class's distance below its threshold at rest: Δ_A = +18.5 mV, Δ_B = 0 and Δ_D = −7.4 mV, so the D-types rest above theirs (corrected after review: the first draft gave Δ_D unsigned, which read literally put the D-types below threshold).
- **The classes.** VA and DA (21 neurons), VB and DB (18), VD and DD (19). The recordings are of ventral cells; DA, DB and DD are classes of their own, so giving them the ventral values is our choice, made because an offset on one side alone would bias the body's dorsoventral bending (corrected after review from "as spec §1.2 allows for a class").
- **The assumption, ours, level 0 and registered.** Every class's release sigmoid has its midpoint at the same absolute voltage as the B-types', and the B-types rest at it, as every neuron does now. The measured differences in rest then become each class's distance from its midpoint. The model's voltages are Kunert et al.'s frame, so only the differences transfer, and the offsets move the thresholds, not the voltages: in the model the A-types rest near AVA, where in the animal VA5 rests about 45 mV below it.
- **AVA and AVB stay at their midpoints, by choice** (corrected after review: the first draft said AVB had no recording and AVA none in the motor neurons' preparation). Liu, Chen & Wang 2020, from the same lab and preparation, recorded AVAL at −24.2 mV and AVAR at −37.2 mV, and Meng et al. 2024 recorded AVB, which holds several stable states. A cell that holds several stable states has no single rest, and under S's assumption AVA would rest 16 to 29 mV above its midpoint, near its greatest release. The harness's sensitivity runs gain a setting with AVA's offset from Liu, Chen & Wang 2020 against VB6.
- **The rest.** At rest each neuron sits Δ from its threshold, so its activation there is known: φ = 1/(1 + e^(βΔ)), and s = a_r φ/(a_r φ + a_d). That is 0.0177 for the A-types, a fifth of their present 0.0909, which every other neuron keeps, and 0.1253 for the D-types, 38% above it, against a ceiling of 1/6. With every activation held at its class's resting value, the rest is the network's equilibrium, solved with the rectifier's gates (below) to a fixed point: every rectified junction starts open, the rest is solved, each gate is set from it, and the solve repeats until no gate changes, a cycle failing the build. The reviews' rest solves converged in two or three, with 4 of the 37 gates open, moving the A-types by up to 3.7 mV from the solve with every junction open (corrected after review from "one sparse linear solve"). Each threshold is the rest plus its class's Δ. Lesions leave the thresholds unchanged, and a rewired brain solves its own, as now.
- **The oscillators.** Each oscillator's shift becomes θ_class − Δ_class, so it keeps its place relative to its neuron's rest: −18.5 mV for the A-types, whose θ is 0, and θ_osc for the B-types, unchanged, since Δ_B is 0.
- **Relative drive's baseline** is each muscle's drive with every neuron at its resting activation, the D-types' included.
- **September's clash, and the probe.** The offset of 2026-09-27 was dropped after review: raising the A-types' threshold moved their oscillator, which reads it, and the fix for that, centring the oscillator on the old rest, left relative drive's baseline at the midpoint, starting each muscle below its own rest. S takes both fixes. In that review's probe, of 96 draws of R's model with no D-type offset, the nearest variant, "oscillator centred, baseline at the A-types' own rest", lost speed against no offset, 0.077 against 0.081 body lengths a second with the head switch free and 0.110 against 0.142 with the head forced. That is evidence against the offsets helping the crawl, recorded rather than tuned around (corrected after review: the first draft called it this variant, and got the clash's order wrong).
- **The down state.** VA5's −71.7 mV is the rest from which it "alternated between the resting membrane potential and an upstate", 33.4 mV higher, for about 15 s at a time; 4 of the 15 recordings showed no clear up state, and only VA5 was analysed for them. The harness's sensitivity runs gain a setting with the offsets off.
- **The code** takes per-neuron vectors where it takes one midpoint activation now: the held solve and what reads it (the passive loads, input conductances and responses), each brain's rest on the CPU and the GPU, the recovery variable's start, and relative drive's baseline. A class map names the D-types, which the schema doesn't mark.

**Rectification.**

- **What was measured.** Liu et al. 2017 recorded AVA with VA5, VA8 and DA4: "Significant junctional current (I_j) is observed only when the membrane voltage (V_m) of VA5 is more depolarized than that of AVA", which they call "probably the strongest degree of rectification ever observed with gap junctions in native tissues"; the coupling with DA4 is abolished when unc-7 is knocked down in AVA (their Supplementary Fig. 6). They read the junctions between AVA and the A-types as "likely antidromic rectifiers". A reviewer of the paper argued for a polarised but bidirectional junction, and the authors held to one direction.
- **The pairs.** AVAL and AVAR's gap junctions with the A-types: 37 pairs, 194 sections, of the A-types' 114 gap pairs. Every brain rectifies the AVA–A-type pairs it has: the primary null holds the gap junctions, so the same 37, and the secondary null whichever it ends with.
- **The form, in the model's voltages.** Current flows only from an A-type into AVA: g·max(V_A − V_AVA, 0), at its section count's conductance, with no width to choose. Its conductance, g when the A-type is the more depolarised and 0 otherwise, is taken at each step's start, and both voltages are implicit, as every gap junction's are, so the system stays symmetric and conjugate gradients still solve it, its diagonal and products reading the same gates. The current is continuous where a gate turns, passing through 0, so the integrator needs no restart there, as proprioception's conductance doesn't (PLAN §3.4, §4.3).
- **On the GPU** the gates are computed in the shader each step, each AVA's in a bitmask held in registers, since AVAL has 19 A-type partners and AVAR 18; the rectified edges are flagged in the topology buffer the gap junctions already use. No buffer and no workgroup memory are added, and `npm run plate:bench` runs again after it.
- **The caveat.** In the model's frame the gates sit near their kink at rest, 4 of 37 open, and the noise and the A-types' oscillators will turn them, where in the animal the junction is closed at rest. The build tests the gates' open share at the step and at half of it, and GPU parity covers them.
- **Levels.** The direction is measured in three cells, level 5 for those pairs; its extension to every A-type is the authors' reading, level 2, which the component takes. The form is ours, level 0, with no value to set, so it is a fidelity component, not an entry among the parameters, and the budget stays 18.
- **Two checks, reported and not graded.** Liu et al. found that knocking the junctions down greatly reduces AVA's bursts of transmission in VA5 and DA4: the rectified junction amplifies the chemical synapse. The model has both, so the build reports AVA-evoked activation in the A-types with the rectified junctions present and removed. And Liu et al. measured input resistances of 2.50 GΩ for AVA and 3.47 GΩ for VA5, where a review's calculation of the model now gives about 0.19 GΩ for AVAL and 3.5 GΩ for VA5; the build reports both models' figures.

**The model's form and its calibration.**

- **The conductance form.** S's fit is calibrated in the conductance form, where the head switch and proprioception drive towards the model's reversal potentials (PLAN §4.3), since the refit's current form holds neurons far outside them. The current form stays for the refit.
- **The procedure: R's third round's,** for S's model and for every null if S's fit is chosen (PLAN §7.3): sixteen searches of 250 evaluations from the survey's Latin hypercube, CMA-ES seeds 11 to 26, then the four with the lowest objective on their final checks continued to 750, 6,000 evaluations in all; the objective the frequency, wavelength and speed alone, the speed's target 0.15 body lengths per second; no reversal term; seeds 1001 to 1004 for the search and 1005 to 1020 for the final checks.
- **The noise.** With no reversal term, σ_n and τ_n are tuned on the kinematics, and the reversal rate is a prediction. That departs from spec §4's "magnitude calibrated to the spontaneous reversal rate", as round 3 did, which named only spec §1.2; the build amends spec §4 and PLAN §6.2's σ_n row, with the maintainer's sign-off.
- **The open item.** With no reversal term, the head switch's slips can't meet one, which settles the item PLAN §9 left open for the nulls if S's fit is chosen; if the refit stays, it stays open for the refit's procedure (corrected after review).
- **The measure first.** S's calibration and §7.2's comparison of its picks run on checkpoint 1's debounced frequency measure, which lands first, in a pull request of its own: a rule independent of any pick, logged under spec §8, marked on checkpoint 1, and joining PLAN §7.4 and `VALIDATION.md`'s "What changed after results", with no past grade revisited (the entry above). S's use of round 3's procedure is marked on checkpoints 1 and 6, as round 3's was.
- **Bounds, rerun by their own rules on S's model,** and kept beside the registry's, by model, rather than replacing them, since the survey's and round 3's records are held to the registry's: the conductance form's 1 mV rule, reading each target's rest voltage, its threshold less its Δ, not its threshold; θ_osc's floor from the silenced head switch's drive; and σ_n's from the most-spread neuron at 20 mV under white noise, as 0.169 was set, whose analysis the build writes, since none is in the tree. Touch's currents and AWC's gains are rules set at the rest, and are rerun by those rules on S's model.
- **The runner.** `npm run calibrate -- --track-s`, with its own guard and record, `data/calibration/s1.json`; the equivalence script's fit `track-s`, with its picks and its chosen record; and S's model as an option the loop's parameters, the calibration's jobs and the equivalence trees' keys carry, since the round 3 mode, the equivalence script's fits and `currentParams()` are each written for R.

**The choice.**

- S's four picks take §7.2's comparison in their order, down the four until one passes; that pick is S's fit.
- **It replaces the refit whatever the two grade,** since the refit's voltages lie outside the model's range and S's model is the more faithful, as R's third round's rule had it (PLAN §9). The registry takes its twelve values and the conductance form; the signs move into the main overrides file; the data's version and `MODEL_VERSION` rise, with entries in `tests/model-versions.json`; the app, the harness and GPU parity run it; the visual baselines come from CI; the app's Safari check runs; and a release 0.2.0 follows (PLAN §8).
- **Then, on S's fit:** checkpoint 1 on its own trials, the first 20 of the comparison's at dt, with the speed's interval, and the diagnostics of what paces the crawl, the switch off and weakened and the B-types, the A-types and AVB lesioned (PLAN §7.4); checkpoint 0 again, its result reported without undoing the choice.
- **If no pick passes,** the refit stays the app's fit, on the model and signs it was calibrated on, and S's model stays in the code as an option, as the planned model is kept (`src/science/planned.ts`), its signs in their side file.
- **The crawl gate stands** (PLAN §9). If S's fit grades at least partial on checkpoint 1, checkpoints 2 to 6 run on it by their protocols, every null tuned by S's procedure.
- **Fitted, not predicted.** S as a whole was proposed after the previews of 2026-09-29, so on S's fit checkpoint 2, checkpoint 4's klinokinesis row, which counts reversals as reorientations, and checkpoint 5's rows that read reversals are reported as fitted, whatever each change's origin (PLAN §10). The signs came from the audit, which the missing backward mode prompted. Rectification and the offsets were first proposed at the go/no-go, before any preview, and R's first round left them out, but they return in a programme written after the previews. Checkpoint 3 reads forward speed and is not marked. Considered: marking only the signs' rows, as the rule of 2026-09-29 named them (corrected after review: the first draft said rectification was prompted by the missing backward mode, and left checkpoint 4 unmarked).

**What S won't show** (rewritten after review). S doesn't pace the crawl: the head switch still sets the rhythm whatever the command state, and the audit placed the missing backward wave in the motor layer. It may slow the crawl: the offsets cut the A-types' resting release to a fifth and raise the D-types' by 38%, and September's nearest variant lost speed. Rectification lies within the backward pathway, not between the modules: the yoke between them the audit named, the 52-section AVA–PVC gap junction, is untouched. With its gates closed, rectification takes about two fifths of AVA's gap load away (AVAL 2.10 of 4.66 nS, AVAR 1.89 of 5.14, a review's calculation), which raises the leverage of AVA's chemical inputs; it also takes away AVA's gap drive into the A-types, leaving AVA's command of them to chemical synapses of at most 5.7 pS a section, which could weaken backward activity that AVA evokes. The odds the entry above gives S stand: 5% to 15% for a converged partial on checkpoint 1.

**The work, in order,** one pull request at a time:

1. These rules.
2. The frequency measure's rule and its build, with checkpoint 1's section regenerated beside the measure it replaces.
3. S's build, in three pull requests: the signs, with the side file, the citations and S's model option; the offsets, with the per-neuron rest, the thresholds, the oscillators' shifts, relative drive's baseline, the bounds' rules rerun, touch and AWC rerun and the sensitivity settings; and rectification, with the gates' fixed point, on the CPU reference and the GPU, with parity in Chrome, in Safari and on CI and the benchmark. Beside them: spec §4's amendments for the offsets, rectification and the noise, for the maintainer's sign-off; the registry and FIDELITY, whose "every neuron rests at half activation" changes, with the glow's start and the inspector's sources; and `scripts/ci/changes.ts`'s reads for the side file. One to two weeks with reviews; the longest part is checking each row's quote against its full text.
4. S's calibration (about 3 hours on 14 workers, as round 3 took), its comparison, and the choice, with checkpoints 1 and 0 on the chosen fit and the release that follows.

**Exploration, disclosed.** None ran for these rules. They were designed after R's results; after the sign audit's probes on the real wiring, 1,700 trials (2026-09-29); and after the probe of 2026-09-27 of the offset's variants, 96 draws of R's model a variant, whose better variant S's offsets follow (2026-09-27). Two of the reviews ran rest solves on scratch copies of the model's modules, and no trial. CeNGEN's downloads page and the full texts of Liu et al. 2017, Liu, Chen & Wang 2020 and Nicoletti et al. 2024 were read for this entry, by anonymous requests. PLAN §9's fairness list gains S: its procedure was designed after the survey on the real wiring, whose starts and final-check seeds it reuses; only the real wiring goes down four picks; and its offsets' form follows a probe on the real wiring.

**Review: decisions, settled by the maintainer before the fixes.** Three reviews read the first draft, for its science, for whether it can be built against the code, and for its reading of the rules and the record. They found its figures right, the 37 pairs, the 25 rows and the resting activations among them, its quotes and the rectifier's sign convention right, and the offsets needing no change to the shaders. They found, and the entry now says:

- **Four questions, settled by the maintainer as recommended:** the rectifier's frame, its stepping, AVA's and AVB's offsets, and the noise (above).
- **Δ's sign,** given unsigned for the D-types.
- **The rest under rectification** is a fixed point of the gates, not one linear solve.
- **The signs' home:** the main overrides file would have reached the refit through touch, AWC and the sensitivity runs; a side file keeps them apart.
- **The record of AVA and AVB:** both were recorded, so their midpoints are a choice, not a gap.
- **The sign criterion** was stated loosely and applied unevenly: it is now fixed, it departs from the audit's two examples, and AVA's unrecorded synapses onto the A-types and the AS neurons keep the rule's sign.
- **The provenance of the fitted marks,** and checkpoint 4's klinokinesis row.
- **What S won't show:** the yoke between the modules is AVA–PVC, not AVA–A-type, and S may slow the crawl.
- **What the build needs:** per-neuron rests in the code, the bounds kept by model with the 1 mV rule reading the rest, σ_n's analysis written, touch and AWC rerun, S's own runner and fit, the GPU's gates, a class map for the D-types, and spec §4's amendments.
- **Smaller:** the dorsal classes' values are our choice; the clash's history and the probe's variant; rectification's extension at level 2, and DA4 measured; the paper's reviewer's dissent; Liu et al.'s amplifier and input resistances as reported checks; the open item made conditional; S's fairness bullet; the entry above's error on VB6's and VD5's rests, corrected in place.

**Status.** Set before any of it is built, and revised after review, for the maintainer's approval in this pull request; nothing in it has run.

## 2026-10-01 — Checkpoint 1's frequency counts a crossing once the bend has left a band (changed after results; set before its build; revised after review)

**Why.** The programme after R fixes checkpoint 1's frequency measure before any new calibration, by a rule independent of any pick, and track S's calibration waits on it (the two entries above). Checkpoint 1 takes the frequency as half the mid-body curvature's crossings of each bout's mean, over the bouts' total duration (PLAN §7.4). Gaits that linger near the mean cross it in pairs a fraction of a second apart: 17% to 23% of the crossings in R's third round's picks 1 and 4 were pairs under 1 s apart, the count moved with the step while the head switch's cycle barely did, and the calibration's objective, which reads the same count against 0.30 Hz, may have rewarded the short crossings (2026-09-30). This changes checkpoint 1's measure after results, as spec §8 allows when it is logged and the checkpoint marked; it is set here before it is built.

**Decision.**

- **The rule.** A crossing of a bout's mean counts once the mid-body curvature has left a band of ±h about that mean on the side opposite to the one it last left it on. A bend that stays within the band, or noise about the mean, counts none; a bend that leaves it and comes back on the same side counts none either; a bout that starts inside the band counts nothing until the curvature first leaves it. The frequency is half these crossings over the bouts' total duration, and the wavelength follows it as before (PLAN §7.4).
- **The band, from real worms' measured curvature.** h is the band within which real worms' measured mid-body curvature sits 5% of the time, read at the model's own span: over the 6,655 pinned postures, the 5th percentile of the magnitude of κL less its mean, at the mid-body, over one segment's span about the body's midpoint, which is what the model reads at its rod 24 of 49. It is 0.308, so h = 0.31 κL to two significant figures. The 5% is a convention, the lower tail matching the 95th percentile the 1 mV rule takes (PLAN §7.3). The data build reports the figure from the pinned postures, and a test holds the code's to the report, as the 1 mV rule's curvature is held.
- **What the figure means** (revised after review: this said every real undulation leaves the band, which percentiles of single postures can't show). The same distribution's median, 4.6, puts a typical real undulation at about 6.5 κL in amplitude, which spends about 3% of its time inside ±0.31. Some of the postures' lowest values come from shallow or straight frames, pauses and turns among them, and from measurement noise: at one segment's span about a third of the curvature's variance isn't shared with a reading over a tenth of the body, a review found. Both pull the band down, so the rule errs towards counting. The band grows with the span it is read over, to 0.38 at two segments, 0.45 at three and 0.49 at a tenth of the body; the model's span sets it.
- **How it grades a shallow worm** (added after review). A worm whose bends all stay within the band has a frequency of 0 and fails the frequency clause; its wavelength is unmeasured, now as "no mid-body bend past the band" rather than "no mid-body bending"; and in the calibration's objective its frequency's error is 1, not the cap of 2 a worm without a bout takes. Track S's procedure, round 3's, scores a worm without a bout at the cap and has no spectral fallback, so the two paths can't trade places in its search (PLAN §7.3).
- **Its edges** (added after review). At a bout's ends the band loses a crossing that began before the bout or falls in its last moments, so a shallow gait reads low. On clean waves at 0.3 Hz with random phases, a review found the band's count at 0.993 of the plain count for an amplitude of 5 κL over bouts of 10 s, 0.967 for 1 κL, 0.927 for 0.5 κL and 0.881 for 0.35 κL, and 0.962 to 0.998 over bouts of 30 s. It follows from the rule, and is reported rather than corrected.
- **Where it applies** (corrected after review: this said the convergence study's scripts were left as they were). Checkpoint 1's kinematics, and through them every calibration's objective and §7.2's comparison from now on, track S's first. The convergence and fixes studies' scripts grade through checkpoint 1's code, so a rerun of either now differs from their tables of 2026-09-28 wherever a gait lingers near its mean, which their headers now say. GPU parity's long runs keep the plain count only while checkpoint 1 is below partial, in `src/sim/bodyWave.ts`, which compares the GPU with the CPU and grades no worm; once checkpoint 1 is partial they are measured as checkpoint 1 measures them, band and all (PLAN §7.2). The go/no-go's script and the convergence study's lone oscillator keep their own plain counts.
- **No past grade is revisited, and nothing can quietly do it** (revised after review, which found nothing stopping a rerun). The records made under the plain count keep it: the calibrations' records and §7.2's comparisons, with their verdicts, are not rerun, and each names the commit it was made at. A full run of §7.2's comparison now refuses while its fit's committed record exists, and so do round 2's full calibration, the probe and the survey; round 3 and the bounded calibration already refuse by their own rules. Moving a record aside is a decision to rerun. From track S's runner on, each record names the band it counted with, which S's build adds, so the comparison's section can tell the two counts' records apart.
- **Checkpoint 1's section** is regenerated on the refit, as the harness writes it, with the plain count reported beside the new one. The refit fails checkpoint 1 on its speed and its bouts whatever the frequency, and the band's count never exceeds the plain one, so the change can't improve its grade.
- **The markers.** Checkpoint 1's row and its kinematics in PLAN §7.4, the measures of §7.2's comparison and §7.3's calibration, and `VALIDATION.md`'s "What changed after results" and known simplifications.
- Considered:
  - a time debounce, counting crossings at least 0.5 s apart, which would count a chatter of three crossings as two. PLAN §7.1's head swings use such a gap together with an amplitude test, a peak past 10° between crossings, which is the nearer precedent for a band;
  - a band at the 1st percentile, 0.025, which debounces almost nothing, or at the 10th, 0.71;
  - a band relative to each bout's own spread, which would count a bout of tiny wiggles in full;
  - the mid-body spectrum's peak, whose resolution over a bout of 10 s is 0.1 Hz;
  - the ±0.5 κL band the entry of 2026-09-30 tried, which was seen passing three of round 3's picks.

**Exploration, disclosed** (revised after review). The rule was set after the entry of 2026-09-30 found that a band of ±0.5 κL would pass three of round 3's four picks at the half step. Only the band's width comes from the postures alone: its form, a band about each bout's mean, is the form that exploration tried, and the convention and the span were chosen knowing its result. Whether ±0.31, which is narrower, removes the short pairs that prompted the change is not known, since no pick is run again under it. The rule and its build landed in one commit (`1de1773`), so the order rests on this entry; no trial ran under the band before the commit.

**Built.** `FREQUENCY_BAND` and the band's count are in `src/validation/motion.ts`, which checkpoint 1, the calibration's objective and §7.2's comparison all read; the plain count stays beside it as `meanCrossings`, for the report. The data build reports the band from the pinned postures (`data/reports/data-build.md`), 0.308 as computed here, and `tests/frequency-band.test.ts` holds the code's 0.31 to it; `data/sources.json` and `DATA_SOURCES.md` now say the postures give it. Tests cover a clean wave, which both counts read alike, chatter within the band, which the band counts as none, a slow wave with chatter riding on it, 39 plain crossings and 7 by the band, and a bend that leaves the band and returns to the same side. One regression pin moved with the count: the resampling's interval in `src/validation/equivalence.test.ts`, computed on synthetic waves, where a crossing near a bout's edge is now counted where the curvature leaves the band rather than where it crosses the mean; the test says so and keeps the old values in its comment. A review reproduced the old pin exactly with the plain count, so the draws themselves are unchanged. The guards are `recorded` in `scripts/harness/equivalence.ts` and `committedRecord` in `scripts/calibrate/run.ts`, each tested.

**Checkpoint 1 on the refit, regenerated** (`npm run harness -- --checkpoint 1` at `1de1773`, on 8 workers). Every figure is as it was: 24 crossings by the band and 24 by the plain count over the 12 bouts, 0.099 Hz, and the grade, a fail on the frequency, the speed and the bouts. The refit's bends are far larger than the band, so it changes nothing there.

**Review.** Two reviews read the pull request, of the rule and the record and of the code. They found the count matching the rule exactly, the build reading the mid-body as the model reads its own rod, every figure reproducing from the pinned file, the plain count byte for byte the old one, CI tracing the data job to the measure, and checkpoint 1's section unchanged but for the run line and the new sentence. They found, and this entry and the code now say:

- **The scope was wrong:** the convergence and fixes studies grade through checkpoint 1, and long-run parity's branch for a partial checkpoint 1 takes the band.
- **Nothing stopped a regrade:** a full comparison of round 3's pick 1 would have run under the band and overwritten its record; the comparison and three calibration modes now refuse while their committed records exist.
- **The figure's meaning was overstated,** and the disclosure stopped short: only the width is independent of the picks, and whether it removes the short pairs is unknown.
- **What a shallow worm gets,** the band's edge bias, and the records naming their count from track S on.
- **Smaller:** the unmeasured wavelength's reason, a duplicated header I had written into the convergence study's script, a stale known simplification, the pointers in PLAN §7.2, §7.3 and §9, where "debounced" read like the time debounce this rejects, the sources' description of the postures, a comment on the report's facts, and the report's minus sign.

**Status.** Set before its build, built, revised after review, and checkpoint 1's section regenerated on the refit; no other record is rerun.

## 2026-10-01 — Track S's signs, built: a side file, a generated module and a switch only track S's model throws (revised after review)

**Why.** Track S's rules set its build in three pull requests, the signs first (the entry before last). This records the first: the measured signs, the citations they rest on, and the switch that applies them to track S's model alone, leaving the refit and the app as they are.

**Decision.**

- **The side file.** `data/sign-overrides-s.csv` has the main overrides file's columns and 44 rows, one per Cook connection, each with its citation and quotes from the source with the row's caveat. Every quoted fragment was checked against the paper's full text before the file was written, from the sign audit's local copies (`harness-out/sign-audit/`, gitignored, which hold the publishers' texts), and found verbatim; a review checked them again, case and punctuation included.
  - **Flipped to inhibitory,** 27 connections, 346 sections: AVA→AVB 3 and AVB→AVA 4, each direction recorded on its own (Roberts et al. 2016), ASH→AVB 2 (Roberts et al. 2016), PVP→AVA 4 (Zhang et al. 2025), AIB→RIM 4 (Piggott et al. 2011), AIB→RIB 2 (Wang et al. 2020) and SAA→RIM 8 (Huo et al. 2024).
  - **Confirmed,** 17 connections, 413 sections, their signs unchanged and raised to cited physiology: PVP→AVB 4 and DVC→AVA 2 (Zhang et al. 2025), ASH→AVA 3 and ASH→AIB 2 (Piggott et al. 2011), AIY→AIZ 2 and AIY→RIB 2 (Li et al. 2014), and AIZ→RIA 2 (Lin et al. 2024).
- **Where the criterion and the rules' list parted** (revised after review). The rules fixed the criterion and listed the rows they expected it to give; the full texts decided, by the criterion.
  - **AVA→VA5 is left out, and so is AVA→DA4** (corrected after review, which found the first draft's reason wrong). Liu et al. 2017 recorded VA5 under voltage clamp at −60 mV with a chloride-loaded pipette, where, as they write, "An inward current was expected upon the activation of either a non-selective cation channel or a Cl− channel". Knocking down AVA's acetylcholine release removed VA5's bursts, so the recordings show that the transmission is AVA's and cholinergic, not its sign; "AVA excites A-MNs" summarises a model of the result. VA5 and DA4 stand alike, and the rule's + stays on both.
  - **AIY→RIA is left out** (after review). Liu et al. 2018 silence AIY with tetanus toxin and record RIA's synchrony with odour pulses falling, a response with no sign; the sign comes from AIY's and RIA's opposite responses to the odour, recorded apart. That is the kind of evidence the rules exclude for AIB→SMD, and the expression rule's − stays.
  - **ASH's three connections join** (after review, which found them in sources the file already cites). Roberts et al. 2016 recorded AVB while driving ASH, the method of AVA⇄AVB, and found the reversal potential "more negative than the zero current potential, indicating inhibition", allowing that it may come through AVA. Piggott et al. 2011 restored nose touch's EPSPs in AVA and AIB by restoring glutamate release in ASH alone. The criterion adopts a sign whichever way it points, so ASH→AVB flips and ASH→AVA and ASH→AIB are confirmed.
  - **DVC→PVP has no Cook connection.** Zhang et al. 2025 record DVC inhibiting PVP by patch clamp, but Cook has no chemical connection from DVC to PVP; DVC→AVB, which Cook has, gave no response and takes no sign.
  - **Rightly out, a review found:** ASH→AIZ, which Lin et al. 2024 lay on gap junctions; AIZ→RIM, with no response; AIB→AVA, by silencing and calcium imaging; and Meng et al. 2024's slow excitation of AVB, extrasynaptic.
- **The caveats** (revised after review) say which rows rest on calcium imaging, some in freely moving worms, whose drivers reached other cells, that RIM was itself held depolarised in Huo et al.'s imaging, and that only inhibiting AIY acted on AIZ.
- **The build checks it as it checks the main file:** each row parses, cites the registry, names a connection Cook has, and appears once across both files, by `signChemical` run on the two merged. Its errors now name the file a bad row is in, and the edge an override lists twice (after review). The build report gains a section listing each row beside the sign the runtime file gives it (`data/reports/data-build.md`, "Track S's measured signs"). The side file is stored byte for byte, as the main file is (`.gitattributes`).
- **The generated module.** The build writes `src/data/trackSSigns.ts`, each row's connection, sign and citation, with the side file's digest, and `data:check` fails when it is stale; CI runs the data job when the module alone changes (after review). A module rather than a file the app fetches, so that track S's rows reach a World in Node and in the browser alike, the GPU's parity page among them.
- **The switch.** `measuredSigns` on the loop's parameters makes a World build everything from a copy of the data with S's rows applied (`src/sim/trackS.ts`), one copy for each runtime data object: its brain, and every layer read from the data, touch's currents among them. Left out, as the refit and the app have it, the World reads the runtime data as it is, so neither moves: the runtime file, its version and the model's fingerprint are unchanged.
  - **AWC's gains** are constants set at the runtime data's rest, so track S's model reads them unchanged here; the offsets' pull request reruns them by their rule on track S's model, as its rules set (corrected after review: the first draft's module comment said they read the signs). A review computed them on these signs: AWCL 3.73539 and AWCR 5.51807, against 3.73338 and 5.51839.
  - **A network beside the switch is refused** (after review): a World can't tell which signs built a network it is given, so track S's model takes none until its contrast brains are built from its data.
  - **The copy keeps the runtime file's version,** which its signs no longer match; a record tells track S's model apart by its loop parameters.
  - **Still to thread,** in the pull requests that use them: the calibration's jobs and `currentParams()`, the comparison's manifests and parameters, the harness and its sensitivity networks, which would cover 1,957 connections under track S's signs, not 1,986, and GPU parity's setups.
- **Citations.** Eight are registered, each checked against Crossref: roberts2016, meng2024, zhang2025, piggott2011, wang2020, huo2024, li2014 and lin2024. Meng et al. 2024 is cited by the caveats on AVA⇄AVB. Kumar et al. 2024, which the rules listed, and Liu et al. 2018 are cited by no row, so neither is registered; liu2020 waits for the offsets' sensitivity setting.
- **The ledger.** A component, "Track S's measured signs", at level 5, says the signs are built for track S's model, which no fit uses yet, and that level 5 overstates the rows resting on calcium imaging; `FIDELITY.md` regenerates with it, and the app's "About the science" shows it. The rules said FIDELITY and the inspector would show only the signs the app runs: the inspector does, and the ledger names track S's beside them.
- **Corrected from the rules.** They said S's file would be listed in `DATA_SOURCES.md` beside the main overrides. That page lists datasets, and the main overrides aren't on it; both files are reported in the build's report instead.

**Exploration, disclosed.** None. No trial ran; the full texts were read from the sign audit's local copies, and the citations checked on Crossref by anonymous requests. A review's computation of AWC's gains ran on the CPU modules, with no trial.

**Review.** Two reviews, of the rows' evidence and of the code. They found every quote verbatim, every sign matching its paper, the rows matching Cook's connections, the citations matching Crossref, the switch isolated from the refit and the app, and the build's checks doing what they say. They found, and this entry and the code now say:

- **AVA→VA5 failed the criterion,** its sign not shown under the recording's chloride; and the first draft's reason for leaving DA4 out was wrong.
- **AIY→RIA** rested on silencing and an unsigned response, the kind the rules exclude.
- **ASH→AVB, ASH→AVA and ASH→AIB** met the criterion in sources the file already cited.
- **Caveats** on drivers, on calcium imaging and on what was recorded, row by row and in the ledger, whose "every" overclaimed.
- **The code:** a module comment claiming AWC's gains read the signs; CI skipping the data job when only the module changed; errors naming the wrong file; a network accepted beside the switch; the side file's line endings; an export that would have run the build if imported; and the copy rebuilt for every world.

**Status.** Built and revised after review. The offsets come next, in a pull request of their own.

## 2026-10-02 — GPU parity's one-second checks, dealt across four Chromes (revised after review and its first CI run) in CI

**Why.** The GPU job had grown to about eleven minutes, much the slowest of CI's jobs, and the maintainer asked for ways to shorten it. Its parity checks took 621 s at `2312fe1` and the benchmark after them about 20 s more; setup took under a minute. The run's own figures put the cost in the one-second checks: on SwiftShader, Chrome's software GPU, a loop step takes about 8 ms, and the loop's 145 one-second states take 400 steps each, about 470 s, with the brain's 21 about 60 s more; the CPU reference in the page, at 13 times real time, takes about 30 s. The shader runs a whole world in one workgroup, which SwiftShader executes on one CPU core, so three of the runner's four cores sat idle. Track S's offsets and rectifier will add parity setups, which would take the run towards the runner's 900 s limit.

**Decision.** The maintainer chose the recommendation: deal the checks across shards, and take no benchmark in CI.

- **What is dealt.** Only the one-second checks, the brain's and the loop's, round-robin by their place in the whole run's order; every shard runs everything else whole: the noise, the API checks, the one-step states, the lesioned variant and the odour field. Those are cheap and deterministic, and every shard must pass them, a shard that fails one named in the merged report. Running them in every shard was meant to cost no time; on CI's four cores it costs some (below).
- **The merge** (`src/gpu/parityShards.ts`). The runner launches four pages, each in a Chrome of its own, with `?shard=k/4`, writes each page's report (`parity-shard-k.json`), and merges them: each list of one-second results is interleaved back into the whole run's order, after checking that the shards counted the same number of places and that each holds exactly the results the deal gives it, and the pass rules are applied again to the merged run. So the rule that at most a quarter of the states may go ungraded is taken over the whole run, never per shard. The pass rules moved into that module, so the page and the merge apply the same ones.
- **Defaults.** `npm run gpu:parity` takes four shards on CI (`WEBGPU_CI`) and one elsewhere, and `--shards=N` sets it. The long runs and Safari take one: they run locally, on a real GPU. A sharded page takes its benchmark only when asked, and the runner asks only on a whole run, since a finished shard's benchmark would share the cores the others are still using. The benchmark times SwiftShader, which says nothing about a real GPU, and nothing grades it.
- **Checked here.** On this Mac's GPU the whole run and four shards gave identical results, every one-step and one-second state in the same order, and both passed: 19.6 s whole, 8.7 s in four shards.
- **CI's first sharded run, short of the estimate** (added after it ran). At `637627d` the checks took 395.5 s on SwiftShader, against 621 s whole, and the job 436 s, against about 670: 1.6 times faster, where about 3 was expected. The estimate assumed a dispatch runs on one core and that the checks every shard runs whole are free; on four cores shared by four Chromes, each with its renderer running the CPU reference, neither holds exactly. Each page now reports how long each part of its run took, and the runner prints it, so the next run shows where a shard's time goes before anything more is dealt.
- **The page and the runner, after review.** A page opened with `?shard=k/n` says its verdicts are the shard's, not the run's, and refuses `?long`; the runner refuses an option it doesn't know, so `--shards 4`, without the `=`, no longer becomes the output directory; and each page's errors are named by its shard.
- Considered: fewer one-second states, which would weaken the check and change PLAN §7.2's protocol; running parity only after merging, which would let a failure reach `main`; a larger runner, which a run bound to one core can't use; Mesa's lavapipe in place of SwiftShader, whose gain is unknown; a world spread over many workgroups, a shader rework out of proportion to a CI saving; and skipping the GPU's second for states the CPU leaves ungraded, which would drop their errors from the report, left for now.

**Exploration, disclosed.** None; parity's checks and thresholds are unchanged, and no trial ran.

**Review.** A review of the code found the deal and the pass rules correct, every shard placing each check alike, and the runner closing every Chrome when a shard fails. It found, and the code now does: every shard's odour-field check counts, where the first draft took only the first shard's; each page reports the run's number of places, so a shard short of its last result is caught; each shard's report is written before the merge, and a shard that fails a check it runs whole is named; and the corrections to the page, the runner, the CI workflow's comment and four comments citing the wrong date.

**Where a shard's time goes** (CI at `c88f4ff`: the checks 410.7 s, the job 474 s). Each shard, by part, in seconds:

| Part                                                | Shard 1 | Shard 2 | Shard 3 | Shard 4 | Dealt |
| --------------------------------------------------- | ------- | ------- | ------- | ------- | ----- |
| Loop, one-second states                             | 208     | 206     | 205     | 204     | Yes   |
| Brain, one-second states                            | 34      | 27      | 29      | 31      | Yes   |
| Loop, states: each setup's trajectory and GPU world | 62      | 62      | 62      | 63      | No    |
| Loop, API checks                                    | 66      | 66      | 66      | 67      | No    |
| Loop, one-step states                               | 12      | 12      | 12      | 12      | No    |
| Brain: states, noise, API, one-step states, variant | 27      | 27      | 27      | 27      | No    |

- **The duplicated parts aren't free.** About 167 s of every shard's 410 is work every shard repeats, on the same four cores.
- **The dealt parts slow down too.** A loop one-second state takes about 5.7 s under four shards, against 3.2 s in the whole run, so the cores are shared more than a single-threaded SwiftShader would explain, and dealing everything perfectly would give at most about 2.2 times.
- **Left, with its estimate.** Dealing the loop's API and one-step checks by setup, and giving the brain's whole checks to one shard each, would cut about 70 s from each shard; the loop's states would still repeat unless one GPU world served every setup, which would change what its API checks test. Together, a job of about 5.5 to 6 minutes, against 7.5 now, for a merge rebuilt around which shard owns which setup. Not taken now: the job is already about four minutes shorter, and the rest is a smaller gain for more machinery.

**Status.** Built and revised after review; the checks are 1.5 to 1.6 times faster on CI.

## 2026-10-02 — Track S's offsets, built: the D-types alone, since the A-types' would sit above E_exc (settled by the maintainer during the build; revised after review)

**Why.** Track S's rules set its build in three pull requests; the signs landed first (the entries of 2026-10-01). This is the second: the class offsets, with everything set at rest that they move.

**What was built.**

- **A rest from offsets** (`src/sim/brain/brain.ts`). A neuron Δ mV below its threshold rests at activation s = a_r φ/(a_r φ + a_d), φ at V_th − Δ (`restActivation`), which at Δ = 0 is the midpoint value exactly as before. The held solve and everything that reads it (the passive loads, input conductances and responses) take a value per neuron as well as one for all; `restOf` solves the rest with every activation held at its own value and sets each threshold at that rest plus Δ. A Brain, on the CPU and the GPU, carries its offsets, and `rest()` puts each neuron Δ below its threshold at its own activation, the oscillators' recovery set where that leaves them. With every offset 0, every path is bit for bit the old one, and the model's fingerprint test is unchanged.
- **The switch.** `restOffsets` on the loop's parameters (`'measured'`, or `'measured with AVA'` for a sensitivity setting) sets each neuron's offset by class (`src/sim/trackS.ts`); the World solves the rest from them, shifts each oscillator to θ − Δ, so it keeps its place relative to its neuron's rest, takes relative drive's baseline at each neuron's resting activation, and sizes touch's currents at that rest.
- **AWC's gain** is the bisection rule rerun on each model, pinned in a table by model (`AWC_GAINS`) since the rule takes about a second a side, and a test recomputes each: AWCL and AWCR are 3.73338 and 5.51839 for the runtime model, 3.73539 and 5.51805 with S's signs, 3.73541 and 5.51798 with its offsets as well, and 3.73541 and 5.51800 with AVA's too. A World refuses a model whose gain isn't set.
- **The bounds' rules, rerun on S's model** (PLAN §7.3), each reproducing the registry on the runtime model first. The conductance form's 1 mV rule, reading each target's rest voltage, which for every target, the SMDs and the A- and B-types, is its threshold, since none takes an offset, gives g_sw 0.0217–47.5 nS and g_p 0.000172–7.65 nS per unit of κL; θ_osc's floor, the first whole mV above the silenced head switch's drive, sits above S's −28.14 mV; and σ_n's bound gives IL2DL a 20 mV spread at 0.1687. Rounded as each rounds, every one is the registry's: 0.02–50, 0.0001–8, −28 and 0.169. So S's model needs no bounds of its own, and a test holds that; S's silenced drive sits 0.14 mV below the floor, against the refit's 0.47, most of the loss from the signs, which alone put it at −28.18 mV; it is deterministic, the leak's potential less the SMDs' thresholds, and rectification will move it again, which the test will catch.
- **σ_n's analysis,** which the tree lacked: with synapses held at rest the network is linear and symmetric, so under white noise of intensity σ each neuron's voltage spreads with a standard deviation of σ/√(2·C·G_in), G_in its input conductance; the bound is the σ at which the neuron with the least G_in spreads 20 mV. White noise's bound also caps the coloured current, whose power lies below it at every frequency (2026-09-28). It reproduces the registry's 0.169 on the runtime model, IL2DL at 0.03556 nS, which a test now holds as well.
- **GPU parity** gains a "track S" setup: S's signs and offsets in the conductance form, so both sides rest the D-types off their thresholds. It passes, and the sharded run matches the whole one, now over 156 loop one-second states. No oscillating class takes an offset now, so no oscillator is shifted, and parity doesn't exercise the GPU's recovery formula with an offset; a unit test checks the CPU's (corrected after review, which found the comments saying otherwise).

**The A-types' offset, found unworkable during the build.** The rules set the A-types 18.5 mV below their thresholds and the D-types 7.4 above (the entry of 2026-10-01). Built so, the A-types' thresholds landed near +10 mV, VA5's at +10.28 mV: the model's neurons rest near −10 mV, between reversal potentials of −48 and 0 mV, where the animal's motor neurons rest near −46 to −72 mV (corrected after review from −53), so a difference that leaves VA5's threshold about 53 mV below the excitatory reversal potential in the animal put it 10 mV above it in the model. No chemical synapse could then bring an A-type to the midpoint of its release, though gap coupling to neurons the oscillators lift, and the noise, still could: at E_exc its sigmoid stands at 0.22, and its activation at about a quarter of a synapse's ceiling, so only the oscillator's current could lift it further. It also failed two of the new setup's GPU one-second states, at steep upswings of VA5 and DA6 through about 0 mV, where the GPU lagged the CPU by 0.33 mV for a sample and parity's 1 mV floor turned that into a share of 2.1 and 1.7. A debug page found the neurons, and the CPU's own runs from f32-rounded states found no sensitivity that would explain it; with the D-types' offset alone those states' shares fell to the CPU's own.

For the D-types the rule "only the differences transfer" holds in the narrow sense that their thresholds land inside the range, at −16.1 to −8.9 mV, median −10.8 (corrected after review from "near −18"), and fails for the A-types. In a wider sense it holds for neither, a review found: the model's D-types rest near E_exc with or without the offset, at about −8.7 to −1.5 mV in S's model against −8.0 to −1.4 in the refit's, where VD5 rests about 46 mV below it in the animal. With the offset they release at 75% of a synapse's ceiling at rest, against 55% at the midpoint, can rise only about 9% further when driven to E_exc, against 16% without it, and respond to small signals at 0.75 of the midpoint's gain, so excitation of the D-types moves their release little, and their inhibition is mostly tonic, modulated downward. Relative drive takes that tonic inhibition into its baseline, so the muscles start at zero drive, but each muscle's range grows by 0% to 21%, median 6.6%, which no single g_nmj can undo muscle by muscle. These are recorded, and the sensitivity setting with the offsets off will show their effect once S's fit is chosen.

**Decision.** The maintainer chose the recommendation: the D-types' offset alone. The A-types keep their midpoint for two reasons, VA5's −71.7 mV being the down state of an alternation, which the rules had already weighed and kept the offset over, and, the new and decisive one, its difference putting their thresholds above E_exc in the model's frame. A test now holds every threshold within the reversal potentials. Considered: shrinking both offsets into the model's frame by the B-types' headroom to E_exc against the animal's 53.2 mV, a new rule set after results, whose headroom runs from about 8 to 14 mV over κ_gap,B's box, so that it would tie an offset to a calibrated parameter (corrected after review from a fixed 10.5 mV, which leaves the A-types about 3.6 mV below and the D-types 1.5 above); after review, keeping the A-types' offset as a sensitivity setting, as AVA's is, capping it at the headroom, or taking VA5's time-averaged potential, its up state at −38.3 mV lying above VB6's rest; keeping the measured values, the A-types recruitable only by their oscillators, with parity's floor changed after results; and dropping the offsets from S.

**The registry.** `restOffsetD`, −7.4 mV, joins the parameters at level 2, from Liu, Chen & Wang 2014, and the code reads it from there; its note carries the measurement's uncertainty, 7.4 ± 3.1 mV in wild type and from 0.1 to 8.8 mV across the strains whose rests the authors found unchanged, where the A-types' difference stays between 14 and 23 mV, so the offset kept is the less robust of the two; AVA's two offsets join it, `restOffsetAvaL` and `restOffsetAvaR`, for the setting; Liu, Chen & Wang 2020 is registered for the AVA setting, checked against Crossref; and a component, "Track S's class offsets", says what is built, that no fit uses it yet, why the A-types and AVA keep their midpoints, and that the shared midpoint is ours. Its level 0 widens the neurons subsystem's range in the ledger from 3–1 to 3–0. `FIDELITY.md` regenerates. Spec §4 gains a sentence on track S's offsets: the deviation was approved with track S's rules, and the wording is for the maintainer's sign-off in this pull request.

**Left for later.**

- The rest under rectification, a fixed point of the gates, comes with rectification, the next pull request; until then the rest is one solve.
- The harness's `--sensitivity` takes rewired networks alone, so the settings with the offsets off and with AVA's are wired in when S's fit is chosen and its sensitivity runs; the World already takes both.
- The app's glow, which starts every neuron at half, and "About the science"'s account of the rest, change only if S's fit is chosen and the app runs it.

**Review.** A review of the science and the record reproduced the A-types' finding exactly, all 21 thresholds between +6.25 and +13.18 mV, the resting activations, σ_n's closed form and its reading of the registry's rule, the bounds and Liu, Chen & Wang 2020's values; a review of the code found every path bit for bit the old one without offsets, the CPU's and GPU's rests agreeing, and AWC's table matching the rule. They found, and this entry and the code now say: the D-types' thresholds, the headroom's dependence on κ_gap,B, and the animal's range, misstated; the D-types' compressed range and what it does to relative drive; the down state as already weighed; Δ_D's uncertainty; comments still describing the A-types as offset, and parity as shifting oscillators; the shunt diagnostic taking its loads at the midpoint, now at each neuron's rest; a guard that no SMD takes an offset, which the head switch's gate assumes; a carried state keeping its voltage relative to its rest rather than its threshold; AVA's offsets in the registry; and tests of an offset oscillator's rest, of the AVA setting's World, of touch's currents at S's rest and of σ_n's rule on the runtime model.

**Exploration, disclosed.** No trial ran. A throwaway debug page, in the gitignored `harness-out/`, ran two parity states on both sides, and CPU runs from f32-rounded states tested their sensitivity; neither changes anything recorded.

**Status.** Built. Rectification comes next, in a pull request of its own.

## 2026-10-02 — Track S's rectifier, built: AVA's junctions with the A-types gated each step, and a bound of its own (revised after review)

**Why.** Track S's rules set its build in three pull requests (the entries of 2026-10-01); the signs and the offsets have landed (the entries above). This is the third: the AVA–A-type gap junctions rectified, on the CPU reference and the GPU, with the rest a fixed point of their gates.

**What was built.**

- **The pairs** (`src/sim/trackS.ts`). `rectify` lists every gap junction a network has between AVAL or AVAR and a DA or VA neuron, each as its A-type and its AVA: 37 pairs, 194 sections, AVAL's 19 and AVAR's 18, as the rules counted. A network carries the list, and a lesion or a gain keeps it, so a lesioned brain rectifies the junctions it has left and a rewired brain whichever it has. `rectified` on the loop's parameters switches it on, and the model's key gains it.
- **The gates** (`src/sim/brain/network.ts`, `src/sim/brain/brain.ts`). Each gap entry carries its junction's rule, and both entries of a junction read one comparison, the A-type strictly the more depolarised, so its conductance is the same in both rows and the system stays symmetric. The CPU keeps a copy of the gap weights, and each step rewrites the 74 rectified entries in it, each at its junction's conductance where it conducts at the step's start and at 0 where it is shut, and takes the copy for both the diagonal and the solve. Without a rectifier it takes the network's own rows, so every path without one is bit for bit the old one, and the model's fingerprint test is unchanged.
- **The rest** (`restOf`), a fixed point of the gates: every junction open, the rest solved, each gate set from it, and the solve repeated until no gate changes, a cycle throwing. On every variant it took three solves: every junction open; gated once, which changed the gates, from 13 open to 10 on S's whole model; and gated again, which kept them (corrected after review from "one gated solve"). At rest 10 of the 37 gates are open in S's whole model, 13 with its signs alone, 15 with AVA's offsets too, and 4 in the runtime model rectified. That is the count the rules' review found, though their A-types' move of 3.7 mV matches the runtime signs with both offsets as then planned, 3.65 mV, where the runtime model alone moves them 2.59 mV. S's A-types sit up to 2.4 mV (VA6) from the rest with every junction open. `restOf` also gives the network as the rest gates it, which every rule set at rest now reads: touch's currents, AWC's gain, the shunt's passive loads (`Brain.restNetwork`) and the bounds' rules.
- **On the GPU** (`src/gpu/brain.ts`, `src/gpu/brainShader.ts`), as the rules set it, though in the gap rows' order rather than a flag on every edge. Each neuron's gap row lists its rectified junctions first, and the topology buffer ends with two words a neuron: how many, and a bit for each, set where the neuron is the A-type. A padding word of the uniform block becomes `rect_at`, 0 without a rectifier. The shader publishes each neuron's voltage at the step's start beside its activation, before the barrier it already had; building its row, each neuron reads its partners' voltages there, keeps its open junctions as a bitmask in a register and sums their conductances, and the solver's products skip the shut ones. That publish replaces the one the rows made, whose barrier went: no buffer, no workgroup memory and no barrier were added. A neuron may have at most 32 rectified junctions, a bit each. Without a rectifier the layout and the arithmetic are the old ones. A unit test emulates the shader's gating on the packed layout against the CPU's gated network.
- **GPU parity's track S setup** gains the rectifier, and a test holds that its world's brain packs it and that its gates turn over the span its states are taken from. It passes in Chrome on the M5 Max, whole and in four shards, in Safari on the same GPU, and on CI's SwiftShader in four shards. Its worst one-step state is at 0.011 of its threshold on the M5 Max and 0.094 on SwiftShader; one of its eleven one-second states is ill posed and not graded, on all three (t = 6.5 s, the CPU against itself at 0.45 of the threshold), within the rule's quarter.
- **The app's speed** is unchanged, as the rules required it be measured: in headless Chrome on the M5 Max, `npm run plate:bench` holds 60 frames a second from 1× to 30× real time on main and on this branch alike, and asked for 50× both saturate, main at 32.8–34.7× over four runs and this branch at 32.3–34.2× over three. The app runs no rectifier, so its shader reads one word more a neuron each step and skips an empty loop.
- **The gates' open share at the step and at half of it,** which the rules called for. The brain's step is halved by neural sub-steps within the loop's 2.5 ms step, where §7.2's comparison halves the whole loop's. Over a minute at the conductance form's provisional values, seed 1, the two runs sharing one noise path, the share is 0.185 with the brain at 2.5 ms and 0.186 at 1.25 ms, and the open gates change on about ten loop steps a second. A test holds the two within 0.02, a bound set after a look at five seeds, where they differed by 0.007 at most.
- **AWC's gain,** pinned for the three rectified models: AWCL and AWCR are 3.73539 and 5.51805 with S's signs, 3.73540 and 5.51799 on S's whole model, and 3.73540 and 5.51800 with AVA's offsets as well. The rectifier moves them by about 10⁻⁵, AWC lying far from AVA's junctions (corrected after review from "under 10⁻⁵"). Like touch's currents, AWC's gain is set on the real wiring at its rest, as PLAN §4.2 has the layers outside the brain built for every brain, so where S's calibration takes κ_gap,B below 1 the gates they were set with can differ from those of the brain's own rest.

**The bounds' rules, rerun on S's whole model** (PLAN §7.3), each reading the network as the rest gates it. g_sw's rule gives 0.0217–47.5 nS, as without the rectifier; θ_osc's floor stays −28 mV, the rectifier moving S's silenced drive by 0.0015 mV, to −28.137 mV, through the SMDs' thresholds (corrected after review, which found the first draft's reason, that the silenced network has no junctions to gate, wrong: the drive reads thresholds set at the intact network's gated rest); and σ_n's bound stays 0.169, IL2DL's. g_p's rule gives 0.000143–6.36 nS per unit of κL, against 0.000172–7.65 without the rectifier: the shut junctions lighten the A-types' loads at rest, and DA8's, the largest, sets the top. Rounded outward its top is 7, not the registry's 8. As the rules have it, bounds are kept by model beside the registry's, since the survey's and round 3's records are held to those: S's model takes g_p from 0.0001 to 7, held in the registry beside the conductance form's own bounds (`conductance.trackS`, shown in FIDELITY's ledger), and a test recomputes it. S's calibration will read it. Its provisional value and its starts are the calibration's to set: PLAN takes the provisional value from the bounds' log midpoint, which is 0.026 for 0.0001–7 against the registry's 0.028, and the survey's Latin hypercube, given in the box's mapped units, maps onto the narrower range.

**Two checks, reported and not graded** (`node scripts/experiments/rectification/run.ts`; revised after review). Each AVA takes a current step for 1 s from rest, on the brain alone, in S's model three ways, each at its own rest:

| Into each AVA | Junctions | AVA (mV) | A-types (mV) | A-types (activation) | VA5 (mV) | DA4 (mV) | Gates open at the end |
| ------------- | --------- | -------- | ------------ | -------------------- | -------- | -------- | --------------------- |
| 1 pA          | rectified | +0.26    | +0.08        | +0.0004              | +0.05    | +0.12    | 9 of 37               |
| 1 pA          | removed   | +0.27    | +0.05        | +0.0003              | +0.04    | +0.04    |                       |
| 1 pA          | both ways | +0.23    | +0.13        | +0.0007              | +0.12    | +0.11    |                       |
| 10 pA         | rectified | +2.62    | +0.65        | +0.0033              | +0.42    | +1.09    | 3 of 37               |
| 10 pA         | removed   | +2.71    | +0.50        | +0.0025              | +0.38    | +0.38    |                       |
| 10 pA         | both ways | +2.24    | +1.25        | +0.0064              | +1.20    | +1.06    |                       |
| 50 pA         | rectified | +12.77   | +1.99        | +0.0100              | +1.38    | +2.16    | 0 of 37               |
| 50 pA         | removed   | +12.87   | +1.82        | +0.0092              | +1.34    | +1.29    |                       |
| 50 pA         | both ways | +10.58   | +5.48        | +0.0262              | +5.17    | +4.33    |                       |

And the other way, 1 pA into each A-type:

| Junctions | A-types (mV) | AVA (mV) | Gates open at the end |
| --------- | ------------ | -------- | --------------------- |
| rectified | +3.99        | +0.96    | 32 of 37              |
| removed   | +5.83        | +0.27    |                       |
| both ways | +3.37        | +1.23    |                       |

- **What Liu et al. measured.** With the junctions knocked down, "the frequency of PSC bursts was greatly reduced" in VA5, the bursts of synaptic currents AVA's activity drives, and the bursts' duration and charge fell too (their Fig. 7c and Supplementary Figs. 5 and 6). They read the rectifying junctions as serving "as an amplifier of chemical transmission from AVA to A-MNs". The model has no bursts, and its proxy is the A-types' depolarisation that a step into AVA evokes.
- **The model reproduces little of that amplification, and not by its mechanism** (corrected after review from "the model has no amplifier", and from a quarter at most, which the first draft's own runs at 1 to 5 pA contradicted). Removing the rectified junctions costs the A-types a third of their AVA-evoked rise at 1 pA (32%), a quarter at 10 pA (23%) and a tenth at 50 pA (8.6%). What is lost passed through the gates open at rest, DA4's among them, whose rise at 10 pA falls from 1.09 to 0.38 mV: as AVA rises above the A-types it shuts the gates it drives, 1 of the 10 open at rest at 1 pA, 7 at 10 pA and all of them at 50. Driven from the A-types, the junction does what a rectifier into AVA should: it loads them, their rise falling from 5.83 to 3.99 mV, and lifts AVA from 0.27 to 0.96 mV, current AVA's synapses can return to them; but they still rise less than with the junctions removed, so the loop shows no gain here. Against junctions conducting both ways, the rectifier takes away most of AVA's gap drive into the A-types, as the rules foresaw, and leaves AVA's command of them to its chemical synapses.
- **Input resistances** (GΩ), every activation held at rest and each gate as the rest sets it:

| Neuron | Runtime model | S's, unrectified | S's whole | Liu et al. 2017 |
| ------ | ------------- | ---------------- | --------- | --------------- |
| AVAL   | 0.19          | 0.19             | 0.23      | 2.50 (AVA)      |
| AVAR   | 0.18          | 0.18             | 0.21      | 2.50 (AVA)      |
| VA5    | 3.54          | 3.51             | 5.50      | 3.47            |
| VA8    | 6.62          | 6.52             | 13.92     |                 |
| DA4    | 3.75          | 3.75             | 3.75      |                 |

The rectifier raises AVA's by about a fifth, to about a tenth of the measured value, and VA5's by 57%, to 59% above it; VA8's doubles. DA4, whose gates are open at rest, keeps its own. Liu et al. measured them near rest, holding AVA at −25 mV and VA5 at −70 mV, and found "these unusually high input resistance values suggest that a small I_j could have a major impact on the membrane voltage in these neurons": the model's AVA, at a tenth of that, gives its junctions far less leverage. The runtime model's figures are the rules' review's, 0.19 and 3.5 GΩ.

**The registry.** A component, "Track S's rectifier", at levels 2 and 0, says what is built: the direction measured in three cells and extended to every A-type by the authors' reading, the form ours with no value to set, that no fit uses it yet, the gates open at rest in the model's frame, and how little of the amplifier it reproduces. The gap junctions' component, the synaptic strengths' subsystem and the omitted biology say that track S's model rectifies; `FIDELITY.md` regenerates. The budget stays 18. Spec §4 gains a sentence on the rectifier, beside the offsets': the deviation was approved with track S's rules, and the wording is for the maintainer's sign-off in this pull request.

**Left for later.** S's calibration, its comparison and the choice (the entry of 2026-10-01), reading S's own bound on g_p; spec §4's amendment for the noise, with that calibration; and the sensitivity settings in the harness, with the app's rest and glow, if S's fit is chosen.

**Exploration, disclosed.** No trial ran. Before the tests' values were set, the rest was solved on every variant; the open share was run for 10 s at three seeds and for a minute at five, at the conductance form's provisional values; and the checks' script was run at 1, 2, 5, 10 and 50 pA, of which the first draft kept 10 and 50 pA; after review it keeps 1 pA as well, and gained the step into the A-types. The refit's own values on S's model, in the current form, shut every gate within a second; S is calibrated in the conductance form.

**Review.** Two reviews read the pull request, one of the code and one of the science and the record. The code's found nothing serious, and confirmed the gates' symmetry, the step-start gating, the bit-for-bit paths without a rectifier, the fixed point's loop, the GPU's packing and the shader's barriers. It found tests that didn't test what they claimed, now replaced: touch's currents compared by value and against the gated network's input conductance; each step's gating checked against a brain built on the network as the step's start gates it, bit for bit over 50 steps of a swinging current into AVAL; the packing's 32nd bit; the fixed point on small random networks, 5 of 100 of which need more than two gated solves, where every variant of S's model needs two; the A-types alone in the rest's move; and parity's setup carrying the rectifier. With activations held the rectified network's currents are the gradient of a strictly convex energy, so the gates' fixed point exists and is unique, and the cycle error now says the iteration failed rather than that no rest exists. The science's review reproduced every figure and found, and this entry now says: the amplifier's reading and its small-signal loss, with what Liu et al. measured and the check the other way; the silenced drive's reason; the rest's three solves; the open share's halved step being the brain's; AWC's change; the runtime count's provenance; the provisional value under S's bound; the spec sentence's three cells; FIDELITY's omitted biology; and smaller wording.

**Status.** Built. S's calibration comes next, in a pull request of its own.

## 2026-10-02 — Track S's calibration, built: round 3's runner on S's model, before it runs (revised after review)

**Why.** Track S's rules set its calibration before any of S was built: R's third round's procedure on S's model, in the conductance form, on checkpoint 1's frequency counted with its band, with its own runner, record and comparison (the entry of 2026-10-01). S's build has landed (the entries above). This pull request builds the runner and the comparison's fit; the run, its comparison and the choice come in the next, as round 3's code and run came apart (#37, #38).

**What was built.**

- **The model, named** (`src/sim/trackS.ts`). A calibration searches track R's model or track S's: S's is the same twelve calibrated parameters on its measured signs, the D-types' offset and its rectifier (`TRACK_S`), which every one of its trials switches on.
- **Its bound** (`src/validation/calibration.ts`). `bounds`, and the mapping between the box and the values, take the model: on S's model in the conductance form, g_p runs from 0.0001 to 7 nS per unit of κL, the bound its rule gives and the registry keeps beside its own (the entry above), and every other bound is the form's. `TRACK_S_ROUND` is round 3's settings with S's model.
- **The starts, in the box's units.** S's sixteen searches start from the survey's Latin hypercube, as the rules have it, and those starts are points of the box in its mapped units. On S's narrower range for g_p, each start lies where the survey's did in the box, not at the same value of g_p. The registry's provisional value, which PLAN takes from the bounds' log midpoint, is not read: every search starts from its point of the hypercube.
- **The runner** (`npm run calibrate -- --track-s`). Round 3's phases, its own budget and its restarts, on S's model: the jobs carry the model, and each trial adds S's parts to its loop parameters and reports the model it ran, which the scorer holds to the one the run asked for, so a record that names S's model can't hold R's trials (added after review). Its record, `harness-out/calibration-s1.json` and the committed `data/calibration/s1.json`, names the model, its parts, checkpoint 1's frequency band, the round's settings, the starts and S's bounds; every record that can still be written now names the band, while the probe's, the survey's and round 3's, made under the plain count and never run again, are described as they ran. It runs once: it refuses while `s1.json` exists, and a stopped run is resumed, as round 3's was. It starts and resumes only at a commit, so that its evaluations all come from one code (added after review: the resume guard compares commits, and a tree with uncommitted changes would let edits in between). It needs no survey, since S's rules decided it runs.
- **The comparison** (`npm run equivalence -- --fit track-s --pick N`). S's four picks take §7.2's comparison in their order, each only once those before it have failed at their recorded values, as round 3's did. A pick's values are checked against S's model and its bounds, and its trials run on S's model in each step's tree, the manifest naming the model so that no set of R's trials is reused for S's; each trial checks that its manifest's model is its fit's and that it runs it (added after review). R's manifests are as they were, so their sets are still reused. The first pick to pass grades checkpoint 1 from the comparison's first 20 trials at dt, adds the speed's interval and runs the diagnostics of what paces the crawl, writing `data/calibration/s1-chosen.json`. Every comparison record from now on, and the chosen record, names the frequency band, and `VALIDATION.md`'s section says so where a record does.

**The noise, amended for sign-off.** S's rules set its noise to be tuned on the kinematics alone, as round 3's was, and said the build amends spec §4's noise sentence and PLAN §6.2's σ_n row, with the maintainer's sign-off; the rectifier's entry left it for the calibration. Both now say that S's calibration tunes the noise on the crawl's frequency, wavelength and speed, its reversal rate a prediction, and the wording is for the maintainer's sign-off in this pull request, before the run (added after review, which found it still missing).

**A look, disclosed.** One generation of the first search ran as a smoke test, 11 candidates on 4 trials each, on 6 workers in 33 s, and was stopped and its file removed; its best objective was 8.99, near the cap of 12. Nothing else ran. At that pace the whole run, about 28,000 trials of 120 s with the final checks, takes about three hours on 14 workers, as round 3 took 3.2.

**Review.** A review of the code against the rules found nothing serious: a `--track-s` run is round 3's procedure on S's model, every trial path, phase 2's continuation, the extra candidate and the final checks among them, carries the model, resume replays bit for bit at an unchanged commit, and S's rest solved without failure over 8,001 values of κ_gap,B across its box. It found, and the pull request now has: the noise's amendment, still missing; nothing tying what the trials ran to what the record names, now checked in every trial; the resume guard's gap on an uncommitted tree; a comment that called the record's write resumable; the comparison's test of VALIDATION.md's order, which wouldn't have counted S's picks; a refusal that said every record was made under the plain count; the band named by every record that can still be written; "class offsets" where S has only the D-types'; and smaller points.

**Status.** Built, before it runs. The next pull request runs it, commits its record, and takes its picks through §7.2's comparison to the choice (the entry of 2026-10-01).

## 2026-10-02 — Track S's calibration, run: its first pick passes §7.2's comparison and grades partial, so S's fit replaces the refit

**Why.** Track S's rules set its calibration, its comparison and the choice before any of S was built (the entry of 2026-10-01), and its runner landed in the entry above. This records the run and what the rules make of it.

**The calibration.** `npm run calibrate -- --track-s` ran at `6263a8d`, main with the runner merged, on 14 workers in 3 hours 43 minutes, every search to its budget, every one of its 6,000 evaluations and its final checks converged and finite. Phase 1's sixteen searches ranked 23, 19, 11 and 18 lowest on their final checks (0.759, 0.937, 1.027 and 1.041), and phase 2 continued those four to 750 evaluations each. Two of them, 23 and 19, ended on phase 1's pick, which joins each continued search's final check. The picks, in the order they take the comparison (`data/calibration/s1.json`):

| Pick | Search | From           | Objective | Frequency (Hz) | Wavelength (body lengths) | Speed (body lengths/s) |
| ---- | ------ | -------------- | --------- | -------------- | ------------------------- | ---------------------- |
| 1    | 18     | generation 67  | 0.438     | 0.211          | 0.49                      | 0.069                  |
| 2    | 11     | generation 58  | 0.654     | 0.231          | 0.38                      | 0.052                  |
| 3    | 23     | phase 1's pick | 0.759     | 0.193          | 0.47                      | 0.038                  |
| 4    | 19     | phase 1's pick | 0.937     | 0.117          | 0.61                      | 0.038                  |

Round 3's best pick on the real wiring scored 0.366 by the same objective, so S's model fits the crawl a little less closely.

**The comparison.** Pick 1 passed §7.2's comparison with the noise on (`data/equivalence/track-s-pick-1.json`, run at `8188ae9`, which adds the record): over 200 trials at 2.5 and 1.25 ms, every clause's interval lies well inside its margin, the frequency's difference −0.0008 Hz with an interval of −0.0027 to +0.0010 against ±0.0065, the wavelength's +0.0008 against ±0.0146 and the speed's −0.0002 against ±0.0021. No solve failed to converge and every trial stayed finite. So picks 2 to 4 didn't run, as the rules have it. Every one of round 3's picks failed this comparison on the frequency and the wavelength; the refit passed it and failed checkpoint 1.

**The choice.** Pick 1 is track S's fit, and by the rules it replaces the refit whatever the two grade (the entry of 2026-10-01).

**Checkpoint 1 on its own trials,** the comparison's first 20 at dt (`data/calibration/s1-chosen.json`): **partial**, the first fit to grade at least partial and pass the comparison.

| Clause                                  | Measured | Grade   |
| --------------------------------------- | -------- | ------- |
| Frequency (Hz)                          | 0.217    | Pass    |
| Wavelength (body lengths)               | 0.48     | Partial |
| Speed (body lengths/s)                  | 0.068    | Partial |
| Posture variance the eigenworms capture | 97.5%    | Pass    |
| Trials with a forward bout of 20 s      | 100%     | Pass    |

Its pooled speed has a 95% interval of 0.0672 to 0.0693 body lengths a second, and 0.0686 at dt/2, so the partial is not at the speed floor of 0.06.

**What the fit is, reported and not graded.**

- **Three of its twelve values lie at their bounds:** the B-types' oscillator gain at 0, so the B-types have no oscillator; the head switch's gain at its top, 50 nS; and the neuromuscular gain at its top, 40 per unit of relative drive.
- **The head switch paces the crawl, as the rules foresaw** ("S doesn't pace the crawl"). With the switch off, or at its lower bound, the worm doesn't move forward at all; the switch's gate was open on every measured step, its conductance about fifty times its targets' passive loads, and it cycled at 0.214 Hz beside the spectrum's peak at 0.210 Hz. With the B-types lesioned the worm moved forward 63% of the time at 0.013 body lengths a second, with the A-types lesioned 73% at 0.020, and with AVBL and AVBR lesioned 30% at 0.006, none of them in a bout of 20 s.
- **It hardly reverses:** 0.005 reversals a minute over the comparison's 200 trials at dt, against the 1.8 a minute of the calibration's reversal target (PLAN §7.3), which the refit's procedure fitted. S tunes the noise on the kinematics alone, so the rate is a prediction (spec §4, amended for S), and it is a miss. Checkpoint 2, checkpoint 4's klinokinesis row and checkpoint 5's rows that read reversals will show it.
- **The voltages stay within the model's range:** 0.2 neurons on average outside −48 to 0 mV at each sample, none more than 10 mV outside, where the refit's lay far outside it.

**What follows, one pull request at a time.**

1. The adoption, as the rules list it: the registry takes the twelve values and the conductance form; S's signs move from their side file into the main overrides file; the data's version and `MODEL_VERSION` rise, with entries in `tests/model-versions.json`; the app, the harness and GPU parity run it; the visual baselines come from CI; the app's Safari check runs; touch's currents and AWC's gains are the ones S's model already pins.
2. Checkpoint 1's section of `VALIDATION.md` from the harness on the registry's fit, and checkpoint 0 again, its result reported without undoing the choice.
3. Release 0.2.0 (PLAN §8).
4. The crawl gate stands open: with a partial on checkpoint 1, checkpoints 2 to 6 run on S's fit by their protocols (PLAN §9), checkpoint 6's ten primary nulls each tuned by S's procedure, about 3.7 hours each on 14 workers, so some 37 hours in all, scheduled when the maintainer chooses.

**Exploration, disclosed.** None beyond the run and the comparison: the calibration ran once, as its rules set, and the comparison of pick 1 once, with its chosen-pick runs.

**Status.** Run and chosen. The adoption comes next, in a pull request of its own.
