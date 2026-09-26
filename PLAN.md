# Wormlight: Plan

For review under spec §10. The scaffold is on `main`; everything below is proposed. This is the second draft: a multi-agent review of the first draft found 61 problems (45 confirmed, 16 plausible, none rejected), and every one is addressed here. Once you approve the plan, the thresholds and definitions in §7 are fixed: changing one later is logged in `DECISIONS.md` and marked on the checkpoint.

## 0. What needs your sign-off

1. The validation thresholds, definitions and tuning procedure (§7).
2. The changes this PR writes into `WORMLIGHT_SPEC.md`:
   - **Rhythm:** documented rhythm generators replace "the head rhythm emerges from the network" (§4.3). The network can't supply a rhythm: with fixed thresholds it settles to a stable fixed point.
   - **Proprioception:** Wen et al. 2012's front-to-back direction replaces Boyle, Berri & Cohen's. The allow-list's proprioception layer now names SMDD (Yeon et al. 2018), and A-type neurons as a hypothesis.
   - **Sensing:** Levy & Bargmann 2020's adaptive threshold replaces nematode's fold-change sensor, which stays as the conceptual precedent.
   - **Attractant:** 2-butanone, sensed by AWC-ON.
   - **Signs:** both of Fenyves et al. 2020's prediction files (S1 and S5 Data), not S1 alone.
   - **Neural time constants:** Kunert et al.'s published values, not Neural Interactome's 1.5× slower ones.
   - **Thresholds:** set at the intact network's rest, and left unchanged by lesions (§3.3).
   - **Integration:** a second-order linearly implicit scheme replaces the spec's exponential-Euler example, which rings on strongly coupled pairs (§3.4).
   - **Contrast brain:** it rewires chemical synapses only (§3.5).
   - **Drag:** Boyle's whole-worm values are split per rod as their code does (§5.1).
   - **Chemotaxis references:** indices come from Bargmann et al. 1993 directly, not nematode's table, which misattributes two entries.
   - **Checkpoint 0:** residual A-type backward activity is expected when the network is silenced (Gao et al. 2018).
   - **Dish:** 10 cm, the standard chemotaxis plate, rather than 60–90 mm.
   - **Prior art:** corrected descriptions of Kim et al. 2025 and Fieseler et al., and Ji et al. 2021 added.
   - **Connectome source:** Cook et al. 2019's matrices come from Emmons 2024's CC BY release, which carries the lab's corrections, and the README credit line names it (§2.1), as you agreed.
3. The decisions marked "needs sign-off" in `DECISIONS.md`.
4. The free-parameter budget, raised from 10 to 14, as you agreed (§6.2).
5. The fallback menu (§10).

## 1. Architecture

```
nematode export ──┐
c302 morphologies ├─► data build ─► public/data/wormlight.v1.json + NOTICE.md
Fenyves 2020 ─────┤   (scripts/)          │
sign overrides ───┘                        ▼
          ┌────────────── simulation core: CPU reference (src/sim) ──────────────┐
          │ environment ─► sensing ─┐                                             │
          │ body ─► proprioception ─┴─► brain ─► neuromuscular layer ─► body     │
          └──────────────────────────────────────────────────────────────────────┘
                      mirrored by WGSL kernels (src/gpu) that run the app
                                            ▼
                       renderer: plate view, 3D graph, glow (src/render)
```

**Modules.** `src/science` holds the citation list and the fidelity and parameter registries (§6). `src/data` loads and validates the runtime file. `src/sim` is the CPU reference: `brain`, `sensing`, `proprio`, `muscles` (the neuromuscular layer shared by every brain), `body`, `env`, `rng` and a `world` that orders a step. `src/gpu` mirrors `src/sim` in WGSL. `src/render` and `src/ui` draw and interact. `scripts/` has the data build, the doc generators, the behavioural harness, headless-Chrome capture, and in `scripts/experiments/` the experiments behind decisions. `tools/reference/` drives Neural Interactome's own code to produce golden trajectories.

**The brain boundary** is spec §1.1's. A brain takes one input current per neuron (sensing, proprioception, stimuli) and exposes each neuron's synaptic activation; the shared neuromuscular layer turns activation into muscle drive through the one map in the data, so every brain drives the same muscles by construction.

```ts
interface Brain {
  // The CPU reference, used by the harness.
  reset(seed: number): void;
  setLesions(ablated: ReadonlySet<number>): void; // neuron indices
  step(dt: number, current: Float32Array): void; // pA per neuron
  activation(): Float32Array; // synaptic activation s per neuron
  voltage(): Float32Array;
}
```

On the GPU a brain is a set of buffers (connectivity, signs, oscillator classes, thresholds) that the fused step kernels read, so a brain swap or a lesion swaps or edits buffers. WebGPU reads results back asynchronously, so the app gets state through `snapshot(): Promise<WorldState>`, which returns the latest completed step; the glow and inspector are therefore one frame behind, by design.

**One step** runs in this order on both the CPU and the GPU:

1. Read the odour concentration at each sensing point, and apply any touch stimulus.
2. Update sensory adaptation and compute sensory currents.
3. Compute proprioceptive currents from body curvature, including the head switch's signal (§4.3).
4. Advance the brain: the second-order implicit voltage solve, the oscillator and switch variables, then synaptic activation (§3.4).
5. The neuromuscular layer turns activation into muscle activation.
6. Advance the body under resistive force theory.
7. In the app, advance the odour field in sub-steps of at most 4 ms. The harness reads a precomputed field instead (§5.2).

**Time.** The neural and body step targets 2.5 ms. Milestone 0b confirmed it for the neural model: both checks pass at 2.5 ms, and the port check fails at 5 ms. Milestone 0c confirmed it for the body with a prescribed wave, whose speed agrees within 0.08% at 2.5 and 1.25 ms; the closed loop's comparison at dt and dt/2 waits for checkpoint 1 (§9). Pause, slow motion and fast forward only change how many steps a frame runs.

**Fast forward (spec §3).** The target is 10× real time, sustained on an M-series laptop in Chrome. That plays a 20-minute chemotaxis run in 2 minutes and the full 60-minute assay in 6. The review benchmarked the neural step alone on an M5 Max at 6.3× real time at a 1 ms step and 18× at 5 ms. Milestone 2's GPU brain runs at about 29× real time at 2.5 ms on the same machine in Chrome, and milestone 3's whole step, the brain with the layers outside it and the body, at about 24× in dispatches of 67 steps, for the step alone: rendering and readback come with the plate view (DECISIONS.md, 2026-09-26). In Safari on the same machine the whole step runs at about 11×. A shortfall would be logged rather than paid for with accuracy.

## 2. Data

### 2.1 The nematode exporter

A separate PR in the nematode repo, through its OpenSpec process.

- **Input.** It vendors the S1 File of Emmons 2024 (_PLoS Biol_ 22:e3002939), which is Cook et al. 2019's connectome released under CC BY 4.0 by Cook et al.'s senior author. Its chemical matrix is identical to the 2019 original; its gap junctions carry the lab's July 2020 corrections and its 2023 BDU–ALM and BDU–PLM junctions.
- **Existing experiments.** The file sits alongside the 2019 original that nematode already vendors, and nematode's own experiments keep using the original, so their results stay reproducible.
- **Parsing.** The layout matches the original's, so nematode's existing sheet parser reads it. Only the gap-junction sheet names differ ("hermaphrodite gap jn symmetric" rather than "herm gap jn symmetric").
- **Output.** It adds `scripts/export_wormlight.py` and emits `connectome.v1.json`:

```json
{
  "schema": "wormlight.connectome/1",
  "provenance": { "nematodeCommit": "…", "inputs": [{ "file": "…", "sha256": "…" }] },
  "neurons": [{ "name": "AWCL", "class": "sensory", "transmitters": ["Glu"], "ruleSign": 1 }],
  "chemical": [{ "pre": "AWCL", "post": "AIYL", "sections": 22 }],
  "gap": [{ "a": "ALA", "b": "CANL", "sections": 401 }],
  "neuromuscular": [{ "pre": "DA9", "muscle": "dBWML24", "sections": 4 }]
}
```

The example counts are Cook's. The export keeps Cook's 38 autapses and has 1,095 gap-junction pairs among neurons. The neuromuscular part needs a new parse path: nematode's loader drops muscles, but the file holds all 95 body wall muscles, with 956 non-zero entries from 162 cells.

### 2.2 The Wormlight data build

`npm run data:build` is TypeScript run by Node. It reads sources pinned in `data/sources.json` (URL, SHA-256, retrieval date, licence), caches downloads in `data/cache/` (git-ignored), and writes files that are committed and never hand-edited. It:

1. reads the nematode export;
2. reads the c302 morphologies: soma position, dendrite tip and process extent, normalised so the nose is 0 and the tail tip is 1 along the reconstruction's anteroposterior axis (the morphologies span 797.9 µm, from −349.5 to +448.4 µm). The Virtual Worm is posed with a dorsoventral bend, so this is a projection (the midline is about 5% longer), and its z coordinate is dorsal only near the head;
3. reads both of Fenyves et al.'s prediction files, S1 Data (`journal.pcbi.1007974.s003`, the WormWiring reconstruction) and the Cook sheet of S5 Data (`s007`), keyed by (pre, post) after un-padding names like `VB01`, with the primary transmitter each prediction rests on. The two agree on all 3,121 connections they share. Rows that aren't Cook edges are ignored and counted;
4. applies `data/sign-overrides.csv`, where every row cites its source;
5. assigns every chemical connection a sign (§2.4) and every neuromuscular connection a sign (§4.4), recording which rule set each;
6. cross-checks signs against the Creamer et al. fitted weights (MIT; pinned from the authors' repository, the same file nematode vendors) on the 1,049 head connections they cover, and writes the disagreements, with the weights' licence, to `data/reports/sign-crosscheck.md`. There are 364, including AIY's heaviest outputs on the AWC path, which Fenyves signs negative and Creamer fits as positive;
7. checks counts, name coverage and symmetry. The ignored Fenyves rows, the 23 neurons S5's Cook sheet lacks, and zero-padded names are expected and listed; anything else fails the build;
8. generates `DATA_SOURCES.md` and `public/data/NOTICE.md` from `data/sources.json`, so the site ships its data licences and attributions (spec §9).

### 2.3 Runtime format

One JSON file, `public/data/wormlight.v1.json`, about 480 KB (about 38 KB gzipped). Every element carries its provenance, so the inspector can show where it came from.

- **neurons:** name, class, release identities (`transmitters`, in the order Quantum Nematode reads the atlas; the sign rules read the first); position `{ s, reconstructionUm: [x, y, z], source }`, with `s` from 0 (nose) to 1 (tail) along the reconstruction's y axis and the soma's raw coordinates beside it; sensing `{ kind: 'tip', s }`, `{ kind: 'field', s0, s1 }` or `{ kind: 'none' }`; oscillator class (`A`, `B`, `headSwitch` or none).
- **chemical:** pre, post, sections, sign (+1, −1 or 0), sign source (`physiology`, `expression`, `rule` or `none`), and a citation id on each physiology sign; the other sources each have one basis, recorded in `meta`.
- **gap:** the pairs with their section counts.
- **neuromuscular:** pre, muscle, sections, sign, and sign source (`receptor` or `none`).
- **muscles:** quadrant, index, and the stretch of body each one covers, on the grid of §4.4.
- **meta:** schema version; the basis of each sign source and a reference for every citation id; each shipped dataset's licence as an SPDX id, with a pointer to `NOTICE.md`; and the digest of every input.

Constants such as the Cook-to-Varshney scale live in `src/science/params.ts` alone, never in the data file, so a sweep changes one place.

### 2.4 Synapse signs

Each chemical connection takes its sign from the first step that gives one. Coverage is counted by the data build on Cook's 3,709 chemical connections:

| Step | Source                                                                                                                    | Level | Connections                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------- |
| 1    | Cited physiology, e.g. AWC→AIY and AWC→AIB (Chalasani et al. 2007)                                                        | 5     | a handful, listed in the overrides file                                 |
| 2    | Fenyves et al. 2020, "+" or "−", from S1 and S5 Data together, where its transmitter is one of the cell's Wang identities | 4     | 1,716 (46.3%; 54.5% of synaptic sections)                               |
| 3    | Transmitter rule: ACh and Glu +, GABA −                                                                                   | 0     | 1,453 (39.2%; 35.3%), including 438 of Fenyves's 446 "complex"          |
| 4    | No basis: no fast effect                                                                                                  | 0     | 533 (14.4%; 9.8%), including the other 8 "complex" and the 40 set aside |

Fenyves signs 1,763 connections in all. Seven of them are AWC→AIY and AWC→AIB, which Fenyves already signs the way the physiology does; the overrides lift them from level 4 to 5. Fenyves's predictions rest on the transmitter expression known in 2020, and 40 connections, from AVFL/R (GABA, which Wang et al. 2024 record as uptake only), PVM and PVQL/R (glutamate, where the atlas records no identity), rest on a transmitter the atlas no longer supports; they are set aside and listed in `data/reports/data-build.md`. A further 67 connections from AIM, AVA, AVB and RIB rest partly on a second transmitter the atlas doesn't list; their primary one agrees, so they keep Fenyves's sign. The transmitter rule disagrees with Fenyves on about a fifth of the connections where both give a sign, so steps 3 and 4 get a sensitivity check (spec §2.4). The harness reruns the checkpoints with those 1,986 connections set four ways: by the rule (the default), all excitatory, all silent, and ten random-sign draws.

## 3. Neural model

### 3.1 Equations

The model is Kunert, Shlizerman & Kutz 2014, as implemented in Neural Interactome, with the rhythm generators of §4.3 added. For neuron _i_:

```
C dVᵢ/dt = −G_c (Vᵢ − E_c) − Σⱼ gᵍᵃᵖᵢⱼ (Vᵢ − Vⱼ) − Σⱼ gˢʸⁿⱼᵢ sⱼ (Vᵢ − Eⱼᵢ) + I_osc,ᵢ + I_sw,ᵢ + Iᵢ
dsᵢ/dt  = a_r φᵢ (1 − sᵢ) − a_d sᵢ,        φᵢ = 1 / (1 + exp(−β (Vᵢ − V_th,ᵢ)))
```

`Iᵢ` sums sensory, proprioceptive, stimulus and noise currents; `I_osc` and `I_sw` are the oscillator and head-switch currents (§4.3). `Eⱼᵢ` is 0 mV for an excitatory connection and −48 mV for an inhibitory one; a connection with no sign gets zero conductance. Neural Interactome sets reversal potentials per presynaptic neuron; Wormlight sets them per connection so Fenyves's predictions fit. Autapses are ordinary connections. Neural Interactome's matrices are indexed [post, pre].

### 3.2 Parameters

| Parameter                         | Value                       | Level | Source                                                                                            |
| --------------------------------- | --------------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| Membrane capacitance C            | 1 pF                        | 3     | Kunert, Shlizerman & Kutz 2014, as restated by Kunert-Graf et al. 2017: "Gc = 10pS and C = 1pF"   |
| Leak conductance G_c              | 10 pS                       | 3     | as above                                                                                          |
| Leak potential E_c                | −35 mV                      | 3     | Wicks, Roehrig & Rankin 1996, via Kunert et al.                                                   |
| Reversal, excitatory / inhibitory | 0 / −48 mV                  | 3     | Wicks, Roehrig & Rankin 1996                                                                      |
| Sigmoid width β                   | 0.125 mV⁻¹                  | 3     | Wicks, Roehrig & Rankin 1996                                                                      |
| Synaptic rise a_r / decay a_d     | 1 and 5 s⁻¹                 | 3     | Kunert-Graf et al. 2017: "ar = 1 s−1 and ad = 5 s−1"                                              |
| Conductance per Varshney unit     | 100 pS, gap and chemical    | 3     | Kunert, Shlizerman & Kutz 2014                                                                    |
| Cook-to-Varshney scale            | 0.3444 chemical, 0.2055 gap | 2     | Matched totals over the 279 shared neurons, autapses excluded as in Neural Interactome's matrices |

Neural Interactome's code uses 1.5 pF with both rates divided by 1.5: the same model run 1.5× slower. Its values are used only in "Neural Interactome mode" for the port check, which validates the equations and data handling but can't see a uniform time rescale, so the time scale rests on the publication.

Matching totals leaves connections that both datasets share at about 0.63× (gap) and 0.69× (chemical) their Neural Interactome strength, with Cook-only connections making up the rest. The harness therefore also reports the checkpoints under shared-connection scales (0.33 gap, 0.50 chemical).

The membrane time constant is C/G_c = 100 ms, but gap-junction coupling makes the system far faster in places: with Cook's weights, down to about 0.05 ms for ALA. That is why the voltages are solved implicitly.

### 3.3 Thresholds

Each neuron's threshold `V_th,ᵢ` is its voltage at the network's equilibrium with every `sⱼ` at its sigmoid-midpoint value `a_r / (a_r + 2 a_d)`, no external input, and oscillators and switches off. That is one sparse linear solve, with autapses on both sides of the equation.

- **Lesions leave thresholds unchanged.** A lesion removes connections, and the survivors keep their thresholds, so lost drive shows up as it does in an ablated animal. Recomputing would re-centre every survivor at φ = ½, a perfect, instant compensation no source documents. It would erase the ~20% drop in B-type output after an AVB + PVC lesion and the ~34% drop in A-type output after AVA + AVD.
- **Rewired brains get their own thresholds,** computed from their own intact wiring, as a different animal would have.
- **Neural Interactome mode** recomputes thresholds from the current input, as its code does, for the port check only.

### 3.4 Integration

Each step is second order in both variables:

- **Voltages:** BDF2, with leak, gap-junction and synaptic conductances on the left, and synaptic activation extrapolated to the new step (2sₙ − sₙ₋₁).
- **Activation:** BDF2, with φ evaluated at the new voltages.
- **Start:** one implicit Euler step, since BDF2 needs a history. The same goes for the step after any jump in the input, such as a stimulus or the head switch turning on or off: a history that spans the jump makes BDF2 first order there. Whatever switches an input restarts the integrator, on the GPU as on the CPU.

The review measured order 2.0 for this pairing, and all four Neural Interactome presets passing the port check at 2.5 ms. The first draft's first-order splitting failed at every step from 1 to 5 ms. Milestone 0b's CPU reference confirmed both: order 1.99 and 2.10 on the Cook model, and every neuron within tolerance in both checks at 2.5 ms (DECISIONS.md).

The linear system is sparse, symmetric and positive definite, with 302 unknowns. Conjugate gradients solve it with a Jacobi preconditioner, warm-started from the last step, stopping when the recursive residual falls below 10⁻⁶‖b‖ on the CPU (f64) or 10⁻⁵‖b‖ on the GPU (f32, safely above the ~10⁻⁶ floor the review measured for f32 on this system). A cap of 64 iterations sets a flag that the harness and app report, so the solve can never spin.

On the GPU the whole step runs in one workgroup of 256 invocations, each holding the state of one or two neurons, and from milestone 3 one rod, in registers, within the default limits: it binds all 8 storage buffers a stage may have and uses 15 of the 16 KB of workgroup memory, the brain's vectors and the body's blocks sharing one pool. A dispatch takes any number of steps, with only barriers between them (`src/gpu/brainShader.ts`).

### 3.5 Noise, lesions and the contrast brain

- **Noise.** White current noise of intensity σ_n (in pA·√s, calibrated), drawn each step with standard deviation σ_n/√dt so its power doesn't depend on the step size. A counter-based hash of (seed, step, neuron) gives the same 32-bit integer h in TypeScript and WGSL. Then u = (⌊h / 2⁹⌋ + 0.5) · 2⁻²³ lies strictly inside (0, 1) and is exact in f32, so Box–Muller never takes log(0). Test vectors include h = 0 and h = 2³² − 1, and noisy parity allows for WGSL's error bounds on `log`, `sqrt` and `cos`. WGSL lets `log` return 0 or more for the few uniforms within 2⁻²¹ of 1, so the shader holds −2 ln u at 0 or above before its square root.
- **Lesions.** A lesion zeroes every connection of the ablated neuron, chemical, gap and neuromuscular; thresholds are unchanged (§3.3).
- **Contrast brain (checkpoint 6).** The primary null is a port of nematode's degree-preserving double-edge swap, applied to the chemical graph only:
  - each directed connection keeps its section count and sign at its presynaptic end, so every neuron keeps its outgoing strength and its excitatory/inhibitory mix;
  - autapses, gap junctions, the neuromuscular map, and sensory and motor identities are left unchanged;
  - rewired connections carry the provenance "rewired (sign from …)", never a physiology badge.

  A secondary null also rewires gap junctions. It is reported without verdicts, because nematode's undirected swap moves strength with the edges: ALA's 1,314 gap-junction sections leave ALA, and half the neurons' totals change by more than 50%. Each null has 10 seeded rewirings.

## 4. The layers outside the connectome (spec §1.1)

Every layer here obeys spec §1.1: it is the same for every cell of a class, it is cited, it is shared by every brain, and nothing in it reads what the worm is doing.

### 4.1 Sensing: AWC-ON and 2-butanone

- **Which cell.** Butanone is sensed by the AWC-ON neuron alone (Wes & Bargmann 2001). Which of the two AWCs becomes AWC-ON is decided at random in each animal (Troemel, Sagasti & Bargmann 1999), so each simulated worm draws its AWC-ON side from its seed, and AWC-OFF gets no butanone input.
- **Adaptation.** Levy & Bargmann 2020's adaptive threshold `T` tracks the odour's history: `dT/dt = (K(1 − e^(−C/K)) − T) / τ`, with `K = 5.5 µM` and `τ = 17 s`, taken from the authors' code (level 3). `T` starts adapted to the concentration at the worm's start, as their code does. AWC-ON activates when the concentration falls below the threshold, matching the OFF response Chalasani et al. 2007 describe: "AWC neurons are activated by odour removal".
- **Current.** `I_AWC = g_AWC · (T − C) / (T + C)`. The form is ours (level 0), since Levy & Bargmann model only the threshold crossing. It depolarises the cell when odour falls below the threshold and hyperpolarises it when odour rises above, and it stays bounded between −g_AWC and +g_AWC, so even a strong source can't drive AWC past every reversal potential.
- **Gain.** `g_AWC` is set once, on the intact real wiring, so that removing odour from the adapted start concentration depolarises AWC by 16 mV (2/β, the working width of its sigmoid). It is fixed in advance and never tuned against chemotaxis (level 0). Because the form is bounded, the result barely depends on which concentration anchors it.
- **Where and in what units.** The concentration is read at the nose tip, where AWC's dendrite ends, in aqueous-equivalent micromolar at the agar surface, the units Levy & Bargmann's parameters use. How a spotted dilution maps onto that is an assumption (level 0), fixed by the release-rate anchor (§5.2).

nematode's adaptive sensor (Logbook 028) is the conceptual precedent.

### 4.2 Touch

- **Where it acts.** A tap at body position `s` stimulates every touch receptor whose process covers `s`, using the c302 morphologies (level 4). As fractions of body length: ALM L/R 0.05–0.39, AVM 0.04–0.37, PVM 0.24–0.67, and PLM L/R 0.50–0.97.
- **How strong.** A current step that holds the receptor 10 mV above its rest for 500 ms. The current is computed once, from each receptor's input conductance in the intact real wiring, and applied unchanged to every brain and every lesion: a tap is the same physical stimulus whatever the wiring. The values are fixed in advance (level 0). Neural Interactome's preset amplitudes can't be borrowed, because they are only meaningful when thresholds are recomputed around the input.
- Nose touch (ASH, FLP, OLQ) is a different circuit and is left out of v1.

### 4.3 The rhythm and proprioception

The network alone can't generate the rhythm. With thresholds fixed at rest, both the Varshney and the Cook-scaled networks settle to a stable fixed point under constant drive; Kunert's PLM oscillation exists only because Neural Interactome moves thresholds with the input. Kunert-Graf et al. 2017 make the same point about their own model, which "does not sustain oscillation in the absence of explicit external input". So the rhythm comes from documented generators, and the network decides which of them run.

- **The head: a proprioceptive relaxation switch (Ji et al. 2021).**
  - Ji et al. locate the primary rhythm generator "near the head". The active muscle moment switches sign when a proprioceptive signal `P = K + b·dK/dt` reaches `±P_th`.
  - Wormlight puts that switch in the SMD head motor neurons. SMDD senses head-muscle stretch through two TRPC channels and is required and sufficient for head bending (Yeon et al. 2018), and Ji et al. name SMDD among the candidate generators. SMDV is taken as its ventral counterpart.
  - A binary state `h` flips when `P` crosses `±P_th`, and injects `I_sw = ±g_sw (h − ½)` into SMDD and SMDV in antiphase. `K` is the scaled curvature κL averaged over body coordinates 0.1–0.3, the head region where Ji et al. measured it and fitted `b` and `P_th` (level 2, with them).
  - `b = 46 ms` and `P_th = 2.33` come from Ji et al. They were fitted in a 120 mPa·s fluid, so on agar they are level 2. The gain `g_sw` is calibrated.
  - The switch operates only while network input holds the neuron above the drive threshold `θ_osc`, so a silenced network has no head rhythm (level 0). The drive it reads is, for each SMD, the voltage its partners and leak would hold it at, less its threshold, averaged over the four; the SMDs' own voltages, and so the switch's own current, don't enter. It is 0 at rest and E_c − V_th, about −28 mV, in the silenced network.
- **Forward: B-type intrinsic oscillators.**
  - Fouad et al. 2018 found that "multiple sections of forward locomotor circuitry are capable of independently generating rhythms", with secondary rhythms coming from cholinergic motor neurons in the midbody.
  - Xu et al. 2018 report B-type motor neurons with intrinsic rhythmic activity that proprioceptive coupling entrains; only their abstract has been checked.
  - VB and DB oscillate only above `θ_osc`, which AVB's drive supplies. Killing AVB and PVC abolishes forward movement (Chalfie et al. 1985).
- **Backward: A-type intrinsic oscillators.**
  - Gao et al. 2018 show A-type motor neurons "exhibit intrinsic and oscillatory activity that is sufficient to drive backward locomotion in the absence of premotor interneurons", with DA9 leading.
  - AVA inhibits them through gap junctions at rest and potentiates them through chemical synapses. Both effects arise from the wiring, so VA and DA need no drive threshold.
- **The oscillator.** A minimal slow–fast (FitzHugh–Nagumo) oscillator attached to each A- and B-type neuron:

  ```
  I_osc,ᵢ = g_osc · v₀ · (xᵢ − xᵢ³/3 − wᵢ),   xᵢ = (Vᵢ − V_th,ᵢ − θᵢ) / v₀,   τ_w dwᵢ/dt = xᵢ + 0.7 − 0.8 wᵢ
  ```

  - `v₀ = 1/(2β) = 4 mV`, and the constants are the textbook ones.
  - `θᵢ` is `θ_osc` for B-types and 0 for A-types.
  - The excitability `g_osc` and recovery time `τ_w` are calibrated and shared by A and B.
  - No published, parameterised model of these cells exists, so the form is ours (level 0), while the mechanism is level 2.
  - With these constants a neuron cycles only while its network holds it within a window of drive; with none it is excitable, not oscillating. In the network the B-types cycle when `θ_osc` sits well below their rest (all 18 from −8 to −32 mV at g_osc = 2 nS), while the A-types, with no drive threshold, don't cycle on their own (DECISIONS.md).
  - In the voltage solve, the part of the oscillator current that stabilises (the cubic's outer branches) is implicit and the rest explicit, which keeps the system positive definite (DECISIONS.md).

- **Proprioceptive coupling (Wen et al. 2012).**
  - Each VB (DB) neuron receives a current proportional to the ventral (dorsal) curvature of the ~200 µm (0.2 body lengths) in front of its muscle field, taken from its neuromuscular targets. That is the coupling Wen et al. measured: posterior regions "are compelled to bend in the same direction and shortly after the bending of the neighboring anterior region".
  - Each VA (DA) neuron receives the mirror image: the curvature of the 0.2 body lengths behind its field. This is a level-2 hypothesis. There is no direct evidence for A-type proprioception, but Gao et al. infer that motor neurons are "likely proprioceptive", since the A-type rhythm is about 5× faster in crawling than in glued animals.
  - One gain `g_p` serves both. Wen et al.'s ~80 ms region-to-region delay is not added as a parameter: it should emerge from the neuromuscular and mechanical lags, and is reported as a check.
- **Why this default.** The rhythm evidence points at generators in motor neurons and the head, while proprioception's evidence is for propagation and entrainment. This default also gives reversals a rhythm source, and it keeps the forward/backward decision in the network, through AVB's and AVA's documented synapses. A delayed proprioceptive loop is the first fallback (§10).

### 4.4 Neuromuscular transfer and muscles

- **Signs.** Body wall muscle responds through one GABA receptor and two acetylcholine receptors (Richmond & Jorgensen 1999). So a cholinergic cell excites, a GABAergic cell inhibits (DD and VD, and also RME and AVL), and a cell releasing neither has no fast effect on muscle (level 0, assumed: corrected from 4 on 2026-09-26, DECISIONS.md). That last group is 32 of the 162 cells that synapse onto muscle, 366 of 5,515 sections: glutamatergic IL1 and RIM, dopaminergic cells, and cells with no identity. A harness toggle applies the transmitter rule to them instead.
- **Drive.** The shared neuromuscular layer computes `u_m = Σⱼ w_jm · sign_j · s_j`, where `w_jm` is Cook's neuromuscular section count (level 5).
- **Activation.** `τ_M dA_m/dt = σ(g_nmj (u_m − θ_nmj)) − A_m`, with `τ_M = 100 ms` (Boyle et al. 2012; Ji et al.'s muscle switching time is also 100 ms). The gain and threshold are calibrated (level 1).
- **Placement.** Each quadrant's muscles sit on one grid of 24 slots from nose to tail, so muscle i of every quadrant covers the same stretch (level 0). The ventral-left quadrant has 23 cells, and its last covers the last two slots: Cook's innervation matches vBWMLi to vBWMRi for most i up to 21, and vBWML23 to vBWMR24. A body unit's dorsal activation is the mean of the dorsal-left and dorsal-right muscles covering it, and likewise ventrally.
- **Muscles as springs.** As in Boyle et al., each muscle is a spring and damper whose rest length shortens with activation, with the strength gradient along the body from their Table 1.

## 5. Body and environment

### 5.1 Body

- **Structure** (Boyle, Berri & Cohen 2012, level 3). 48 units, built from 49 rods, over 1 mm, with a radius profile peaking at 40 µm, joined by damped lateral and diagonal springs using their Table 1 constants. Neuron positions are fractions of body length, so the 0.8 mm morphology maps onto the 1 mm body.
- **Drag.** The body is overdamped, so each step balances internal forces against resistive drag. The whole worm's agar coefficients are C∥ = 3.2 × 10⁻³ and C⊥ = 128 × 10⁻³ kg s⁻¹, a ratio of 40. Each rod gets the whole-worm value divided by twice the rod count, C/98, exactly as Boyle et al.'s code (`worm.cc`: C/(2·NBAR)) and Fieseler et al.'s Table 1 do.
- **Integration.** A semi-implicit step solves the 49 × (3×3) block-tridiagonal system for the rod velocities, with drag and dampers implicit and the springs explicit; every spring has a damper in parallel, which keeps it stable to about 20 ms. The CPU reference eliminates the blocks in order; the GPU uses block cyclic reduction on 63 rows, the rods and then identity rows, five levels down, the middle row solved, and five back, in the brain's workgroup. f32 limits how closely it can follow the CPU on this stiff system; §7.2's body row says what parity requires.
- **Tests.**
  - A passive-bend relaxation test depends on the stiffness-to-drag ratio, so it catches a wrong stiffness that the translation tests can't, while they pin the drag.
  - A prescribed muscle wave at 0.30 Hz must crawl before the brain is attached.
- **Lying side.** Each trial draws which side the worm lies on, which mirrors the dorsoventral plane on screen.

### 5.2 Dish, lawn and odour field

- **Dish.** A 10 cm dish with the standard chemotaxis layout (Bargmann, Hartwieg & Horvitz 1993). The odour spot sits 0.5 cm from the edge, a control spot sits opposite, and the worm starts at the centre, about 4.5 cm from each.
- **Odour.** 2-butanone, at the standard dose of 1 µl of a 10⁻³ dilution. It is the best-supported choice for an AWC-only model:
  - killing AWC almost abolishes butanone chemotaxis;
  - its diffusion coefficient in air is measured;
  - Levy & Bargmann's parameters are in butanone units.
- **Field.** 2D diffusion on a 256 × 256 grid (0.4 mm cells), made of:
  - a diffusion coefficient of 0.091 cm² s⁻¹ in air at 298 K, a measured value (Lugg 1968, via Tang et al. 2015; level 3);
  - a first-order loss set so the steady decay length √(D/k) is 3 cm (level 0, fixed in advance);
  - a release rate set so the steady concentration at the 0.5 cm capture radius equals K, the top of the adaptation model's working range (level 0).

  Tanimoto et al. 2017 measured a closed plate approaching a quasi-steady 2-nonanone field over minutes. Their rates come from a phenomenological fit, not a loss rate, so they are context only. Treating the air layer as 2D over uniform agar is an assumption (level 0).

- **Stepping.** The explicit scheme's stability limit on this grid is 4.4 ms. The app therefore advances the field on the GPU in explicit sub-steps of at most 4 ms, about 16 million cell updates per simulated second. The field doesn't depend on the worm, so the harness computes it once per layout at high accuracy and every trial reads the same copy.
- **Lawn.** A 1 cm disc that releases butanone. Real lawns release many odours (level 0), and slowing on food and dwelling versus roaming need neuromodulation, so they won't emerge (spec §5).
- **Walls.** The dish wall reflects odour and stops the worm.

## 6. Parameters and the fidelity registry

### 6.1 The registry

The fidelity ledger (spec §1.3) lives in code, so the app, the docs and the tests read the same facts:

- `src/science/citations.ts` lists every source once: authors, year, title, venue, DOI or URL.
- `src/science/params.ts` is the single source of truth for every constant. Each entry has its value, unit, level, sources and a note, and `free` is derived from the level: true at levels 1 and 0. Calibrated parameters also carry the bounds they may move within.
- `src/science/fidelity.ts` lists every component (level or tag, basis, caveats, upgrade path, sources, and the checkpoints that test it). It also lists every subsystem (summary, what's solid, what isn't, upgrade path). A subsystem's level is never set by hand: it is shown as the range of its components' levels.
- The runtime data carries per-element provenance: each connection's sign source, each neuron's position source.

`npm run docs:fidelity` generates `FIDELITY.md`, with sign coverage counted from the data file, and `npm run data:build` generates `DATA_SOURCES.md`; CI regenerates both and fails on any difference. The app's "About the science" view renders the same registry, and the inspector shows each element's provenance badge.

### 6.2 The free-parameter budget

Values we set ourselves, all global or per class:

| Parameter                                         | Level | How it's set                                                   |
| ------------------------------------------------- | ----- | -------------------------------------------------------------- |
| Neural noise intensity σ_n                        | 1     | Calibrated to the spontaneous reversal rate                    |
| Proprioceptive gain g_p (A and B)                 | 1     | Calibrated (§7.2)                                              |
| Neuromuscular gain and threshold                  | 1     | Calibrated (§7.2)                                              |
| Head-switch gain g_sw                             | 1     | Calibrated (§7.2)                                              |
| Oscillator excitability, recovery time, B drive θ | 1     | Calibrated (§7.2)                                              |
| AWC gain                                          | 0     | Fixed in advance: 16 mV on odour removal (§4.1)                |
| Touch stimulus: 10 mV for 500 ms                  | 0     | Fixed in advance (§4.2)                                        |
| Odour release rate                                | 0     | Fixed in advance: concentration K at the capture radius (§5.2) |
| Odour decay length, 3 cm                          | 0     | Fixed in advance (§5.2)                                        |
| Lawn diameter, 1 cm                               | 0     | Fixed in advance (§5.2)                                        |

That is fourteen values: eight calibrated and six fixed in advance. The budget is **at most 14**; anything beyond it needs your approval, and `FIDELITY.md` lists every one with its final value. Research track R (§9) will need more, by the amount its approved proposal sets.

Until calibration, the eight calibrated parameters run on provisional values: the best of the planned model's 96 go/no-go draws, to three significant figures, with the noise off (2026-09-26, DECISIONS.md). `params.ts` holds them beside the calibrated values, which stay unset, so nothing can mistake them for calibrated.

Values taken from a source aren't free, even when adapted. These include:

- the neural constants (§3.2) and the adaptation constants K and τ (Levy & Bargmann 2020);
- the head switch's `b`, `P_th` and the head region they were fitted in (Ji et al. 2021);
- the proprioceptive reach of 0.2 body lengths (Wen et al. 2012);
- the diffusion coefficient (Lugg 1968);
- the body, drag and muscle constants (Boyle, Berri & Cohen 2012).

## 7. Validation, fixed in advance

Every behavioural checkpoint runs on the CPU reference in the harness, with the seeds, trial counts, definitions and thresholds fixed here. Speeds and wavelengths are in body lengths, so literature measured on worms of different sizes applies directly; the simulated body is 1 mm long. Each result is reported as pass, partial or fail, and each quantity as calibrated or predicted.

### 7.1 Definitions and statistics

- **Head swing.** Half a cycle of head bending: successive zero crossings of the head angle (between the body tangents at 0.05 and 0.2 body lengths), counted when they are at least 0.5 s apart and the peak between them exceeds 10°.
- **Reversal.** Backward centroid motion lasting at least 1 s. It is short with 1–2 head swings and long with 3 or more, matching how Gray, Hill & Bargmann 2005 scored reversals by eye.
- **Forward bout.** Continuous forward centroid motion between reversals.
- **Forward and backward** (set 2026-09-26, before any trial, DECISIONS.md). Sampled every 0.1 s, the centroid's velocity is its displacement over the centred 1 s window, projected on the direction from the centroid to the head at the window's middle. Above +0.01 body lengths/s it is forward, below −0.01 backward, and between them a pause, which ends a bout or a reversal. Every measure starts after each trial's first 10 s.
- **Tests.** Rates are compared per trial with two-sided Mann–Whitney U tests, proportions with Fisher's exact test, and before-and-after speeds with the Wilcoxon signed-rank test, all at α = 0.05.

### 7.2 Correctness checks

| Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Port check.** Golden trajectories come from Neural Interactome's own, unmodified `initialize.py`, with its web server stubbed out. They are solved with Radau at rtol = atol = 10⁻¹⁰, from its own starting state with a fixed seed, for the ALM, PLM, AVA and AVB presets over 5 s. The CPU reference in Neural Interactome mode is compared against them                                                                                                                                                                                                                                                                                                                                                                                                      | RMS error of `V − V_th` at most 1% of max(excursion range, 1 mV), after the 0.3 s input ramp, for every neuron. The excursion range is max − min after the ramp                                                                                                                                                                                                                                                                                                                                                                |
| **Production check.** The Cook model (rest thresholds, per-connection signs, autapses, oscillators off) against Radau, for a PLM pulse and an AVB step                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | The same tolerance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Convergence**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | The integrator's measured order is 2 ± 0.3, and checkpoint 1's metrics agree within 2% at dt and dt/2                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **GPU parity, one step.** Twenty active states sampled from a closed-loop CPU run, plus the rest state, their inputs held. **Changed after results (2026-09-26, DECISIONS.md):** the GPU is compared with the CPU reference solved at the GPU's own solver tolerance, so the check sees the port's arithmetic. The comparison with the reference at its own tolerance is reported, not graded: there 7 of 21 states exceed the threshold, as the f64 reference itself does at the GPU's tolerance                                                                                                                                                                                                                                                                 | \|ΔV\| ≤ 10⁻⁴ × max(\|V\|, 1 mV), plus the noise's rounding allowance (§3.5), \|Δs\| ≤ 10⁻⁴ and, since 2026-09-26, \|Δw\| ≤ 10⁻⁴ × max(\|w\|, 1) for every neuron                                                                                                                                                                                                                                                                                                                                                              |
| **GPU parity, one second.** The same states, their inputs held. **Changed after results (2026-09-26, DECISIONS.md):** a state is graded only if it is well posed, meaning the CPU reference, rerun at the GPU's solver tolerance, stays within 10⁻² of itself; the others are reported, not graded                                                                                                                                                                                                                                                                                                                                                                                                                                                                | RMS relative error ≤ 10⁻², with the same floor, for every graded state; the check fails if more than a quarter of the states are not graded                                                                                                                                                                                                                                                                                                                                                                                    |
| **GPU parity, the body, muscles and head switch** (set 2026-09-26, before any loop parity results, DECISIONS.md). From milestone 3, the same states carry the body, the muscles and the head switch, and both sides run the whole loop; so do copies of them moved 3 cm across the dish and turned 50 times, which the CPU doesn't notice, and states from two variants that make the head switch flip and gate. **Changed after results (2026-09-26, DECISIONS.md):** the velocities' threshold from 10⁻⁴, which an f32 assembly of this system can't reach, to 10⁻². A second change, to grade each rod's end points instead of its centre and rotation, was undone the same day: its cause turned out to be a defect, since fixed. The end points are reported | One step: each rod's velocity within 10⁻² of the body's largest, normwise and separately for x, y and θ, with floors of 10⁻⁴ segment lengths per second and 10⁻⁴ rad/s for a body at rest; \|ΔA\| ≤ 10⁻⁴ for every muscle; the same head-switch state. One second: the RMS error of κL over the interior rods ≤ 10⁻² × max(RMS κL, 1), the centroid's displacement within 10⁻² of the reference's (floor 0.01 body lengths), and the same head-switch state at every sample, graded under the one-second row's well-posed rule |
| **GPU parity, long runs.** Seeds 1 upwards, 60 s each, from milestone 3, when the body is on the GPU. **Changed after results (2026-09-26, DECISIONS.md):** 265 seeds a side, not 20, at which the frequency could not be shown equivalent (p = 0.25), whatever the means; sized for 90% power from that run's spread                                                                                                                                                                                                                                                                                                                                                                                                                                             | Crawling frequency and speed equivalent within ±5% of the CPU's mean (Welch's two one-sided tests, α = 0.05, the form fixed in code before the first long run). While checkpoint 1 is below partial, the mid-body curvature's frequency and its standard deviation of κL instead, as `scripts/experiments/go-no-go/loop.ts` measures them, by the same test (set 2026-09-26, before any parity results, DECISIONS.md)                                                                                                          |
| **Checkpoint 0, silenced network.** Every neuron-to-neuron chemical synapse and gap junction cut; neuromuscular junctions, oscillators and every §1.1 layer kept. Run with the harness from milestone 3, again at milestone 4 once touch and odour exist, and after any fallback. Milestone 0c ran only the go/no-go's silenced controls (DECISIONS.md, 2026-09-26)                                                                                                                                                                                                                                                                                                                                                                                               | No forward bout of 10 s or more in 20 trials of 120 s. Neither touch reflex, over 50 anterior and 50 posterior touches. A chemotaxis index within ±0.1 of zero over 30 runs of checkpoint 4's 60-minute protocol. Residual backward activity from A-type oscillators is expected (Gao et al. 2018) and is reported, not failed                                                                                                                                                                                                 |

### 7.3 Calibration

The calibrated parameters (§6.2) are tuned by one fixed procedure, applied identically to the real wiring and to every null. That keeps the wiring test fair.

- **Optimiser.** CMA-ES within the bounds in `params.ts`.
- **Objective.** The sum of squared relative errors from four targets: undulation frequency 0.30 Hz, wavelength 0.65 body lengths, speed 0.22 body lengths/s, and 1.8 spontaneous reversals per minute.
- **Evaluation.** 4 trials of 120 s, with fixed seeds.
- **Budget.** 400 evaluations, after which the best parameters are final.

The real wiring's exploration in milestone 0 may inform the bounds, but its final parameters come from this same procedure. Calibration waits for research track R (§9): at the go/no-go no draw of the planned model came near these targets.

The kinematic targets are Fang-Yen et al. 2010 (Table 1: 0.30 ± 0.02 Hz and 0.65 ± 0.03 body lengths, mean ± SEM, N > 10) and Ramot et al. 2008 (219 ± 29 µm/s off food, mean ± s.d.).

The reversal rate is from Gray, Hill & Bargmann 2005, Fig. 1E, read from the figure: short plus long reversals at 6–16 minutes off food average 1.8 per minute, with whiskers spanning about 1.1–2.5. The model has no food history, so it can't reproduce the fall from about 3.5 per minute just off food to 0.15 per minute after 36 minutes, which depends on neuromodulation.

### 7.4 Behavioural checkpoints

| #   | Checkpoint          | Protocol                                                                                                                                                                                                                            | Pass                                                                                                                                                                                                          | Partial                                                                                                  | Reference                                                                                                                                                                                                                         |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Crawling**        | 20 trials × 120 s from random postures; kinematics measured over forward bouts of 10 s or more                                                                                                                                      | Frequency 0.20–0.45 Hz; wavelength 0.50–0.80 body lengths; speed 0.12–0.30 body lengths/s; the four published eigenworms capture ≥ 85% of posture variance; a forward bout of 20 s or more in ≥ 80% of trials | Frequency 0.10–0.60 Hz, wavelength 0.40–1.0, speed 0.06–0.50, eigenworms ≥ 70%, the bout clause in ≥ 50% | Fang-Yen et al. 2010; Ramot et al. 2008; Stephens et al. 2008 (four eigenworms explain over 95% for real worms)                                                                                                                   |
| 2   | **Anterior touch**  | 50 touches in the ALM/AVM field, during forward crawling, at least 10 s apart                                                                                                                                                       | A reversal within 2 s in ≥ 70% of touches, and more often than in matched spontaneous windows (Fisher's exact test) by at least 3×                                                                            | 40–70%                                                                                                   | Chalfie et al. 1985 (anterior touch reverses; ALM needed for a full response). Stirman et al. 2011: optogenetic ALM/AVM activation reversed 65% of worms (78/120). No verified latency exists, so latency is reported, not graded |
| 3   | **Posterior touch** | 50 touches in the PLM field during forward crawling                                                                                                                                                                                 | Mean forward speed over the next 2 s rises by ≥ 10% (Wilcoxon signed-rank test)                                                                                                                               | A significant rise under 10%                                                                             | Chalfie et al. 1985 (PLM needed for any tail response). Stirman et al. 2011 and Leifer et al. 2011: PLM activation speeds forward movement                                                                                        |
| 4   | **Chemotaxis**      | Bargmann et al. 1993's layout (§5.2): 100 independent worms × 60 min each. A worm is counted and stopped on coming within 0.5 cm of either spot, as sodium azide does. CI = (at odour − at control) / total. Control: AWC input off | CI ≥ 0.6, and above the control (Fisher's exact test)                                                                                                                                                         | CI 0.2–0.6 and above the control                                                                         | Bargmann, Hartwieg & Horvitz 1993, Fig. 2: about 0.87 for butanone at 10⁻³ in population assays (read from the figure)                                                                                                            |
| 5   | **Lesions**         | Each lesion against intact: 30 trials of 120 s for spontaneous behaviour, and 50 touches for the touch rows                                                                                                                         | All five primary lesions move in the reported direction, each by at least the stated amount                                                                                                                   | Three or four do                                                                                         | See below                                                                                                                                                                                                                         |
| 6   | **Wiring test**     | 10 primary nulls (§3.5), each tuned by §7.3's procedure                                                                                                                                                                             | The verdict map below                                                                                                                                                                                         |                                                                                                          | Spec §4                                                                                                                                                                                                                           |

**Checkpoint 1.** The kinematic clauses are calibration targets, so they are reported as calibrated; the eigenworm and bout clauses are predicted. Five details were fixed before any posture data existed, and two more on 2026-09-26, before any trial ran (DECISIONS.md):

- **Eigenworm basis.** The eigenworms of Stephens et al. 2008, as the authors' group distributes them with WormPose (`EigenWorms.csv`, pinned in `data/sources.json`): the first four of its 100 modes, read with the head at angle 1. The file names no source, so its identity with the 2008 basis is inferred (DECISIONS.md). A published set of real postures, which its tutorial introduces as coming from Stephens et al.'s experiment, is consistent with it: the first four modes capture 96.46% of their variance, against 96.48% for the best any four modes can do.
- **Posture sampling.** Postures are 100 tangent angles sampled at 101 equally spaced midline points, with the mean angle removed, as in Stephens et al.
- **Variance captured.** Σₖ₌₁..₄ eₖᵀ C eₖ / tr C, where the eₖ are the four modes and C is the covariance of the postures pooled over all 20 trials, sampled at 4 Hz as Stephens et al. did, leaving out each trial's first 10 s, which start from a random posture, and leaving out self-intersecting postures. That matches how Stephens et al. measured their 95%: all the behaviour of freely crawling worms, reversals and shallow turns included, as "Cases of self-intersection were excluded from processing". The simulated body has no self-contact, so it can form postures they never measured.
- **Pass margin.** The pass level sits below Stephens's 95% because the model is simpler than a worm.
- **Bout clause.** At the calibrated reversal rate, a simulation with exponentially distributed runs and 5–10 s reversals puts about 99% of trials above a 20 s bout. The clause therefore fails only a model that can't sustain forward crawling at all.
- **Starting postures.** Each trial starts from a real posture: one of the 6,655 in the OIST Physics of Behavior tutorials' `shapes.csv` (pinned in `data/sources.json`), which the tutorial introduces as coming from Stephens et al.'s experiment, drawn by the trial's seed, head first and turned to a heading drawn uniformly. Trials use seeds 1 to 20, and checkpoint 0 the same seeds, so it silences the network on the same postures.
- **Kinematics**, over forward bouts of 10 s or more, pooled over all trials. Speed is the mean forward velocity (§7.1). Frequency is half the mid-body curvature's crossings of each bout's mean, over the bouts' total duration. Wavelength is 0.3125 body lengths, the distance between the rods at 0.29 and 0.60 body lengths, over the frequency times the lag, from 0.1 s to one period, at which their curvatures correlate best, the correlations summed over bouts. The checkpoint passes if every clause passes and is partial if every clause is at least partial; with no bout of 10 s, the kinematic clauses fail.

**Checkpoint 4 references.** Bargmann et al.'s Fig. 5 values come from single-animal assays scored positive or negative, so they aren't chemotaxis indices. They are cited as context only: 0.77 of intact animals and 0.16 with AWC killed scored positive, against a false-positive rate of 0.11. The spec's silenced-network control lives in checkpoint 0.

**Checkpoint 4 mechanism** (secondary: reported, never gating):

- **Klinokinesis.** The ratio of reorientation rates when heading down the gradient versus up it.
- **Weathervaning.** The slope of curving rate against bearing, where curving rate is the change in heading per unit path length. It is computed over runs only (windows without a reorientation) and excludes steps shorter than 0.25 × the median stride, the floor nematode's Logbook 035 found essential. Threshold-free companion statistics are reported alongside.
- **Grading.** "Reproduced" needs both of these; "partial" needs one; otherwise it's "absent". The references are sign-only, because the source studies used salts (Pierce-Shimomura et al. 1999: ammonium chloride and biotin; Iino & Yoshida 2009: NaCl).
  - The intact statistic's 80% bootstrap interval clears the null in the right direction.
  - The interval for the intact-minus-AWC-off difference excludes zero, as spec §8.4 requires.
- **Definitions.**
  - **Heading:** the direction of the centroid's motion over one undulation period (3.3 s).
  - **dC/dt:** the concentration change at the nose over the same window.
  - **Reorientation:** a reversal, or an omega turn: more than 135° of turning within one head swing (Gray et al. 2005).
  - **Bearing:** the angle from the heading to the local gradient.

**Checkpoint 5 lesions:**

| Lesion    | Pass if                                                                       | Source                                                                                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AVA + AVD | Touch-evoked reversals fall ≥ 80%, and spontaneous reversals fall ≥ 30%       | Chalfie et al. 1985 (N = 3): "incapable of moving backward". Piggott et al. 2011, Fig. 2C (read from the figure): AVA⁻AVD⁻ worms still reversed about 1.1 times a minute against about 2.1, a 47% fall |
| AVB + PVC | Forward speed falls ≥ 80%                                                     | Chalfie et al. 1985: "incapable of generating forward motion with their bodies"                                                                                                                        |
| PVC       | Checkpoint 3's response falls ≥ 80%, and checkpoint 2's stays ≥ 70% of intact | Chalfie et al. 1985                                                                                                                                                                                    |
| AVA       | Long reversals fall ≥ 80%, and spontaneous reversals fall ≥ 30%               | Gray et al. 2005: "unable to generate long reversals". Piggott et al. 2011: about a 44% fall                                                                                                           |
| RIM       | Short reversals rise                                                          | Gray et al. 2005; Piggott et al. 2011 (inhibiting RIM triggers reversals)                                                                                                                              |

AIB, AIY and AIZ lesions are reported as secondary results, not graded, because Gray et al. describe their effects through time off food, which depends on neuromodulation the model lacks.

**Checkpoint 6 verdict map:**

- **Crawl gate.** A null "crawls" if it reaches at least partial on checkpoint 1 after tuning.
- **Crawling.** Wiring matters if the real wiring crawls and at most 2 of the 10 nulls do; no evidence if 5 or more crawl; inconclusive otherwise.
- **Checkpoints 2 to 5, compared among crawling nulls only.** Wiring matters if the real wiring passes and at most 20% of the crawling nulls do; no evidence if 50% or more do; inconclusive otherwise. With fewer than 5 crawling nulls, the verdict is "insufficient nulls".

The secondary nulls are reported without verdicts. The report gives every null's results, whichever way they fall.

### 7.5 Harness cost

Trials are independent, so the harness runs them in parallel, one worker per core, against the shared precomputed odour field. The review's single-thread benchmarks put a worm-hour at about 2–11 CPU-minutes, depending on the step.

- **Checkpoint 4 dominates.** Intact plus AWC-off is at most 200 worm-hours per wiring.
- **Tuning** is about 53 worm-hours per wiring.
- **A full pass** of checkpoints 1–6 over the real wiring and 10 nulls is on the order of a day on a 16-core machine.

## 8. Testing, CI and deployment

**Unit tests** (Vitest) cover the loader's validation and the physics against cases with known answers:

- a lone neuron relaxes to E_c with time constant C/G_c;
- two gap-coupled neurons equilibrate at the analytic rate;
- the integrator's measured convergence order is 2;
- a passive straight body under uniform drag translates without turning;
- a passive bend relaxes at the rate the drag-to-stiffness ratio predicts;
- a prescribed travelling wave moves forward at the speed resistive force theory predicts;
- a point release of odour matches the analytic 2D Gaussian, which is nematode's Fick kernel;
- the random-number hash and Gaussian transform match fixed test vectors, including the edge hashes.

**The port check and production check** (§7.2). `tools/reference/ni_reference.py`, run with `uv`, imports Neural Interactome's unmodified `initialize.py` (BSD-3, credited) with its web server stubbed, and calls its own right-hand side, Jacobian and threshold functions. The review confirmed this runs headlessly. Driving Neural Interactome's own code, not a re-implementation, means a misreading can't be shared between reference and port, such as reading `Gs.npy`'s [post, pre] layout the wrong way round. The goldens are stored with the script's hash in `tests/fixtures/ni/`. For the production check, `tools/reference/cook_reference.py` is an independent, dense implementation of the production model that reads the runtime data file, solved by Radau in the same way; its goldens in `tests/fixtures/cook/` record the constants they used, which a test compares with the registry, and a digest of the wiring they read. The tests fail when a golden is stale (its script, its pinned inputs or the wiring changed without it being regenerated) or was edited by hand, since each manifest also records its outputs' digests.

**GPU parity** (`npm run gpu:parity`) runs in the same headless Chrome as the visual tests (`scripts/browser.ts`), ported from Universe:

- on the real GPU locally, and in CI on SwiftShader, the software Vulkan that ships with Chrome, with Universe's flags (`--enable-unsafe-webgpu --use-angle=vulkan --enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE --disable-vulkan-surface`);
- it never presents a frame, because software stacks read screenshots back as black;
- a test page, `parity.html`, served by the dev server and never deployed, exposes `window.__parity()` and `window.__bench()`. It builds the states with the CPU reference in the page, runs both brains from them, reads the GPU's buffers back and compares. Opened in a browser, it shows the results, which is how the Safari check is made;
- the random numbers are checked first: the GPU's hashes and uniforms must equal the CPU's exactly, and each Gaussian must lie within the error WGSL allows `log`, `sqrt` and `cos`, which the one-step check adds to its voltage tolerance;
- API checks cover what the states don't: a new brain's rest state, a state's round trip, a run split across dispatches, a restart, and the CPU carrying on from a state the GPU read; and one lesioned case, without oscillators or noise, restarts its integrator halfway through its second;
- from milestone 3 the same states are also whole worlds, and both sides run the whole loop, the body included, from them, from copies moved across the dish and turned, and from two variants that make the head switch flip and gate (`src/gpu/loopParity.ts`);
- long runs (`npm run gpu:parity -- --long`, or `/parity.html?long`) take 11 to 18 minutes on an M5 Max and would take hours on SwiftShader, so they run locally, not in CI;
- the `webgpu` npm package (Dawn's Node bindings) is an optional local fast loop, not a second CI stack.

Safari and Firefox run their own WebGPU engines, which CI can't cover, so milestones 3 and 6 each include a manual Safari check. Milestone 2's was postponed to milestone 3, since it couldn't be run then, and passed there with milestone 3's parity (2026-09-26, DECISIONS.md).

**The behavioural harness.** `npm run harness -- --checkpoint <n>` runs trials in parallel on the CPU reference, writes JSON to `harness-out/`, and regenerates the results tables in `VALIDATION.md`. It runs checkpoints 0 (its crawling clause, until milestone 4 brings touch and odour) and 1 from milestone 3, on the provisional parameters until calibration (§6.2).

**CI jobs.**

- `checks`: lint, format, unit tests including the port and production checks, typecheck, build, and the freshness of `FIDELITY.md`.
- `data`: rebuilds the runtime data, `DATA_SOURCES.md` and the reports from their pins, and fails if any committed output differs.
- `gpu`: parity on SwiftShader, since milestone 2.
- `visual`: fixed views pixel-compared against baselines, as Universe does, from milestone 1.
- `deploy`: Pages, gated on `DEPLOY_PAGES`, after `checks`, `data`, `visual` and `gpu` pass. Live since 2026-09-26 at https://chrisjz.github.io/wormlight/.

## 9. Milestones

Each milestone is one or more focused PRs, each merged before the next starts, and ends with a summary of what works, what doesn't, and checkpoint status.

| Milestone             | Delivers                                                                                                                                                                                                                 | Exit criteria                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0a** Data           | The nematode exporter (a PR there), the data build, the runtime file with its notices, the sign cross-check report, and the registries with `FIDELITY.md` and `DATA_SOURCES.md` generated. The eigenworm basis is pinned | Counts and coverage match §2; the docs regenerate cleanly                                                                                                                                                                                              |
| **0b** Neural core    | The CPU neural model, the port and production checks, and the step size confirmed                                                                                                                                        | Both checks and the convergence tests pass                                                                                                                                                                                                             |
| **0c** Crawling spike | The oscillators, head switch, proprioception, muscles and body on the CPU; the calibration procedure; checkpoint 0's crawling clause; checkpoint 1 (see the outcome below)                                               | **Go/no-go with you**: does the connectome-driven body crawl?                                                                                                                                                                                          |
| 1                     | The WebGPU 3D neural graph, the inspector with provenance badges, and visual regression CI                                                                                                                               | The graph renders on CI's software GPU; the inspector shows each connection's sign source                                                                                                                                                              |
| 2                     | The neural model on the GPU, with the parity CI job                                                                                                                                                                      | Parity passes on CI's software GPU and on the Mac; the brain step's speed measured against the 10× target. Long-run parity and the full step's speed moved to milestone 3, and the Safari check was postponed there (2026-09-26)                       |
| 3                     | The body on the GPU and the plate view                                                                                                                                                                                   | Checkpoint 1 in the harness, a fail until track R succeeds; long-run GPU parity; the parity page passes in Safari (postponed from milestone 2); 60 fps real time on an M-series Mac in Chrome and Safari; the full step's speed against the 10× target |
| 4                     | Odour field, AWC sensing and touch                                                                                                                                                                                       | Checkpoints 2 to 4, or not reached until track R; checkpoint 0 re-run in full                                                                                                                                                                          |
| 5                     | Lesions and the brain swap                                                                                                                                                                                               | Checkpoints 5 and 6, or not reached until track R                                                                                                                                                                                                      |
| 6                     | Glow, "About the science", URL state, performance and docs (Pages has deployed `main` since 2026-09-26)                                                                                                                  | `VALIDATION.md` complete; the fast-forward target met or its shortfall logged; a Safari check                                                                                                                                                          |

**Milestone 0c's outcome (2026-09-26): no-go on crawling.** The loop is built and tested, but none of the parameter draws tried makes the planned model crawl, and neither fallback 1 nor 2 changes that (DECISIONS.md). You chose fallback 4: 0c closes as an honest partial, and milestone 1 comes next. The ledger says crawling does not yet emerge, and the app will say so from its first view of the body. Of what 0c's row lists, calibration and checkpoints 0 and 1 did not run formally:

- **Calibration** (§7.3) waits for track R, since no draw of the planned model comes near its targets.
- **Checkpoint 1** is reported as a fail, and checkpoints 2 to 6, which need forward crawling, as not reached, until R brings checkpoint 1 to at least partial (§7.4's crawl gate).
- **Checkpoint 0** runs formally with the harness, from milestone 3. While the intact model doesn't crawl, its crawling clause can't fail, so a pass says nothing about the wiring.
- **GPU parity.** Settled when milestone 2 started (2026-09-26, DECISIONS.md): long-run parity moves to milestone 3, where the body joins the GPU, and while checkpoint 1 is below partial it compares the mid-body curvature's frequency and standard deviation of κL, not crawling frequency and speed (§7.2).

**Milestone 1's outcome (2026-09-26): done.** The graph renders on a local GPU and on CI's software GPU, where the visual tests match their baselines exactly, and the inspector shows each connection's sign source and fidelity level (DECISIONS.md).

**Milestone 2's outcome (2026-09-26): done, but for the Safari check, which moves to milestone 3; it passed there the same day (DECISIONS.md).** The GPU brain matches the CPU reference on the Mac's GPU and on CI's software GPU, by the one-step and one-second checks as changed after results (§7.2), and steps at about 29× real time on an M5 Max. Long-run parity and the full step's speed moved to milestone 3 before any parity results (DECISIONS.md).

**Research track R: class-level fitting.** R is not a milestone: you schedule it between milestones, one PR at a time. It is fallback 3, widened to class-level gains, resting offsets and rectification in the motor circuit, tuned by §7.3's procedure. It starts from a proposal you approve, which fixes before anything runs:

- the classes and parameters, and the free-parameter budget raise they need (§6.2);
- which of them are spec deviations for your sign-off: resting offsets depart from §3.3's threshold rule, and rectification from the spec's bidirectional gap junctions;
- its evaluation budget. If that differs from §7.3's 400, §7.3 changes, and the change is logged in DECISIONS and marked on checkpoints 1 and 6.

Every primary null is tuned by the same procedure on the same budget. R's parameterisation comes from experiments on the real wiring (the ladder in DECISIONS), a design step the nulls don't get, and checkpoint 6's report says so. R ends when checkpoint 1 reaches at least partial or its evaluation budget is spent.

## 10. Risks and the fallback menu

| Risk                                                      | Likelihood               | Mitigation                                                                                                                                                                               |
| --------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The rhythm generators and coupling don't produce crawling | Happened at milestone 0c | Fallbacks 1 and 2 tested without effect; fallback 4 taken, with fallback 3 as research track R (§9)                                                                                      |
| Reversals don't travel backward along the body            | Medium to high           | A-type oscillators and their mirrored coupling are the default, but the A-types don't yet cycle on their own (DECISIONS.md, 2026-09-25); checkpoint 2 waits for track R                  |
| The model saturates or falls silent on Cook's weights     | Medium                   | Per-type rescaling (§3.2), with shared-connection scales and the sign-sensitivity runs reported                                                                                          |
| Chemotaxis needs head steering the model can't produce    | Medium to high           | Accept a partial and report it; weathervaning depends on head motor neurons (SMD, RMD) that the data wire to head muscles                                                                |
| One GPU workgroup misses the fast-forward target          | Low since milestone 3    | The whole step runs at about 24× real time on an M5 Max, for the step alone (§1); rendering and readback come with the plate view, and a shortfall is logged, not paid for with accuracy |
| Safari's WebGPU behaves differently                       | Low to medium            | Safari checks at milestones 3 and 6 (milestone 2's postponed to 3)                                                                                                                       |

**If milestone 0 can't make the worm crawl**, these are the options, in order. Each is logged, levelled in the ledger, and applied only with your go-ahead:

1. **A delayed proprioceptive loop.** Wen et al. measured delays of about 80 ms per region, with ~300 ms as an upper bound. Kim et al. 2025's model, with its synapses unfitted, kept moving in a fluid once it had a feedback of the network's own activity delayed by about 0.5–0.6 s (§11). _Tested at the go/no-go: delays of 80, 300 and 550 ms in the proprioceptive loop changed nothing, and Kim et al.'s mechanism, rebuilt as their code has it, gave no crawling on Wormlight's network and body._
2. **Bistable B-type neurons,** as in Boyle, Berri & Cohen 2012, keeping Wen's coupling direction. _Tested: no effect._
3. **Calibrated class-level gains** in the motor circuit (level 1, counted against the budget). _Research track R (§9), which also proposes resting offsets and rectification, as spec deviations for your approval._
4. **An honest partial.** The connectome still drives the muscles, and the app says crawling does not yet emerge. _Taken at the go/no-go._

Never on the menu: a central pattern generator outside the allow-list, or anything that reads behavioural state.

**Changes after held-out results.** If a model change is made after any held-out checkpoint (2 to 5) has been run, that checkpoint, and any checkpoint run later on the changed model, is reported as fitted rather than predicted (spec §1.2).

## 11. Prior art, and what Wormlight adds

| Work                                                                                 | What Wormlight takes from it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neural Interactome (Kim, Leahy & Shlizerman 2019)                                    | The neural model, its code and data as the port check, and the warning that its threshold rule is what creates Kunert's oscillation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Kunert-Graf et al. 2017                                                              | The model's published parameter values, and its statement that the model "does not sustain oscillation in the absence of explicit external input" (§4.3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Kunert, Proctor, Brunton & Kutz 2017 (_PLOS Computational Biology_)                  | Confirmation that the model needs constant drive: "In the absence of constant stimulus, the neural state will collapse onto a static, stable fixed point, i.e. a state of no movement." They drove the B-types with an imposed travelling wave instead, noting that without a body "any feedback rule which we might implement on the present model would be no less artificial"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Kim et al. 2025, arXiv 2504.18073 (modWorm; code at `shlizee/modWorm`, BSD-3-Clause) | The closest precedent: the same neural model on 279 neurons, with muscles and a body. Its neurons and synapses are not fitted. Its body is an eel-like rod in a fluid of 10 mPa·s, which the authors take to stand for agar, and they chose the feedback's delay to match recorded curvatures: "Time delay of approximately 0.5 sec produces optimal forward and backward locomotion which is close to experimental locomotion". Constant stimuli, chosen by "maximizing locomotion distance", drive one set of runs. In the others a pulse into sensory neurons (PLM forward; ALM and AVM backward) dies away over about 1.2–2 s, and from 1.18 s a feedback delayed by 0.6 s in their code sustains the movement. That feedback is the network's own voltages projected onto the patterns the muscle map can see, pinv(M)·M·(V − V_th), added to the voltage the network sees; the body state is never read. A later genetic-algorithm tuning of 5,146 synapse scales was optional, and it turned backward locomotion forward. Its Cook-based variant matched recorded postures better than the Varshney base (eigenworm error 5.6 ± 0.7% against 13.1 ± 0.8%). On Wormlight's Cook network and agar body the mechanism gives no crawling (DECISIONS.md, 2026-09-26) |
| Ji et al. 2021                                                                       | The head's proprioceptive relaxation switch, with its fitted threshold and derivative weight                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Fouad et al. 2018; Xu et al. 2018; Gao et al. 2018                                   | The rhythm generators in the ventral cord                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Wen et al. 2012                                                                      | The direction and reach of proprioceptive coupling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Boyle, Berri & Cohen 2012                                                            | The body mechanics and muscle dynamics, but not its proprioception                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Izquierdo & Beer 2018 (_Phil. Trans. R. Soc. B_)                                     | Evidence that a connectome-inspired circuit on Boyle's body crawls once fitted: SMD and RMD in the head and six identical ventral-cord units from Haspel & O'Donovan's repeating unit, with 30 free parameters evolved to match speed on agar. 46 of 100 runs reached a fitness of at least 0.95; B-type stretch feedback was essential, and B-types "did not evolve to be bistable in any of the solutions"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Olivares, Izquierdo & Beer 2021 (_Frontiers in Computational Neuroscience_)          | Seven identical ventral-cord units with no head circuit or stretch receptors and 44 evolved parameters; 104 of 160 runs matched the frequency and speed on agar. Strengthening the gap junctions between neighbouring units' B-types reduced bending: "As the strength of the gap junctions was increased, the bending in the body decreased"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Chung & Kim 2026 (_Scientific Reports_)                                              | Cook's motor circuit (162 motor neurons, 10 premotor interneurons, 95 muscles) with 316 proprioceptive links added and the command neurons clamped. Its 3,233 weights were fitted to a sinusoidal muscle pattern and to the phase between SMD activity and neck bending, while held close to the anatomy. They fitted because "the model using anatomical connectome weights directly did not achieve that", of earlier whole-connectome models whose output reached the muscles only through an eigenworm projection. The body is driven open loop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Randi et al. 2023 (_Nature_)                                                         | Measured signal propagation among head neurons agrees poorly with an anatomy-based model like Wormlight's, and still poorly once its weights and signs are fitted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Fieseler, Kunert-Graf & Kutz 2018 (_Journal of Biomechanics_; arXiv 1707.05359)      | Extends Boyle, Berri & Cohen's model with A- and B-class circuits, and suppresses proprioception to produce omega turns. It does not use the connectome, which is left as future work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| BAAIWorm (Zhao et al., _Nature Computational Science_, 2024)                         | A biophysically detailed closed brain–body–environment loop, as a reference for what detailed models achieve. It models 136 neurons, not the whole connectome, with synapse polarities and weights fitted by gradient descent to whole-brain calcium correlations. A linear readout of its 80 motor neurons, trained on a 10 s movement generated in its own simulator, drives the 96 muscles in simplified hydrodynamics, and the authors leave "more reasonable central pattern generators" and proprioception to future work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| OpenWorm c302                                                                        | Neuron morphologies and positions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Quantum Nematode                                                                     | The data pipeline, the rewired null, the chemotaxis validation method, and the prior results on wiring against nulls                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

What Wormlight adds: the whole connectome in a closed loop that runs live in a browser on the GPU; a fidelity ledger down to each connection's sign; and validation fixed in advance, including a wiring test in which every null gets the same tuning procedure and budget.

A literature sweep at the go/no-go found no published model that makes the whole connectome crawl on agar with anatomy's weights and without fitting, and Wormlight doesn't yet either (DECISIONS.md, 2026-09-26). The circuits above that crawl on agar were fitted, and most were also reduced to repeating units. Kim et al.'s network, with its synapses unfitted, moves in a fluid that stands for agar, with a feedback delay chosen to match recorded curvatures.
