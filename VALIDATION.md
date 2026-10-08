# Validation

How Wormlight's behaviour compares with the real worm's, by the checkpoints PLAN §7 fixes in advance. The behavioural harness runs each checkpoint on the CPU reference (`npm run harness -- --checkpoint <n>`) and writes its results below, between the markers, as `npm run equivalence` writes §7.2's comparison of the step; the prose around them is written by hand. Whether the GPU matches the CPU reference is checked separately, by GPU parity (PLAN §7.2). The harness's `--sensitivity` writes its own section there too. The page gives the result first, then where each checkpoint stands, how the trials run, what changed after results and how to read the results; then the results in full, the checkpoints not reached, the GPU's checks, and the known simplifications.

## The result

**Until 2026-10-02, crawling as checkpoint 1 asks for it did not emerge from the connectome** (DECISIONS.md, 2026-09-26 to 2026-09-30). That was the project's headline finding, and it stands for every fit before track S's (below). The checkpoints after it, which wait on a worm that crawls, were not run.

**Since then: track S's fit is chosen, and the app runs it** (DECISIONS.md, 2026-10-02). Track S, measured signs, the D-types' rest offset and AVA's rectified junctions on track R's model, was calibrated by round 3's procedure; its first pick passed §7.2's comparison ("The step", below), so by rules set before it ran it replaced the refit, and on its own trials it grades partial on checkpoint 1. Its crawl is the head switch's, as round 3's was, and it hardly reverses. The app and the harness run it from model version 2, with S's signs in the runtime data. Checkpoints 0 and 1 and the sensitivity runs ran again on S's fit the same day, and the sections below report them (DECISIONS.md, 2026-10-02).

Three terms recur. A _fit_ is a set of values for the twelve calibrated parameters. _Track R_ is the research track that, after the go/no-go found no crawl, changed the model and recalibrated it over three rounds (PLAN §9); its _refit_ is the fit the app and the checkpoints ran on until track S's fit replaced it. The _head switch_ is the relaxation oscillator in the head's SMD motor neurons, one of the layers allowed outside the connectome (PLAN §4.3).

- **The chosen fit grades partial on checkpoint 1.** The model runs track S's fit. On it the worm moves forward in every trial nearly all of the time, in runs of up to 110 s, at 0.068 body lengths per second, about a third of a real worm's 0.22. Its frequency, its postures and its sustained runs pass; its wavelength and its speed are partial, the speed not at partial's floor. The result holds at half the step (PLAN §7.2).
- **A rhythm in its head moves it, not the network.** Its head switch's gate is open throughout and its cycle sets the frequency; with the switch off the worm doesn't move. Its B-types have no oscillator, and with them lesioned it still moves forward 63% of the time. It made no reversal in checkpoint 1's trials, and 2 in §7.2's 200.
- **Checkpoint 0 passes, and still says little.** The silenced worm pauses throughout. Its head switch, which carries the crawl, stays shut once the network is silenced; the noise still sets the A-types' oscillators off and bends the silenced body, but doesn't move it.
- **Set at random, the uncertain signs keep the crawl, and half keep its grade; checkpoint 0 holds across them.** With the 1,959 connections whose signs are uncertain set all excitatory, all silent or at random ten times over, the connections rescaled, or track S's rest offsets off or AVA's added, on S's fit with nothing tuned again, eight of the sixteen settings would grade partial, five of the ten random draws among them. Under every draw the worm still moves forward at least 86% of the time, and all but one of the failing settings miss on speed alone or with the wavelength. With the uncertain signs silent the crawl goes, and the worm rocks with the head switch. Silenced, the switch stays shut under every setting ("The sensitivity runs", below).
- **The touch reflexes fail.** Checkpoint 2: none of 50 anterior touches during forward crawling was followed by a reversal, nor any of their sham twins; it is reported as fitted. Checkpoint 3: a posterior touch left the worm's speed where its twin's was, 0.3% slower. A touch moves its receptors about 10 mV but AVA by about 1 mV; it shifts the head switch's timing, but the crawl the switch paces carries on ("Checkpoints 2 to 6", below).
- **Chemotaxis fails.** Of 100 worms in Bargmann et al.'s layout, 18 reached the odour and 14 the control, an index of 0.04, against 0.03 for the same worms with AWC-ON's input off. Their reversals are collisions with the dish's wall, and their weathervaning, reproduced by its rule, is the wall's too ("Checkpoints 2 to 6", below).
- **The lesions fail.** Checkpoint 5: none of its five rows passes, and it is reported as fitted. The intact worm never reverses, so the rows asking a lesion to make reversals fewer have nothing to fall from; RIM's lesion makes no short reversal either. Every primary lesion slows the crawl, cutting the backward command interneurons AVA and AVD as much as cutting AVB and PVC, the row that asks for a fall of 80% in forward speed: it slows 72%. AVB cut alone slows it 91%, but with AVB gone PVC sends the worm backward more often ("Checkpoints 2 to 6", below).
- **Why the worm doesn't back up, and where the research ends.** A diagnosis found the model's chemical synapses unable to carry a small signal far: a synapse's activation can rise at most 83% above its rest, and excitatory synapses push with a median of 7 mV. What a touch does reach comes mostly through gap junctions, and reaches AVA by under 1 mV. Driving AVA directly by 44 mV, alone or with AVB held down, never made the worm reverse. S's rectifier closes AVA's gap route to the A-types, its synapses barely reach them, and driven directly the motor circuit only drifts backward. Strengthening every synapse shrinks a touch's reach further. The research closes at that documented conclusion (DECISIONS.md, 2026-10-03; "Checkpoints 2 to 6", below).
- **The wiring test finds no evidence that the wiring matters.** Checkpoint 6: ten rewired brains, each tuned by S's procedure in its own box, and nine of them crawl at partial, as the real wiring does, most of them faster. Every crawl is the head switch's. Since the real wiring fails checkpoints 2 to 5, the verdict on each is "no evidence that the wiring matters (the real wiring doesn't pass)", a reading changed after results; no crawling null passes any of them either. The clearest behavioural difference is AVB: lesioned, the real wiring's crawl nearly stops, where every crawling null's stays partial, observed rather than asked in advance (DECISIONS.md, 2026-10-08; "Checkpoints 2 to 6", below).

## Where it stands

| Checkpoint          | Result      | Status                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0: silenced network | **Pass**    | Crawling, touch and chemotaxis clauses, on track S's fit, touches against sham twins and chemotaxis by a binomial test, both changed after its first run; the pass says little (below)                                                                                                                                             |
| 1: crawling         | **Partial** | On track S's fit, chosen by rules set before it ran: frequency, postures and 20 s bouts pass, wavelength and speed partial, not at the speed floor; within its margins at half the step (PLAN §7.2), so final; its measures and calibration changed after results as listed below. Track R ended below partial before it (PLAN §9) |
| 2: anterior touch   | **Fail**    | On track S's fit: no reversal after any of 50 touches, nor after their sham twins; reported as fitted (PLAN §10); its protocol changed after results                                                                                                                                                                               |
| 3: posterior touch  | **Fail**    | On track S's fit: the touched copies 0.3% slower than their twins, where a pass needs 10% faster; its protocol changed after results                                                                                                                                                                                               |
| 4: chemotaxis       | **Fail**    | On track S's fit: an index of 0.04, against 0.03 with AWC-ON's input off (Fisher's p = 0.50); its mechanism reported, klinokinesis absent and fitted, weathervaning reproduced by its rule but the dish's wall's                                                                                                                   |
| 5: lesions          | **Fail**    | On track S's fit: no row passes; its clauses that read reversals reported as fitted, unmeasured or failing, the intact worm never reversing; AVB + PVC's speed down 72%, where a pass needs 80%, about as much as AVA + AVD's                                                                                                      |
| 6: wiring test      | No evidence | On track S's fit: 9 of 10 nulls, each tuned by S's procedure in its own box, crawl, so no evidence that the wiring matters; on checkpoints 2 to 5 the real wiring doesn't pass; its tuning procedure, its verdict where the real wiring doesn't pass, and the secondary null changed after results                                 |

## How the trials run

- **Trials.** 20 of 120 s for checkpoints 0 and 1, seeds 1 to 20. Each starts from a real worm's posture, one of 6,655 that the OIST Physics of Behavior tutorials introduce as coming from Stephens et al.'s experiment, drawn by its seed and turned to a random heading (PLAN §7.4); checkpoint 0 silences the network on the same postures. The "Posture" column gives the row of the pinned `shapes.csv` a trial started from.
- **Motion** (PLAN §7.1). The centroid's velocity towards the head, over the centred second, sampled every 0.1 s: forward above +0.01 body lengths per second, backward below −0.01, a pause between, which ends a bout. A reversal is backward motion of 1 s or more. Every measure starts after a trial's first 10 s.
- **Checkpoint 1's measures** (PLAN §7.4). The kinematics over forward bouts of 10 s or more, pooled over trials, the wavelength only from a wave running from head to tail; the variance the first four eigenworms capture in postures sampled at 4 Hz, pooled over trials, self-intersecting ones left out; and the share of trials with a forward bout of 20 s or more.
- **Touched trials** (checkpoint 0, PLAN §7.4). The same 20 trials again, each touched 5 times, 20 s apart from t = 20 s, alternating front (s = 0.2) and back (s = 0.8), odd seeds starting at the front: 50 anterior touches and 50 posterior. A touch starts with the step after its time. At each touch the world forks a sham twin, which takes a sham touch in its place and runs 3.5 s on while the touched line runs on (changed after the first run, 2026-09-27). A reversal follows a touch if its first backward sample lies within the 2 s after it, in the touched line and its twin alike; McNemar's exact test weighs the pairs in which only one reversed. The speed after a touch is the mean of the velocity samples whose windows lie within the 2 s after it, and the paired signed-rank test compares each touched copy with its twin, a difference under 0.0012 body lengths per second on average failing to count however significant. Both tests are one-sided, in the reflex's direction, at α = 0.05. The chemotaxis clause fails only if the exact binomial test, two-sided, finds one spot reached significantly more often.
- **Touch trials** (checkpoints 2 and 3, PLAN §7.4; DECISIONS.md, 2026-10-02). From seed 1 upwards, each worm crawls from its real posture until the first 0.1 s sample from an earliest time its seed draws between 20 and 100 s at which the 2 s before were all forward, and is touched there once: the world forks into a copy touched at the front (s = 0.2), one at the back (s = 0.8) and a sham twin, each run 3.5 s on. The first 50 touches are graded, checkpoint 2's reversals within 2 s against the twins' by McNemar's exact test, checkpoint 3's mean speed over the 2 s after against the twins' by the signed-rank test, both one-sided.
- **Lesion trials** (checkpoint 5, PLAN §7.4; DECISIONS.md, 2026-10-02). For each of the five primary lesions, the three secondary ones and the intact worm, 30 trials of 120 s, seeds 1 to 30, on the same postures and noise, with both of each pair cut; and checkpoints 2 and 3's touch trials for the intact worm and the two lesions whose rows read them, AVA + AVD and PVC. A reversal is long if three or more head swings, crossings of the head angle as checkpoint 4's mechanism counts them, peak within it, and short otherwise. A row passes if its pooled measure moves the reported way by the amount PLAN states and Mann–Whitney's or Fisher's test, two-sided at α = 0.05, is significant that way; a fall, or PVC's "stays", from an intact measure of zero, or from checkpoint 3's response under its 1% floor, is unmeasured, and fails. Every lesion's spontaneous measures are reported beside the rows.
- **The chemotaxis assay** (checkpoints 0 and 4). Each worm runs alone for up to 60 min on the butanone spot's steady field, starting with its centroid at the dish's centre from the posture its seed draws, and stops when any part of its body comes within 0.5 cm of either spot's centre. CI = (at odour − at control) / every worm run. Checkpoint 4 runs 100 worms, each again as its control with AWC-ON's input off, the world sensing no odour, and reports its mechanism, klinokinesis and weathervaning, from samples every 0.1 s (DECISIONS.md, 2026-10-02).
- **The step** (PLAN §7.2). The comparison of checkpoint 1's measures at dt and dt/2 was deferred until checkpoint 1 reached partial, then run when R's first fit reached partial only at half the step: neither that fit nor the planned model's converged at any step down to 0.3125 ms, with white noise. The model now runs a coloured noise current, and the comparison is an equivalence test on 200 trials a step, each clause's 95% interval for the difference within a margin. R's refit passes it; the planned fit fails it, and so do R's second round's fit and round 3's four picks; track S's first pick passes it, counting the frequency's crossings past the band, where the earlier comparisons counted them plainly (under "The step", in the results below; DECISIONS.md, 2026-09-28, 2026-09-29 and 2026-10-02).
- **The sensitivity runs** (spec §2.4; PLAN §2.4, §3.2; DECISIONS.md, 2026-09-30 and 2026-10-02). Checkpoint 1's trials, and the same trials of the silenced network, under sixteen settings, on track S's fit with nothing tuned again. Thirteen set the 1,959 chemical connections whose signs come from the transmitter rule or from nothing: by the rule, as the model has them; all excitatory; all silent; and ten random draws. The fourteenth keeps the model's signs and scales Cook's section counts by what the connections Cook's and Varshney's data share ask for, 0.33 for gap junctions and 0.50 for chemical synapses, in place of the scales that match the datasets' totals, 0.2055 and 0.3444 (PLAN §3.2). The last two, which track S's rules added (DECISIONS.md, 2026-10-01), keep the model's wiring and change its rest: its offsets off, every neuron at its midpoint, and AVA's added, AVAL and AVAR resting 29.0 and 16.0 mV above their midpoints, from Liu, Chen & Wang 2020's recordings against VB6. The first fourteen are each a brain of its own, and every setting has its thresholds at its own rest. They are reported, not graded.
- **Calibrated or predicted** (spec §1.2). Checkpoint 1's clauses carry their kind in its table, and checkpoints 0, 2, 3, 4 and 5's are all predicted, as each section says, checkpoint 2, checkpoint 4's klinokinesis, and checkpoint 5's clauses that read reversals and its grade reported as fitted on S's fit. Of the rest: the step comparison's frequency, wavelength and speed are calibration targets, and so is its reversal rate, at 1.8 a minute, for every fit but R's third round's picks and track S's, whose procedure fitted no reversal rate and aimed the speed at 0.15 body lengths per second, so theirs is predicted (PLAN §7.3); its share of trials with a 20 s bout is predicted. Each trial's columns, the diagnostics and the sensitivity runs describe a run: nothing is tuned to them and nothing is graded by them.

## What changed after results

Every threshold and definition was fixed in PLAN §7 before its results. These changed afterwards; each is logged in DECISIONS.md with its reason and marked where PLAN states it.

- **The model.** After the go/no-go found no crawl, track R's model took the planned one's place: three more calibrated parameters, and each muscle's drive taken relative to its own range, a deviation from spec §1.1 signed off on 2026-09-27. The coloured noise added a fourth, so the budget of free parameters rose from 14 to 18 (PLAN §6.2, §9). Track S then gave R's model the measured signs and, as deviations from PLAN §3.3's threshold rule and the spec's two-way junctions signed off with its rules, the D-types' rest offset and AVA's rectified junctions with the A-types, with no parameter added (2026-10-01 and 2026-10-02).
- **Checkpoint 1.** The wavelength is measured between rods 0.125 of the body apart, not 0.3125, where forward, backward and standing waves read alike (2026-09-26). The calibration spends 2,000 evaluations, not 400 (2026-09-27, before any calibration). The noise is a coloured current, not white (2026-09-28). Later rounds of track R changed the calibration's procedure and the form of two currents (2026-09-28 and 2026-09-29); the refit predates both, and track S's fit, the chosen one, takes round 3's procedure in the conductance form (2026-10-01).
- **Checkpoint 1's frequency.** A crossing of a bout's mean counts once the mid-body curvature has left a band of ±0.31 κL about it on the far side, the band real worms' mid-body curvature sits within 5% of the time (2026-10-01). It applies from then on; the records made under the plain count keep it, and the section below reports both counts.
- **The step.** The comparison at half the step, deferred until checkpoint 1 reached partial, runs for every fit, as an equivalence test on 200 trials a step (2026-09-28).
- **Checkpoint 0.** Its reruns grade each touch against a sham-touched twin, and chemotaxis by an exact binomial test on arrivals (2026-09-27, after its first run). Checkpoints 2 and 3 take the same protocol, changed before any trial of their own.
- **Checkpoint 6.** Each null is tuned by the procedure of the real wiring's final fit, track S's since 2026-10-02 (2026-09-27 to 2026-09-29, before any null was tuned). Where the real wiring doesn't pass one of checkpoints 2 to 5, the verdict there is "no evidence that the wiring matters (the real wiring doesn't pass)", where PLAN's map would read "inconclusive" unless half the crawling nulls pass: set by the maintainer knowing that the real wiring fails all four, and the reading less favourable to the wiring mattering. The secondary null, which PLAN has reported, is deferred, for its cost (2026-10-03).
- **GPU parity.** The GPU is compared with the reference solved at the GPU's own solver tolerance; a one-second state is graded only where the reference agrees with itself there, within a third of the threshold; the rods' velocities are held to 10⁻², not 10⁻⁴, with a floor for a slow body raised 48 times, to 10⁻⁴ body lengths per second; and the long runs take 265 seeds a side, not 20, on the registry's values (2026-09-26 to 2026-09-29). A one-second sample's voltages leave out any neuron the reference moved more than 1 mV over the step before it, mid-jump, where a fast jump's conditioning decides the difference (2026-10-02).

## Reading the results

### The chosen fit, track S's

- **It crawls by its head switch.** The switch's gate is open on every step, its drive 13.6 mV above θ_osc on average, and it cycles at 0.214 Hz, beside the mid-body spectrum's peak at 0.210 Hz, with 60% of the spectrum's power between 0.2 and 0.45 Hz, where a crawling worm's lies. With the switch off, or at its lower bound, the worm doesn't move. The calibration took the B-types' oscillator gain to 0, so they have no rhythm of their own: with them lesioned the worm still moves forward 63% of the time, at 0.013 body lengths per second over the run, and with the A-types lesioned 73%, at 0.020, neither in a bout of 20 s (DECISIONS.md, 2026-10-02).
- **It needs AVB.** With AVBL and AVBR lesioned it moves forward 30% of the time, at 0.006 body lengths per second over the run, a preview of checkpoint 5's AVB + PVC row; R's third round's crawl stayed partial with the same lesion. Checkpoint 5's row, which cuts PVC as well, finds it slowed less, by 72%, since with AVB gone PVC sends it backward more often; cutting AVA and AVD slows it about as much, by 74%.
- **Its runs last.** Every trial holds a forward bout of 20 s, and in 15 of the 20 the forward run fills the whole measured window, 109.6 s.
- **Its speed is partial, above the floor:** 0.068 body lengths per second, with a 95% interval of 0.0672 to 0.0693 over the trials and 0.0686 at half the step. That is 46% of the 0.15 its calibration aimed at and 31% of a real worm's 0.22. Its wavelength, 0.48 body lengths, lies just under the pass band's 0.50.
- **It hardly reverses:** none in checkpoint 1's trials, and 2 in §7.2's 200 trials at dt, 0.0055 a minute, against a real worm's 1.8. Its noise was tuned on the kinematics alone, so the rate is a prediction (spec §4, amended for track S), and it misses.
- **Its voltages stay close to the model's range.** At each sample 0.15 neurons on average sit outside −48 to 0 mV, 3 at most, none more than 10 mV outside, the highest at +4.8 mV, where the refit's held 16 outside and drove the SMDs to ±210 mV. The head switch and proprioception are conductances in this fit, driving towards the model's reversal potentials; the switch's, at its bound's top, comes to about 50 times its targets' passive loads.
- **Three of its twelve values sit on a bound:** g_sw at 50 nS and g_nmj at 40, their tops, and the B-types' oscillator gain at 0, its floor.
- **Its result doesn't depend on the step.** Over 200 trials a step, each measure's 95% interval for the difference between 2.5 and 1.25 ms lies within its margin ("The step", below; DECISIONS.md, 2026-10-02).
- **The eigenworm clause measures how worm-like the postures are, not whether the worm crawls.** With the uncertain signs silent, the worm rocking in place, it still passes at 96.7% ("The sensitivity runs", below).

### Checkpoint 0

Checkpoint 0 ran again on track S's fit, its touches graded against sham twins and its chemotaxis by an exact binomial test, as its reruns are (PLAN §7.4; DECISIONS.md, 2026-10-02), and passes, as it did on the refit. The pass still says little. The head switch carries S's crawl, and it stays shut once the network is silenced, as θ_osc's floor is set to keep it (PLAN §7.3); what the crawling clause tests besides, the A-types' oscillators and the motor neurons' drive on the muscles at the neuromuscular gain's top, bends the silenced body and doesn't move it. Its touch and chemotaxis clauses ask that the silenced worm show no reflex and no chemotaxis, which it couldn't while it barely moved, and their passes would mean something only alongside passes of checkpoints 2 to 4: they have run, and fail.

- **The silenced worm pauses throughout.** It makes no forward sample in any trial, and over an hour in the assay no centroid got more than 0.51 mm from its start, against 40 mm to either spot's capture circle. Its head switch's gate stays shut on every step, the drive 13.3 mV below θ_osc. S's silenced drive, −28.19 mV, sits just under θ_osc's floor of −28, which its rule sets the first whole millivolt above the silenced drive so that a silenced switch stays shut, and S's θ_osc lies 13 mV above the floor, where the refit's sat on it. Intact, the gate is open on every step.
- **The noise bends the silenced body, and moves nothing.** Its mid-body curvature's standard deviation within a trial is 0.19 to 0.87 κL, against 1.75 to 1.98 intact, its spectrum peaking below 0.1 Hz in half the trials, a slow drift. In instrumented runs with the noise off, the A-types' oscillators sat still and the bend nearly stopped; with the noise on, every A-type's oscillator runs through full excursions, as in the intact network, but the bend stays much the same with those oscillators off. Silencing takes away the synaptic load that holds an intact neuron near its rest, so the noise also takes 28 neurons on average outside the reversal range at each sample, the voltages running from −89 to +28 mV, as the refit's ran from −78 to +11 (DECISIONS.md, 2026-10-02).
- **The touches reach no muscle.** Neither place's receptors, ALML, ALMR and AVM at the front and PLML and PLMR at the back, has a neuromuscular junction, so with their synapses cut a touch reaches the body only through the numerics: chiefly the integrator's restarts at its pulse's edges, and at rounding level the voltage solve's sums over every neuron. In the first run it moved no velocity sample by more than 2.7 × 10⁻⁷ body lengths per second (DECISIONS.md). A sham twin takes the same restarts, so on S's fit each touched copy's speed after its touch matches its twin's to rounding: a mean difference of 2.0 × 10⁻¹⁷ body lengths per second over the posterior touches, and none over 4.7 × 10⁻¹⁶ at either place. The touched receptors themselves reach +858 mV in the silenced network, a touch's current being sized for a receptor's load in the intact one, but they move no muscle.
- **In the first run the posterior clause passed at p = 0.051.** Its test compared the speeds before and after each touch, and the silenced worm creeps. In 30 of the 50 windows before a posterior touch it crept backward, and its speed rose after 26 of them: backward creep dying away. Over the same windows the untouched twins give the same rank sum, 808, and the same p, so the near-significance is the creep's, not the touch's. The test has no control for a worm's own trend, so checkpoint 0's reruns, and checkpoints 2 and 3, grade each touch against a sham-touched twin instead (PLAN §7.4). On S's fit the clause passes against its twins at p = 0.12, a p-value of rounding that the floor makes moot; the before-and-after test, reported beside it, gives p = 0.24.
- **The chemotaxis band is loose for a worm that moves.** A worm that moves but has no bias fails ±0.1 over 30 worms by chance 15% of the time if each worm has a one-in-five chance of reaching a spot, and 58% if every worm reaches one. Reruns grade the clause instead by a two-sided exact binomial test on arrivals (PLAN §7.4; DECISIONS.md, 2026-09-27). On S's fit, as on the refit, no worm reached either spot, so the test couldn't fail, which for a worm that barely moves is itself the result.

### The sensitivity runs

- **Half the settings would grade partial,** on S's fit with nothing tuned again: eight of the sixteen, the model's own, five of the ten random draws and both settings of the rest. Six of the eight that would fail miss on speed alone, at 0.044 to 0.057 body lengths per second against partial's 0.06: all excitatory, the shared-connection scales and four of the draws. A fifth draw misses on its wavelength too, 0.36 body lengths, its speed 0.040, and with the uncertain signs silent the crawl goes. So on this fit the crawl survives every random setting of the uncertain signs, the worm moving forward at least 86% of the time, and its partial grade survives half of them, where on the refit no setting reached partial. The signs move its speed with the head switch's gate open throughout, so they reach the crawl through more than the switch's drive.
- **The model's own setting repeats checkpoint 1**, figure for figure, as its rule requires.
- **The head switch carries the crawl under every setting.** Its gate stays open throughout, and wherever the frequency is measured the switch's cycle lies within 0.023 Hz of it.
- **With the uncertain signs silent the worm rocks with the switch.** It moves forward 20% of the measured time and backward 21.5%, no forward run lasting past 5.2 s, and makes 7.4 reversals a minute, the only setting with more than one. Every one starts within 3 s after a flip of the head switch, and AVA's activation hardly changes over them, so they are the switch's slips, not AVA's reversals.
- **The rest offsets move the speed by a few per cent.** With them off the worm crawls at 0.0655 body lengths per second, against the model's 0.0683; with AVA's, which rest it near its greatest release, at 0.0699, still never reversing. Neither changes a grade.
- **Checkpoint 0's crawling pass holds across the settings.** Silenced, the head switch stays shut under every one, 4.6 to 14.9 mV below θ_osc, and never flips; no setting makes a forward bout of 10 s, and under the random draws the silenced worm moves forward at most 0.47% of the time and backward at most 0.45%. The voltages run from −89 to +28 mV under every setting: the noise's, on the neurons silencing unloads, whatever the signs.
- **On the refit, before** (DECISIONS.md, 2026-09-30). No setting reached partial. The silenced network's head switch, shut by under half a millivolt on the model's signs, opened under eleven of the fourteen settings it had, and under two random draws the silenced worm drifted forward for 10 s, where checkpoint 0 asks for none; with its gate open, the silenced network's voltages ran to about ±15,600 mV.
- **They are not checkpoints.** Nothing was tuned for any setting, each has its thresholds at its own rest, the random draws are one set of ten, and no choice rests on them. They were first run with the silenced network's bouts alone, and the columns on how it moves, on its gate, its switch's flips and its voltages were added after those bouts were seen, in two steps, to show their cause (DECISIONS.md, 2026-09-30). Track S's two settings of its rest were set with its rules, before its fit was chosen (DECISIONS.md, 2026-10-01).

### How track R got here

Track R calibrated the planned model as it stands, then built its own model and calibrated it four times: first with white noise, whose result changed with the time step; then, after two numerics studies, with a coloured noise; in a second round with a two-stage calibration; and in a third on a conductance form of its head switch and proprioception (PLAN §7.3, §9; DECISIONS.md). Checkpoint 1 graded R's refit a fail, and §7.2's comparison, below, finds each of the refit's measures within its margin at half the step, so the result was final. By a rule set before the refit, only a fit that passes that comparison can be chosen: the planned fit fails it, so R's refit is the real wiring's final fit, and since checkpoint 1 stays below partial, R's first round ends (PLAN §9; DECISIONS.md, 2026-09-28). Without that rule, checkpoint 1's ranking alone would have chosen the planned fit. A review then found R's model reaching partial inside its bounds, where the calibration's objective ranked it below the refit for making no reversal, so a second round changed the calibration (PLAN §9). One of its four probe searches found the crawl and graded partial on seeds of its own, but its full run didn't: that fit fails §7.2's comparison and checkpoint 1, so the refit stays chosen. The probe's pick passes §7.2's comparison and grades partial on checkpoint 1's own trials, but only the full run's fit can be chosen, so it is recorded as exploratory. A third round, R's last, was paused: an investigation found that crawl resting on two currents with no reversal potential, the head switch's and proprioception's, which drive neurons far outside the model's reversal range, and the model without a backward mode, so a conductance form of the currents was built beside them, and a survey of it found two of sixteen searches reaching a partial crawl, slow and without reversals; the round ran on that form, by rules set before it ran. Its four picks crawled, three of them partial on checkpoint 1 over §7.2's trials, but each one's frequency and wavelength intervals reached past their margins at half the step, while its speed held, so none could be chosen: the refit stays the real wiring's final fit, and R has ended (PLAN §9; DECISIONS.md, 2026-09-29). An assessment then found the round's crawl paced by the head switch and largely indifferent to the chemical wiring, and the model without a backward mode, so the negative result is the headline: checkpoints 2 to 6 stay not reached (DECISIONS.md, 2026-09-30).

In the order they ran, from the planned model on its provisional parameters, before any calibration, to R's third round:

- **On the planned model's provisional parameters** (DECISIONS.md, 2026-09-26), it fell into one slow cycle instead: its bend deepened over about a minute as it crept to a halt, then flipped, and it moved forward for about 25 s. Checkpoint 0's first run, on 2026-09-27, silenced the network on those parameters; its section below now reports track S's fit.
- **The planned model's fit** (DECISIONS.md, 2026-09-27) was led by its head switch's slower cycle, at 0.073 Hz, and moved at 0.030 body lengths per second, its forward runs cut by the switch at 13.6 s at most; checkpoint 1 graded its frequency partial and its speed and bouts fail. It fails §7.2's comparison: at half the step its frequency, wavelength, speed and reversal rate all move outside their margins, so its result isn't final and it can't be chosen (DECISIONS.md, 2026-09-28).
- **R's first fit, with white noise** (DECISIONS.md, 2026-09-27 and 2026-09-28), crawled faster, at 0.063 body lengths per second in bouts at 0.232 Hz, with 8 of 20 trials holding a 20 s run. But its reversals and the length of its runs came from the time step: at half the step 17 trials held one and it reached partial. The convergence studies traced this to the white noise, which a coarse step damps, and to the oscillators' stiff dynamics; the coloured noise and the refit followed.
- **R's refit, the chosen fit until 2026-10-02** (DECISIONS.md, 2026-09-28 to 2026-09-30). It failed checkpoint 1: it moved forward 79–82% of the time at 0.029 body lengths per second, about an eighth of a real worm's speed, its wavelength and postures passing and its frequency, speed and sustained runs failing, no forward run lasting past 10.3 s. Its head switch alone moved it: without the switch it didn't move, and with all 18 B-types lesioned it still moved forward 72% of the time, against 81%, its B-types held about 30 mV below threshold and its A-types never firing. All 54 of its reversals began within 3 s after a flip of the switch, whose cycle put the mid-body spectrum's peak at 0.082 Hz; its 12 bouts of 10 s held one undulation each, so the graded 0.099 Hz was the switch's, not a wave's. Its switch, in the current form, injected a current with no reversal potential that held the SMDs near ±210 mV, 16 neurons on average sitting outside the reversal range at each sample. Five of its twelve values sat on a bound, each quieting the motor circuits. It passed §7.2's comparison, its frequency's and speed's intervals within 0.0003 of zero, so the failure was the model's, not the numerics'. Checkpoint 0 passed on it, its crawling pass following from θ_osc's floor, which it sat on, and the sensitivity runs left it failing under every setting.
- **R's second round's fit** (DECISIONS.md, 2026-09-29) moves at 0.036 body lengths per second. All 168 of its reversals follow a flip of the head switch, and its mid-body spectrum peaks at the switch's 0.082 Hz, as the refit's does; with the switch removed it doesn't move, and with the B-types lesioned it still moves forward 77% of the time, a review found. Its graded frequency and wavelength come from bouts piled at the 10 s floor and move with the step, so its result isn't final and it can't be chosen.
- **The second round's probe found a crawler the rules can't choose** (DECISIONS.md, 2026-09-29). Seed 14's pick passes §7.2's comparison over 200 paired seeds and grades partial on checkpoint 1's own trials: 0.341 Hz, 0.50 body lengths, 0.103 body lengths per second and a 20 s bout in every trial. The head switch paces it, the B-types give it thrust, and it never reverses. It sits in a corner of the parameters' box that the full run's search never reached, and only the full run's fit could be chosen, so it is recorded as exploratory. Its crawl needs the head switch's and proprioception's currents to drive neurons far outside the reversal range, an investigation found (DECISIONS.md, 2026-09-29).
- **The survey of the bounded model found two slow crawlers the rules can't choose** (DECISIONS.md, 2026-09-29). With the head switch and proprioception as conductances, 2 of 16 searches graded partial on seeds of their own: 0.129 and 0.186 Hz, 0.061 body lengths per second, at partial's floor, and no reversal. Their head switch's gate stays open throughout, so its rhythm, not the network's, paces them, and at half the step one of them is partial by 0.00001, a review found. They are exploratory. R's third round ran on the bounded model by rules of its own, and none of its picks passed §7.2's comparison (the next item).
- **R's third round found faster crawlers the rules can't choose either** (DECISIONS.md, 2026-09-29 and 2026-09-30). Picks 1 and 2 crawl at 0.081 body lengths per second, with a forward bout of 20 s in every trial, three of its four picks partial over §7.2's 200 trials, but each pick's counted frequency, and with it the wavelength, which the measure ties to it, moves with the step past its margin. The body's own rhythm moves less: most of the shift is short crossings of the bouts' mean, which the count takes in. Every pick's head switch runs with its gate open throughout, and the body follows its cycle; an assessment found the crawl relayed back along the body by proprioception, and the worm still moving forward 93% of the time, more slowly, with every chemical synapse cut.

## Results

<!-- harness:checkpoint-0 -->

### Checkpoint 0: the silenced network — **Pass**

Run on 2026-10-02 at `e37996b`: 20 trials of 120 s, seeds 1 to 20, each run untouched and touched, and 30 worms in the assay for up to 60 min, seeds 1 to 30, on track S's model, its measured signs, the D-types' offset and its rectifier, in the conductance form, with the calibrated parameters (PLAN §7.3), here to three significant figures: g_osc = 838 pS, g_osc,B = 0 pS, τ_w = 1.23 s, θ_osc = −14.9 mV, g_sw = 50 nS, g_p = 0.0157 nS per unit of κL, κ_gap,B = 0.156, g_nmj = 40 per unit of relative drive, θ_nmj = −0.0994 relative drive, κ_SMD = 0.169, σ_n = 0.0565 pA·√s, τ_n = 0.0551 s. Every trial's measures start after its first 10 s. Every trial, sham twin and worm stayed finite, and no brain solve failed to converge.

| Clause          | Measured                                                                                                                                                      | Passes if                                                                                                                                                                     | Grade    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Crawling        | 0 forward bouts of 10 s or more                                                                                                                               | None in any trial                                                                                                                                                             | **Pass** |
| Anterior touch  | A reversal within 2 s after 0 of 50 touches (0%), and after 0 of their sham twins; 0 pairs with the touched copy's alone and 0 with the twin's alone, p = 1.0 | Under 40%, or not more often than after the sham twins (McNemar's exact test, one-sided)                                                                                      | **Pass** |
| Posterior touch | Forward velocity over the 2 s after 50 touches: 0.0002 touched, 0.0002 in the sham twins (body lengths/s), a difference of 2.0 × 10⁻¹⁷ on average; p = 0.12   | Not significantly faster than the sham twins (Wilcoxon's signed-rank test, one-sided, paired), or by under 0.0012 body lengths/s on average                                   | **Pass** |
| Chemotaxis      | 0 arrivals: 0 of 30 worms at the odour, 0 at the control (CI 0.00); p = 1.0                                                                                   | Neither spot reached significantly more often than the other (the exact binomial test, two-sided, over the worms that reached either); with 5 arrivals or fewer it can't fail | **Pass** |

Every clause is predicted, since no parameter is tuned to it: each passes if a behaviour that should need the connectome is absent without it. Two of the calibration's bounds were set with the silenced network in view, θ_osc's floor and σ_n's ceiling (PLAN §7.3), so that within them it stays still.

#### Crawling

There were 0 forward bouts of 10 s or more; the longest forward run lasted 0.0 s. Backward activity, reported and not graded: 0 reversals of 1 s or more, 0.00 a minute.

| Seed | Posture | Forward / paused / backward | Longest forward run (s) | Reversals | Mean velocity (body lengths/s) | Self-intersecting postures |
| ---- | ------- | --------------------------- | ----------------------- | --------- | ------------------------------ | -------------------------- |
| 1    | 247     | 0% / 100% / 0%              | 0.0                     | 0         | −0.0006                        | 0                          |
| 2    | 5745    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0005                         | 0                          |
| 3    | 2081    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0005                         | 0                          |
| 4    | 2260    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0000                         | 0                          |
| 5    | 6605    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0001                         | 0                          |
| 6    | 2621    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0000                         | 0                          |
| 7    | 394     | 0% / 100% / 0%              | 0.0                     | 0         | −0.0007                        | 0                          |
| 8    | 874     | 0% / 100% / 0%              | 0.0                     | 0         | −0.0005                        | 0                          |
| 9    | 2169    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0005                         | 0                          |
| 10   | 4026    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0006                        | 0                          |
| 11   | 162     | 0% / 100% / 0%              | 0.0                     | 0         | −0.0005                        | 0                          |
| 12   | 1032    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0001                         | 0                          |
| 13   | 4410    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0004                        | 0                          |
| 14   | 4877    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0005                         | 0                          |
| 15   | 4679    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0011                         | 0                          |
| 16   | 1398    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0005                        | 0                          |
| 17   | 3516    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0003                        | 0                          |
| 18   | 3956    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0006                         | 0                          |
| 19   | 6488    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0001                         | 0                          |
| 20   | 5323    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0001                        | 0                          |

#### Touch

The same trials ran again, each touched 5 times, 20 s apart from t = 20 s, alternating front (F, s = 0.2) and back (B, s = 0.8), odd seeds starting at the front: 50 anterior touches and 50 posterior. Each front touch reached ALML, ALMR, AVM; each back touch reached PLML, PLMR. At each touch the world forked a sham twin, which took a sham touch in its place, restarting the integrator where the touch's current switched, with no current of its own, and ran 3.5 s on while the touched line ran on; each touch is graded against its twin over the same samples (PLAN §7.4). The signed-rank test takes the 50 posterior touches whose speed after differed from their twins' at all, with a rank sum of 762 for those the touched copy led; where the touch reaches no muscle, those differences are rounding, and the floor decides. Reported, not graded: the forward velocity before and after the posterior touches, −0.0001 and 0.0002 body lengths per second, a rank sum of 711 over 50 pairs, p = 0.24, by the before-and-after test the first run graded by. Backward activity in the touched trials, reported and not graded: 0 reversals of 1 s or more, 0.00 a minute.

| Seed | Touches   | Anterior touches followed by a reversal | Sham twins with one | Posterior touches: forward velocity after, touched / sham (body lengths/s) | Reversals |
| ---- | --------- | --------------------------------------- | ------------------- | -------------------------------------------------------------------------- | --------- |
| 1    | F B F B F | 0 of 3                                  | 0 of 3              | −0.0006 / −0.0006                                                          | 0         |
| 2    | B F B F B | 0 of 2                                  | 0 of 2              | 0.0006 / 0.0006                                                            | 0         |
| 3    | F B F B F | 0 of 3                                  | 0 of 3              | 0.0008 / 0.0008                                                            | 0         |
| 4    | B F B F B | 0 of 2                                  | 0 of 2              | 0.0004 / 0.0004                                                            | 0         |
| 5    | F B F B F | 0 of 3                                  | 0 of 3              | 0.0000 / 0.0000                                                            | 0         |
| 6    | B F B F B | 0 of 2                                  | 0 of 2              | 0.0002 / 0.0002                                                            | 0         |
| 7    | F B F B F | 0 of 3                                  | 0 of 3              | 0.0003 / 0.0003                                                            | 0         |
| 8    | B F B F B | 0 of 2                                  | 0 of 2              | −0.0004 / −0.0004                                                          | 0         |
| 9    | F B F B F | 0 of 3                                  | 0 of 3              | 0.0009 / 0.0009                                                            | 0         |
| 10   | B F B F B | 0 of 2                                  | 0 of 2              | −0.0007 / −0.0007                                                          | 0         |
| 11   | F B F B F | 0 of 3                                  | 0 of 3              | −0.0008 / −0.0008                                                          | 0         |
| 12   | B F B F B | 0 of 2                                  | 0 of 2              | 0.0003 / 0.0003                                                            | 0         |
| 13   | F B F B F | 0 of 3                                  | 0 of 3              | −0.0007 / −0.0007                                                          | 0         |
| 14   | B F B F B | 0 of 2                                  | 0 of 2              | 0.0003 / 0.0003                                                            | 0         |
| 15   | F B F B F | 0 of 3                                  | 0 of 3              | 0.0014 / 0.0014                                                            | 0         |
| 16   | B F B F B | 0 of 2                                  | 0 of 2              | 0.0002 / 0.0002                                                            | 0         |
| 17   | F B F B F | 0 of 3                                  | 0 of 3              | 0.0001 / 0.0001                                                            | 0         |
| 18   | B F B F B | 0 of 2                                  | 0 of 2              | 0.0007 / 0.0007                                                            | 0         |
| 19   | F B F B F | 0 of 3                                  | 0 of 3              | 0.0006 / 0.0006                                                            | 0         |
| 20   | B F B F B | 0 of 2                                  | 0 of 2              | −0.0001 / −0.0001                                                          | 0         |

#### Chemotaxis

Each worm ran alone in checkpoint 4's assay: the butanone spot's steady field, the worm's centroid starting at the dish's centre, 45 mm from each spot, and the run stopping when any part of its body came within 5 mm of a spot's centre. 0 worms reached the odour, 0 the control and 30 neither. The nearest any worm came was 44.06 mm from the odour spot's centre and 44.22 mm from the control's; the farthest any centroid got from its start was 0.509 mm.

| Seed | Posture | AWC-ON | Reached | Nearest the odour spot (mm) | Nearest the control (mm) | Farthest from the start (mm) |
| ---- | ------- | ------ | ------- | --------------------------- | ------------------------ | ---------------------------- |
| 1    | 247     | AWCL   | Neither | 44.28                       | 44.60                    | 0.413                        |
| 2    | 5745    | AWCL   | Neither | 44.38                       | 44.33                    | 0.184                        |
| 3    | 2081    | AWCR   | Neither | 44.83                       | 44.54                    | 0.250                        |
| 4    | 2260    | AWCR   | Neither | 44.79                       | 44.74                    | 0.341                        |
| 5    | 6605    | AWCR   | Neither | 44.88                       | 44.79                    | 0.256                        |
| 6    | 2621    | AWCR   | Neither | 44.26                       | 44.65                    | 0.349                        |
| 7    | 394     | AWCL   | Neither | 44.06                       | 44.48                    | 0.509                        |
| 8    | 874     | AWCL   | Neither | 44.48                       | 44.53                    | 0.406                        |
| 9    | 2169    | AWCR   | Neither | 44.58                       | 44.82                    | 0.183                        |
| 10   | 4026    | AWCL   | Neither | 44.15                       | 44.43                    | 0.457                        |
| 11   | 162     | AWCL   | Neither | 44.28                       | 44.66                    | 0.338                        |
| 12   | 1032    | AWCL   | Neither | 44.43                       | 44.31                    | 0.252                        |
| 13   | 4410    | AWCL   | Neither | 44.83                       | 44.43                    | 0.370                        |
| 14   | 4877    | AWCR   | Neither | 44.60                       | 44.76                    | 0.235                        |
| 15   | 4679    | AWCL   | Neither | 44.64                       | 44.85                    | 0.189                        |
| 16   | 1398    | AWCR   | Neither | 44.83                       | 44.77                    | 0.505                        |
| 17   | 3516    | AWCL   | Neither | 44.14                       | 44.51                    | 0.394                        |
| 18   | 3956    | AWCL   | Neither | 44.88                       | 44.73                    | 0.266                        |
| 19   | 6488    | AWCL   | Neither | 44.81                       | 44.70                    | 0.336                        |
| 20   | 5323    | AWCR   | Neither | 44.41                       | 44.38                    | 0.226                        |
| 21   | 1014    | AWCL   | Neither | 44.89                       | 44.65                    | 0.223                        |
| 22   | 645     | AWCL   | Neither | 44.38                       | 44.48                    | 0.330                        |
| 23   | 5014    | AWCR   | Neither | 44.65                       | 44.28                    | 0.483                        |
| 24   | 4945    | AWCL   | Neither | 44.76                       | 44.89                    | 0.458                        |
| 25   | 1543    | AWCR   | Neither | 44.22                       | 44.56                    | 0.312                        |
| 26   | 4604    | AWCR   | Neither | 44.73                       | 44.42                    | 0.417                        |
| 27   | 680     | AWCR   | Neither | 44.88                       | 44.72                    | 0.301                        |
| 28   | 5128    | AWCR   | Neither | 44.84                       | 44.74                    | 0.371                        |
| 29   | 820     | AWCL   | Neither | 44.54                       | 44.22                    | 0.314                        |
| 30   | 479     | AWCL   | Neither | 44.78                       | 44.39                    | 0.360                        |

<!-- /harness:checkpoint-0 -->

<!-- harness:checkpoint-1 -->

### Checkpoint 1: crawling — **Partial**

Run on 2026-10-02 at `e37996b`: 20 trials of 120 s, seeds 1 to 20, on track S's model, its measured signs, the D-types' offset and its rectifier, in the conductance form, with the calibrated parameters (PLAN §7.3), here to three significant figures: g_osc = 838 pS, g_osc,B = 0 pS, τ_w = 1.23 s, θ_osc = −14.9 mV, g_sw = 50 nS, g_p = 0.0157 nS per unit of κL, κ_gap,B = 0.156, g_nmj = 40 per unit of relative drive, θ_nmj = −0.0994 relative drive, κ_SMD = 0.169, σ_n = 0.0565 pA·√s, τ_n = 0.0551 s. Every measure starts after each trial's first 10 s. Every trial stayed finite, and no brain solve failed to converge.

| Clause                                       | Measured | Pass      | Partial   | Grade       | Kind               |
| -------------------------------------------- | -------- | --------- | --------- | ----------- | ------------------ |
| Frequency (Hz)                               | 0.217    | 0.20–0.45 | 0.10–0.60 | **Pass**    | Calibration target |
| Wavelength (body lengths)                    | 0.48     | 0.50–0.80 | 0.40–1.00 | **Partial** | Calibration target |
| Speed (body lengths/s)                       | 0.068    | 0.12–0.30 | 0.06–0.50 | **Partial** | Calibration target |
| Posture variance the four eigenworms capture | 97.5%    | ≥ 85%     | ≥ 70%     | **Pass**    | Predicted          |
| Trials with a forward bout of 20 s or more   | 100%     | ≥ 80%     | ≥ 50%     | **Pass**    | Predicted          |

The kinematics come from 24 forward bouts of 10 s or more, 2178.9 s in all. Over them the mid-body curvature crossed its mean 945 times, 39.4 a bout, counting a crossing once the curvature left ±0.31 κL about the mean on the far side; a full undulation crosses twice. By the plain count it replaced (PLAN §7.4, changed after results 2026-10-01), it crossed 1088 times, for a frequency of 0.250 Hz. The rear rod's curvature correlated best with the front's at a lag of 1.19 s (correlation 0.89). The eigenworm clause pools 8,820 postures sampled at 4 Hz; 0 self-intersecting postures were left out. The kinematic clauses are calibration targets, which the parameters were tuned against (PLAN §7.3), on seeds of their own, 1001 to 1020.

Diagnostics, reported and not graded (PLAN §7.4): the mid-body curvature's spectrum peaks at 0.210 Hz, with 60% of its power between 0.2 and 0.45 Hz; 0 of 0 reversals started within 3 s after a flip of the head switch; AVA's activation has no reversal to report; 0.2 neurons on average sat outside the model's reversal range, −48 to 0 mV, at each sample, and 3 at most; 0.0 on average, and 0 at most, sat more than 10 mV outside it; the voltages ran from −47.6 to 4.8 mV over every step of the measured windows; in the conductance form, the head switch's conductance came to 4974% of its targets' passive loads and proprioception's to 16%, each shunt the mean of per-target ratios, and the switch's gate turned on or off 0.0 times a second; the head switch's gate was open on 100.0% of the measured steps, the head-switch drive sat 13.6 mV above θ_osc on average, with a standard deviation of 0.5 mV, and the switch cycled at 0.214 Hz, half its flips a second, beside the spectrum's peak at 0.210 Hz.

| Seed | Posture | Forward / paused / backward | Longest forward run (s) | Reversals | Mean velocity (body lengths/s) | Self-intersecting postures |
| ---- | ------- | --------------------------- | ----------------------- | --------- | ------------------------------ | -------------------------- |
| 1    | 247     | 100% / 0% / 0%              | 55.4                    | 0         | 0.0696                         | 0                          |
| 2    | 5745    | 100% / 0% / 0%              | 109.6                   | 0         | 0.0643                         | 0                          |
| 3    | 2081    | 100% / 0% / 0%              | 109.6                   | 0         | 0.0708                         | 0                          |
| 4    | 2260    | 100% / 0% / 0%              | 109.6                   | 0         | 0.0675                         | 0                          |
| 5    | 6605    | 100% / 0% / 0%              | 109.6                   | 0         | 0.0695                         | 0                          |
| 6    | 2621    | 100% / 0% / 0%              | 109.6                   | 0         | 0.0712                         | 0                          |
| 7    | 394     | 100% / 0% / 0%              | 109.6                   | 0         | 0.0709                         | 0                          |
| 8    | 874     | 99% / 1% / 0%               | 103.4                   | 0         | 0.0698                         | 0                          |
| 9    | 2169    | 100% / 0% / 0%              | 109.6                   | 0         | 0.0639                         | 0                          |
| 10   | 4026    | 100% / 0% / 0%              | 109.6                   | 0         | 0.0682                         | 0                          |
| 11   | 162     | 100% / 0% / 0%              | 109.6                   | 0         | 0.0660                         | 0                          |
| 12   | 1032    | 100% / 0% / 0%              | 109.6                   | 0         | 0.0682                         | 0                          |
| 13   | 4410    | 100% / 0% / 0%              | 109.6                   | 0         | 0.0659                         | 0                          |
| 14   | 4877    | 100% / 0% / 0%              | 77.5                    | 0         | 0.0704                         | 0                          |
| 15   | 4679    | 97% / 3% / 0%               | 77.3                    | 0         | 0.0617                         | 0                          |
| 16   | 1398    | 100% / 0% / 0%              | 109.6                   | 0         | 0.0680                         | 0                          |
| 17   | 3516    | 100% / 0% / 0%              | 109.6                   | 0         | 0.0680                         | 0                          |
| 18   | 3956    | 100% / 0% / 0%              | 109.6                   | 0         | 0.0703                         | 0                          |
| 19   | 6488    | 99% / 1% / 0%               | 64.1                    | 0         | 0.0658                         | 0                          |
| 20   | 5323    | 100% / 0% / 0%              | 109.6                   | 0         | 0.0710                         | 0                          |

<!-- /harness:checkpoint-1 -->

<!-- harness:checkpoint-2 -->

### Checkpoint 2: anterior touch — **Fail**, reported as fitted

Run on 2026-10-02 at `97c436a`: trials of 120 s from real postures, seed 1 upwards, each touched once during forward crawling, at the first 0.1 s sample from an earliest time its seed draws between 20 and 100 s at which the 2 s before were forward, the world forking there into a copy touched at the front (s = 0.2), one at the back (s = 0.8) and a sham twin, each run 3.5 s on; 50 touches from 50 seeds, on track S's model, its measured signs, the D-types' offset and its rectifier, in the conductance form, with the calibrated parameters (PLAN §7.3), here to three significant figures: g_osc = 838 pS, g_osc,B = 0 pS, τ_w = 1.23 s, θ_osc = −14.9 mV, g_sw = 50 nS, g_p = 0.0157 nS per unit of κL, κ_gap,B = 0.156, g_nmj = 40 per unit of relative drive, θ_nmj = −0.0994 relative drive, κ_SMD = 0.169, σ_n = 0.0565 pA·√s, τ_n = 0.0551 s. Every trial and copy stayed finite, and no brain solve failed to converge.

| Clause                                                   | Measured                                                                                          | Pass                                          | Partial                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------- |
| Touches followed by a reversal within 2 s                | 0 of 50 (0%)                                                                                      | ≥ 70%                                         | 40%–70%                                |
| Against the sham twins (McNemar's exact test, one-sided) | 0 twins reversed (0%); 0 pairs with the touched copy's alone and 0 with the twin's alone; p = 1.0 | Significant, and at least 3× the twins' share | Significant (DECISIONS.md, 2026-10-02) |

The response, the touched copies' share of reversals less the twins', is 0.00: what checkpoint 5's touch rows read. No touch was followed by a reversal, so there is no latency to report. Every clause would be predicted, since checkpoint 2 is held out of the calibration (spec §1.2), but it is reported as fitted: track S, whose fit this is, was proposed after the previews below, and its measured signs came from an audit the missing backward mode prompted (PLAN §10; DECISIONS.md, 2026-10-01). Previewed outside the protocol (PLAN §10): an investigation on 2026-09-29 stimulated and lesioned the real wiring at another fit, the second round's probe crawler, on exploration seeds; it pointed to checkpoint 2 failing, with no reversal, and checkpoint 3 likely failing, since stimulating PLM slowed the worm (DECISIONS.md, 2026-09-29).

| Seed | Posture | Touch at (s) | Reached         | Reversal: touched / sham | Speed before (body lengths/s) | Speed after: touched / sham (body lengths/s) |
| ---- | ------- | ------------ | --------------- | ------------------------ | ----------------------------- | -------------------------------------------- |
| 1    | 247     | 38.5         | ALML, ALMR, AVM | No / No                  | 0.0369                        | 0.0734 / 0.0724                              |
| 2    | 5745    | 68.7         | ALML, ALMR, AVM | No / No                  | 0.0764                        | 0.0548 / 0.0550                              |
| 3    | 2081    | 50.2         | ALML, ALMR, AVM | No / No                  | 0.0891                        | 0.0914 / 0.0911                              |
| 4    | 2260    | 22.8         | ALML, ALMR, AVM | No / No                  | 0.0469                        | 0.0728 / 0.0834                              |
| 5    | 6605    | 32.2         | ALML, ALMR, AVM | No / No                  | 0.0631                        | 0.0913 / 0.0774                              |
| 6    | 2621    | 89.4         | ALML, ALMR, AVM | No / No                  | 0.0568                        | 0.0608 / 0.0621                              |
| 7    | 394     | 42.1         | ALML, ALMR, AVM | No / No                  | 0.0668                        | 0.0838 / 0.0818                              |
| 8    | 874     | 77.0         | ALML, ALMR, AVM | No / No                  | 0.0941                        | 0.0554 / 0.0522                              |
| 9    | 2169    | 46.7         | ALML, ALMR, AVM | No / No                  | 0.0632                        | 0.0416 / 0.0458                              |
| 10   | 4026    | 66.4         | ALML, ALMR, AVM | No / No                  | 0.0634                        | 0.0935 / 0.0961                              |
| 11   | 162     | 84.5         | ALML, ALMR, AVM | No / No                  | 0.0816                        | 0.0538 / 0.0541                              |
| 12   | 1032    | 67.8         | ALML, ALMR, AVM | No / No                  | 0.0590                        | 0.0588 / 0.0697                              |
| 13   | 4410    | 28.6         | ALML, ALMR, AVM | No / No                  | 0.0828                        | 0.0648 / 0.0648                              |
| 14   | 4877    | 26.8         | ALML, ALMR, AVM | No / No                  | 0.0705                        | 0.0754 / 0.0669                              |
| 15   | 4679    | 71.1         | ALML, ALMR, AVM | No / No                  | 0.0671                        | 0.0790 / 0.0804                              |
| 16   | 1398    | 49.2         | ALML, ALMR, AVM | No / No                  | 0.0484                        | 0.0740 / 0.0674                              |
| 17   | 3516    | 21.7         | ALML, ALMR, AVM | No / No                  | 0.0612                        | 0.0785 / 0.0768                              |
| 18   | 3956    | 42.5         | ALML, ALMR, AVM | No / No                  | 0.0614                        | 0.0816 / 0.0816                              |
| 19   | 6488    | 73.5         | ALML, ALMR, AVM | No / No                  | 0.0557                        | 0.0069 / 0.0078                              |
| 20   | 5323    | 41.7         | ALML, ALMR, AVM | No / No                  | 0.0408                        | 0.0757 / 0.0736                              |
| 21   | 1014    | 39.6         | ALML, ALMR, AVM | No / No                  | 0.0527                        | 0.0660 / 0.0623                              |
| 22   | 645     | 74.8         | ALML, ALMR, AVM | No / No                  | 0.0847                        | 0.0909 / 0.0896                              |
| 23   | 5014    | 37.8         | ALML, ALMR, AVM | No / No                  | 0.0431                        | 0.0954 / 0.0965                              |
| 24   | 4945    | 69.5         | ALML, ALMR, AVM | No / No                  | 0.0941                        | 0.0428 / 0.0421                              |
| 25   | 1543    | 37.0         | ALML, ALMR, AVM | No / No                  | 0.0624                        | 0.0716 / 0.0706                              |
| 26   | 4604    | 30.7         | ALML, ALMR, AVM | No / No                  | 0.0976                        | 0.0660 / 0.0658                              |
| 27   | 680     | 44.6         | ALML, ALMR, AVM | No / No                  | 0.0449                        | 0.0893 / 0.0871                              |
| 28   | 5128    | 24.2         | ALML, ALMR, AVM | No / No                  | 0.0701                        | 0.0809 / 0.0801                              |
| 29   | 820     | 83.2         | ALML, ALMR, AVM | No / No                  | 0.0686                        | 0.0625 / 0.0641                              |
| 30   | 479     | 57.2         | ALML, ALMR, AVM | No / No                  | 0.0504                        | 0.0947 / 0.0970                              |
| 31   | 1720    | 87.5         | ALML, ALMR, AVM | No / No                  | 0.0736                        | 0.0654 / 0.0669                              |
| 32   | 2380    | 24.3         | ALML, ALMR, AVM | No / No                  | 0.0748                        | 0.0711 / 0.0674                              |
| 33   | 84      | 34.6         | ALML, ALMR, AVM | No / No                  | 0.0799                        | 0.0780 / 0.0793                              |
| 34   | 4090    | 35.8         | ALML, ALMR, AVM | No / No                  | 0.0572                        | 0.0561 / 0.0582                              |
| 35   | 5808    | 21.2         | ALML, ALMR, AVM | No / No                  | 0.0620                        | 0.0684 / 0.0678                              |
| 36   | 5962    | 41.9         | ALML, ALMR, AVM | No / No                  | 0.1043                        | 0.0853 / 0.0839                              |
| 37   | 3357    | 76.4         | ALML, ALMR, AVM | No / No                  | 0.0658                        | 0.0631 / 0.0621                              |
| 38   | 6407    | 84.3         | ALML, ALMR, AVM | No / No                  | 0.0545                        | 0.0960 / 0.0994                              |
| 39   | 2681    | 37.2         | ALML, ALMR, AVM | No / No                  | 0.0780                        | 0.0470 / 0.0475                              |
| 40   | 1042    | 41.1         | ALML, ALMR, AVM | No / No                  | 0.0815                        | 0.0743 / 0.0764                              |
| 41   | 5497    | 93.2         | ALML, ALMR, AVM | No / No                  | 0.0546                        | 0.0818 / 0.0801                              |
| 42   | 5168    | 36.7         | ALML, ALMR, AVM | No / No                  | 0.0590                        | 0.0805 / 0.0809                              |
| 43   | 4786    | 44.6         | ALML, ALMR, AVM | No / No                  | 0.0860                        | 0.0323 / 0.0356                              |
| 44   | 1583    | 22.4         | ALML, ALMR, AVM | No / No                  | 0.0930                        | 0.0836 / 0.0918                              |
| 45   | 6352    | 41.7         | ALML, ALMR, AVM | No / No                  | 0.0737                        | 0.0642 / 0.0638                              |
| 46   | 4539    | 66.3         | ALML, ALMR, AVM | No / No                  | 0.0736                        | 0.0760 / 0.0781                              |
| 47   | 5607    | 67.0         | ALML, ALMR, AVM | No / No                  | 0.0590                        | 0.0597 / 0.0662                              |
| 48   | 172     | 21.7         | ALML, ALMR, AVM | No / No                  | 0.1000                        | 0.0423 / 0.0416                              |
| 49   | 5252    | 32.9         | ALML, ALMR, AVM | No / No                  | 0.0522                        | 0.0439 / 0.0421                              |
| 50   | 639     | 66.1         | ALML, ALMR, AVM | No / No                  | 0.0373                        | 0.0654 / 0.0630                              |

<!-- /harness:checkpoint-2 -->

<!-- harness:checkpoint-3 -->

### Checkpoint 3: posterior touch — **Fail**

Run on 2026-10-02 at `97c436a`: trials of 120 s from real postures, seed 1 upwards, each touched once during forward crawling, at the first 0.1 s sample from an earliest time its seed draws between 20 and 100 s at which the 2 s before were forward, the world forking there into a copy touched at the front (s = 0.2), one at the back (s = 0.8) and a sham twin, each run 3.5 s on; 50 touches from 50 seeds, on track S's model, its measured signs, the D-types' offset and its rectifier, in the conductance form, with the calibrated parameters (PLAN §7.3), here to three significant figures: g_osc = 838 pS, g_osc,B = 0 pS, τ_w = 1.23 s, θ_osc = −14.9 mV, g_sw = 50 nS, g_p = 0.0157 nS per unit of κL, κ_gap,B = 0.156, g_nmj = 40 per unit of relative drive, θ_nmj = −0.0994 relative drive, κ_SMD = 0.169, σ_n = 0.0565 pA·√s, τ_n = 0.0551 s. Every trial and copy stayed finite, and no brain solve failed to converge.

| Clause                                                                                                          | Measured                                                                                                                                       | Pass                         | Partial                           |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------- |
| Mean forward speed over the 2 s after the touch, over the sham twins' (the signed-rank test, one-sided, paired) | 0.0692 touched, 0.0694 in the twins (body lengths/s): −0.3%; a rank sum of 568 for the touches that led, over 50 pairs that differed, p = 0.75 | ≥ 10% above, and significant | Significantly above, by 1% to 10% |

The response, the touched copies' mean speed over the twins' less one, is −0.3%: what checkpoint 5's touch rows read. The clause is predicted, since checkpoint 3 is held out of the calibration (spec §1.2). Reported, not graded: the forward velocity over the 2 s before the touches, 0.0675 body lengths per second, against 0.0692 after, by the before-and-after test the cited papers use, a rank sum of 723 over 50 pairs, p = 0.21. Previewed outside the protocol (PLAN §10): an investigation on 2026-09-29 stimulated and lesioned the real wiring at another fit, the second round's probe crawler, on exploration seeds; it pointed to checkpoint 2 failing, with no reversal, and checkpoint 3 likely failing, since stimulating PLM slowed the worm (DECISIONS.md, 2026-09-29).

| Seed | Posture | Touch at (s) | Reached    | Reversal: touched / sham | Speed before (body lengths/s) | Speed after: touched / sham (body lengths/s) |
| ---- | ------- | ------------ | ---------- | ------------------------ | ----------------------------- | -------------------------------------------- |
| 1    | 247     | 38.5         | PLML, PLMR | No / No                  | 0.0369                        | 0.0732 / 0.0724                              |
| 2    | 5745    | 68.7         | PLML, PLMR | No / No                  | 0.0764                        | 0.0553 / 0.0550                              |
| 3    | 2081    | 50.2         | PLML, PLMR | No / No                  | 0.0891                        | 0.0915 / 0.0911                              |
| 4    | 2260    | 22.8         | PLML, PLMR | No / No                  | 0.0469                        | 0.0716 / 0.0834                              |
| 5    | 6605    | 32.2         | PLML, PLMR | No / No                  | 0.0631                        | 0.0907 / 0.0774                              |
| 6    | 2621    | 89.4         | PLML, PLMR | No / No                  | 0.0568                        | 0.0611 / 0.0621                              |
| 7    | 394     | 42.1         | PLML, PLMR | No / No                  | 0.0668                        | 0.0834 / 0.0818                              |
| 8    | 874     | 77.0         | PLML, PLMR | No / No                  | 0.0941                        | 0.0526 / 0.0522                              |
| 9    | 2169    | 46.7         | PLML, PLMR | No / No                  | 0.0632                        | 0.0401 / 0.0458                              |
| 10   | 4026    | 66.4         | PLML, PLMR | No / No                  | 0.0634                        | 0.0922 / 0.0961                              |
| 11   | 162     | 84.5         | PLML, PLMR | No / No                  | 0.0816                        | 0.0545 / 0.0541                              |
| 12   | 1032    | 67.8         | PLML, PLMR | No / No                  | 0.0590                        | 0.0580 / 0.0697                              |
| 13   | 4410    | 28.6         | PLML, PLMR | No / No                  | 0.0828                        | 0.0618 / 0.0648                              |
| 14   | 4877    | 26.8         | PLML, PLMR | No / No                  | 0.0705                        | 0.0831 / 0.0669                              |
| 15   | 4679    | 71.1         | PLML, PLMR | No / No                  | 0.0671                        | 0.0784 / 0.0804                              |
| 16   | 1398    | 49.2         | PLML, PLMR | No / No                  | 0.0484                        | 0.0726 / 0.0674                              |
| 17   | 3516    | 21.7         | PLML, PLMR | No / No                  | 0.0612                        | 0.0778 / 0.0768                              |
| 18   | 3956    | 42.5         | PLML, PLMR | No / No                  | 0.0614                        | 0.0825 / 0.0816                              |
| 19   | 6488    | 73.5         | PLML, PLMR | No / No                  | 0.0557                        | 0.0066 / 0.0078                              |
| 20   | 5323    | 41.7         | PLML, PLMR | No / No                  | 0.0408                        | 0.0740 / 0.0736                              |
| 21   | 1014    | 39.6         | PLML, PLMR | No / No                  | 0.0527                        | 0.0658 / 0.0623                              |
| 22   | 645     | 74.8         | PLML, PLMR | No / No                  | 0.0847                        | 0.0890 / 0.0896                              |
| 23   | 5014    | 37.8         | PLML, PLMR | No / No                  | 0.0431                        | 0.0953 / 0.0965                              |
| 24   | 4945    | 69.5         | PLML, PLMR | No / No                  | 0.0941                        | 0.0322 / 0.0421                              |
| 25   | 1543    | 37.0         | PLML, PLMR | No / No                  | 0.0624                        | 0.0714 / 0.0706                              |
| 26   | 4604    | 30.7         | PLML, PLMR | No / No                  | 0.0976                        | 0.0658 / 0.0658                              |
| 27   | 680     | 44.6         | PLML, PLMR | No / No                  | 0.0449                        | 0.0905 / 0.0871                              |
| 28   | 5128    | 24.2         | PLML, PLMR | No / No                  | 0.0701                        | 0.0805 / 0.0801                              |
| 29   | 820     | 83.2         | PLML, PLMR | No / No                  | 0.0686                        | 0.0625 / 0.0641                              |
| 30   | 479     | 57.2         | PLML, PLMR | No / No                  | 0.0504                        | 0.0946 / 0.0970                              |
| 31   | 1720    | 87.5         | PLML, PLMR | No / No                  | 0.0736                        | 0.0649 / 0.0669                              |
| 32   | 2380    | 24.3         | PLML, PLMR | No / No                  | 0.0748                        | 0.0695 / 0.0674                              |
| 33   | 84      | 34.6         | PLML, PLMR | No / No                  | 0.0799                        | 0.0776 / 0.0793                              |
| 34   | 4090    | 35.8         | PLML, PLMR | No / No                  | 0.0572                        | 0.0560 / 0.0582                              |
| 35   | 5808    | 21.2         | PLML, PLMR | No / No                  | 0.0620                        | 0.0689 / 0.0678                              |
| 36   | 5962    | 41.9         | PLML, PLMR | No / No                  | 0.1043                        | 0.0845 / 0.0839                              |
| 37   | 3357    | 76.4         | PLML, PLMR | No / No                  | 0.0658                        | 0.0662 / 0.0621                              |
| 38   | 6407    | 84.3         | PLML, PLMR | No / No                  | 0.0545                        | 0.0961 / 0.0994                              |
| 39   | 2681    | 37.2         | PLML, PLMR | No / No                  | 0.0780                        | 0.0460 / 0.0475                              |
| 40   | 1042    | 41.1         | PLML, PLMR | No / No                  | 0.0815                        | 0.0669 / 0.0764                              |
| 41   | 5497    | 93.2         | PLML, PLMR | No / No                  | 0.0546                        | 0.0815 / 0.0801                              |
| 42   | 5168    | 36.7         | PLML, PLMR | No / No                  | 0.0590                        | 0.0817 / 0.0809                              |
| 43   | 4786    | 44.6         | PLML, PLMR | No / No                  | 0.0860                        | 0.0318 / 0.0356                              |
| 44   | 1583    | 22.4         | PLML, PLMR | No / No                  | 0.0930                        | 0.0834 / 0.0918                              |
| 45   | 6352    | 41.7         | PLML, PLMR | No / No                  | 0.0737                        | 0.0647 / 0.0638                              |
| 46   | 4539    | 66.3         | PLML, PLMR | No / No                  | 0.0736                        | 0.0762 / 0.0781                              |
| 47   | 5607    | 67.0         | PLML, PLMR | No / No                  | 0.0590                        | 0.0672 / 0.0662                              |
| 48   | 172     | 21.7         | PLML, PLMR | No / No                  | 0.1000                        | 0.0453 / 0.0416                              |
| 49   | 5252    | 32.9         | PLML, PLMR | No / No                  | 0.0522                        | 0.0596 / 0.0421                              |
| 50   | 639     | 66.1         | PLML, PLMR | No / No                  | 0.0373                        | 0.0623 / 0.0630                              |

<!-- /harness:checkpoint-3 -->

<!-- harness:checkpoint-4 -->

### Checkpoint 4: chemotaxis — **Fail**

Run on 2026-10-02 at `3fb389f`: 100 worms, seeds 1 to 100, each alone for up to 60 min in the butanone spot's steady field, its centroid starting at the dish's centre, 45 mm from each spot, and stopped when any part of its body came within 5 mm of a spot's centre; and each again as its control, with AWC-ON's input off, the world sensing no odour; on track S's model, its measured signs, the D-types' offset and its rectifier, in the conductance form, with the calibrated parameters (PLAN §7.3), here to three significant figures: g_osc = 838 pS, g_osc,B = 0 pS, τ_w = 1.23 s, θ_osc = −14.9 mV, g_sw = 50 nS, g_p = 0.0157 nS per unit of κL, κ_gap,B = 0.156, g_nmj = 40 per unit of relative drive, θ_nmj = −0.0994 relative drive, κ_SMD = 0.169, σ_n = 0.0565 pA·√s, τ_n = 0.0551 s. Every run stayed finite, and no brain solve failed to converge.

| Clause                                                                              | Measured                                                                                                                                    | Pass        | Partial     |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------- |
| Chemotaxis index, (at odour − at control) / every worm                              | 0.04: 18 at the odour, 14 at the control, 68 neither                                                                                        | ≥ 0.6       | 0.2 to 0.6  |
| Above the control (Fisher's exact test, one-sided, on the worms reaching the odour) | 18 intact worms reached the odour, against 17 controls (the controls' index 0.03: 17 at the odour, 14 at the control, 69 neither); p = 0.50 | Significant | Significant |

Every clause is predicted, since checkpoint 4 is held out of the calibration (spec §1.2).

The mechanism, reported and never gating (PLAN §7.4; DECISIONS.md, 2026-10-02): each statistic over every worm with its 80% interval over 1,000 resamples of the worms, the control's, and the intact-minus-control difference over paired resamples. Klinokinesis is the ratio of reorientation rates heading down the gradient to up it, its null 1; weathervaning is the slope of the curving rate (rad/mm) against the bearing (rad), over transitions between 3.3 s blocks with no reorientation or backward sample, strides under a quarter of the median left out, its null 0. Each is reproduced when its interval clears its null above it and the difference's lies above 0, partial with one of those. Over the intact runs there were 2,123 reorientations, 2,123 reversals and 0 omega turns, of which klinokinesis attributes 1,850 to a side: the others began where dC/dt over the 3.3 s before was exactly zero, as it reads where the field is flat, and count on neither.

| Mechanism     | Intact (80% interval)     | Control | Intact − control (80% interval) | Clears its null | Above the control | Grade          |
| ------------- | ------------------------- | ------- | ------------------------------- | --------------- | ----------------- | -------------- |
| Klinokinesis  | 0.87 (0.60 to 1.31)       | 1.09    | −0.22 (−0.95 to 0.41)           | No              | No                | **Absent**     |
| Weathervaning | 0.0038 (0.0016 to 0.0061) | 0.0004  | 0.0033 (0.0002 to 0.0067)       | Yes             | Yes               | **Reproduced** |

Reported beside them: klinokinesis's companion, the ratio of the mean absolute change in heading from one block to the next, down the gradient over up it, 1.00 (0.97 to 1.03) intact and 0.99 in the controls; weathervaning's slope over every transition, reorientations included, the floor kept, 0.0341 (0.0205 to 0.0461) intact and 0.0262 in the controls; its slope over the clean transitions with no floor, 0.0147 (−0.0151 to 0.0429) intact and −0.0127 in the controls. The klinokinesis row counts reversals as reorientations, so on track S's fit it is reported as fitted (PLAN §10; DECISIONS.md, 2026-10-01); weathervaning reads reversals only to leave their blocks out, and isn't marked. Previewed outside the protocol (PLAN §10): an investigation on 2026-09-29, on another fit, the second round's probe crawler, pointed to checkpoint 4 failing, the worm circling and AWC-ON's drive changing its speed by at most 0.6% (DECISIONS.md, 2026-09-29).

| Seed | AWC-ON | Intact: reached         | Control: reached        | Nearest the odour spot, intact / control (mm) |
| ---- | ------ | ----------------------- | ----------------------- | --------------------------------------------- |
| 1    | AWCL   | The control at 42.1 min | Neither                 | 44.80 / 29.24                                 |
| 2    | AWCL   | The odour at 36.3 min   | The control at 15.1 min | 5.00 / 44.57                                  |
| 3    | AWCR   | Neither                 | Neither                 | 44.29 / 17.41                                 |
| 4    | AWCR   | The odour at 53.9 min   | The odour at 50.1 min   | 5.00 / 5.00                                   |
| 5    | AWCR   | The odour at 16.3 min   | Neither                 | 5.00 / 9.99                                   |
| 6    | AWCR   | Neither                 | Neither                 | 27.81 / 34.66                                 |
| 7    | AWCL   | Neither                 | Neither                 | 34.25 / 7.20                                  |
| 8    | AWCL   | Neither                 | The control at 22.6 min | 34.78 / 44.60                                 |
| 9    | AWCR   | Neither                 | The control at 24.1 min | 21.24 / 36.74                                 |
| 10   | AWCL   | Neither                 | The control at 50.5 min | 44.61 / 26.61                                 |
| 11   | AWCL   | Neither                 | Neither                 | 14.58 / 23.76                                 |
| 12   | AWCL   | Neither                 | Neither                 | 28.54 / 17.28                                 |
| 13   | AWCL   | The control at 18.2 min | The control at 25.3 min | 44.75 / 44.75                                 |
| 14   | AWCR   | Neither                 | The control at 27.8 min | 15.46 / 44.70                                 |
| 15   | AWCL   | The control at 31.6 min | Neither                 | 44.70 / 44.70                                 |
| 16   | AWCR   | Neither                 | The control at 38.4 min | 5.09 / 44.78                                  |
| 17   | AWCL   | Neither                 | Neither                 | 13.58 / 13.95                                 |
| 18   | AWCL   | Neither                 | Neither                 | 27.77 / 9.14                                  |
| 19   | AWCL   | Neither                 | The control at 38.1 min | 23.11 / 36.06                                 |
| 20   | AWCR   | Neither                 | The control at 20.5 min | 33.99 / 44.63                                 |
| 21   | AWCL   | The odour at 38.9 min   | Neither                 | 5.00 / 19.90                                  |
| 22   | AWCL   | Neither                 | Neither                 | 25.51 / 30.27                                 |
| 23   | AWCR   | The odour at 18.3 min   | The odour at 10.7 min   | 5.00 / 5.00                                   |
| 24   | AWCL   | Neither                 | Neither                 | 44.90 / 5.04                                  |
| 25   | AWCR   | Neither                 | Neither                 | 44.38 / 44.57                                 |
| 26   | AWCR   | The odour at 25.0 min   | Neither                 | 5.00 / 27.40                                  |
| 27   | AWCR   | The control at 20.6 min | Neither                 | 44.88 / 32.62                                 |
| 28   | AWCR   | The control at 28.9 min | Neither                 | 44.84 / 44.84                                 |
| 29   | AWCL   | Neither                 | Neither                 | 10.45 / 15.20                                 |
| 30   | AWCL   | Neither                 | Neither                 | 17.63 / 23.03                                 |
| 31   | AWCL   | The odour at 56.1 min   | Neither                 | 5.00 / 36.63                                  |
| 32   | AWCR   | Neither                 | Neither                 | 21.86 / 42.44                                 |
| 33   | AWCL   | The odour at 18.7 min   | Neither                 | 5.00 / 7.38                                   |
| 34   | AWCR   | Neither                 | Neither                 | 29.29 / 44.57                                 |
| 35   | AWCL   | The control at 31.8 min | Neither                 | 44.57 / 25.70                                 |
| 36   | AWCL   | Neither                 | Neither                 | 10.45 / 17.86                                 |
| 37   | AWCL   | The odour at 53.0 min   | Neither                 | 5.00 / 43.94                                  |
| 38   | AWCR   | Neither                 | The odour at 13.3 min   | 5.67 / 5.00                                   |
| 39   | AWCL   | The odour at 47.4 min   | Neither                 | 5.00 / 14.75                                  |
| 40   | AWCL   | Neither                 | Neither                 | 22.62 / 12.36                                 |
| 41   | AWCR   | The odour at 33.8 min   | Neither                 | 5.00 / 34.53                                  |
| 42   | AWCL   | Neither                 | Neither                 | 21.18 / 28.44                                 |
| 43   | AWCR   | Neither                 | Neither                 | 44.88 / 44.88                                 |
| 44   | AWCR   | Neither                 | Neither                 | 14.75 / 12.16                                 |
| 45   | AWCR   | The control at 50.5 min | Neither                 | 44.54 / 23.78                                 |
| 46   | AWCL   | Neither                 | The odour at 56.9 min   | 35.10 / 5.00                                  |
| 47   | AWCR   | The control at 33.9 min | The odour at 54.7 min   | 44.83 / 5.00                                  |
| 48   | AWCR   | The odour at 41.8 min   | Neither                 | 5.00 / 19.90                                  |
| 49   | AWCR   | Neither                 | Neither                 | 11.06 / 43.24                                 |
| 50   | AWCL   | Neither                 | The odour at 46.7 min   | 43.17 / 5.00                                  |
| 51   | AWCL   | The control at 25.1 min | Neither                 | 25.89 / 15.48                                 |
| 52   | AWCR   | Neither                 | Neither                 | 12.79 / 14.27                                 |
| 53   | AWCR   | Neither                 | Neither                 | 6.79 / 26.16                                  |
| 54   | AWCL   | Neither                 | Neither                 | 22.09 / 27.49                                 |
| 55   | AWCL   | Neither                 | Neither                 | 18.76 / 28.41                                 |
| 56   | AWCL   | Neither                 | Neither                 | 27.68 / 23.34                                 |
| 57   | AWCL   | The control at 43.9 min | Neither                 | 44.69 / 44.69                                 |
| 58   | AWCL   | Neither                 | Neither                 | 18.45 / 37.65                                 |
| 59   | AWCR   | Neither                 | Neither                 | 30.93 / 23.96                                 |
| 60   | AWCR   | Neither                 | Neither                 | 41.88 / 15.43                                 |
| 61   | AWCR   | Neither                 | Neither                 | 11.38 / 13.16                                 |
| 62   | AWCR   | The control at 13.6 min | Neither                 | 44.88 / 20.93                                 |
| 63   | AWCL   | Neither                 | The odour at 27.7 min   | 44.55 / 5.00                                  |
| 64   | AWCL   | Neither                 | The odour at 32.7 min   | 13.57 / 5.00                                  |
| 65   | AWCL   | The control at 21.9 min | The odour at 21.9 min   | 44.50 / 5.00                                  |
| 66   | AWCL   | Neither                 | Neither                 | 17.55 / 32.26                                 |
| 67   | AWCL   | Neither                 | The odour at 19.8 min   | 44.51 / 5.00                                  |
| 68   | AWCR   | The odour at 21.0 min   | Neither                 | 5.00 / 24.12                                  |
| 69   | AWCR   | Neither                 | Neither                 | 36.84 / 29.37                                 |
| 70   | AWCL   | Neither                 | The control at 34.3 min | 40.55 / 44.73                                 |
| 71   | AWCL   | Neither                 | Neither                 | 19.94 / 14.18                                 |
| 72   | AWCL   | Neither                 | The odour at 30.3 min   | 38.03 / 5.00                                  |
| 73   | AWCR   | Neither                 | Neither                 | 28.24 / 36.44                                 |
| 74   | AWCL   | Neither                 | Neither                 | 33.92 / 41.96                                 |
| 75   | AWCL   | Neither                 | Neither                 | 13.05 / 16.92                                 |
| 76   | AWCR   | The control at 52.9 min | The control at 34.4 min | 44.75 / 44.75                                 |
| 77   | AWCR   | The odour at 42.7 min   | Neither                 | 5.00 / 19.33                                  |
| 78   | AWCR   | The odour at 54.4 min   | Neither                 | 5.00 / 29.37                                  |
| 79   | AWCR   | Neither                 | Neither                 | 11.05 / 27.90                                 |
| 80   | AWCR   | Neither                 | Neither                 | 44.55 / 44.55                                 |
| 81   | AWCL   | Neither                 | The control at 25.3 min | 21.36 / 37.54                                 |
| 82   | AWCL   | Neither                 | Neither                 | 44.67 / 44.67                                 |
| 83   | AWCR   | Neither                 | The control at 53.7 min | 28.23 / 28.83                                 |
| 84   | AWCR   | Neither                 | The odour at 54.5 min   | 36.63 / 5.00                                  |
| 85   | AWCR   | Neither                 | Neither                 | 16.57 / 31.67                                 |
| 86   | AWCL   | Neither                 | The odour at 17.2 min   | 35.38 / 5.00                                  |
| 87   | AWCL   | The odour at 26.3 min   | Neither                 | 5.00 / 27.97                                  |
| 88   | AWCR   | Neither                 | Neither                 | 16.34 / 13.66                                 |
| 89   | AWCL   | Neither                 | Neither                 | 11.50 / 8.53                                  |
| 90   | AWCR   | Neither                 | Neither                 | 41.63 / 44.88                                 |
| 91   | AWCR   | Neither                 | Neither                 | 17.01 / 30.72                                 |
| 92   | AWCR   | Neither                 | The odour at 49.2 min   | 7.96 / 5.00                                   |
| 93   | AWCL   | Neither                 | Neither                 | 27.64 / 26.06                                 |
| 94   | AWCL   | The control at 40.2 min | The odour at 20.3 min   | 44.59 / 5.00                                  |
| 95   | AWCL   | Neither                 | Neither                 | 21.52 / 16.04                                 |
| 96   | AWCR   | Neither                 | The odour at 25.9 min   | 30.18 / 5.00                                  |
| 97   | AWCR   | The odour at 56.2 min   | Neither                 | 5.00 / 21.83                                  |
| 98   | AWCL   | The odour at 41.3 min   | The control at 26.5 min | 5.00 / 44.62                                  |
| 99   | AWCR   | Neither                 | Neither                 | 22.03 / 5.63                                  |
| 100  | AWCL   | Neither                 | The odour at 16.0 min   | 34.71 / 5.00                                  |

<!-- /harness:checkpoint-4 -->

<!-- harness:checkpoint-5 -->

### Checkpoint 5: lesions — **Fail**, reported as fitted

Run on 2026-10-02 at `aba1617`: for each lesion and the intact worm, 30 trials of 120 s, seeds 1 to 30, every arm on the same seeds, postures and noise, measured after each trial's first 10 s; and checkpoints 2 and 3's touch trials for the intact worm and for the lesions whose rows read touches, AVA + AVD and PVC; on track S's model, its measured signs, the D-types' offset and its rectifier, in the conductance form, with the calibrated parameters (PLAN §7.3), here to three significant figures: g_osc = 838 pS, g_osc,B = 0 pS, τ_w = 1.23 s, θ_osc = −14.9 mV, g_sw = 50 nS, g_p = 0.0157 nS per unit of κL, κ_gap,B = 0.156, g_nmj = 40 per unit of relative drive, θ_nmj = −0.0994 relative drive, κ_SMD = 0.169, σ_n = 0.0565 pA·√s, τ_n = 0.0551 s. Every spontaneous trial stayed finite; no brain solve failed to converge in them or in the touch runs' graded touches.

0 of the five primary rows pass; the checkpoint needs all five to pass, and three or four to be partial (PLAN §7.4). A row needs every clause, and a clause the effect and the test: its pooled measure moves the way it asks by the amount it names, and its test, two-sided at α = 0.05, is significant the reported way. A fall, or PVC's "stays", needs a measured, positive intact measure, checkpoint 3's response at least its 1% floor; RIM's rise counts from zero (DECISIONS.md, 2026-10-02).

| Lesion             | Clause                                                         | Intact | Lesioned | Asks                           | Test                        | Result                                                                   |
| ------------------ | -------------------------------------------------------------- | ------ | -------- | ------------------------------ | --------------------------- | ------------------------------------------------------------------------ |
| AVA + AVD (fitted) | Touch-evoked reversals (checkpoint 2's response)               | 0.00   | 0.00     | falls by 80% or more           | —                           | Unmeasured: the intact response is zero                                  |
|                    | Spontaneous reversals a minute                                 | 0.00   | 0.09     | falls by 30% or more           | —                           | Unmeasured: the intact measure is zero                                   |
| AVB + PVC          | Forward speed, mean velocity towards the head (body lengths/s) | 0.0683 | 0.0193   | falls by 80% or more           | p < 0.001, the reported way | **Fail**                                                                 |
| PVC                | The posterior touch's speed-up (checkpoint 3's response)       | −0.3%  | −2.1%    | falls by 80% or more           | —                           | Unmeasured: the intact response, −0.3%, is under checkpoint 3's 1% floor |
|                    | Touch-evoked reversals (checkpoint 2's response) stay (fitted) | 0.00   | 0.00     | stays at 70% of intact or more | —                           | Unmeasured: the intact response is zero                                  |
| AVA (fitted)       | Long reversals a minute                                        | 0.00   | 0.00     | falls by 80% or more           | —                           | Unmeasured: the intact measure is zero                                   |
|                    | Spontaneous reversals a minute                                 | 0.00   | 0.02     | falls by 30% or more           | —                           | Unmeasured: the intact measure is zero                                   |
| RIM (fitted)       | Short reversals a minute                                       | 0.00   | 0.00     | rises                          | p = 1.0                     | **Fail**                                                                 |

Every clause would be predicted, since checkpoint 5 is held out of the calibration (spec §1.2), but those that read reversals, AVA + AVD's, AVA's, RIM's and PVC's on checkpoint 2, are reported as fitted, and so is the checkpoint's grade: track S, whose fit this is, was proposed after the previews below (PLAN §10; DECISIONS.md, 2026-10-01). Reported beside AVB + PVC's row, not graded: checkpoint 1's speed over forward bouts of 10 s or more, pooled as checkpoint 1 pools it, in body lengths per second: 0.0685 intact, over the 30 trials with a bout, and 0.0357 lesioned, over the 18 trials with a bout. The row reads the mean velocity, set knowing the preview below (DECISIONS.md, 2026-10-02). Previewed outside the protocol (PLAN §10): AVB + PVC's row by the chosen pick's diagnostics with AVBL and AVBR lesioned, its mean velocity falling 91% (DECISIONS.md, 2026-10-02), by round 3's pick 1's, and by the investigation of 2026-09-29 on the probe crawler's corner; and the checkpoint by that investigation, which pointed to checkpoint 5 passing at most one row, and by the refit's AVA lesion, which raised its reversals from 1.42 to 5.41 a minute (DECISIONS.md, 2026-09-28 and 2026-09-29).

Every primary lesion's spontaneous measures, reported beside the rows and not graded, whichever its rows read: each measure pooled over its trials, beside the intact worm's, with Mann–Whitney's two-sided p.

| Lesion    | Measure                                         | Intact | Lesioned | p          |
| --------- | ----------------------------------------------- | ------ | -------- | ---------- |
| AVA + AVD | Spontaneous reversals a minute                  | 0.00   | 0.09     | p = 0.040  |
|           | Short reversals a minute                        | 0.00   | 0.09     | p = 0.040  |
|           | Long reversals a minute                         | 0.00   | 0.00     | p = 1.0    |
|           | Mean velocity towards the head (body lengths/s) | 0.0683 | 0.0177   | p < 0.001  |
| AVB + PVC | Spontaneous reversals a minute                  | 0.00   | 0.27     | p = 0.0027 |
|           | Short reversals a minute                        | 0.00   | 0.27     | p = 0.0027 |
|           | Long reversals a minute                         | 0.00   | 0.00     | p = 1.0    |
|           | Mean velocity towards the head (body lengths/s) | 0.0683 | 0.0193   | p < 0.001  |
| PVC       | Spontaneous reversals a minute                  | 0.00   | 0.00     | p = 1.0    |
|           | Short reversals a minute                        | 0.00   | 0.00     | p = 1.0    |
|           | Long reversals a minute                         | 0.00   | 0.00     | p = 1.0    |
|           | Mean velocity towards the head (body lengths/s) | 0.0683 | 0.0585   | p < 0.001  |
| AVA       | Spontaneous reversals a minute                  | 0.00   | 0.02     | p = 0.32   |
|           | Short reversals a minute                        | 0.00   | 0.02     | p = 0.32   |
|           | Long reversals a minute                         | 0.00   | 0.00     | p = 1.0    |
|           | Mean velocity towards the head (body lengths/s) | 0.0683 | 0.0244   | p < 0.001  |
| RIM       | Spontaneous reversals a minute                  | 0.00   | 0.00     | p = 1.0    |
|           | Short reversals a minute                        | 0.00   | 0.00     | p = 1.0    |
|           | Long reversals a minute                         | 0.00   | 0.00     | p = 1.0    |
|           | Mean velocity towards the head (body lengths/s) | 0.0683 | 0.0625   | p < 0.001  |

The secondary lesions, reported and not graded, since Gray et al. describe their effects through time off food, which depends on neuromodulation the model lacks (PLAN §7.4), in the same way.

| Lesion | Measure                                         | Intact | Lesioned | p         |
| ------ | ----------------------------------------------- | ------ | -------- | --------- |
| AIB    | Spontaneous reversals a minute                  | 0.00   | 0.00     | p = 1.0   |
|        | Short reversals a minute                        | 0.00   | 0.00     | p = 1.0   |
|        | Long reversals a minute                         | 0.00   | 0.00     | p = 1.0   |
|        | Mean velocity towards the head (body lengths/s) | 0.0683 | 0.0677   | p = 0.22  |
| AIY    | Spontaneous reversals a minute                  | 0.00   | 0.00     | p = 1.0   |
|        | Short reversals a minute                        | 0.00   | 0.00     | p = 1.0   |
|        | Long reversals a minute                         | 0.00   | 0.00     | p = 1.0   |
|        | Mean velocity towards the head (body lengths/s) | 0.0683 | 0.0742   | p < 0.001 |
| AIZ    | Spontaneous reversals a minute                  | 0.00   | 0.00     | p = 1.0   |
|        | Short reversals a minute                        | 0.00   | 0.00     | p = 1.0   |
|        | Long reversals a minute                         | 0.00   | 0.00     | p = 1.0   |
|        | Mean velocity towards the head (body lengths/s) | 0.0683 | 0.0452   | p < 0.001 |

<!-- /harness:checkpoint-5 -->

<!-- harness:checkpoint-6 -->

### Checkpoint 6: the wiring test — its verdict where the real wiring doesn't pass changed after results

Each of the primary null's ten rewirings was tuned by track S's procedure in the box its own rest gives by the rules that set S's, its fit its first pick, and graded on the machine its search ran on (Intel(R) Core(TM) i9-9900X CPU @ 3.50GHz, Node v26.7.0), at `1190b3e`; the real wiring, at the registry's values, track S's first pick, on Apple M5 Max, Node v26.7.0 at `4db8422` (DECISIONS.md, 2026-10-03). A wiring crawls if checkpoint 1 grades it at least partial on seeds 1 to 20; a crawling wiring runs checkpoint 0, reported and not counted, and checkpoints 2 to 5 by their own protocols.

| Question                                | Verdict                                                            | Counts                                                       |
| --------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Crawling: checkpoint 1 at least partial | No evidence that the wiring matters                                | 9 of 10 nulls crawl; the real wiring is partial              |
| Checkpoint 2, among the crawling nulls  | No evidence that the wiring matters (the real wiring doesn't pass) | the real wiring: fail; 0 of 9 crawling nulls pass, 0 partial |
| Checkpoint 3, among the crawling nulls  | No evidence that the wiring matters (the real wiring doesn't pass) | the real wiring: fail; 0 of 9 crawling nulls pass, 1 partial |
| Checkpoint 4, among the crawling nulls  | No evidence that the wiring matters (the real wiring doesn't pass) | the real wiring: fail; 0 of 9 crawling nulls pass, 0 partial |
| Checkpoint 5, among the crawling nulls  | No evidence that the wiring matters (the real wiring doesn't pass) | the real wiring: fail; 0 of 9 crawling nulls pass, 0 partial |

PLAN §7.4's verdict map. Crawling: the wiring matters if the real wiring crawls and at most 2 of the 10 nulls do, there is no evidence that it does if 5 or more crawl, and it is inconclusive otherwise. Each of checkpoints 2 to 5, among the crawling nulls: with fewer than 5 of them, "insufficient nulls"; otherwise the wiring matters if the real wiring passes and at most 20% of them pass, there is no evidence that it does if 50% or more pass, and it is inconclusive between. **Changed after results** (DECISIONS.md, 2026-10-03): where the real wiring doesn't pass, a partial included, the verdict is "no evidence that the wiring matters (the real wiring doesn't pass)", where the map as written reads "inconclusive" unless half the crawling nulls pass, set by the maintainer knowing that the real wiring fails checkpoints 2 to 5. A null passes a checkpoint if it grades pass; partials are counted beside it.

Each wiring's search: its box's tops for g_sw (nS) and g_p (nS per unit of κL) and θ_osc's floor (mV); its picks' objectives on their final checks, the first its fit; the candidates its search couldn't run; and its fit's parameters at a bound of its box.

| Wiring          | Box: g_sw · g_p · θ_osc | Picks                      | Failed | On a bound                                                                                                                   |
| --------------- | ----------------------- | -------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| The real wiring | 50 · 7 · −28            | 0.438, 0.654, 0.759, 0.937 | 0      | oscillatorExcitabilityB, headSwitchGain, neuromuscularGain                                                                   |
| Rewiring 1      | 50 · 6 · −26            | 0.194, 0.200, 0.843, 0.867 | 0      | oscillatorExcitabilityB, headSwitchGain, neuromuscularGain, noiseIntensity                                                   |
| Rewiring 2      | 50 · 7 · −25            | 0.172, 0.493, 0.643, 0.732 | 0      | oscillatorExcitability, oscillatorExcitabilityB, headSwitchGain, neuromuscularGain                                           |
| Rewiring 3      | 50 · 7 · −25            | 0.138, 0.279, 0.843, 1.081 | 0      | oscillatorExcitabilityB, gapGainB                                                                                            |
| Rewiring 4      | 40 · 7 · −24            | 0.139, 0.179, 0.493, 0.660 | 0      | oscillatorExcitability, oscillatorExcitabilityB, neuromuscularGain, noiseCorrelation                                         |
| Rewiring 5      | 40 · 6 · −25            | 0.106, 0.156, 0.216, 0.887 | 0      | oscillatorExcitability, oscillatorExcitabilityB, neuromuscularGain, noiseCorrelation                                         |
| Rewiring 6      | 50 · 8 · −25            | 0.664, 0.812, 0.814, 0.891 | 0      | oscillatorRecoveryTime, headSwitchGain, neuromuscularGain, noiseCorrelation                                                  |
| Rewiring 7      | 60 · 7 · −27            | 0.229, 0.438, 0.668, 0.810 | 0      | oscillatorExcitability, oscillatorExcitabilityB, oscillatorDriveThreshold, headSwitchGain, neuromuscularGain, noiseIntensity |
| Rewiring 8      | 40 · 9 · −22            | 0.506, 0.760, 0.765, 0.814 | 0      | oscillatorExcitabilityB, oscillatorDriveThreshold, noiseCorrelation                                                          |
| Rewiring 9      | 40 · 7 · −26            | 0.251, 0.334, 0.405, 0.883 | 0      | oscillatorExcitabilityB, oscillatorDriveThreshold, gapGainB, neuromuscularGain, smdGain                                      |
| Rewiring 10     | 50 · 8 · −25            | 0.106, 0.208, 0.719, 0.726 | 0      | oscillatorExcitability, oscillatorExcitabilityB, headSwitchGain, neuromuscularGain                                           |

Each wiring's grades: checkpoint 1, a partial whose speed's interval reaches below 0.06 labelled at the speed floor, its speed with its 95% interval (body lengths per second), and its head switch's gate open on what share of the measured steps, its drive less θ_osc and its cycle rate; the widest neuron's voltage spread at its fitted noise, by §7.3's linear analysis at its own rest, every synapse's activation and rectified gate held there and the oscillators left out; and, if it crawls, checkpoint 0, reported and not counted, and checkpoints 2 to 5.

| Wiring          | Checkpoint 1 | Speed               | Gate · drive · cycle      | Widest spread  | 0        | 2        | 3           | 4        | 5        |
| --------------- | ------------ | ------------------- | ------------------------- | -------------- | -------- | -------- | ----------- | -------- | -------- |
| The real wiring | **Partial**  | 0.068 (0.067–0.069) | 100% · 13.6 mV · 0.214 Hz | IL2DL, 3.94 mV | **Pass** | **Fail** | **Fail**    | **Fail** | **Fail** |
| Rewiring 1      | **Partial**  | 0.097 (0.095–0.098) | 100% · 8.8 mV · 0.223 Hz  | VA8, 9.57 mV   | **Pass** | **Fail** | **Fail**    | **Fail** | **Fail** |
| Rewiring 2      | **Partial**  | 0.099 (0.098–0.100) | 100% · 14.7 mV · 0.247 Hz | IL2DL, 6.69 mV | **Pass** | **Fail** | **Fail**    | **Fail** | **Fail** |
| Rewiring 3      | **Partial**  | 0.101 (0.100–0.102) | 100% · 17.7 mV · 0.288 Hz | IL2DL, 7.59 mV | **Pass** | **Fail** | **Fail**    | **Fail** | **Fail** |
| Rewiring 4      | **Partial**  | 0.106 (0.106–0.106) | 100% · 22.0 mV · 0.243 Hz | IL2DL, 0.94 mV | **Pass** | **Fail** | **Fail**    | **Fail** | **Fail** |
| Rewiring 5      | **Partial**  | 0.110 (0.109–0.111) | 100% · 17.7 mV · 0.248 Hz | IL2DL, 6.74 mV | **Pass** | **Fail** | **Fail**    | **Fail** | **Fail** |
| Rewiring 6      | **Fail**     | 0.041 (0.040–0.042) | 100% · 2.2 mV · 0.143 Hz  | AS9, 4.09 mV   | —        | —        | —           | —        | —        |
| Rewiring 7      | **Partial**  | 0.093 (0.093–0.093) | 100% · 25.3 mV · 0.227 Hz | ADAL, 0.00 mV  | **Pass** | **Fail** | **Fail**    | **Fail** | **Fail** |
| Rewiring 8      | **Partial**  | 0.069 (0.069–0.069) | 100% · 20.9 mV · 0.183 Hz | IL2DL, 0.23 mV | **Pass** | **Fail** | **Fail**    | **Fail** | **Fail** |
| Rewiring 9      | **Partial**  | 0.084 (0.083–0.085) | 100% · 24.1 mV · 0.227 Hz | IL2DL, 7.27 mV | **Pass** | **Fail** | **Partial** | **Fail** | **Fail** |
| Rewiring 10     | **Partial**  | 0.102 (0.102–0.103) | 100% · 8.0 mV · 0.288 Hz  | IL2DL, 6.90 mV | **Pass** | **Fail** | **Fail**    | **Fail** | **Fail** |

What paces each crawl (PLAN §7.4): checkpoint 1's trials again with the head switch off and at its box's lower bound, and with classes lesioned, each graded by checkpoint 1's grading, with its share of samples forward and its mean velocity.

| Wiring          | The head switch off, g_sw at 0 | g_sw at its lower bound      | The 18 B-types lesioned      | The 21 A-types lesioned       | AVBL and AVBR lesioned           |
| --------------- | ------------------------------ | ---------------------------- | ---------------------------- | ----------------------------- | -------------------------------- |
| The real wiring | **Fail**, 0% forward, −0.001   | **Fail**, 0% forward, −0.001 | **Fail**, 63% forward, 0.013 | **Fail**, 73% forward, 0.020  | **Fail**, 30% forward, 0.006     |
| Rewiring 1      | **Fail**, 0% forward, −0.001   | **Fail**, 0% forward, −0.001 | **Fail**, 40% forward, 0.004 | **Fail**, 100% forward, 0.038 | **Partial**, 98% forward, 0.083  |
| Rewiring 2      | **Fail**, 0% forward, −0.001   | **Fail**, 0% forward, −0.001 | **Fail**, 62% forward, 0.013 | **Fail**, 17% forward, 0.008  | **Partial**, 100% forward, 0.091 |
| Rewiring 3      | **Fail**, 0% forward, −0.001   | **Fail**, 0% forward, −0.001 | **Fail**, 44% forward, 0.009 | **Fail**, 93% forward, 0.033  | **Partial**, 100% forward, 0.092 |
| Rewiring 4      | **Fail**, 0% forward, −0.001   | **Fail**, 0% forward, −0.001 | **Fail**, 49% forward, 0.008 | **Fail**, 100% forward, 0.036 | **Partial**, 100% forward, 0.113 |
| Rewiring 5      | **Fail**, 0% forward, −0.001   | **Fail**, 0% forward, −0.001 | **Fail**, 38% forward, 0.007 | **Fail**, 100% forward, 0.038 | **Partial**, 100% forward, 0.111 |
| Rewiring 6      | **Fail**, 10% forward, 0.001   | **Fail**, 10% forward, 0.000 | **Fail**, 45% forward, 0.010 | **Fail**, 88% forward, 0.025  | **Fail**, 79% forward, 0.028     |
| Rewiring 7      | **Fail**, 0% forward, −0.001   | **Fail**, 0% forward, −0.001 | **Fail**, 50% forward, 0.008 | **Fail**, 28% forward, 0.012  | **Partial**, 100% forward, 0.100 |
| Rewiring 8      | **Fail**, 0% forward, −0.001   | **Fail**, 0% forward, −0.001 | **Fail**, 58% forward, 0.014 | **Fail**, 49% forward, 0.016  | **Partial**, 100% forward, 0.080 |
| Rewiring 9      | **Fail**, 0% forward, 0.000    | **Fail**, 0% forward, −0.001 | **Fail**, 46% forward, 0.009 | **Fail**, 44% forward, 0.014  | **Partial**, 100% forward, 0.087 |
| Rewiring 10     | **Fail**, 0% forward, −0.001   | **Fail**, 0% forward, −0.001 | **Fail**, 65% forward, 0.014 | **Fail**, 94% forward, 0.032  | **Partial**, 98% forward, 0.076  |

The crawling wirings' mechanism of chemotaxis, reported and never gating, and the rows of checkpoint 5 that pass. Checkpoint 2, checkpoint 4's klinokinesis and checkpoint 5's rows that read reversals are reported as fitted on every wiring, as on the real wiring (PLAN §10).

| Wiring          | Klinokinesis | Weathervaning | Checkpoint 5's rows passing |
| --------------- | ------------ | ------------- | --------------------------- |
| The real wiring | absent       | reproduced    | none                        |
| Rewiring 1      | absent       | partial       | none                        |
| Rewiring 2      | absent       | absent        | avb-pvc                     |
| Rewiring 3      | absent       | absent        | rim                         |
| Rewiring 4      | absent       | absent        | none                        |
| Rewiring 5      | absent       | absent        | none                        |
| Rewiring 7      | absent       | absent        | rim                         |
| Rewiring 8      | absent       | partial       | none                        |
| Rewiring 9      | absent       | reproduced    | none                        |
| Rewiring 10     | absent       | absent        | none                        |

The sister project's hop statistic, reported and never graded (nematode's Logbook 071; DECISIONS.md, 2026-10-01): how many of the 39 A- and B-type motor neurons sit each number of hops from the nearest of the six food sensors nematode feeds, ASEL, ASER, AWCL, AWCR, AWAL, AWAR, walking each chemical synapse from its presynaptic neuron and each gap junction both ways. The real wiring has none one hop from a food sensor, as a path through interneurons and command interneurons implies; the nulls have 8.1 on average (3 to 12). A rewiring here moves only the chemical synapses, as nematode's chemical-only null does, so its gap junctions are the real wiring's.

| Wiring          | 1 hop | 2 hops | 3 hops | Unreached |
| --------------- | ----- | ------ | ------ | --------- |
| The real wiring | 0     | 26     | 13     | 0         |
| Rewiring 1      | 11    | 28     | 0      | 0         |
| Rewiring 2      | 3     | 36     | 0      | 0         |
| Rewiring 3      | 5     | 34     | 0      | 0         |
| Rewiring 4      | 7     | 32     | 0      | 0         |
| Rewiring 5      | 8     | 31     | 0      | 0         |
| Rewiring 6      | 9     | 30     | 0      | 0         |
| Rewiring 7      | 10    | 29     | 0      | 0         |
| Rewiring 8      | 11    | 28     | 0      | 0         |
| Rewiring 9      | 5     | 34     | 0      | 0         |
| Rewiring 10     | 12    | 27     | 0      | 0         |

What the real wiring got and the nulls don't (PLAN §9): track R's parameterisation, and track S's measured signs, the D-types' offset and the rectifier, were designed on the real wiring; round 3's procedure, which S's is, was designed after the survey on it and reuses the survey's starts and final-check seeds; it was explored as no null is, about 9,000 trials in the investigation of 2026-09-29, the survey's sixteen searches, round 3's searches and comparisons, and the assessment after them; and it could have gone down four picks by §7.2's comparison, where each null's fit is its first, though the real wiring's was its first too. Previewed (PLAN §10): scratch nulls on round 3's first and fourth picks' values (DECISIONS.md, 2026-09-30); the ten rewirings untuned on S's values, none partial (data/checkpoint-6/preview.json); and, once, the progress of rewiring 1's first search on the M5 Max, read in a smoke run before the grading was built (DECISIONS.md, 2026-10-03). The secondary null, which rewires the gap junctions too, is deferred, a change after results, to be tuned only if the primary null's verdict finds that the wiring matters (DECISIONS.md, 2026-10-03).

<!-- /harness:checkpoint-6 -->

<!-- harness:equivalence -->

### The step: §7.2's comparison with the noise on

#### R's refit — **Pass**

Run on 2026-09-28 at `f9954de`: 200 trials of 120 s at each step, seeds 1 to 200, at dt = 2.5 ms and dt/2 = 1.25 ms. Each clause's 95% interval for the difference, the value at dt less the value at dt/2, comes from 1,000 resamples of the seeds, and must lie within its margin (PLAN §7.2).

| Clause                           | dt     | dt/2   | Difference | 95% interval       | Margin  | Result   |
| -------------------------------- | ------ | ------ | ---------- | ------------------ | ------- | -------- |
| Frequency (Hz)                   | 0.0995 | 0.0995 | +0.0001    | −0.0002 to +0.0003 | ±0.0030 | **Pass** |
| Wavelength (body lengths)        | 0.7029 | 0.7048 | −0.0020    | −0.0043 to +0.0004 | ±0.0211 | **Pass** |
| Speed (body lengths/s)           | 0.0288 | 0.0288 | 0.0000     | −0.0001 to +0.0001 | ±0.0009 | **Pass** |
| Share of trials with a 20 s bout | 0.000  | 0.000  | 0.000      | 0.000 to 0.000     | ±0.100  | **Pass** |
| Reversals a minute               | 1.514  | 1.585  | −0.071     | −0.219 to +0.074   | ±0.300  | **Pass** |

Checkpoint 1's grade over these trials, reported and not compared: **Fail** at dt and **Fail** at dt/2. Solves that didn't converge: 0 at dt and 0 at dt/2. Every trial stayed within the finite numbers.

#### R's second round's fit — **Fail**

Run on 2026-09-28 at `6f52402`: 200 trials of 120 s at each step, seeds 1 to 200, at dt = 2.5 ms and dt/2 = 1.25 ms. Each clause's 95% interval for the difference, the value at dt less the value at dt/2, comes from 1,000 resamples of the seeds, and must lie within its margin (PLAN §7.2).

| Clause                           | dt     | dt/2   | Difference | 95% interval       | Margin  | Result   |
| -------------------------------- | ------ | ------ | ---------- | ------------------ | ------- | -------- |
| Frequency (Hz)                   | 0.1567 | 0.1741 | −0.0174    | −0.0329 to −0.0024 | ±0.0052 | **Fail** |
| Wavelength (body lengths)        | 0.6659 | 0.5942 | +0.0716    | +0.0161 to +0.1322 | ±0.0178 | **Fail** |
| Speed (body lengths/s)           | 0.0356 | 0.0356 | 0.0000     | −0.0003 to +0.0003 | ±0.0011 | **Pass** |
| Share of trials with a 20 s bout | 0.000  | 0.000  | 0.000      | 0.000 to 0.000     | ±0.100  | **Pass** |
| Reversals a minute               | 4.579  | 4.623  | −0.044     | −0.115 to +0.027   | ±0.300  | **Pass** |

Checkpoint 1's grade over these trials, reported and not compared: **Fail** at dt and **Fail** at dt/2. Solves that didn't converge: 0 at dt and 0 at dt/2. Every trial stayed within the finite numbers.

#### The planned model's fit — **Fail**

Run on 2026-09-28 at `eb76387`: 200 trials of 120 s at each step, seeds 1 to 200, at dt = 2.5 ms and dt/2 = 1.25 ms. Each clause's 95% interval for the difference, the value at dt less the value at dt/2, comes from 1,000 resamples of the seeds, and must lie within its margin (PLAN §7.2).

| Clause                           | dt     | dt/2   | Difference | 95% interval       | Margin  | Result   |
| -------------------------------- | ------ | ------ | ---------- | ------------------ | ------- | -------- |
| Frequency (Hz)                   | 0.1982 | 0.2552 | −0.0570    | −0.0971 to −0.0251 | ±0.0077 | **Fail** |
| Wavelength (body lengths)        | 0.5548 | 0.4057 | +0.1492    | +0.0824 to +0.2177 | ±0.0122 | **Fail** |
| Speed (body lengths/s)           | 0.0313 | 0.0302 | +0.0011    | +0.0003 to +0.0020 | ±0.0009 | **Fail** |
| Share of trials with a 20 s bout | 0.000  | 0.000  | 0.000      | 0.000 to 0.000     | ±0.100  | **Pass** |
| Reversals a minute               | 1.708  | 4.484  | −2.776     | −2.877 to −2.672   | ±0.300  | **Fail** |

Checkpoint 1's grade over these trials, reported and not compared: **Fail** at dt and **Fail** at dt/2. Solves that didn't converge: 0 at dt and 0 at dt/2. Every trial stayed within the finite numbers.

#### R's third round, pick 1 — **Fail**

Run on 2026-09-29 at `8358a9a`: 200 trials of 120 s at each step, seeds 1 to 200, at dt = 2.5 ms and dt/2 = 1.25 ms. Each clause's 95% interval for the difference, the value at dt less the value at dt/2, comes from 1,000 resamples of the seeds, and must lie within its margin (PLAN §7.2).

| Clause                           | dt     | dt/2   | Difference | 95% interval       | Margin  | Result   |
| -------------------------------- | ------ | ------ | ---------- | ------------------ | ------- | -------- |
| Frequency (Hz)                   | 0.1846 | 0.1886 | −0.0039    | −0.0072 to −0.0006 | ±0.0057 | **Fail** |
| Wavelength (body lengths)        | 0.5931 | 0.5809 | +0.0122    | +0.0010 to +0.0234 | ±0.0174 | **Fail** |
| Speed (body lengths/s)           | 0.0812 | 0.0812 | 0.0000     | −0.0005 to +0.0004 | ±0.0024 | **Pass** |
| Share of trials with a 20 s bout | 1.000  | 1.000  | 0.000      | 0.000 to 0.000     | ±0.100  | **Pass** |
| Reversals a minute               | 0.003  | 0.000  | +0.003     | 0.000 to +0.011    | ±0.300  | **Pass** |

Checkpoint 1's grade over these trials, reported and not compared: **Partial** at dt and **Partial** at dt/2. Solves that didn't converge: 0 at dt and 0 at dt/2. Every trial stayed within the finite numbers.

#### R's third round, pick 2 — **Fail**

Run on 2026-09-29 at `4042820`: 200 trials of 120 s at each step, seeds 1 to 200, at dt = 2.5 ms and dt/2 = 1.25 ms. Each clause's 95% interval for the difference, the value at dt less the value at dt/2, comes from 1,000 resamples of the seeds, and must lie within its margin (PLAN §7.2).

| Clause                           | dt     | dt/2   | Difference | 95% interval       | Margin  | Result   |
| -------------------------------- | ------ | ------ | ---------- | ------------------ | ------- | -------- |
| Frequency (Hz)                   | 0.1796 | 0.1896 | −0.0099    | −0.0137 to −0.0065 | ±0.0057 | **Fail** |
| Wavelength (body lengths)        | 0.6088 | 0.5665 | +0.0423    | +0.0316 to +0.0533 | ±0.0170 | **Fail** |
| Speed (body lengths/s)           | 0.0813 | 0.0791 | +0.0022    | +0.0022 to +0.0022 | ±0.0024 | **Pass** |
| Share of trials with a 20 s bout | 1.000  | 1.000  | 0.000      | 0.000 to 0.000     | ±0.100  | **Pass** |
| Reversals a minute               | 0.014  | 0.014  | 0.000      | 0.000 to 0.000     | ±0.300  | **Pass** |

Checkpoint 1's grade over these trials, reported and not compared: **Partial** at dt and **Partial** at dt/2. Solves that didn't converge: 0 at dt and 0 at dt/2. Every trial stayed within the finite numbers.

#### R's third round, pick 3 — **Fail**

Run on 2026-09-29 at `d888332`: 200 trials of 120 s at each step, seeds 1 to 200, at dt = 2.5 ms and dt/2 = 1.25 ms. Each clause's 95% interval for the difference, the value at dt less the value at dt/2, comes from 1,000 resamples of the seeds, and must lie within its margin (PLAN §7.2).

| Clause                           | dt     | dt/2   | Difference | 95% interval       | Margin  | Result   |
| -------------------------------- | ------ | ------ | ---------- | ------------------ | ------- | -------- |
| Frequency (Hz)                   | 0.2091 | 0.2001 | +0.0090    | +0.0002 to +0.0170 | ±0.0060 | **Fail** |
| Wavelength (body lengths)        | 0.4754 | 0.4991 | −0.0237    | −0.0453 to −0.0005 | ±0.0150 | **Fail** |
| Speed (body lengths/s)           | 0.0569 | 0.0573 | −0.0005    | −0.0010 to +0.0001 | ±0.0017 | **Pass** |
| Share of trials with a 20 s bout | 0.915  | 0.960  | −0.045     | −0.095 to +0.005   | ±0.100  | **Pass** |
| Reversals a minute               | 0.055  | 0.038  | +0.016     | −0.014 to +0.047   | ±0.300  | **Pass** |

Checkpoint 1's grade over these trials, reported and not compared: **Fail** at dt and **Fail** at dt/2. Solves that didn't converge: 0 at dt and 0 at dt/2. Every trial stayed within the finite numbers.

#### R's third round, pick 4 — **Fail**

Run on 2026-09-29 at `c5539c3`: 200 trials of 120 s at each step, seeds 1 to 200, at dt = 2.5 ms and dt/2 = 1.25 ms. Each clause's 95% interval for the difference, the value at dt less the value at dt/2, comes from 1,000 resamples of the seeds, and must lie within its margin (PLAN §7.2).

| Clause                           | dt     | dt/2   | Difference | 95% interval       | Margin  | Result   |
| -------------------------------- | ------ | ------ | ---------- | ------------------ | ------- | -------- |
| Frequency (Hz)                   | 0.1500 | 0.1579 | −0.0079    | −0.0113 to −0.0046 | ±0.0047 | **Fail** |
| Wavelength (body lengths)        | 0.6129 | 0.5878 | +0.0251    | +0.0122 to +0.0386 | ±0.0176 | **Fail** |
| Speed (body lengths/s)           | 0.0630 | 0.0635 | −0.0005    | −0.0008 to −0.0002 | ±0.0019 | **Pass** |
| Share of trials with a 20 s bout | 1.000  | 1.000  | 0.000      | 0.000 to 0.000     | ±0.100  | **Pass** |
| Reversals a minute               | 0.000  | 0.000  | 0.000      | 0.000 to 0.000     | ±0.300  | **Pass** |

Checkpoint 1's grade over these trials, reported and not compared: **Partial** at dt and **Partial** at dt/2. Solves that didn't converge: 0 at dt and 0 at dt/2. Every trial stayed within the finite numbers.

#### Track S, pick 1 — **Pass**

Run on 2026-10-02 at `8188ae9`: 200 trials of 120 s at each step, seeds 1 to 200, at dt = 2.5 ms and dt/2 = 1.25 ms. Each clause's 95% interval for the difference, the value at dt less the value at dt/2, comes from 1,000 resamples of the seeds, and must lie within its margin (PLAN §7.2). The frequency counts crossings past a band of ±0.31 κL (PLAN §7.4).

| Clause                           | dt     | dt/2   | Difference | 95% interval       | Margin  | Result   |
| -------------------------------- | ------ | ------ | ---------- | ------------------ | ------- | -------- |
| Frequency (Hz)                   | 0.2148 | 0.2156 | −0.0008    | −0.0027 to +0.0010 | ±0.0065 | **Pass** |
| Wavelength (body lengths)        | 0.4874 | 0.4866 | +0.0008    | −0.0032 to +0.0051 | ±0.0146 | **Pass** |
| Speed (body lengths/s)           | 0.0684 | 0.0686 | −0.0002    | −0.0006 to +0.0002 | ±0.0021 | **Pass** |
| Share of trials with a 20 s bout | 1.000  | 1.000  | 0.000      | 0.000 to 0.000     | ±0.100  | **Pass** |
| Reversals a minute               | 0.005  | 0.000  | +0.005     | 0.000 to +0.014    | ±0.300  | **Pass** |

Checkpoint 1's grade over these trials, reported and not compared: **Partial** at dt and **Partial** at dt/2. Solves that didn't converge: 0 at dt and 0 at dt/2. Every trial stayed within the finite numbers.

<!-- /harness:equivalence -->

<!-- harness:sensitivity -->

### Sensitivity: the uncertain signs, the scales and the rest offsets

Run on 2026-10-02 at `e37996b`: under each setting, checkpoint 1's 20 trials of 120 s and the same trials of the silenced network, seeds 1 to 20, on track S's model, its measured signs, the D-types' offset and its rectifier, in the conductance form, with the calibrated parameters (PLAN §7.3), here to three significant figures: g_osc = 838 pS, g_osc,B = 0 pS, τ_w = 1.23 s, θ_osc = −14.9 mV, g_sw = 50 nS, g_p = 0.0157 nS per unit of κL, κ_gap,B = 0.156, g_nmj = 40 per unit of relative drive, θ_nmj = −0.0994 relative drive, κ_SMD = 0.169, σ_n = 0.0565 pA·√s, τ_n = 0.0551 s, none of them tuned again. Every trial stayed finite, and no brain solve failed to converge.

Reported, not graded. First checkpoint 1's trials under each setting: the share of the measured time the worm moves forward, and its mean velocity towards its head, over all the trials; the kinematics, from forward bouts of 10 s or more, a dash where there is none to take them from; and the grade checkpoint 1 would give.

| Setting                                            | Forward | Mean velocity (body lengths/s) | Frequency (Hz) | Wavelength (body lengths) | Speed (body lengths/s) | Eigenworms | 20 s bouts | Checkpoint 1 would grade |
| -------------------------------------------------- | ------- | ------------------------------ | -------------- | ------------------------- | ---------------------- | ---------- | ---------- | ------------------------ |
| By the rule, as the model has them                 | 100%    | 0.068                          | 0.217          | 0.48                      | 0.068                  | 97.5%      | 100%       | **Partial**              |
| All excitatory                                     | 100%    | 0.054                          | 0.238          | 0.45                      | 0.055                  | 96.5%      | 100%       | **Fail**                 |
| All silent                                         | 20%     | 0.001                          | –              | –                         | –                      | 96.7%      | 0%         | **Fail**                 |
| Random draw 1                                      | 100%    | 0.072                          | 0.215          | 0.55                      | 0.072                  | 98.0%      | 100%       | **Partial**              |
| Random draw 2                                      | 100%    | 0.068                          | 0.196          | 0.62                      | 0.068                  | 97.8%      | 100%       | **Partial**              |
| Random draw 3                                      | 98%     | 0.050                          | 0.228          | 0.51                      | 0.052                  | 97.0%      | 100%       | **Fail**                 |
| Random draw 4                                      | 99%     | 0.064                          | 0.187          | 0.60                      | 0.065                  | 98.0%      | 100%       | **Partial**              |
| Random draw 5                                      | 96%     | 0.042                          | 0.265          | 0.40                      | 0.044                  | 94.2%      | 80%        | **Fail**                 |
| Random draw 6                                      | 95%     | 0.036                          | 0.289          | 0.36                      | 0.040                  | 94.3%      | 60%        | **Fail**                 |
| Random draw 7                                      | 100%    | 0.072                          | 0.202          | 0.63                      | 0.072                  | 98.0%      | 100%       | **Partial**              |
| Random draw 8                                      | 100%    | 0.060                          | 0.266          | 0.42                      | 0.060                  | 95.8%      | 100%       | **Partial**              |
| Random draw 9                                      | 99%     | 0.057                          | 0.218          | 0.55                      | 0.057                  | 97.2%      | 100%       | **Fail**                 |
| Random draw 10                                     | 86%     | 0.043                          | 0.174          | 0.79                      | 0.051                  | 97.5%      | 85%        | **Fail**                 |
| The model's signs, at the shared-connection scales | 99%     | 0.056                          | 0.192          | 0.53                      | 0.056                  | 97.4%      | 100%       | **Fail**                 |
| The model's signs, with no rest offset             | 100%    | 0.065                          | 0.226          | 0.46                      | 0.065                  | 97.1%      | 100%       | **Partial**              |
| The model's signs, with AVA's rest offsets too     | 100%    | 0.070                          | 0.206          | 0.51                      | 0.070                  | 97.7%      | 100%       | **Partial**              |

Then the same trials of the silenced network, which keeps each setting's intact thresholds: the shares of the time it moves forward and backward; the head switch's drive less θ_osc, averaged over the measured steps, the gate open when it is above 0; how many times a minute the switch flips; the lowest and highest voltage any neuron reaches; and its forward bouts of 10 s, where checkpoint 0 asks for none.

| Setting                                            | Forward | Backward | Gate: drive less θ_osc (mV) | Switch flips a minute | Voltages (mV) | Bouts of 10 s |
| -------------------------------------------------- | ------- | -------- | --------------------------- | --------------------- | ------------- | ------------- |
| By the rule, as the model has them                 | 0.0%    | 0.0%     | −13.32                      | 0.00                  | −89 to 28     | 0             |
| All excitatory                                     | 0.0%    | 0.0%     | −14.87                      | 0.00                  | −89 to 28     | 0             |
| All silent                                         | 0.027%  | 0.0%     | −10.07                      | 0.00                  | −89 to 28     | 0             |
| Random draw 1                                      | 0.18%   | 0.0%     | −6.00                       | 0.00                  | −89 to 28     | 0             |
| Random draw 2                                      | 0.47%   | 0.16%    | −5.56                       | 0.00                  | −89 to 28     | 0             |
| Random draw 3                                      | 0.11%   | 0.45%    | −6.56                       | 0.00                  | −89 to 28     | 0             |
| Random draw 4                                      | 0.046%  | 0.0%     | −6.93                       | 0.00                  | −89 to 28     | 0             |
| Random draw 5                                      | 0.19%   | 0.29%    | −4.58                       | 0.00                  | −89 to 28     | 0             |
| Random draw 6                                      | 0.21%   | 0.087%   | −5.98                       | 0.00                  | −89 to 28     | 0             |
| Random draw 7                                      | 0.014%  | 0.0046%  | −7.32                       | 0.00                  | −89 to 28     | 0             |
| Random draw 8                                      | 0.16%   | 0.0%     | −6.24                       | 0.00                  | −89 to 28     | 0             |
| Random draw 9                                      | 0.091%  | 0.055%   | −6.63                       | 0.00                  | −89 to 28     | 0             |
| Random draw 10                                     | 0.11%   | 0.036%   | −5.86                       | 0.00                  | −89 to 28     | 0             |
| The model's signs, at the shared-connection scales | 0.0%    | 0.0%     | −13.36                      | 0.00                  | −89 to 28     | 0             |
| The model's signs, with no rest offset             | 0.0%    | 0.0%     | −13.35                      | 0.00                  | −89 to 28     | 0             |
| The model's signs, with AVA's rest offsets too     | 0.0%    | 0.0%     | −13.32                      | 0.00                  | −89 to 28     | 0             |

<!-- /harness:sensitivity -->

## Checkpoints 2 to 6

They waited, by a decision made at the go/no-go and kept since (PLAN §9; DECISIONS.md, 2026-09-26 and 2026-09-30), until checkpoint 1 reached at least partial on a fit the rules could choose. Track R ended below partial on 2026-09-29, so none ran on its fits. Track S's fit grades partial (2026-10-02), so they now run on it by their protocols, checkpoint 6's ten nulls each tuned by S's procedure first (PLAN §9), by rules for what PLAN left open set before any of them was built (DECISIONS.md, 2026-10-02). Checkpoints 2 to 5 have run, and fail (their sections, above); checkpoint 6 has run, and finds no evidence that the wiring matters (its section, above). S as a whole was proposed after the previews below, so on its fit checkpoint 2, checkpoint 4's klinokinesis row, which counts reversals as reorientations, and checkpoint 5's rows that read reversals are reported as fitted (PLAN §10); checkpoint 3 reads forward speed and is not marked. The reason they waited is what each measures: checkpoints 2 and 3 touch a worm "during forward crawling", checkpoint 4 needs it to travel centimetres to a spot, checkpoint 5 measures lesions against those behaviours, and checkpoint 6 asks whether rewired brains crawl as the real one does (PLAN §7.4).

Checkpoints 2 and 3 failed as their rules expected of a fit that hardly reverses. A touch moves its receptors about 10 mV, as their currents are sized to, but on three seeds it moved AVA by at most 1.2 mV, AVD by 1.4, PVC by 2.3 and AVB by 0.5 against its sham twin, so it reaches the command circuit only faintly. It does reach the head switch, whose flips it moves by up to about 1 s either way, shifting each touch's speed by −17% to +25% against its twin; but on average the speed doesn't move, no touch makes the worm reverse, and the crawl, which the switch paces, carries on (DECISIONS.md, 2026-10-02).

Checkpoint 4 failed as its rules expected. Of 100 worms, each run for up to an hour from the dish's centre, 18 reached the odour and 14 the control, and with AWC-ON's input off 17 and 14. The worms' reversals, 0.41 a minute over the hour where checkpoint 1's two-minute trials made none, are the dish's wall's: every worm that reversed had reached the wall, and in the worms looked at every reversal began with the body at it, within 0.5 mm, where they spent 37% to 49% of their time within 2 mm. So klinokinesis, which counts them as reorientations, reads the wall. Weathervaning, the slope of the curving rate against the bearing, clears its null and the control at the 80% level the rules set, so it is reproduced; but it rests on about 1% of the transitions, nearly all at the wall, where even the controls, which can't smell, curve inwards as they slide along it, and without them it is absent. Nothing shows the odour steering a worm (DECISIONS.md, 2026-10-02).

Checkpoint 5 failed, its rows that read reversals as its rules expected of a fit that hardly reverses. The intact worm made no reversal in its 30 trials, nor after any touch, so AVA + AVD's and AVA's falls, and PVC's clause asking checkpoint 2's response to stay, have nothing to fall from or stay at, and fail unmeasured. With AVA and AVD cut the worm made 5 short reversals, a rise significant the wrong way (p = 0.040), and with AVA alone 1, where intact it made none. PVC's other clause, the posterior touch's speed-up falling, is unmeasured too, since the intact worm doesn't speed up, and RIM's lesion made no short reversal. The row its rules expected to pass, AVB + PVC's forward speed, falls 72%, significantly, where it asks for 80%. It isn't the forward command that matters here: every primary lesion slows the crawl the head switch paces, AVA + AVD's by 74% and AVA's by 64%, those worms pausing about half the time, and PVC's and RIM's by 14% and 8%. With AVB cut alone the worm's mean velocity falls 91%, as its preview found, but it is moving about half the time, forward in 30% of the samples and backward in 17%, 5.5 reversals a minute; with PVC cut as well, 66% and 3% (an exploration, disclosed). Reported beside them, the secondary lesions: none reverses, cutting AIY speeds the worm up and AIZ slows it (DECISIONS.md, 2026-10-02).

Why none of checkpoints 2 to 5 sees a reversal was diagnosed before the research closed (DECISIONS.md, 2026-10-03). In the graded network Wormlight ports, a synapse's activation rests at 0.091 and can never exceed 0.167, with Kunert-Graf et al.'s rates and Wicks et al.'s sigmoid. Excitatory synapses push with a median of 7 mV, since the neurons rest just below their 0 mV reversal, so every excitatory relay stays below unit gain.

- **The touch's path.** Saturated, the front touch receptors' synapses could move AVD by at most 0.025 mV, and they make none onto AVA. The back receptors' could move AVA by at most 0.04 mV, and AVD's could move AVA by 0.32. What a touch does reach comes mostly through gap junctions.
- **Driving AVA.** By up to 44 mV, alone or with AVB held down, it never made the worm reverse on 10 seeds. S's rectifier closes AVA's gap route to the A-types, its synapses barely reach them, and their oscillators load them; the two A-types watched stayed below their rest.
- **Driving the motor circuit directly,** with the head switch off, only drifts it backward, at −0.005 body lengths per second. The sign audit found the same at R's refit.
- **Strengthening every synapse,** up to thirtyfold, made no reversal and shrank a touch's reach in AVA from 0.036 mV per millivolt at the receptor to 0.0002. The stronger synapses shunt the gap junctions, the brain's rest drifts towards E_exc, and the touch's currents stay fixed.

So on S's fit a touch reversal doesn't emerge, and under the model's rules it would need a new synapse model or a backward motor layer. The maintainer closed the research at that documented conclusion: no further track, and checkpoint 6's verdict, a write-up and release 0.3.0 to follow. Checkpoint 6's verdict came on 2026-10-08, below.

Checkpoint 6 ran by rules set before any null's record was read (DECISIONS.md, 2026-10-03): each null tuned by S's procedure in its own box, its fit its first pick, as PLAN §9 has it; and, changed after checkpoints 2 to 5's results, the secondary null deferred and "no evidence that the wiring matters (the real wiring doesn't pass)" wherever the real wiring doesn't pass. The ten nulls were tuned and graded on an older PC, 88 hours of tuning (DECISIONS.md, 2026-10-08).

- **Crawling.** Nine of the ten crawl at partial, so by PLAN's map there is no evidence that the wiring matters. Eight of their fits score better on the search's objective than the real wiring's, and the nine crawl at 0.069 to 0.110 body lengths per second, against its 0.068.
- **What paces them.** The head switch, in every one: with it off, none moves. Rewiring 6, the one that doesn't crawl, has its switch's drive barely above θ_osc.
- **AVB.** Lesioned, it leaves every crawling null partial and moving forward nearly all the time, where the real wiring falls to 30% forward and slows 91%. It is the clearest behavioural difference, observed and not asked in advance, and since each wiring runs at its own fit, the runs don't separate its wiring from its fit. The real wiring is also the slowest crawler, and its fit scores worse than eight of the nulls'.
- **Checkpoints 2 to 5.** No crawling null passes any of them, and the real wiring passes none, so each reads "no evidence that the wiring matters (the real wiring doesn't pass)". Rewiring 9 is partial on checkpoint 3, and three nulls pass a row of checkpoint 5 that the real wiring fails.
- **The hop statistic.** Logbook 071 of nematode, the sister project, found the real wiring has no motor neuron one hop from a food sensor and its rewirings about nine, and Logbook 074 about eight under its chemical-only null. Wormlight's real wiring gives the logbook's wild type exactly, and its nulls 3 to 12; the shortcuts don't track which nulls crawl.

So in this model the crawl gives no evidence of depending on the real wiring: S's procedure finds a head-switch crawl in nine of ten rewired brains. That is a statement about the model and its procedure, not about the worm.

What each measures, by thresholds PLAN §7.4 fixes, every quantity predicted, since checkpoints 2 to 5 are held out of the calibration (spec §1.2), though on track S's fit some are reported as fitted (above):

| Checkpoint         | Protocol                                                                                                                                                     | Pass                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 2: anterior touch  | 50 touches in the ALM and AVM field during forward crawling, one a trial, each against a sham-touched twin                                                   | A reversal within 2 s after ≥ 70% of touches, and at least 3 times as often as after the twins' (McNemar's exact test) |
| 3: posterior touch | 50 touches in the PLM field during forward crawling, one a trial, each against a sham-touched twin                                                           | Mean forward speed over the next 2 s ≥ 10% above the twins' (Wilcoxon signed-rank test)                                |
| 4: chemotaxis      | Bargmann et al. 1993's layout: 100 worms run alone for 60 min each, counted at either spot; the control, AWC's input off                                     | CI ≥ 0.6, and above the control (Fisher's exact test)                                                                  |
| 5: lesions         | Five primary lesions against intact, AVA + AVD, AVB + PVC, PVC, AVA and RIM: 30 trials of 120 s for spontaneous behaviour, and 50 touches for the touch rows | All five move in the direction the literature reports, each by at least the amount PLAN states, significantly          |
| 6: wiring test     | 10 rewired brains, each tuned by the real wiring's procedure and budget, and gated on checkpoint 1; checkpoints 2 to 5 compared among those that crawl       | PLAN's verdict map: whether the wiring matters, doesn't, or the nulls are too few to say                               |

Checkpoint 4 also reports its mechanism, klinokinesis and weathervaning, each against the same worm with AWC's input off, never gating (PLAN §7.4).

What is known short of them, none of it a checkpoint's result:

- **They were previewed, outside their protocols** (PLAN §10, which asks every report of them to say so). An investigation on 2026-09-29 stimulated and lesioned the real wiring at the probe crawler's values, on exploration seeds. It pointed to checkpoint 2 failing, with no reversal; checkpoint 3 likely failing, since stimulating PLM slowed the worm; checkpoint 4 failing, the worm circling and AWC-ON's drive changing its speed by at most 0.6%; and checkpoint 5 passing at most one row. On the refit, lesioning AVA raised the reversals from 1.42 to 5.41 a minute, where checkpoint 5's AVA rows ask for a fall (2026-09-28). The sign audit's probes re-signed up to 102 connections and found no backward mode (2026-09-29). No change to track R's model followed a preview of checkpoints 2 to 5; track S's did, which is why its rows above are reported as fitted. On S's fit itself, its chosen pick's runs previewed checkpoint 5's AVB + PVC row: with AVBL and AVBR lesioned it moved forward 30% of the time (above), and its mean velocity fell 91%, where the row itself, with PVC cut as well, found 72%.
- **Touch and odour were first measured where they must do nothing.** Checkpoint 0 touched the silenced worm and ran it in the assay's field, on the refit and on S's fit, and both clauses pass, as they would for any worm that barely moves; checkpoints 2 to 4 have since touched and assayed a crawling one.
- **The wiring test was previewed before it ran.** An assessment found R's third round's crawl largely indifferent to the chemical wiring: it still moved forward 93% of the time with every chemical synapse cut. Ten rewirings built in a scratch copy, untuned, were run at that round's values: 2 of the 10 graded partial on checkpoint 1's seeds at its first pick's values, 6 of the 10 after one nudge of one parameter, the best of six by a fixed rule on seeds 4001 to 4010, and none of five at its fourth pick's. PLAN's verdict map reads five or more crawling nulls as no evidence that the wiring matters, and an untuned run understates how many a tuned search would make crawl (DECISIONS.md, 2026-09-30). The test itself has since run, and found nine of ten tuned nulls crawling (above). The contrast brain in the app is a rewiring on S's fit's values, untuned. On S's fit, before any tuning, the ten rewirings ran untuned on its values, by checkpoint 1's protocol on seeds 4001 to 4020, not the gate's: none graded partial, where the real wiring did, every one slower than it, at 0.008 to 0.050 body lengths per second against 0.068, and three moving forward less than 60% of the time (DECISIONS.md, 2026-10-03). Untuned, that says how far each starts from a crawl, not where tuning takes it.
- **The app runs what the checkpoints would test.** A viewer can touch the worm, place food, lesion neurons and swap in the contrast brain, on S's fit's slow crawl. What they then see is the model's behaviour, not a validated reflex.

## The GPU against the CPU reference

Every behavioural trial above runs on the CPU reference, the scientific ground truth (spec §8). The app runs the same loop on the GPU, in f32, and these checks hold the two together (PLAN §7.2).

- **The reference against the published model.** The CPU reference, run on Neural Interactome's own connectome and parameters, reproduces that code's responses to its ALM, AVA, AVB and PLM presets (the port check): at the 2.5 ms step the worst neuron's RMS error is 0.05% to 0.37% of its excursion, against a limit of 1%. On Cook's wiring as the app runs it, with the oscillators off, it matches an independent high-accuracy solve within 0.29% (the production check; DECISIONS.md, 2026-09-25). Both are unit tests, run on every change.
- **One step, and one second.** From states sampled along closed-loop runs, the GPU's step is compared with the reference's, and then a second of steps: the brain alone, then the whole loop with the body, the muscles, the head switch, touch, odour and the dish's wall, in both forms of the head switch's current, and on a lesioned contrast brain. The tolerances are PLAN §7.2's: after one step, 10⁻⁴ on each neuron's voltage, activation and recovery and on the muscles, and 10⁻² on the rods' velocities; over one second, an RMS error of 10⁻²; for the odour field, 10⁻⁵ of its largest concentration after one sub-step and 10⁻⁴ after a second. A one-second state is graded only where the reference agrees with itself at the GPU's solver tolerance, and up to a quarter may go ungraded; its voltages leave out a neuron the reference moved more than 1 mV over the step before (DECISIONS.md, 2026-10-02). It passes on the Mac's GPU in Chrome and in Safari, and on CI's software GPU on every change that touches it. In Safari on 2026-09-30, and again on 2026-10-01 with the same counts: all 21 of the brain's one-step states and 19 of its 21 one-second states, 2 not graded; all 312 of the loop's one-step states and 131 of its 145 one-second states, 14 not graded; and the odour field's three checks.
- **Long runs, by statistics.** Floating-point differences grow in these dynamics, so long runs are compared by their statistics, not step by step: 265 seeds a side for 60 s each, the two sides equivalent within ±5%. Since checkpoint 1 is partial they compare each run's crawling speed and frequency, measured as checkpoint 1 measures a trial's over the run's forward bouts of 10 s or more (PLAN §7.2). On track S's fit in Chrome the speed differs by 0.0002 body lengths per second against a margin of ±0.0034, and the frequency by 0.0002 Hz against ±0.0107; in Safari by 0.0003 and 0.0001 Hz against the same margins; every run with a bout on both sides and no unconverged solve, in both (DECISIONS.md, 2026-10-02). Before, they compared the body wave's spread and frequency: on the refit in Chrome the mid-body curvature's standard deviation differs by −0.0003 against a margin of ±0.0372, and the frequency by 0.00004 Hz against ±0.0043 (DECISIONS.md, 2026-09-28). In Safari on the refit, at `10db33a` on 2026-10-01, they pass too: the standard deviation differs by 0.0001 against ±0.0372 and the frequency by −0.00004 Hz against ±0.0043, with no unconverged solve on either side (DECISIONS.md, 2026-10-01); before then they had last run in Safari on the milestone 4 model (2026-09-27).
- **The app in Safari.** Eleven scenarios, from each layout through lesions, the contrast brain, food, touch and a link's note, run without an error once the page is ready, the GPU stepping the worm and every view drawing, on the refit and on track S's fit (DECISIONS.md, 2026-09-30 and 2026-10-02).
- **The frame rate.** On the refit, in real windows on an M5 Max, Chrome held 120 frames a second up to 30 times real time and Safari 60 up to 23 times, against the spec's 60 at real time and PLAN's target of 10 times in Chrome. Asked for more than its GPU can step, each keeps its frames and runs the worm slower than asked (DECISIONS.md, 2026-09-30). On track S's fit, with the rectifier, headless Chrome holds 60 up to 30 times and Safari 60 up to 20 times, stepping 20.6 times when asked for more (DECISIONS.md, 2026-10-02).
- **What the GPU can't promise.** A link reproduces a setup, but the worm's path can differ between GPUs: they may compute the same arithmetic differently in its last bits, which the dynamics amplify. The app says so.

## Known simplifications

[FIDELITY.md](FIDELITY.md) grades every part of the model, from measured in the worm down to assumed, with what would raise it. These are the simplifications that bear most on reading the results above, each with why it was made.

**In the model.**

- **Every neuron is the same graded, passive cell** (Kunert et al. 2014), with no spikes, plateaus or differences between cell types. Most of the worm's neurons are graded, and no set of cell-type models covers all 302, so the published whole-network model is used as it stands.
- **A synapse's strength is its size in the micrographs**, times one conductance per unit. No physiology gives strengths connection by connection (spec §2.4).
- **Synapse signs are inferred**: from transmitter and receptor expression for 46% of chemical connections, from the transmitter alone for 38%, and with no basis, so no fast effect, for 14%; 51 rest on physiology, 44 of them adopted by track S (PLAN §2.4). No signed functional connectome of the whole animal exists; `docs/sign-audit.md` checks the command circuit's against the literature.
- **The rhythm is a hypothesis.** Which cells generate the worm's rhythm is unsettled. The model takes one documented candidate, a proprioceptive switch in the head, oscillators in the A- and B-type motor neurons and front-to-back proprioceptive coupling, in a form of its own with tuned gains (spec §2.4).
- **The head switch and proprioception are conductances of the project's own form** in the chosen fit, track S's, driving towards the model's reversal potentials (PLAN §4.3). The refit's form, currents with no reversal potential, drove some neurons far outside the range any synapse could take them to (DECISIONS.md, 2026-09-29). The switch's conductance, at its bound's top in S's fit, comes to about 50 times its targets' passive loads.
- **There is no neuromodulation** and no signalling outside synapses, so nothing that depends on them can emerge: slowing on food, dwelling against roaming, and the change in reversals with time off food among them (spec §2.4).
- **Only AWC-ON and the gentle-touch receptors sense anything.** The odour's current takes a form of the project's own around a measured adapting threshold, and a touch is a 500 ms current pulse.
- **The body is two-dimensional**, after Boyle, Berri & Cohen 2012: resistive force theory stands in for agar, the muscles' placement along the body is assumed, and the body can pass through itself, which a worm can't.
- **The odour is a two-dimensional layer of air** over uniform agar, with loss and release rates of the project's own around butanone's measured diffusion coefficient, and a lawn only emits odour. Trials start from the field's steady state, as if the source had long been there.
- **The noise is a coloured current**, not white. With white noise the results changed with the time step; the coloured current, its correlation time calibrated, keeps them within chance across steps (DECISIONS.md, 2026-09-28). The spec expected noise to make the spontaneous reversals. Track S's fit tunes it on the crawl's kinematics alone, as spec §4 was amended to allow, so its reversal rate is a prediction, and it hardly reverses; in track R's model the head switch made them, and noise lowered their rate.
- **The wiring is assembled from several animals**, with some connections extrapolated where no micrographs existed, and connectomes vary between individuals.
- **One fixed step.** The loop advances by 2.5 ms. The network's voltages and activations take a second-order linearly implicit scheme, checked against a high-accuracy solve with the oscillators off; an oscillator's period converges at first order, and the body's step is semi-implicit Euler (PLAN §3.4). So each fit's result is compared at half the step before it is taken as final (PLAN §7.2); of the fits the comparison took, the refit, the second round's probe pick and track S's first pick held, and the rest moved with the step.

**In the measures.** Where a published measure could only be approximated, the approximation and its reason (spec §8):

- **The eigenworms are taken on trust.** The basis is the file Stephens et al.'s group distributes with WormPose, which names no source, so its identity with the 2008 basis is inferred; a published set of real postures is consistent with it, its first four modes capturing 96.46% of their variance.
- **The starting postures' origin is as their tutorial states it**: 6,655 real postures that the OIST tutorials introduce as coming from Stephens et al.'s experiment.
- **The pass bands sit wider than a real worm's values**, since the model is simpler than a worm: 85% of posture variance, for instance, against the 95% real worms reach.
- **Frequency is counted, not fitted**: half the mid-body curvature's crossings of each bout's mean, over forward bouts of 10 s or more, each counted once the curvature has left ±0.31 κL about the mean on the far side (2026-10-01). The band reads a shallow gait a little low at a bout's ends. A worm whose bouts all end at the 10 s floor holds one undulation each, so the count then reports the rhythm that ends its bouts, as the refit's did.
- **Wavelength follows from the frequency**: the distance between two rods over the frequency times the lag at which their curvatures correlate best, so it moves when the frequency does.
- **No touch latency is graded.** No verified latency exists, so checkpoint 2 would grade a reversal within 2 s and report the latency.
- **Each touch is judged against a sham-touched twin**, not against the worm before the touch, which the cited papers use: a silenced worm's own drift came within 0.001 of counting as a reflex in the first before-and-after test (p = 0.051, above).
- **The chemotaxis index counts every worm run**, and stops a worm within 0.5 cm of a spot, as sodium azide does on a real plate. Its reference, about 0.87 for butanone, is read from a figure, as one of the lesion rows' is.
- **Chemotaxis' mechanism is judged by sign alone**, since the studies that measured it used salts, not butanone.
- **Each worm runs alone**, 100 of them, where the assay the index comes from puts a population on one plate.
- **The dish's wall shapes the hour-long runs.** A worm that reaches it is pushed back as it crawls into it, which the motion's measure counts as a reversal, and turns inwards to slide along it; the spots lie 5 mm from it, so a worm following it can reach one. The odour field reads flat within about 0.05 mm of the wall, where its interpolation takes a single cell. Checkpoint 4's mechanism reads all of this, and says so (DECISIONS.md, 2026-10-02).
- **The reversal target is read from a figure** (Gray, Hill & Bargmann 2005, Fig. 1E): 1.8 a minute, the average at 6 to 16 minutes off food. The model has no food history, so it can't follow the rate's fall with time off food.
- **The speed target outruns the other targets' wave.** At 0.30 Hz and 0.65 body lengths a wave travels 0.195 body lengths a second, under the 0.22 the refit's calibration aimed for, where real worms slip against their wave; R's third round and track S aimed theirs at 0.15 (PLAN §7.3).
- **The crawling bands rest on Fang-Yen et al. 2010 and Ramot et al. 2008.** Berri et al. 2009, which the spec also names, was not used.
