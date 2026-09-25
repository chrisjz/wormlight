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

- **The network can't supply the rhythm.** The review showed that with thresholds fixed at rest, both the Varshney and the Cook-scaled networks settle to a stable fixed point under constant drive. Kunert's PLM oscillation exists only because Neural Interactome moves thresholds with the input. Kunert-Graf et al. 2017 note that their own model "does not sustain oscillation in the absence of explicit external input". (Corrected 2026-09-25: an earlier version of this entry quoted a sentence that is not in their paper.)
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

**Status.** Decided with the maintainer on 2026-09-26. The spec §2.5 correction needs the maintainer's sign-off.

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
