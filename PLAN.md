# Wormlight: Plan

For review under spec §10. The scaffold is on `main`; everything below is proposed. Once you approve it, the thresholds in §7 are fixed: changing one later is logged in `DECISIONS.md` and marked on the checkpoint.

## 0. What needs your sign-off

1. The validation thresholds (§7).
2. Two changes to the spec's defaults, which this PR also writes into the spec:
   - **The rhythm hypothesis becomes Wen et al. 2012's front-to-back proprioceptive chain**, with the head rhythm expected from the network itself (§4.3). The spec named Boyle, Berri & Cohen's convention, which Wen's experiments contradict in direction.
   - **The attractant becomes 2-butanone, sensed by AWC-ON** (§4.1, §5.2), because chemotaxis to it depends almost entirely on AWC.
3. The defaults marked "needs sign-off" in `DECISIONS.md`: the sign hierarchy, the weight rescaling, the implicit voltage solve, and the threshold at rest.
4. The free-parameter budget (§6).
5. The fallback menu if milestone 0 can't make the worm crawl (§10).

## 1. Architecture

```
nematode export ──┐
c302 morphologies ├─► data build ─► public/data/wormlight.v1.json
Fenyves 2020 ─────┤   (scripts/)          │
sign overrides ───┘                        ▼
          ┌────────────── simulation core: CPU reference (src/sim) ──────────────┐
          │ environment ─► sensing ─┐                                             │
          │ body ─► proprioception ─┴─► brain ─► muscles ─► body                 │
          └──────────────────────────────────────────────────────────────────────┘
                      mirrored by WGSL kernels (src/gpu) that run the app
                                            ▼
                       renderer: plate view, 3D graph, glow (src/render)
```

**Modules.** `src/science` holds the citation list and the fidelity and parameter registries (§6). `src/data` loads and validates the runtime file. `src/sim` is the CPU reference: `brain`, `sensing`, `proprio`, `muscles`, `body`, `env`, `rng` and a `world` that orders a step. `src/gpu` mirrors `src/sim` in WGSL. `src/render` and `src/ui` draw and interact. `scripts/` has the data build, the fidelity doc generator, the behavioural harness and headless-Chrome capture. `tools/reference/` holds a Python script that produces golden trajectories from Neural Interactome's own code.

**The brain interface** sits on the spec §1.1 boundary, so every brain takes the same inputs and drives the same muscles:

```ts
interface Brain {
  reset(seed: number): void;
  setLesions(ablated: ReadonlySet<number>): void; // neuron indices
  step(dt: number, input: BrainInput, out: BrainOutput): void; // currents in, drive per muscle out
  readActivity(target: Float32Array): void; // per-neuron state for the glow and inspector
}
```

**One step** runs in this order on both the CPU and the GPU:

1. Sample the odour field at each sensing point, and apply any touch stimulus.
2. Update sensory adaptation and compute sensory currents.
3. Compute proprioceptive currents from body curvature.
4. Advance the brain: solve voltages implicitly, then update synaptic activation (§3.4).
5. Convert neuromuscular drive into muscle activation.
6. Advance the body under resistive force theory.
7. Advance odour diffusion, on its own coarser step.

**Time.** The neural and body step is fixed (target 1–5 ms, chosen in milestone 0 against the reference). The frame loop runs as many steps as the simulation clock needs, so pause, slow motion and fast forward only change that count.

## 2. Data

### 2.1 The nematode exporter

A separate PR in the nematode repo, through its OpenSpec process. It adds `scripts/export_wormlight.py` and emits `connectome.v1.json`:

```json
{
  "schema": "wormlight.connectome/1",
  "provenance": { "nematodeCommit": "…", "inputs": [{ "file": "…", "sha256": "…" }] },
  "neurons": [{ "name": "AWCL", "class": "sensory", "transmitters": ["Glu"], "ruleSign": 1 }],
  "chemical": [{ "pre": "AWCL", "post": "AIYL", "sections": 22 }],
  "gap": [{ "a": "ALA", "b": "CANL", "sections": 401 }],
  "neuromuscular": [{ "pre": "DA9", "muscle": "dBWML24", "sections": 3 }]
}
```

The neuromuscular part needs a new parse path: nematode's loader drops muscles, but the vendored Cook sheet holds all 95 body wall muscles, with 956 non-zero entries from 162 cells.

### 2.2 The Wormlight data build

`npm run data:build` is TypeScript run by Node. It reads sources pinned by URL and SHA-256 in `data/sources.json`, caches downloads in `data/cache/` (git-ignored), and writes `public/data/wormlight.v1.json`, which is committed and never hand-edited. It:

1. reads the nematode export;
2. reads the c302 morphologies: soma position, dendrite tip and process extent, normalised so the nose is 0 and the tail tip is 1 along the body (the morphologies span 798 µm, from −349.5 to +448.4 µm);
3. reads Fenyves et al. 2020's Cook-connectome sheet (`journal.pcbi.1007974.s007`, "5. Sign prediction (Cook)");
4. applies `data/sign-overrides.csv`, where every row cites its source;
5. assigns each chemical connection a sign and records which step of the hierarchy set it (§2.4);
6. checks counts, name coverage and symmetry, and fails loudly on any mismatch.

### 2.3 Runtime format

One JSON file, about 400 KB (about 80 KB gzipped). Every element carries its provenance, so the inspector can show where it came from.

- **neurons:** name, class, primary transmitter; position `{ s, lateral, dorsoventral }` with `s` from 0 (nose) to 1 (tail); sensing `{ kind: 'tip' | 'field' | 'none', s0, s1 }`.
- **chemical:** pre, post, sections, sign (+1, −1 or 0), sign source (`physiology`, `expression`, `rule` or `none`), and a citation id.
- **gap** and **neuromuscular:** the pairs with their section counts.
- **muscles:** quadrant, index, and the stretch of body each one covers.
- **meta:** schema version, source hashes and rescaling factors.

### 2.4 Synapse signs

This is the hierarchy logged in `DECISIONS.md`. Coverage was measured on Cook's 3,709 chemical connections:

| Step | Source                                                             | Level | Connections                              |
| ---- | ------------------------------------------------------------------ | ----- | ---------------------------------------- |
| 1    | Cited physiology, e.g. AWC→AIY and AWC→AIB (Chalasani et al. 2007) | 5     | a handful, listed in the overrides file  |
| 2    | Fenyves et al. 2020, "+" or "−"                                    | 4     | 1,545 (42%; 49% of synaptic sections)    |
| 3    | Transmitter rule (ACh and Glu +, GABA −)                           | 0     | 1,669, including Fenyves's 370 "complex" |
| 4    | No basis: no fast effect                                           | 0     | 495 (13%)                                |

Fenyves already predicts AWC→AIY as inhibitory. The override lifts it from level 4 to 5 and pins it against future data changes.

## 3. Neural model

### 3.1 Equations

The model is Kunert, Shlizerman & Kutz 2014, as implemented in Neural Interactome. For neuron _i_:

```
C dVᵢ/dt = −G_c (Vᵢ − E_c) − Σⱼ gᵍᵃᵖᵢⱼ (Vᵢ − Vⱼ) − Σⱼ gˢʸⁿⱼᵢ sⱼ (Vᵢ − Eⱼᵢ) + Iᵢ
dsᵢ/dt  = a_r φᵢ (1 − sᵢ) − a_d sᵢ,        φᵢ = 1 / (1 + exp(−β (Vᵢ − V_th,ᵢ)))
```

`Iᵢ` sums sensory, proprioceptive and noise currents. `Eⱼᵢ` is 0 mV for an excitatory connection and −48 mV for an inhibitory one; a connection with no sign gets zero conductance. Neural Interactome sets reversal potentials per presynaptic neuron, and Wormlight generalises this to per connection so Fenyves's predictions fit.

### 3.2 Parameters

| Parameter                         | Value                       | Level | Source                                                                |
| --------------------------------- | --------------------------- | ----- | --------------------------------------------------------------------- |
| Membrane capacitance C            | 1.5 pF                      | 3     | Varshney et al. 2011, via Kunert et al. 2014                          |
| Leak conductance G_c              | 10 pS                       | 3     | Varshney et al. 2011, via Kunert et al. 2014                          |
| Leak potential E_c                | −35 mV                      | 3     | Wicks, Roehrig & Rankin 1996                                          |
| Reversal, excitatory / inhibitory | 0 / −48 mV                  | 3     | Wicks, Roehrig & Rankin 1996                                          |
| Sigmoid width β                   | 0.125 mV⁻¹                  | 3     | Wicks, Roehrig & Rankin 1996                                          |
| Synaptic rise a_r / decay a_d     | 1/1.5 and 5/1.5 s⁻¹         | 3     | Neural Interactome `initialize.py`; units confirmed by the port check |
| Conductance per Varshney unit     | 100 pS, gap and chemical    | 3     | Varshney et al. 2011, via Kunert et al. 2014                          |
| Cook-to-Varshney scale            | 0.3426 chemical, 0.2087 gap | 2     | Matched totals over the 279 shared neurons (DECISIONS.md)             |

The membrane time constant is C/G_c = 150 ms, but gap-junction coupling makes the system far faster in places: with Cook's weights, down to about 0.05 ms for ALA.

### 3.3 Thresholds

Each neuron's threshold `V_th,ᵢ` is the network's equilibrium voltage with every `sⱼ` at its sigmoid-midpoint value `a_r / (a_r + 2 a_d)` and no external input. That is one dense linear solve, repeated after any lesion. Neural Interactome recomputes the threshold whenever the input changes; Wormlight does that only in the port check (DECISIONS.md).

### 3.4 Integration

Each step solves the voltages with linearly implicit Euler. Leak, gap-junction and synaptic conductances (at the current `s`) go on the left: a sparse, symmetric, positive-definite system of 302 unknowns, solved by conjugate gradients to a relative residual of 10⁻⁶. Synaptic activation then advances exactly for the new voltage, because the `s` equation is linear in `s` once `φ` is fixed.

On the GPU the whole step runs in one workgroup, two neurons per invocation, with reductions in workgroup memory. Milestone 0 picks the step size by comparing against golden trajectories from Neural Interactome's own stiff BDF solver. The target is 1–5 ms; if first order isn't accurate enough, the same solve upgrades to BDF2.

### 3.5 Noise, lesions and the contrast brain

- **Noise.** Gaussian current noise per neuron per step, with standard deviation σ (calibrated, level 1). Random numbers come from a counter-based hash of (seed, step, neuron), implemented identically in TypeScript and WGSL, so both produce the same stream.
- **Lesions.** A lesion zeroes every connection of the ablated neuron, then the thresholds are recomputed, as Neural Interactome does.
- **Contrast brain.** A port of nematode's degree-preserving double-edge swap, run separately on the chemical graph (directed) and the gap-junction graph (undirected). A connection keeps its sign and section count at its presynaptic end, so each neuron keeps its outgoing excitatory/inhibitory mix. Sensory and motor identities and the neuromuscular map are untouched. Checkpoint 6 uses 10 seeded rewirings.

## 4. The layers outside the connectome (spec §1.1)

Every layer here obeys spec §1.1: it is the same for every cell of a class, it is cited, it is shared by every brain, and nothing in it reads what the worm is doing.

### 4.1 Sensing: AWC-ON and 2-butanone

- **Which cell.** Butanone is sensed by the AWC-ON neuron alone (Wes & Bargmann 2001). Which of the two AWCs becomes AWC-ON is decided at random in each animal (Troemel, Sagasti & Bargmann 1999). So each simulated worm draws its AWC-ON side from its seed, and AWC-OFF gets no butanone input.
- **Adaptation.** Levy & Bargmann 2020's adaptive threshold `T` tracks the odour's history: `dT/dt = (K(1 − e^(−C/K)) − T) / τ`, with `K = 5.5 µM` and `τ = 17 s`, taken from the authors' code (level 3). AWC-ON activates when the concentration falls below the threshold. That matches the OFF response Chalasani et al. 2007 describe: "AWC neurons are activated by odour removal".
- **Current.** `I_AWC = g_AWC · (T − C) / K`, a graded form of that threshold crossing: odour falling below the threshold depolarises the cell, and odour rising above it hyperpolarises it. The gain `g_AWC` is calibrated once so that a drop from the plate's typical concentration to zero depolarises AWC by 16 mV, which is 2/β, the working width of its sigmoid. That's a calibration against the sensory scale, never against chemotaxis (level 1).
- **Where and in what units.** The concentration is read at the nose tip, where AWC's dendrite ends. The field is expressed in aqueous-equivalent micromolar at the agar surface, the units Levy & Bargmann's parameters use. How a spotted dilution maps onto that is an assumption (level 0), fixed through the odour release rate (§5.2).

nematode's adaptive sensor (Logbook 028) is the conceptual precedent; the Levy & Bargmann model replaces its generic fold-change readout with a published model of this cell.

### 4.2 Touch

- **Where it acts.** A tap at body position `s` stimulates every touch receptor whose process covers `s`, using the c302 morphologies (level 4). As a fraction of body length: ALM L/R 0.06–0.39, AVM 0.04–0.37, PVM 0.24–0.67, and PLM L/R 0.50–0.97.
- **How strong.** A current step that holds the receptor 10 mV above its rest for 500 ms, computed from the receptor's input conductance. These values are fixed in advance and not tuned (level 0), because no published value maps a gentle touch onto a current in this model. Neural Interactome's preset amplitudes can't be borrowed: they are only meaningful because it recomputes thresholds around the input, and taken literally they come to nanoamps into a 10 pS leak.
- Nose touch (ASH, FLP, OLQ) is a different circuit and is left out of v1.

### 4.3 Proprioception and the rhythm

- **Convention: Wen et al. 2012.** Each VB (DB) motor neuron receives a current proportional to the ventral (dorsal) curvature of the body region just in front of its muscle field, over about 200 µm, or 0.2 body lengths. Wen et al. found that "posterior body regions are compelled to bend in the same direction and shortly after the bending of the neighboring anterior region". They also found that "motor activity in a posterior region requires the active bending of an anterior region extending ~200 µm". The muscle field comes from each neuron's neuromuscular targets in the data. The gain is calibrated (level 1); the mechanism is level 2.
- **Why not Boyle's convention.** In Boyle, Berri & Cohen 2012, each B neuron integrates stretch over its own region and the half body behind it. Wen's experiments point the other way, and Boyle's authors note that B-type axons don't reach half a body length. Their body and muscle models are still used (§4.5, §5.1).
- **Where the rhythm comes from.** Proprioception alone doesn't generate a rhythm in any precedent. Boyle needed bistable neurons and a ventral bias, and Wen assumes a rhythm "initiated near the head". Wormlight's hypothesis is that the head rhythm emerges from the network's own dynamics under tonic drive, and the proprioceptive chain carries it down the body. Kunert, Shlizerman & Kutz 2014 found that stimulating PLM drives the network into an oscillating limit cycle. Milestone 0 tests this; if it fails, the fallback menu (§10) adds documented intrinsic dynamics.
- **Backward.** No source gives evidence for proprioception in A-type motor neurons, so v1 gives them none. Gao et al. 2018 show that A-type motor neurons oscillate intrinsically, with DA9 leading. AVA inhibits them through gap junctions at rest and potentiates them through chemical synapses. Whether reversals can propagate without that intrinsic oscillation is what checkpoint 2 finds out; fallback 2 adds it.

### 4.4 Intrinsic dynamics

None in v1: every neuron is the same passive cell. The documented candidates are on the fallback menu:

- bistable B-type neurons (Boyle, Berri & Cohen 2012);
- oscillating A-type neurons (Gao et al. 2018);
- midbody rhythm generators in cholinergic motor neurons (Fouad et al. 2018).

### 4.5 Neuromuscular transfer and muscles

- **Drive.** Each muscle sums the signed synaptic activation of the cells that synapse onto it: `u_m = Σⱼ w_jm · sign_j · s_j`. Here `w_jm` is Cook's neuromuscular section count, and the sign follows the transmitter: acetylcholine excites, and the GABAergic DD and VD neurons inhibit. So the cross-inhibition Boyle's model adds by rule comes from the data.
- **Activation.** `τ_M dA_m/dt = σ(g_nmj (u_m − θ_nmj)) − A_m`, with `τ_M = 100 ms` from Boyle et al. (level 3). The gain and threshold are calibrated (level 1).
- **Placement.** Each quadrant's muscles (24, or 23 ventral-left) are assumed evenly spaced along the body (level 0). A body unit's dorsal activation is the mean of the dorsal-left and dorsal-right muscles covering it, and likewise ventrally.
- **Muscles as springs.** As in Boyle et al., a muscle is a spring and damper whose rest length shortens with activation, with the strength gradient along the body from their Table 1.

## 5. Body and environment

### 5.1 Body

- **Structure** (Boyle, Berri & Cohen 2012, level 3). 48 units, built from 49 rods, over 1 mm, with a radius profile peaking at 40 µm. The rods are joined by damped lateral and diagonal springs, using their Table 1 constants. Neuron positions are fractions of body length, so the 0.8 mm morphology maps onto the 1 mm body.
- **Drag.** The body is overdamped, so each step balances internal forces against resistive drag. On agar, the whole worm's coefficients are C∥ = 3.2 × 10⁻³ and C⊥ = 128 × 10⁻³ kg s⁻¹, a ratio of 40. As Boyle et al. note, "the drag coefficient experienced locally along the worm is proportionately smaller", so these are divided across the rods, as Fieseler, Kunert-Graf & Kutz do.
- **Integration.** Boyle et al. used an implicit differential-algebraic solver (IDA). Wormlight takes a linearly implicit step, solving a small banded system for the rod velocities, in one GPU workgroup. The unit tests check it against resistive force theory, and a prescribed muscle wave at 0.30 Hz must crawl on its own before the brain is attached.
- **Lying side.** Each trial draws which side the worm lies on, which mirrors the dorsoventral plane on screen.

### 5.2 Dish, lawn and odour field

- **Dish.** A 10 cm dish with the standard chemotaxis layout (Bargmann, Hartwieg & Horvitz 1993). The odour spot sits 0.5 cm from the edge, a control spot sits opposite, and the worm starts at the centre, about 4.5 cm from each.
- **Odour.** 2-butanone, at the standard dose of 1 µl of a 10⁻³ dilution. It is the best-supported choice for an AWC-only model:
  - killing AWC drops butanone chemotaxis from 0.77 to 0.16, against a 0.11 baseline, while isoamyl alcohol keeps about half its response (Bargmann et al. 1993, Fig. 5, read from the figure);
  - its diffusion coefficient in air is measured;
  - Levy & Bargmann's parameters are in butanone units.
- **Field.** 2D diffusion on a 256 × 256 grid (0.4 mm cells). Its terms:
  - The diffusion coefficient is D = 0.091 cm² s⁻¹ in air at 298 K, a measured value (Lugg 1968, via Tang et al. 2015; level 3).
  - A first-order loss makes the field approach steady state at the rate Tanimoto et al. 2017 measured on assay plates, 0.84 min⁻¹. That was for 2-nonanone, so it is level 2.
  - Together these give a steady gradient with a length scale of about 2.5 cm.
  - The release rate is fixed in advance so the concentration near the source sits at K, the top of the adaptation model's working range (level 0).
  - Treating the air layer as 2D over uniform agar is an assumption (level 0).
- **Lawn.** A 1 cm disc that releases butanone. Real lawns release many odours, so this is level 0. Slowing on food and dwelling versus roaming need neuromodulation, so they won't emerge (spec §5).
- **Walls.** The dish wall reflects odour and stops the worm.

## 6. Parameters and the fidelity registry

### 6.1 The registry

The fidelity ledger (spec §1.3) lives in code, so the app, the docs and the tests read the same facts:

- `src/science/citations.ts` lists every source once: authors, year, title, venue, DOI or URL.
- `src/science/params.ts` lists every parameter with its value, unit, level, sources and a note. Each has a `free` flag, true when we set the value ourselves (levels 1 and 0), and calibrated parameters also carry the bounds they may move within.
- `src/science/fidelity.ts` lists every component with its subsystem, level (or "omitted" or "presentation"), basis, caveats, upgrade path, sources, and the checkpoints that test it.
- The runtime data carries per-element provenance: each connection's sign source, each neuron's position source.

`npm run docs:fidelity` generates `FIDELITY.md` from these, including the sign coverage counted from the data file. CI regenerates it and fails on any difference. The app's "About the science" view renders the same registry, and the inspector shows each element's provenance badge.

### 6.2 The free-parameter budget

Values we set ourselves, all global or per class:

| Parameter                        | Level | How it's set                                                                                      |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| Neural noise σ                   | 1     | Calibrated to the spontaneous reversal rate                                                       |
| AWC sensory gain                 | 1     | Calibrated once so a drop to zero odour depolarises AWC by 16 mV (§4.1), never against chemotaxis |
| Touch stimulus: 10 mV for 500 ms | 0     | Fixed in advance (§4.2)                                                                           |
| Proprioceptive gain              | 1     | Calibrated against crawling (checkpoint 1)                                                        |
| Neuromuscular gain and threshold | 1     | Calibrated against crawling (checkpoint 1)                                                        |
| Odour release rate               | 0     | Fixed in advance so the concentration near the source is K (§5.2)                                 |

That is eight values. The budget is **at most 10**; anything beyond it needs your approval, and every one is listed with its final value in `FIDELITY.md`.

Values taken from a source aren't free, even when they are adapted. These include:

- the adaptation constants K and τ (Levy & Bargmann 2020);
- the diffusion coefficient (Lugg 1968) and the loss rate (Tanimoto et al. 2017);
- the body, drag and muscle constants (Boyle, Berri & Cohen 2012);
- the proprioceptive reach, 0.2 body lengths (Wen et al. 2012).

## 7. Validation, fixed in advance

Every behavioural checkpoint runs on the CPU reference in the harness, with seeds, trial counts and thresholds fixed here. Speeds and wavelengths are in body lengths, because the morphology the body is built from is 0.8 mm long while an adult is about 1 mm (Leifer et al. 2011). Each result is reported as pass, partial or fail, and each quantity as calibrated or predicted.

### 7.1 Correctness checks

| Check                                                                                                                                                    | Pass                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Port check**: the CPU reference in Neural Interactome mode against golden BDF trajectories, for the ALM, PLM, AVA and AVB presets, over 5 s            | RMS error of `V − V_th` at most 1% of each neuron's excursion range, after the 0.3 s input ramp                                                                                       |
| **GPU parity**: the same state advanced on both                                                                                                          | One step: relative error ≤ 10⁻⁴. One second: RMS relative error ≤ 10⁻². Sixty seconds: crawling frequency and speed within 5% of the CPU reference                                    |
| **Checkpoint 0, silenced network**: every neuron-to-neuron chemical synapse and gap junction cut, with neuromuscular junctions and every §1.1 layer kept | Over 20 trials of 60 s: net displacement below 0.2 body lengths, no touch-evoked reversal, and a chemotaxis index within ±0.1 of zero. If anything survives, the glue is producing it |

### 7.2 Calibration targets

These are tuned against, so they can't pass or fail; they are reported as calibrated.

- **Crawling kinematics**, the targets of checkpoint 1 below.
- **Spontaneous reversal rate: 1.8 per minute (0.8–2.5).** This is Gray, Hill & Bargmann 2005, Fig. 1E, 6–16 minutes off food (short plus long reversals, read from the figure). The model has no food history, so it can't reproduce the fall from about 3.5 per minute just off food to 0.15 per minute after 36 minutes. That time course depends on neuromodulation, which is out of scope.

### 7.3 Behavioural checkpoints

| #   | Checkpoint          | Protocol                                                                                                                                                                                                                                                       | Pass                                                                                                                                                                                                 | Partial                                                                                            | Reference                                                                                                                                                                                                                         |
| --- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Crawling**        | 20 trials × 120 s from random postures; metrics from forward bouts of 10 s or more                                                                                                                                                                             | Frequency 0.20–0.45 Hz; wavelength 0.50–0.80 body lengths; speed 0.12–0.30 body lengths/s; four eigenworms explain ≥ 90% of posture variance; forward crawling sustained for 60 s in ≥ 80% of trials | Frequency 0.10–0.60 Hz, wavelength 0.40–1.0, speed 0.06–0.50, eigenworms ≥ 80%, sustained in ≥ 50% | Fang-Yen et al. 2010, Table 1: 0.30 ± 0.02 Hz and 0.65 ± 0.03 body lengths (mean ± SEM, N > 10). Ramot et al. 2008: 219 ± 29 µm/s off food (mean ± s.d.). Stephens et al. 2008: four eigenworms explain over 95%                  |
| 2   | **Anterior touch**  | 50 touches in the ALM/AVM field, during forward crawling, at least 10 s apart                                                                                                                                                                                  | A reversal within 2 s in ≥ 70% of touches, and at least 3× the spontaneous rate in a matched window                                                                                                  | 40–70%                                                                                             | Chalfie et al. 1985 (anterior touch reverses; ALM needed for a full response). Stirman et al. 2011: optogenetic ALM/AVM activation reversed 65% of worms (78/120). No verified latency exists, so latency is reported, not graded |
| 3   | **Posterior touch** | 50 touches in the PLM field during forward crawling                                                                                                                                                                                                            | Mean forward speed over the next 2 s rises by ≥ 10% (paired test, p < 0.05)                                                                                                                          | A significant rise under 10%                                                                       | Chalfie et al. 1985 (PLM needed for any tail response). Stirman et al. 2011 and Leifer et al. 2011: PLM activation speeds forward movement                                                                                        |
| 4   | **Chemotaxis**      | Bargmann et al. 1993's layout (§5.2): 100 independent worms × 60 min each. A worm is counted and stopped on coming within 0.5 cm of either spot, as sodium azide does. CI = (at odour − at control) / total. Controls: AWC input off, and the silenced network | CI ≥ 0.6, and above the sensory-off control (Fisher's exact test, p < 0.05)                                                                                                                          | CI 0.2–0.6 and above the control                                                                   | Bargmann, Hartwieg & Horvitz 1993, Fig. 2: butanone at 10⁻³ gives about 0.87 in population assays. Fig. 5: about 0.77 for single animals, 0.16 with AWC killed, against a 0.11 baseline (both read from the figures)              |
| 5   | **Lesions**         | Each lesion versus intact, 30 trials per condition                                                                                                                                                                                                             | All five primary lesions move in the reported direction, each by at least the stated amount                                                                                                          | Three or four do                                                                                   | See below                                                                                                                                                                                                                         |
| 6   | **Wiring test**     | 10 degree-preserving rewirings, each tuned with the same procedure and budget as the real wiring                                                                                                                                                               | Verdict map below                                                                                                                                                                                    |                                                                                                    | Spec §4                                                                                                                                                                                                                           |

**Checkpoint 5 lesions.** Directions and effect sizes are fixed now:

| Lesion    | Expected                                  | Pass if                                                                       | Source                                                                          |
| --------- | ----------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| AVA + AVD | No backward movement                      | Touch-evoked and spontaneous reversals fall ≥ 80%                             | Chalfie et al. 1985: "incapable of moving backward"                             |
| AVB + PVC | No forward movement of the body           | Forward speed falls ≥ 80%                                                     | Chalfie et al. 1985: "incapable of generating forward motion with their bodies" |
| PVC       | Tail touch lost, head touch kept          | Checkpoint 3's response falls ≥ 80%, and checkpoint 2's stays ≥ 70% of intact | Chalfie et al. 1985                                                             |
| AVA       | Fewer spontaneous reversals, no long ones | Spontaneous reversals fall ≥ 50%, and reversals of 3+ head swings fall ≥ 80%  | Gray et al. 2005; Piggott et al. 2011                                           |
| RIM       | More short reversals                      | Short reversals rise (p < 0.05)                                               | Gray et al. 2005; Piggott et al. 2011 (inhibiting RIM triggers reversals)       |

**Checkpoint 4 mechanism** (secondary: reported, graded like nematode's Logbook 035, never gating):

- **Klinokinesis:** the ratio of reorientation rates when heading down the gradient versus up it should exceed 1.
- **Weathervaning:** the slope of curving rate against bearing should be positive, meaning the worm curves toward the gradient.

Each is graded "reproduced" when its 80% bootstrap interval clears the null in the right direction, "partial" when it leans the right way, and "absent" otherwise. The references are sign-only. The source studies used salts (Pierce-Shimomura et al. 1999: ammonium chloride and biotin; Iino & Yoshida 2009: NaCl), and their magnitudes couldn't be checked against an accessible text.

The definitions are fixed now:

- **Heading:** the direction of the centroid's motion over one undulation period (3.3 s).
- **dC/dt:** the change in concentration at the nose over the same window.
- **Reorientation:** the onset of a reversal (backward centroid motion for at least 1 s) or an omega turn (more than 135° of turning within one head swing, as Gray et al. 2005 define it).
- **Bearing:** the angle from the heading to the local gradient.

AIB, AIY and AIZ lesions are reported as secondary results, not graded. Gray et al. 2005 describe their effects through time off food, which depends on neuromodulation the model lacks.

**Checkpoint 6 verdict map**, applied per checkpoint (2 to 5):

- A rewiring that can't be tuned to crawl counts as failing everything.
- **Wiring matters** for a checkpoint if the real wiring passes it and at most 2 of the 10 rewirings do.
- **No evidence** if 5 or more rewirings pass it.
- **Inconclusive** otherwise.

The report gives every rewiring's results, whichever way they fall.

## 8. Testing, CI and deployment

**Unit tests** (Vitest) cover the loader's validation and the physics against cases with known answers:

- a lone neuron relaxes to E_c with time constant C/G_c;
- two gap-coupled neurons equilibrate at the analytic rate;
- halving the step halves the integration error;
- a passive straight body under uniform drag translates without turning;
- a prescribed travelling wave moves forward at the speed resistive force theory predicts;
- a point release of odour matches the analytic 2D Gaussian, which is nematode's Fick kernel;
- the random-number hash matches fixed test vectors.

**The port check.** `tools/reference/ni_reference.py`, run with `uv`, reproduces Neural Interactome's equations (from its BSD-3 `initialize.py`, credited) with SciPy's BDF solver on its own Varshney matrices. It covers the ALM, PLM, AVA and AVB presets and writes compact golden trajectories, stamped with the script's hash, to `tests/fixtures/ni/`. The CPU reference in "Neural Interactome mode" must match them within tolerance. That mode uses Varshney weights, per-presynaptic signs and input-dependent thresholds.

**GPU parity** runs two ways; milestone 2 settles which one CI keeps:

- **Kernel tests in Node,** with the `webgpu` npm package. It is Dawn's Node bindings, so it uses the same engine and WGSL compiler as Chrome, and it ships prebuilt for macOS and Linux. It runs in Vitest on the Mac's GPU. A milestone 2 spike tries it on Mesa lavapipe in CI via `VK_ICD_FILENAMES`.
- **Browser parity,** where a test page loads a fixed state, runs N steps, reads the buffers back and exposes them as `window.__parity()`. `scripts/parity.mjs` drives headless Chrome through puppeteer-core, on the real GPU locally and on lavapipe in CI with Universe's flags (`--enable-unsafe-webgpu --use-angle=vulkan --enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE --disable-vulkan-surface`). It never presents a frame, because software stacks read screenshots back as black.

Tolerances follow WGSL's accuracy rules rather than bit equality. That means a few ULP for arithmetic, 2.5 ULP for division, and 3 + 2|x| ULP for `exp`. Sums get a relative tolerance, because the GPU may reorder or fuse operations. Tests request default limits, as browsers give them: 256 invocations per workgroup, 8 storage buffers per stage, and 16 KB of workgroup memory. The neural step fits, with two neurons per invocation, about 7 KB of workgroup state, and buffers packed so no kernel binds more than 8. Safari and Firefox run their own WebGPU engines, which CI can't cover, so milestones 3 and 6 include a manual Safari check.

**The behavioural harness.** `npm run harness -- --checkpoint <n>` runs trials on the CPU reference in Node, writes JSON to `harness-out/`, and regenerates the results tables in `VALIDATION.md`.

**CI jobs.**

- `checks`: lint, format, unit tests including the port check, typecheck, build, and `FIDELITY.md` freshness.
- `gpu`: parity on lavapipe, from milestone 2.
- `visual`: fixed views pixel-compared against baselines, as Universe does, from milestone 1.
- `deploy`: Pages, gated on `DEPLOY_PAGES`.

## 9. Milestones

Each milestone is one or more focused PRs, each merged before the next starts. Each ends with a summary of what works, what doesn't, and checkpoint status.

| Milestone             | Delivers                                                                                                            | Exit criteria                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **0a** Data           | The nematode exporter (a PR there), the data build, the runtime file, and the registry with `FIDELITY.md` generated | Counts and coverage match §2; the doc regenerates cleanly                             |
| **0b** Neural core    | The CPU neural model, the port check, and the step size chosen against the BDF reference                            | Port check within tolerance; convergence tests pass                                   |
| **0c** Crawling spike | Muscles, body and proprioception on the CPU; checkpoint 0; a crawling attempt under the fixed protocol              | **Go/no-go with you**: does the connectome-driven body crawl?                         |
| 1                     | The WebGPU 3D neural graph, the inspector with provenance badges, and visual regression CI                          | The graph renders on lavapipe; inspector shows the sign source for each connection    |
| 2                     | The neural model on the GPU, with the parity CI job                                                                 | Per-step parity within tolerance on lavapipe and on the Mac                           |
| 3                     | The body on the GPU and the plate view: crawling in the browser                                                     | Checkpoint 1 in the harness; 60 fps real time on an M-series Mac in Chrome and Safari |
| 4                     | Odour field, AWC sensing and touch                                                                                  | Checkpoints 2 to 4                                                                    |
| 5                     | Lesions and the brain swap                                                                                          | Checkpoints 5 and 6                                                                   |
| 6                     | Glow, "About the science", URL state, the fast-forward target, docs, and Pages when you're ready                    | `VALIDATION.md` complete; performance targets met                                     |

## 10. Risks and the milestone 0 fallback menu

| Risk                                                   | Likelihood     | Mitigation                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The connectome-driven body doesn't crawl               | High           | The closest precedent (modWorm) got locomotion only with a genetic algorithm tuning 5,146 synapses, an internal delayed feedback, and direct command-neuron stimulation. Wormlight allows none of these. Use the fallback menu below, agreed before we start and applied only with you at the go/no-go |
| Reversals can't travel backward along the body         | High           | No evidence supports proprioception in A-type neurons, and Gao et al. 2018 find their rhythm is intrinsic. Fallback 2 adds that intrinsic oscillation                                                                                                                                                  |
| The model saturates or falls silent on Cook's weights  | Medium         | Per-type rescaling (§3.2) and the threshold policy (§3.3). A sweep of the scale factors is reported, and any change is marked calibrated                                                                                                                                                               |
| Chemotaxis needs head steering the model can't produce | Medium to high | Accept a partial and report it; weathervaning depends on head motor neurons (SMD, RMD) that the data do wire to head muscles                                                                                                                                                                           |
| One GPU workgroup limits fast forward                  | Medium         | The implicit solve allows larger steps; profile in milestone 2, and log a lower fast-forward target rather than cutting accuracy                                                                                                                                                                       |
| Safari's WebGPU behaves differently                    | Low to medium  | Test in Safari at milestones 2, 3 and 6                                                                                                                                                                                                                                                                |

**If milestone 0 can't make the worm crawl**, these are the options, in order. Each is logged, levelled in the ledger, and applied only with your go-ahead:

1. Bistable B-type motor neurons, as in Boyle, Berri & Cohen 2012 (intrinsic dynamics; level 2).
2. Intrinsic oscillation in A-type motor neurons, which Gao et al. 2018 documents, for backward locomotion (level 2).
3. Calibrate class-level gains in the motor circuit (level 1, counted against the budget).
4. If nothing works: ship an honest partial. The connectome still drives the muscles, and the app says crawling does not yet emerge.

Never on the menu: a central pattern generator outside the allow-list, or anything that reads behavioural state.

## 11. Prior art, and what Wormlight adds

| Work                                                                                 | What Wormlight takes from it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neural Interactome (Kim, Leahy & Shlizerman 2019)                                    | The neural model and its parameters, and its code and data as the port check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Kim et al. 2025, arXiv 2504.18073 (modWorm; code at `shlizee/modWorm`, BSD-3-Clause) | The closest precedent: the same neural model on 279 neurons, with muscles and a body, recovering forward and backward locomotion. But its "proprioception" is a delayed copy of the network's own activity (fed back after 0.6 s; the body state is never read). It tuned 5,146 synapse scale factors with a genetic algorithm, and it drives locomotion by stimulating command interneurons directly. Wormlight's rules exclude all three, which is why milestone 0 is the real test. Its Cook-based variant fitted postures better than the Varshney base, a small point in favour of Cook's data |
| Fieseler, Kunert-Graf & Kutz, arXiv 1707.05359                                       | Extends Boyle, Berri & Cohen's model with A- and B-class circuits, and suppresses proprioception to produce omega turns. It does not use the connectome; that is left as future work                                                                                                                                                                                                                                                                                                                                                                                                                |
| Boyle, Berri & Cohen 2012                                                            | The body mechanics, muscle dynamics and proprioceptive coupling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| BAAIWorm (_Nature Computational Science_, 2024)                                      | A biophysically detailed closed brain–body–environment loop, as a reference for what detailed models achieve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| OpenWorm c302                                                                        | Neuron morphologies and positions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Quantum Nematode                                                                     | The data pipeline, the rewired null, the chemotaxis validation method, and the prior results on wiring against nulls                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

What Wormlight adds: the whole connectome in a closed loop that runs live in a browser on the GPU; a fidelity ledger down to each connection's sign; and validation fixed in advance, including a wiring test that gives the null the same tuning budget.
