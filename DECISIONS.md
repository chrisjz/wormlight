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

## 2026-09-25 — The body is Boyle et al.'s, stepped linearly implicitly

**Decision.** The body follows Boyle, Berri & Cohen 2012's equations and Table 1: 49 rods on a prolate-ellipse outline, lateral and diagonal elements each a spring and damper, and muscles whose stiffness, damping and rest length scale with activation. Each step is linearly implicit Euler with the elements' analytic stiffness Jacobian, solving the symmetric block-tridiagonal system (49 blocks of 3 × 3) for the rod velocities. Boyle et al.'s code is licensed for non-commercial use only, so none of it is copied; it was read to settle what the paper leaves open:

- **Drag per rod.** Each rod resists motion across and along the body with the whole worm's coefficient divided by 2(M + 1) = 98, applied to the net force on its two points, as PLAN §5.1 already says.
- **Rotational drag.** Each rod resists turning with 4πR_i² times its tangential coefficient: their code turns a rod at the half-difference of the tangential forces on its two ends divided by 2πR_i·C∥, which is that coefficient.
- **The damper's sign.** The paper's equations write the damping as +βv; the code subtracts it, which is the sign that dissipates, and so does Wormlight.
- **A quartic term left out.** Equation 3 adds 2(L₀ − L)⁴ when a lateral element is stretched, and the code (2(L − L₀))⁴. In SI units that adds a length to the fourth power to a length: at a 50% stretch of a 21 µm segment it is about 10⁻¹⁴ of the linear term, so the body omits it.

**Why.** The body is the level-3 model PLAN §5.1 names, and the tests check it against predictions made without its code:

- **Passive bend.** A uniform-radius body bent into its first free-free bending mode straightens at 0.978 of the rate of the discrete Euler–Bernoulli beam with the same joint stiffness (2κ_L R²) and rod drag, and at 0.977 with the drag cut 1,000-fold, where the internal damping slows it by a fifth. The remaining 2% is rod rotation, which the beam leaves out. Against the continuum beam the rate is 10% lower, because the discrete body carries a full rod's drag at each tip, where the mode moves most.
- **Prescribed wave.** A travelling wave of activation at 0.30 Hz and 0.65 body lengths crawls head first at 0.134 body lengths per second, within 1.3% of what resistive force theory predicts for the shape it makes (the rigid motion that leaves its change of shape force- and torque-free, from the midline's own tangents). The infinite-sinusoid formula U/V = (K − 1)S/(1 + (K − 1)S) overestimates it by 15%, since a body one length long with 1.5 waves yaws.
- **Step size.** At 2.5 ms and 1.25 ms the wave's speed agrees within 0.04%, and the passive bend's rate within 10⁻⁴.
- **The Jacobian** matches finite differences of the forces on a bent, active body to 10⁻⁷ of its scale. It matters for stability, not accuracy: the stiff diagonals and the tip rods' rotation relax in 0.06–0.2 ms, far faster than the step.

A CPU step costs about 38 µs.
**Status.** Done.
