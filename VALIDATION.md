# Validation

How Wormlight's behaviour compares with the real worm's, by the checkpoints PLAN §7 fixes in advance. The behavioural harness runs each checkpoint on the CPU reference (`npm run harness -- --checkpoint <n>`) and writes its results below, between the markers, as `npm run equivalence` writes §7.2's comparison of the step; the prose around them is written by hand. Whether the GPU matches the CPU reference is checked separately, by GPU parity (PLAN §7.2). The harness's `--sensitivity` writes its own section there too. The page gives the result first, then where each checkpoint stands, how the trials run, what changed after results and how to read the results; then the results in full, the checkpoints not reached, the GPU's checks, and the known simplifications.

## The result

**Crawling as checkpoint 1 asks for it does not yet emerge from the connectome** (DECISIONS.md, 2026-09-26 to 2026-09-30). That is the project's headline finding. The checkpoints after it, which wait on a worm that crawls, were not run.

Three terms recur. A _fit_ is a set of values for the twelve calibrated parameters. _Track R_ is the research track that, after the go/no-go found no crawl, changed the model and recalibrated it over three rounds (PLAN §9); its _refit_ is the fit the app and the checkpoints run on. The _head switch_ is the relaxation oscillator in the head's SMD motor neurons, one of the layers allowed outside the connectome (PLAN §4.3).

- **The chosen fit fails checkpoint 1.** The model runs on R's refit, the last fit that track R's rules, each set before its results, let it choose. On it the worm moves forward 79–82% of the time, at 0.029 body lengths per second, about an eighth of a real worm's 0.22, in runs that end at about 10 s. Its wavelength and its postures pass; its frequency, its speed and its sustained runs fail. The failure is the model's, not the time step's: every measure stays within its margin at half the step (PLAN §7.2).
- **A rhythm in its head moves it, not the network.** Without its head switch the refit doesn't move, and with all 18 B-type motor neurons lesioned it still moves forward 72% of the time, against 81%.
- **Crawlers were found, and none could be chosen.** A probe search in R's second round found a partial crawler that holds at half the step, at 0.103 body lengths per second with a forward bout of 20 s in every trial, but only the full run's fit could be chosen. An investigation's sweep from that pick, with τ_w at 0.34 s, passes every clause of checkpoint 1, on checkpoint 1's own seeds too, at 0.128 body lengths per second; it makes no reversal and drives neurons far outside the reversal range, and it was found by exploring the real wiring and picked on seeds it was then graded on, so no rule could choose it (DECISIONS.md, 2026-09-29). R's third round found crawlers at 0.081 whose frequency moved with the step. Each is paced by the head switch; the third round's crawl is relayed along the body by proprioception, and still moves forward 93% of the time, more slowly, with every chemical synapse cut.
- **Checkpoint 0 passes, and says little.** The silenced worm barely moves, as it should. But the refit moves by its head switch alone, which a bound on its threshold keeps shut once the network is silenced, so the pass follows from that bound, not from the wiring.
- **The uncertain signs don't rescue the crawl, and they unsettle checkpoint 0.** With the 1,986 connections whose signs are uncertain set all excitatory, all silent or at random ten times over, and with the connections rescaled, on the refit's values with nothing tuned again, checkpoint 1 still fails under every setting, none making a forward bout of 20 s. But the silenced network's head switch, shut by under half a millivolt on the model's own signs, has its gate open under eleven of the fourteen settings. Under the random draws the switch then flips now and then on the noise, and in two of them the silenced worm drifts forward for 10 s, which checkpoint 0 asks not to see ("The sensitivity runs", below).
- **Checkpoints 2 to 6 were not reached.** The touch reflexes, chemotaxis, the lesion effects and the wiring test are specified, with their thresholds fixed, and unrun ("Checkpoints 2 to 6", below).

## Where it stands

| Checkpoint          | Result      | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0: silenced network | **Pass**    | Crawling, touch and chemotaxis clauses, on the refit, touches against sham twins and chemotaxis by a binomial test, both changed after its first run; each pass says little (below)                                                                                                                                                                                                                                                                                                                          |
| 1: crawling         | **Fail**    | On R's refit, its measures and calibration changed after results as listed below: frequency just under partial, speed and 20 s bouts fail; within its margins at half the step (PLAN §7.2), so final; a survey of a conductance form of the head switch and proprioception found partial crawlers in two of sixteen searches, and a third, last round of R ran on it by rules set before it ran; none of its four picks passed §7.2's comparison, so the refit stays and R has ended below partial (PLAN §9) |
| 2: anterior touch   | Not reached | Waits, by PLAN §9's rule, on checkpoint 1 reaching partial on a fit the rules could choose; specified below, its protocol changed after results                                                                                                                                                                                                                                                                                                                                                              |
| 3: posterior touch  | Not reached | As checkpoint 2, and its protocol changed after results                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 4: chemotaxis       | Not reached | As checkpoint 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 5: lesions          | Not reached | As checkpoint 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 6: wiring test      | Not reached | The real wiring doesn't crawl by a fit the rules could choose, and by the project's decision no rewired brain was tuned; its tuning procedure changed after results                                                                                                                                                                                                                                                                                                                                          |

## How the trials run

- **Trials.** 20 of 120 s for checkpoints 0 and 1, seeds 1 to 20. Each starts from a real worm's posture, one of 6,655 that the OIST Physics of Behavior tutorials introduce as coming from Stephens et al.'s experiment, drawn by its seed and turned to a random heading (PLAN §7.4); checkpoint 0 silences the network on the same postures. The "Posture" column gives the row of the pinned `shapes.csv` a trial started from.
- **Motion** (PLAN §7.1). The centroid's velocity towards the head, over the centred second, sampled every 0.1 s: forward above +0.01 body lengths per second, backward below −0.01, a pause between, which ends a bout. A reversal is backward motion of 1 s or more. Every measure starts after a trial's first 10 s.
- **Checkpoint 1's measures** (PLAN §7.4). The kinematics over forward bouts of 10 s or more, pooled over trials, the wavelength only from a wave running from head to tail; the variance the first four eigenworms capture in postures sampled at 4 Hz, pooled over trials, self-intersecting ones left out; and the share of trials with a forward bout of 20 s or more.
- **Touched trials** (checkpoint 0, PLAN §7.4). The same 20 trials again, each touched 5 times, 20 s apart from t = 20 s, alternating front (s = 0.2) and back (s = 0.8), odd seeds starting at the front: 50 anterior touches and 50 posterior. A touch starts with the step after its time. At each touch the world forks a sham twin, which takes a sham touch in its place and runs 3.5 s on while the touched line runs on (changed after the first run, 2026-09-27). A reversal follows a touch if its first backward sample lies within the 2 s after it, in the touched line and its twin alike; McNemar's exact test weighs the pairs in which only one reversed. The speed after a touch is the mean of the velocity samples whose windows lie within the 2 s after it, and the paired signed-rank test compares each touched copy with its twin, a difference under 0.0012 body lengths per second on average failing to count however significant. Both tests are one-sided, in the reflex's direction, at α = 0.05. The chemotaxis clause fails only if the exact binomial test, two-sided, finds one spot reached significantly more often.
- **The chemotaxis assay** (checkpoint 0 now, checkpoint 4 once reached). Each worm runs alone for up to 60 min on the butanone spot's steady field, starting with its centroid at the dish's centre from the posture its seed draws, and stops when any part of its body comes within 0.5 cm of either spot's centre. CI = (at odour − at control) / every worm run.
- **The step** (PLAN §7.2). The comparison of checkpoint 1's measures at dt and dt/2 was deferred until checkpoint 1 reached partial, then run when R's first fit reached partial only at half the step: neither that fit nor the planned model's converged at any step down to 0.3125 ms, with white noise. The model now runs a coloured noise current, and the comparison is an equivalence test on 200 trials a step, each clause's 95% interval for the difference within a margin. R's refit passes it; the planned fit fails it, and so does R's second round's fit (under "The step", in the results below; DECISIONS.md, 2026-09-28 and 2026-09-29).
- **The sensitivity runs** (spec §2.4; PLAN §2.4, §3.2; DECISIONS.md, 2026-09-30). Checkpoint 1's trials, and the same trials of the silenced network, under fourteen settings of the real wiring, on the refit's values with nothing tuned again. Thirteen set the 1,986 chemical connections whose signs come from the transmitter rule or from nothing: by the rule, as the model has them; all excitatory; all silent; and ten random draws. The fourteenth keeps the model's signs and scales Cook's section counts by what the connections Cook's and Varshney's data share ask for, 0.33 for gap junctions and 0.50 for chemical synapses, in place of the scales that match the datasets' totals, 0.2055 and 0.3444 (PLAN §3.2). Each setting is a brain of its own, with its thresholds at its own rest. They are reported, not graded.
- **Calibrated or predicted** (spec §1.2). Checkpoint 1's clauses carry their kind in its table, and checkpoint 0's are all predicted, as the sentence under its table says. Of the rest: the step comparison's frequency, wavelength and speed are calibration targets, and so is its reversal rate, at 1.8 a minute, for every fit but R's third round's picks, whose procedure fitted no reversal rate and aimed the speed at 0.15 body lengths per second, so theirs is predicted (PLAN §7.3); its share of trials with a 20 s bout is predicted. Each trial's columns, the diagnostics and the sensitivity runs describe a run: nothing is tuned to them and nothing is graded by them.

## What changed after results

Every threshold and definition was fixed in PLAN §7 before its results. These changed afterwards; each is logged in DECISIONS.md with its reason and marked where PLAN states it.

- **The model.** After the go/no-go found no crawl, track R's model took the planned one's place: three more calibrated parameters, and each muscle's drive taken relative to its own range, a deviation from spec §1.1 signed off on 2026-09-27. The coloured noise added a fourth, so the budget of free parameters rose from 14 to 18 (PLAN §6.2, §9).
- **Checkpoint 1.** The wavelength is measured between rods 0.125 of the body apart, not 0.3125, where forward, backward and standing waves read alike (2026-09-26). The calibration spends 2,000 evaluations, not 400 (2026-09-27, before any calibration). The noise is a coloured current, not white (2026-09-28). Later rounds of track R changed the calibration's procedure and the form of two currents (2026-09-28 and 2026-09-29); the chosen fit, the refit, predates both.
- **The step.** The comparison at half the step, deferred until checkpoint 1 reached partial, runs for every fit, as an equivalence test on 200 trials a step (2026-09-28).
- **Checkpoint 0.** Its reruns grade each touch against a sham-touched twin, and chemotaxis by an exact binomial test on arrivals (2026-09-27, after its first run). Checkpoints 2 and 3 take the same protocol, changed before any trial of their own.
- **Checkpoint 6.** Each null would be tuned by the procedure of the real wiring's final fit (2026-09-27 to 2026-09-29, before any null was tuned).
- **GPU parity.** The GPU is compared with the reference solved at the GPU's own solver tolerance; a one-second state is graded only where the reference agrees with itself there, within a third of the threshold; the rods' velocities are held to 10⁻², not 10⁻⁴, with a floor for a slow body raised 48 times, to 10⁻⁴ body lengths per second; and the long runs take 265 seeds a side, not 20, on the registry's values (2026-09-26 to 2026-09-29).

## Reading the results

### The chosen fit, R's refit

- **R's refit moves by its head switch alone.** Without the switch it doesn't move; with all 18 B-types lesioned it still moves forward 72% of the time, against 81%. The fit holds the B-types about 30 mV below threshold, their oscillator's 3.9 nS with θ_osc at its floor clamping them, and its A-types never fire, a review found (DECISIONS.md, 2026-09-28).
- **Its forward runs end at about 10 s.** In every trial it moves forward 79–82% of the time, yet no forward run lasts past 10.3 s. All 54 reversals began within 3 s after a flip of the head switch, whose cycle puts the mid-body spectrum's peak at 0.082 Hz, with 1% of its power between 0.2 and 0.45 Hz, where a crawling worm's lies. Its 12 bouts of 10 s hold one undulation each, the mid-body crossing its mean twice a bout, so the graded 0.099 Hz is the switch's, not a wave's, and can't pass 0.100 Hz: one undulation in a bout of at least 10 s. It moves at 0.029 body lengths per second, about an eighth of a real worm's 0.22 (DECISIONS.md, 2026-09-28).
- **Its head switch drives neurons past their reversal range.** The switch injects a current with no reversal potential into the SMDs, which holds them near ±210 mV. At each sample 16 neurons on average sit outside the model's reversal range, −48 to 0 mV, where no chemical synapse or leak could take them, and 8 sit more than 10 mV outside it, the voltages running from −219 to +203 mV over every step (checkpoint 1's diagnostics below). The rest sit within 10 mV of it, pulled there through gap junctions or by the oscillators, a review found. Published head switches keep their units bounded (DECISIONS.md, 2026-09-29), so a conductance form of the switch's and proprioception's currents is built beside them, which no chosen fit uses (DECISIONS.md, 2026-09-29).
- **Its result doesn't depend on the step.** Over 200 trials a step, each measure's 95% interval for the difference between 2.5 and 1.25 ms lies within its margin: the frequency's and the speed's within 0.0003 of zero, and the reversals', at 1.51 and 1.58 a minute, within 0.22. So the failure is the model's, not the numerics'. But with the frequency pinned and no 20 s bout at either step, two of the clauses couldn't have failed here, and the stiff A-type dynamics behind the first fit's step bias never occur, so the pass speaks for this fit alone (DECISIONS.md, 2026-09-28).
- **Five of its twelve values sit on a bound:** g_osc at 5 nS and κ_gap,B at 1, their tops; θ_osc at −28 mV and θ_nmj at −0.3, their floors; and τ_n at 0.2 s, its top. The noise, σ_n = 0.0594 pA·√s, ends about a third of the way to its bound. Each value on a bound pushes the same way, quieting the motor circuits (DECISIONS.md, 2026-09-28).
- **The eigenworm clause passes a worm that barely moves.** Smooth bends are shapes the four eigenworms capture almost entirely; the clause measures how worm-like the postures are, not whether the worm moves.

### Checkpoint 0

Checkpoint 0 ran again on the refit, the chosen fit, its touches graded against sham twins and its chemotaxis by an exact binomial test, as its reruns are (PLAN §7.4; DECISIONS.md, 2026-09-30), and passes. The silenced refit makes no forward bout of 10 s, where the intact one makes 12, but only because the head switch, whose current is all that moves the refit, stays shut once the network is silenced: its drive is then a constant below θ_osc's floor, which was set to keep it shut (PLAN §7.3), so the clause couldn't fail through the switch for any fit within the bounds. Its touch and chemotaxis clauses ask that the silenced worm show no reflex and no chemotaxis, which it couldn't while it barely moved, and their passes would mean something only alongside passes of checkpoints 2 to 4, which stay not reached.

- **The silenced worm barely moves.** It makes no forward bout of 10 s, and over an hour in the assay no centroid got more than 0.19 mm from its start, against 40 mm to either spot's capture circle. Its head switch's gate stays shut on every step, the drive a constant 0.47 mV below θ_osc, which sits at its floor of −28 mV: set so that a silenced head switch stays shut (PLAN §7.3). Intact, the gate is open on every step, the drive 26.2 mV above θ_osc, so the network never gates the switch's rhythm; it only supplies a steady drive, which silencing takes away. The refit moves by its switch alone, so silenced it can't crawl; the crawling clause's pass follows from that bound, not from the wiring.
- **The touches reach no muscle.** Neither place's receptors, ALML, ALMR and AVM at the front and PLML and PLMR at the back, has a neuromuscular junction, so with their synapses cut a touch reaches the body only through the numerics: chiefly the integrator's restarts at its pulse's edges, and at rounding level the voltage solve's sums over every neuron. In the first run it moved no velocity sample by more than 2.7 × 10⁻⁷ body lengths per second (DECISIONS.md). A sham twin takes the same restarts, so on the refit each touched copy's speed after its touch matches its twin's to rounding: a mean difference of 5.5 × 10⁻¹⁸ body lengths per second, and none over 1.7 × 10⁻¹⁶. The touched receptors themselves reach +854 mV in the silenced network, a touch's current being sized for a receptor's load in the intact one, but they move no muscle.
- **In the first run the posterior clause passed at p = 0.051.** Its test compared the speeds before and after each touch, and the silenced worm creeps. In 30 of the 50 windows before a posterior touch it crept backward, and its speed rose after 26 of them: backward creep dying away. Over the same windows the untouched twins give the same rank sum, 808, and the same p, so the near-significance is the creep's, not the touch's. The test has no control for a worm's own trend, so checkpoint 0's reruns, and checkpoints 2 and 3, grade each touch against a sham-touched twin instead (PLAN §7.4). On the refit the clause passes against its twins at p = 0.42, a p-value of rounding that the floor makes moot; the before-and-after test, reported beside it, gives p = 0.58.
- **The chemotaxis band is loose for a worm that moves.** A worm that moves but has no bias fails ±0.1 over 30 worms by chance 15% of the time if each worm has a one-in-five chance of reaching a spot, and 58% if every worm reaches one. Reruns grade the clause instead by a two-sided exact binomial test on arrivals (PLAN §7.4; DECISIONS.md, 2026-09-27). On the refit no worm reached either spot, so the test couldn't fail, which for a worm that barely moves is itself the result.

### The sensitivity runs

- **No setting of the uncertain signs or the scales reaches partial,** on the refit's values with nothing tuned again. Checkpoint 1 would fail all fourteen, none making a forward bout of 20 s. The worm moves forward 70% to 81% of the time under thirteen of them, and 32% with the uncertain signs silent. Only three make any forward bout of 10 s to take the kinematics from: the model's own, one random draw and the shared-connection scales, at 0.027 to 0.029 body lengths per second. At these values the failure doesn't hang on how the uncertain signs are set; whether a fit made under other signs would crawl, the runs don't say.
- **The model's own setting repeats checkpoint 1**, figure for figure, as its rule required.
- **The silenced network's stillness rests on the model's signs.** A silenced network keeps its intact thresholds, and the head switch's gate compares the drive on the SMDs with them. On the model's signs that drive sits 0.47 mV below θ_osc's floor, which was set to keep it there (PLAN §7.3), and the switch never flips. All excitatory and at the shared scales it stays shut too. With the uncertain signs silent or drawn at random the thresholds move and the gate is open throughout, 2.7 to 8.5 mV above θ_osc: the switch is free to run.
- **An open gate isn't enough to move it.** With the uncertain signs silent the switch flips 0.08 times a minute and the silenced worm stays still. Under the random draws it flips 0.36 to 1.59 times a minute, each flip set off by the noise, and the silenced worm moves forward 0.8% to 18% of the time and backward 1.8% to 4.8%, drifting after a flip. In two draws it drifts forward for 10 s, three bouts in all, where checkpoint 0 asks for none. So checkpoint 0's crawling pass holds on this wiring's signs, by a bound fitted to them, and not across the signs that are uncertain: one more reason it says little.
- **With the gate open, the silenced network's voltages run to about ±15,600 mV.** The switch's current goes into SMDs held by nothing but their leak. The behaviour sees only their saturated activation, but no neuron could hold such a voltage.
- **They are not checkpoints.** Nothing was tuned for any setting, each has its thresholds at its own rest, the random draws are one set of ten, and no choice rests on them. They were first run with the silenced network's bouts alone, and the columns on how it moves, on its gate, its switch's flips and its voltages were added after those bouts were seen, in two steps, to show their cause (DECISIONS.md, 2026-09-30).

### How track R got here

Track R calibrated the planned model as it stands, then built its own model and calibrated it four times: first with white noise, whose result changed with the time step; then, after two numerics studies, with a coloured noise; in a second round with a two-stage calibration; and in a third on a conductance form of its head switch and proprioception (PLAN §7.3, §9; DECISIONS.md). Checkpoint 1's section below grades R's refit, which fails, and §7.2's comparison, below it, finds each of the refit's measures within its margin at half the step, so the result is final. By a rule set before the refit, only a fit that passes that comparison can be chosen: the planned fit fails it, so R's refit is the real wiring's final fit, and since checkpoint 1 stays below partial, R's first round ends (PLAN §9; DECISIONS.md, 2026-09-28). Without that rule, checkpoint 1's ranking alone would have chosen the planned fit. A review then found R's model reaching partial inside its bounds, where the calibration's objective ranked it below the refit for making no reversal, so a second round changed the calibration (PLAN §9). One of its four probe searches found the crawl and graded partial on seeds of its own, but its full run didn't: that fit fails §7.2's comparison and checkpoint 1, so the refit stays chosen. The probe's pick passes §7.2's comparison and grades partial on checkpoint 1's own trials, but only the full run's fit can be chosen, so it is recorded as exploratory. A third round, R's last, was paused: an investigation found that crawl resting on two currents with no reversal potential, the head switch's and proprioception's, which drive neurons far outside the model's reversal range, and the model without a backward mode, so a conductance form of the currents was built beside them, and a survey of it found two of sixteen searches reaching a partial crawl, slow and without reversals; the round ran on that form, by rules set before it ran. Its four picks crawled, three of them partial on checkpoint 1 over §7.2's trials, but each one's frequency and wavelength intervals reached past their margins at half the step, while its speed held, so none could be chosen: the refit stays the real wiring's final fit, and R has ended (PLAN §9; DECISIONS.md, 2026-09-29). An assessment then found the round's crawl paced by the head switch and largely indifferent to the chemical wiring, and the model without a backward mode, so the negative result is the headline: checkpoints 2 to 6 stay not reached (DECISIONS.md, 2026-09-30).

In the order they ran, from the planned model on its provisional parameters, before any calibration, to R's third round; the refit, above, sits between the first fit and the second round:

- **On the planned model's provisional parameters** (DECISIONS.md, 2026-09-26), it fell into one slow cycle instead: its bend deepened over about a minute as it crept to a halt, then flipped, and it moved forward for about 25 s. Checkpoint 0's first run, on 2026-09-27, silenced the network on those parameters; its section below now reports the refit.
- **The planned model's fit** (DECISIONS.md, 2026-09-27) was led by its head switch's slower cycle, at 0.073 Hz, and moved at 0.030 body lengths per second, its forward runs cut by the switch at 13.6 s at most; checkpoint 1 graded its frequency partial and its speed and bouts fail. It fails §7.2's comparison: at half the step its frequency, wavelength, speed and reversal rate all move outside their margins, so its result isn't final and it can't be chosen (DECISIONS.md, 2026-09-28).
- **R's first fit, with white noise** (DECISIONS.md, 2026-09-27 and 2026-09-28), crawled faster, at 0.063 body lengths per second in bouts at 0.232 Hz, with 8 of 20 trials holding a 20 s run. But its reversals and the length of its runs came from the time step: at half the step 17 trials held one and it reached partial. The convergence studies traced this to the white noise, which a coarse step damps, and to the oscillators' stiff dynamics; the coloured noise and the refit followed.
- **R's second round's fit** (DECISIONS.md, 2026-09-29) moves at 0.036 body lengths per second. All 168 of its reversals follow a flip of the head switch, and its mid-body spectrum peaks at the switch's 0.082 Hz, as the refit's does; with the switch removed it doesn't move, and with the B-types lesioned it still moves forward 77% of the time, a review found. Its graded frequency and wavelength come from bouts piled at the 10 s floor and move with the step, so its result isn't final and it can't be chosen.
- **The second round's probe found a crawler the rules can't choose** (DECISIONS.md, 2026-09-29). Seed 14's pick passes §7.2's comparison over 200 paired seeds and grades partial on checkpoint 1's own trials: 0.341 Hz, 0.50 body lengths, 0.103 body lengths per second and a 20 s bout in every trial. The head switch paces it, the B-types give it thrust, and it never reverses. It sits in a corner of the parameters' box that the full run's search never reached, and only the full run's fit could be chosen, so it is recorded as exploratory. Its crawl needs the head switch's and proprioception's currents to drive neurons far outside the reversal range, an investigation found (DECISIONS.md, 2026-09-29).
- **The survey of the bounded model found two slow crawlers the rules can't choose** (DECISIONS.md, 2026-09-29). With the head switch and proprioception as conductances, 2 of 16 searches graded partial on seeds of their own: 0.129 and 0.186 Hz, 0.061 body lengths per second, at partial's floor, and no reversal. Their head switch's gate stays open throughout, so its rhythm, not the network's, paces them, and at half the step one of them is partial by 0.00001, a review found. They are exploratory. R's third round ran on the bounded model by rules of its own, and none of its picks passed §7.2's comparison (the next item).
- **R's third round found faster crawlers the rules can't choose either** (DECISIONS.md, 2026-09-29 and 2026-09-30). Picks 1 and 2 crawl at 0.081 body lengths per second, with a forward bout of 20 s in every trial, three of its four picks partial over §7.2's 200 trials, but each pick's counted frequency, and with it the wavelength, which the measure ties to it, moves with the step past its margin. The body's own rhythm moves less: most of the shift is short crossings of the bouts' mean, which the count takes in. Every pick's head switch runs with its gate open throughout, and the body follows its cycle; an assessment found the crawl relayed back along the body by proprioception, and the worm still moving forward 93% of the time, more slowly, with every chemical synapse cut.

## Results

<!-- harness:checkpoint-0 -->

### Checkpoint 0: the silenced network — **Pass**

Run on 2026-09-30 at `80923ff`: 20 trials of 120 s, seeds 1 to 20, each run untouched and touched, and 30 worms in the assay for up to 60 min, seeds 1 to 30, on the calibrated parameters (PLAN §7.3), here to three significant figures: g_osc = 5000 pS, g_osc,B = 3900 pS, τ_w = 2.64 s, θ_osc = −28 mV, g_sw = 312 pA, g_p = 0.19 pA, κ_gap,B = 1, g_nmj = 7.55 per unit of relative drive, θ_nmj = −0.3 relative drive, κ_SMD = 0.718, σ_n = 0.0594 pA·√s, τ_n = 0.2 s. Every trial's measures start after its first 10 s. Every trial, sham twin and worm stayed finite, and no brain solve failed to converge.

| Clause          | Measured                                                                                                                                                      | Passes if                                                                                                                                                                     | Grade    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Crawling        | 0 forward bouts of 10 s or more                                                                                                                               | None in any trial                                                                                                                                                             | **Pass** |
| Anterior touch  | A reversal within 2 s after 0 of 50 touches (0%), and after 0 of their sham twins; 0 pairs with the touched copy's alone and 0 with the twin's alone, p = 1.0 | Under 40%, or not more often than after the sham twins (McNemar's exact test, one-sided)                                                                                      | **Pass** |
| Posterior touch | Forward velocity over the 2 s after 50 touches: −0.0001 touched, −0.0001 in the sham twins (body lengths/s), a difference of 5.5 × 10⁻¹⁸ on average; p = 0.42 | Not significantly faster than the sham twins (Wilcoxon's signed-rank test, one-sided, paired), or by under 0.0012 body lengths/s on average                                   | **Pass** |
| Chemotaxis      | 0 arrivals: 0 of 30 worms at the odour, 0 at the control (CI 0.00); p = 1.0                                                                                   | Neither spot reached significantly more often than the other (the exact binomial test, two-sided, over the worms that reached either); with 5 arrivals or fewer it can't fail | **Pass** |

Every clause is predicted, since no parameter is tuned to it: each passes if a behaviour that should need the connectome is absent without it. Two of the calibration's bounds were set with the silenced network in view, θ_osc's floor and σ_n's ceiling (PLAN §7.3), so that within them it stays still.

#### Crawling

There were 0 forward bouts of 10 s or more; the longest forward run lasted 0.0 s. Backward activity, reported and not graded: 0 reversals of 1 s or more, 0.00 a minute.

| Seed | Posture | Forward / paused / backward | Longest forward run (s) | Reversals | Mean velocity (body lengths/s) | Self-intersecting postures |
| ---- | ------- | --------------------------- | ----------------------- | --------- | ------------------------------ | -------------------------- |
| 1    | 247     | 0% / 100% / 0%              | 0.0                     | 0         | −0.0011                        | 0                          |
| 2    | 5745    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0000                         | 0                          |
| 3    | 2081    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0001                        | 0                          |
| 4    | 2260    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0001                         | 0                          |
| 5    | 6605    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0001                         | 0                          |
| 6    | 2621    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0002                         | 0                          |
| 7    | 394     | 0% / 100% / 0%              | 0.0                     | 0         | −0.0006                        | 0                          |
| 8    | 874     | 0% / 100% / 0%              | 0.0                     | 0         | 0.0000                         | 0                          |
| 9    | 2169    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0000                         | 0                          |
| 10   | 4026    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0011                        | 0                          |
| 11   | 162     | 0% / 100% / 0%              | 0.0                     | 0         | −0.0003                        | 0                          |
| 12   | 1032    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0001                         | 0                          |
| 13   | 4410    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0001                        | 0                          |
| 14   | 4877    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0000                         | 0                          |
| 15   | 4679    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0011                        | 0                          |
| 16   | 1398    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0002                        | 0                          |
| 17   | 3516    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0000                         | 0                          |
| 18   | 3956    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0001                        | 0                          |
| 19   | 6488    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0001                         | 0                          |
| 20   | 5323    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0001                         | 0                          |

#### Touch

The same trials ran again, each touched 5 times, 20 s apart from t = 20 s, alternating front (F, s = 0.2) and back (B, s = 0.8), odd seeds starting at the front: 50 anterior touches and 50 posterior. Each front touch reached ALML, ALMR, AVM; each back touch reached PLML, PLMR. At each touch the world forked a sham twin, which took a sham touch in its place, restarting the integrator where the touch's current switched, with no current of its own, and ran 3.5 s on while the touched line ran on; each touch is graded against its twin over the same samples (PLAN §7.4). The signed-rank test takes the 50 posterior touches whose speed after differed from their twins' at all, with a rank sum of 660 for those the touched copy led; where the touch reaches no muscle, those differences are rounding, and the floor decides. Reported, not graded: the forward velocity before and after the posterior touches, −0.0001 and −0.0001 body lengths per second, a rank sum of 616 over 50 pairs, p = 0.58, by the before-and-after test the first run graded by. Backward activity in the touched trials, reported and not graded: 0 reversals of 1 s or more, 0.00 a minute.

| Seed | Touches   | Anterior touches followed by a reversal | Sham twins with one | Posterior touches: forward velocity after, touched / sham (body lengths/s) | Reversals |
| ---- | --------- | --------------------------------------- | ------------------- | -------------------------------------------------------------------------- | --------- |
| 1    | F B F B F | 0 of 3                                  | 0 of 3              | −0.0007 / −0.0007                                                          | 0         |
| 2    | B F B F B | 0 of 2                                  | 0 of 2              | 0.0001 / 0.0001                                                            | 0         |
| 3    | F B F B F | 0 of 3                                  | 0 of 3              | 0.0001 / 0.0001                                                            | 0         |
| 4    | B F B F B | 0 of 2                                  | 0 of 2              | 0.0001 / 0.0001                                                            | 0         |
| 5    | F B F B F | 0 of 3                                  | 0 of 3              | 0.0001 / 0.0001                                                            | 0         |
| 6    | B F B F B | 0 of 2                                  | 0 of 2              | 0.0003 / 0.0003                                                            | 0         |
| 7    | F B F B F | 0 of 3                                  | 0 of 3              | −0.0002 / −0.0002                                                          | 0         |
| 8    | B F B F B | 0 of 2                                  | 0 of 2              | 0.0001 / 0.0001                                                            | 0         |
| 9    | F B F B F | 0 of 3                                  | 0 of 3              | −0.0001 / −0.0001                                                          | 0         |
| 10   | B F B F B | 0 of 2                                  | 0 of 2              | −0.0013 / −0.0013                                                          | 0         |
| 11   | F B F B F | 0 of 3                                  | 0 of 3              | −0.0003 / −0.0003                                                          | 0         |
| 12   | B F B F B | 0 of 2                                  | 0 of 2              | 0.0002 / 0.0002                                                            | 0         |
| 13   | F B F B F | 0 of 3                                  | 0 of 3              | 0.0000 / 0.0000                                                            | 0         |
| 14   | B F B F B | 0 of 2                                  | 0 of 2              | 0.0000 / 0.0000                                                            | 0         |
| 15   | F B F B F | 0 of 3                                  | 0 of 3              | −0.0011 / −0.0011                                                          | 0         |
| 16   | B F B F B | 0 of 2                                  | 0 of 2              | −0.0003 / −0.0003                                                          | 0         |
| 17   | F B F B F | 0 of 3                                  | 0 of 3              | 0.0000 / 0.0000                                                            | 0         |
| 18   | B F B F B | 0 of 2                                  | 0 of 2              | −0.0001 / −0.0001                                                          | 0         |
| 19   | F B F B F | 0 of 3                                  | 0 of 3              | 0.0001 / 0.0001                                                            | 0         |
| 20   | B F B F B | 0 of 2                                  | 0 of 2              | 0.0001 / 0.0001                                                            | 0         |

#### Chemotaxis

Each worm ran alone in checkpoint 4's assay: the butanone spot's steady field, the worm's centroid starting at the dish's centre, 45 mm from each spot, and the run stopping when any part of its body came within 5 mm of a spot's centre. 0 worms reached the odour, 0 the control and 30 neither. The nearest any worm came was 44.33 mm from the odour spot's centre and 44.43 mm from the control's; the farthest any centroid got from its start was 0.192 mm.

| Seed | Posture | AWC-ON | Reached | Nearest the odour spot (mm) | Nearest the control (mm) | Farthest from the start (mm) |
| ---- | ------- | ------ | ------- | --------------------------- | ------------------------ | ---------------------------- |
| 1    | 247     | AWCL   | Neither | 44.67                       | 44.63                    | 0.161                        |
| 2    | 5745    | AWCL   | Neither | 44.46                       | 44.54                    | 0.055                        |
| 3    | 2081    | AWCR   | Neither | 44.78                       | 44.67                    | 0.049                        |
| 4    | 2260    | AWCR   | Neither | 44.77                       | 44.74                    | 0.028                        |
| 5    | 6605    | AWCR   | Neither | 44.87                       | 44.80                    | 0.022                        |
| 6    | 2621    | AWCR   | Neither | 44.58                       | 44.65                    | 0.023                        |
| 7    | 394     | AWCL   | Neither | 44.48                       | 44.54                    | 0.098                        |
| 8    | 874     | AWCL   | Neither | 44.56                       | 44.59                    | 0.051                        |
| 9    | 2169    | AWCR   | Neither | 44.68                       | 44.85                    | 0.053                        |
| 10   | 4026    | AWCL   | Neither | 44.33                       | 44.53                    | 0.177                        |
| 11   | 162     | AWCL   | Neither | 44.62                       | 44.68                    | 0.083                        |
| 12   | 1032    | AWCL   | Neither | 44.50                       | 44.48                    | 0.022                        |
| 13   | 4410    | AWCL   | Neither | 44.83                       | 44.78                    | 0.052                        |
| 14   | 4877    | AWCR   | Neither | 44.66                       | 44.70                    | 0.025                        |
| 15   | 4679    | AWCL   | Neither | 44.37                       | 44.71                    | 0.192                        |
| 16   | 1398    | AWCR   | Neither | 44.83                       | 44.77                    | 0.109                        |
| 17   | 3516    | AWCL   | Neither | 44.51                       | 44.54                    | 0.025                        |
| 18   | 3956    | AWCL   | Neither | 44.91                       | 44.75                    | 0.064                        |
| 19   | 6488    | AWCL   | Neither | 44.78                       | 44.71                    | 0.021                        |
| 20   | 5323    | AWCR   | Neither | 44.59                       | 44.43                    | 0.084                        |
| 21   | 1014    | AWCL   | Neither | 44.89                       | 44.87                    | 0.026                        |
| 22   | 645     | AWCL   | Neither | 44.53                       | 44.53                    | 0.021                        |
| 23   | 5014    | AWCR   | Neither | 44.67                       | 44.68                    | 0.060                        |
| 24   | 4945    | AWCL   | Neither | 44.92                       | 44.90                    | 0.079                        |
| 25   | 1543    | AWCR   | Neither | 44.55                       | 44.52                    | 0.038                        |
| 26   | 4604    | AWCR   | Neither | 44.79                       | 44.82                    | 0.028                        |
| 27   | 680     | AWCR   | Neither | 44.88                       | 44.89                    | 0.153                        |
| 28   | 5128    | AWCR   | Neither | 44.81                       | 44.76                    | 0.019                        |
| 29   | 820     | AWCL   | Neither | 44.51                       | 44.55                    | 0.042                        |
| 30   | 479     | AWCL   | Neither | 44.77                       | 44.70                    | 0.019                        |

<!-- /harness:checkpoint-0 -->

<!-- harness:checkpoint-1 -->

### Checkpoint 1: crawling — **Fail**

Run on 2026-09-30 at `80923ff`: 20 trials of 120 s, seeds 1 to 20, on the calibrated parameters (PLAN §7.3), here to three significant figures: g_osc = 5000 pS, g_osc,B = 3900 pS, τ_w = 2.64 s, θ_osc = −28 mV, g_sw = 312 pA, g_p = 0.19 pA, κ_gap,B = 1, g_nmj = 7.55 per unit of relative drive, θ_nmj = −0.3 relative drive, κ_SMD = 0.718, σ_n = 0.0594 pA·√s, τ_n = 0.2 s. Every measure starts after each trial's first 10 s. Every trial stayed finite, and no brain solve failed to converge.

| Clause                                       | Measured | Pass      | Partial   | Grade    | Kind               |
| -------------------------------------------- | -------- | --------- | --------- | -------- | ------------------ |
| Frequency (Hz)                               | 0.099    | 0.20–0.45 | 0.10–0.60 | **Fail** | Calibration target |
| Wavelength (body lengths)                    | 0.71     | 0.50–0.80 | 0.40–1.00 | **Pass** | Calibration target |
| Speed (body lengths/s)                       | 0.029    | 0.12–0.30 | 0.06–0.50 | **Fail** | Calibration target |
| Posture variance the four eigenworms capture | 98.4%    | ≥ 85%     | ≥ 70%     | **Pass** | Predicted          |
| Trials with a forward bout of 20 s or more   | 0%       | ≥ 80%     | ≥ 50%     | **Fail** | Predicted          |

The kinematics come from 12 forward bouts of 10 s or more, 120.8 s in all. Over them the mid-body curvature crossed its mean 24 times, 2.0 a bout; a full undulation crosses twice. The rear rod's curvature correlated best with the front's at a lag of 1.78 s (correlation 0.93). The eigenworm clause pools 8,820 postures sampled at 4 Hz; 0 self-intersecting postures were left out. The kinematic clauses are calibration targets, which the parameters were tuned against (PLAN §7.3), on seeds of their own, 1001 to 1020.

Diagnostics, reported and not graded (PLAN §7.4): the mid-body curvature's spectrum peaks at 0.082 Hz, with 1% of its power between 0.2 and 0.45 Hz; 54 of 54 reversals started within 3 s after a flip of the head switch; over reversals AVA's activation changed by −5.1 × 10⁻⁴ on average, against a standard deviation of 1.1 × 10⁻³; 16.0 neurons on average sat outside the model's reversal range, −48 to 0 mV, at each sample, and 22 at most; 8.0 on average, and 9 at most, sat more than 10 mV outside it; the voltages ran from −218.8 to 203.1 mV over every step of the measured windows; the head switch's gate was open on 100.0% of the measured steps, the head-switch drive sat 26.2 mV above θ_osc on average, with a standard deviation of 4.9 mV, and the switch cycled at 0.084 Hz, half its flips a second, beside the spectrum's peak at 0.082 Hz.

| Seed | Posture | Forward / paused / backward | Longest forward run (s) | Reversals | Mean velocity (body lengths/s) | Self-intersecting postures |
| ---- | ------- | --------------------------- | ----------------------- | --------- | ------------------------------ | -------------------------- |
| 1    | 247     | 81% / 11% / 8%              | 10.1                    | 1         | 0.0220                         | 0                          |
| 2    | 5745    | 81% / 10% / 8%              | 9.8                     | 4         | 0.0223                         | 0                          |
| 3    | 2081    | 80% / 12% / 7%              | 10.0                    | 2         | 0.0223                         | 0                          |
| 4    | 2260    | 80% / 11% / 8%              | 10.0                    | 5         | 0.0225                         | 0                          |
| 5    | 6605    | 82% / 11% / 7%              | 9.9                     | 1         | 0.0226                         | 0                          |
| 6    | 2621    | 80% / 12% / 8%              | 10.0                    | 2         | 0.0221                         | 0                          |
| 7    | 394     | 80% / 12% / 8%              | 10.0                    | 2         | 0.0222                         | 0                          |
| 8    | 874     | 80% / 11% / 8%              | 9.9                     | 3         | 0.0217                         | 0                          |
| 9    | 2169    | 81% / 11% / 8%              | 10.1                    | 5         | 0.0221                         | 0                          |
| 10   | 4026    | 81% / 11% / 7%              | 9.9                     | 2         | 0.0220                         | 0                          |
| 11   | 162     | 81% / 11% / 8%              | 9.9                     | 2         | 0.0214                         | 0                          |
| 12   | 1032    | 82% / 10% / 7%              | 10.0                    | 5         | 0.0227                         | 0                          |
| 13   | 4410    | 81% / 11% / 7%              | 9.9                     | 1         | 0.0227                         | 0                          |
| 14   | 4877    | 79% / 12% / 8%              | 10.1                    | 5         | 0.0216                         | 0                          |
| 15   | 4679    | 81% / 11% / 7%              | 10.3                    | 2         | 0.0225                         | 0                          |
| 16   | 1398    | 81% / 12% / 7%              | 9.8                     | 1         | 0.0222                         | 0                          |
| 17   | 3516    | 81% / 10% / 8%              | 9.8                     | 4         | 0.0226                         | 0                          |
| 18   | 3956    | 80% / 12% / 8%              | 9.9                     | 3         | 0.0223                         | 0                          |
| 19   | 6488    | 79% / 13% / 8%              | 9.7                     | 2         | 0.0219                         | 0                          |
| 20   | 5323    | 79% / 13% / 8%              | 9.9                     | 2         | 0.0220                         | 0                          |

<!-- /harness:checkpoint-1 -->

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

<!-- /harness:equivalence -->

<!-- harness:sensitivity -->

### Sensitivity: the uncertain signs, and the scales

Run on 2026-09-30 at `80923ff`: under each setting, checkpoint 1's 20 trials of 120 s and the same trials of the silenced network, seeds 1 to 20, on the calibrated parameters (PLAN §7.3), here to three significant figures: g_osc = 5000 pS, g_osc,B = 3900 pS, τ_w = 2.64 s, θ_osc = −28 mV, g_sw = 312 pA, g_p = 0.19 pA, κ_gap,B = 1, g_nmj = 7.55 per unit of relative drive, θ_nmj = −0.3 relative drive, κ_SMD = 0.718, σ_n = 0.0594 pA·√s, τ_n = 0.2 s, none of them tuned again. Every trial stayed finite, and no brain solve failed to converge.

Reported, not graded. First checkpoint 1's trials under each setting: the share of the measured time the worm moves forward, and its mean velocity towards its head, over all the trials; the kinematics, from forward bouts of 10 s or more, a dash where there is none to take them from; and the grade checkpoint 1 would give.

| Setting                                            | Forward | Mean velocity (body lengths/s) | Frequency (Hz) | Wavelength (body lengths) | Speed (body lengths/s) | Eigenworms | 20 s bouts | Checkpoint 1 would grade |
| -------------------------------------------------- | ------- | ------------------------------ | -------------- | ------------------------- | ---------------------- | ---------- | ---------- | ------------------------ |
| By the rule, as the model has them                 | 81%     | 0.022                          | 0.099          | 0.71                      | 0.029                  | 98.4%      | 0%         | **Fail**                 |
| All excitatory                                     | 79%     | 0.021                          | –              | –                         | –                      | 98.3%      | 0%         | **Fail**                 |
| All silent                                         | 32%     | 0.013                          | –              | –                         | –                      | 96.6%      | 0%         | **Fail**                 |
| Random draw 1                                      | 79%     | 0.021                          | –              | –                         | –                      | 98.4%      | 0%         | **Fail**                 |
| Random draw 2                                      | 77%     | 0.021                          | –              | –                         | –                      | 98.3%      | 0%         | **Fail**                 |
| Random draw 3                                      | 71%     | 0.018                          | –              | –                         | –                      | 97.8%      | 0%         | **Fail**                 |
| Random draw 4                                      | 76%     | 0.020                          | –              | –                         | –                      | 98.1%      | 0%         | **Fail**                 |
| Random draw 5                                      | 74%     | 0.017                          | –              | –                         | –                      | 98.1%      | 0%         | **Fail**                 |
| Random draw 6                                      | 70%     | 0.017                          | –              | –                         | –                      | 97.7%      | 0%         | **Fail**                 |
| Random draw 7                                      | 80%     | 0.021                          | 0.099          | 0.71                      | 0.028                  | 98.5%      | 0%         | **Fail**                 |
| Random draw 8                                      | 70%     | 0.019                          | –              | –                         | –                      | 97.5%      | 0%         | **Fail**                 |
| Random draw 9                                      | 74%     | 0.019                          | –              | –                         | –                      | 98.1%      | 0%         | **Fail**                 |
| Random draw 10                                     | 75%     | 0.021                          | –              | –                         | –                      | 98.0%      | 0%         | **Fail**                 |
| The model's signs, at the shared-connection scales | 79%     | 0.020                          | 0.087          | 0.77                      | 0.027                  | 98.6%      | 0%         | **Fail**                 |

Then the same trials of the silenced network, which keeps each setting's intact thresholds: the shares of the time it moves forward and backward; the head switch's drive less θ_osc, averaged over the measured steps, the gate open when it is above 0; how many times a minute the switch flips; the lowest and highest voltage any neuron reaches; and its forward bouts of 10 s, where checkpoint 0 asks for none.

| Setting                                            | Forward | Backward | Gate: drive less θ_osc (mV) | Switch flips a minute | Voltages (mV)   | Bouts of 10 s |
| -------------------------------------------------- | ------- | -------- | --------------------------- | --------------------- | --------------- | ------------- |
| By the rule, as the model has them                 | 0.0%    | 0.0%     | −0.47                       | 0.00                  | −78 to 11       | 0             |
| All excitatory                                     | 0.0%    | 0.0%     | −2.05                       | 0.00                  | −78 to 11       | 0             |
| All silent                                         | 0.0%    | 0.45%    | 2.68                        | 0.08                  | −15659 to 15585 | 0             |
| Random draw 1                                      | 0.79%   | 2.0%     | 7.05                        | 0.41                  | −15659 to 15585 | 0             |
| Random draw 2                                      | 10%     | 4.3%     | 7.59                        | 1.26                  | −15659 to 15585 | 0             |
| Random draw 3                                      | 3.6%    | 3.6%     | 6.64                        | 0.96                  | −15659 to 15585 | 0             |
| Random draw 4                                      | 6.1%    | 4.1%     | 6.13                        | 1.07                  | −15659 to 15585 | 0             |
| Random draw 5                                      | 1.7%    | 1.8%     | 8.47                        | 0.36                  | −15659 to 15585 | 2             |
| Random draw 6                                      | 6.2%    | 4.8%     | 7.09                        | 1.31                  | −15659 to 15585 | 0             |
| Random draw 7                                      | 3.6%    | 3.5%     | 5.60                        | 0.74                  | −15659 to 15585 | 0             |
| Random draw 8                                      | 1.5%    | 3.9%     | 6.78                        | 0.85                  | −15659 to 15585 | 0             |
| Random draw 9                                      | 3.4%    | 4.2%     | 6.35                        | 0.88                  | −15659 to 15585 | 0             |
| Random draw 10                                     | 18%     | 4.6%     | 7.21                        | 1.59                  | −15659 to 15585 | 1             |
| The model's signs, at the shared-connection scales | 0.0%    | 0.0%     | −0.55                       | 0.00                  | −78 to 11       | 0             |

<!-- /harness:sensitivity -->

## Checkpoints 2 to 6: not reached

Not running them is a decision, made at the go/no-go and kept since (PLAN §9; DECISIONS.md, 2026-09-26 and 2026-09-30): checkpoints 2 to 6 wait until track R brings checkpoint 1 to at least partial on a fit its rules could choose. R ended below partial on 2026-09-29, so none ran, and none is reported as a pass, a partial or a fail. The reason is what each measures: checkpoints 2 and 3 touch a worm "during forward crawling", checkpoint 4 needs it to travel centimetres to a spot, checkpoint 5 measures lesions against those behaviours, and checkpoint 6 asks whether rewired brains crawl as the real one does (PLAN §7.4). The spec doesn't make the wiring test wait on the real wiring's crawl, and PLAN's verdict map has a reading for a real wiring that doesn't; the project chose not to tune ten nulls to a crawl the real wiring's own chosen fit doesn't have.

Their graders were built only in part. The touch trials' sham twins and the assay exist, since checkpoint 0 uses them. Checkpoint 4's control with AWC's input off, its klinokinesis and weathervaning measures, the lesion rows and the nulls' tuning were not built.

What each would measure, by thresholds PLAN §7.4 fixes, every quantity predicted, since checkpoints 2 to 5 are held out of the calibration (spec §1.2):

| Checkpoint         | Protocol                                                                                                                                                     | Pass                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 2: anterior touch  | 50 touches in the ALM and AVM field during forward crawling, one a trial, each against a sham-touched twin                                                   | A reversal within 2 s after ≥ 70% of touches, and at least 3 times as often as after the twins' (McNemar's exact test) |
| 3: posterior touch | 50 touches in the PLM field during forward crawling, one a trial, each against a sham-touched twin                                                           | Mean forward speed over the next 2 s ≥ 10% above the twins' (Wilcoxon signed-rank test)                                |
| 4: chemotaxis      | Bargmann et al. 1993's layout: 100 worms run alone for 60 min each, counted at either spot; the control, AWC's input off                                     | CI ≥ 0.6, and above the control (Fisher's exact test)                                                                  |
| 5: lesions         | Five primary lesions against intact, AVA + AVD, AVB + PVC, PVC, AVA and RIM: 30 trials of 120 s for spontaneous behaviour, and 50 touches for the touch rows | All five move in the direction the literature reports, each by at least the amount PLAN states                         |
| 6: wiring test     | 10 rewired brains, each tuned by the real wiring's procedure and budget, and gated on checkpoint 1; checkpoints 2 to 5 compared among those that crawl       | PLAN's verdict map: whether the wiring matters, doesn't, or the nulls are too few to say                               |

Checkpoint 4 would also report its mechanism, klinokinesis and weathervaning, each against the same worm with AWC's input off, never gating (PLAN §7.4).

What is known short of them, none of it a checkpoint's result:

- **They were previewed, outside their protocols** (PLAN §10, which asks every report of them to say so). An investigation on 2026-09-29 stimulated and lesioned the real wiring at the probe crawler's values, on exploration seeds. It pointed to checkpoint 2 failing, with no reversal; checkpoint 3 likely failing, since stimulating PLM slowed the worm; checkpoint 4 failing, the worm circling and AWC-ON's drive changing its speed by at most 0.6%; and checkpoint 5 passing at most one row. On the refit, lesioning AVA raised the reversals from 1.42 to 5.41 a minute, where checkpoint 5's AVA rows ask for a fall (2026-09-28). The sign audit's probes re-signed up to 102 connections and found no backward mode (2026-09-29). No change to the model followed a preview of checkpoints 2 to 5, so none of them would be reported as fitted.
- **Touch and odour were measured only where they must do nothing.** Checkpoint 0 touched the silenced worm and ran it in the assay's field; both clauses pass, as they would for any worm that barely moves.
- **The wiring test's question has an exploratory answer, not a result.** An assessment found R's third round's crawl largely indifferent to the chemical wiring: it still moved forward 93% of the time with every chemical synapse cut. Ten rewirings built in a scratch copy, untuned, were run at that round's values: 2 of the 10 graded partial on checkpoint 1's seeds at its first pick's values, 6 of the 10 after one nudge of one parameter, the best of six by a fixed rule on seeds 4001 to 4010, and none of five at its fourth pick's. PLAN's verdict map reads five or more crawling nulls as no evidence that the wiring matters, and an untuned run understates how many a tuned search would make crawl (DECISIONS.md, 2026-09-30). No null was tuned by checkpoint 6's procedure, so the test itself has no result. The contrast brain in the app is a rewiring on the refit's values, untuned, and nothing about it is measured.
- **The app runs what the checkpoints would test.** A viewer can touch the worm, place food, lesion neurons and swap in the contrast brain, on the refit's slow forward motion. What they then see is the model's behaviour, not a validated reflex.

## The GPU against the CPU reference

Every behavioural trial above runs on the CPU reference, the scientific ground truth (spec §8). The app runs the same loop on the GPU, in f32, and these checks hold the two together (PLAN §7.2).

- **The reference against the published model.** The CPU reference, run on Neural Interactome's own connectome and parameters, reproduces that code's responses to its ALM, AVA, AVB and PLM presets (the port check): at the 2.5 ms step the worst neuron's RMS error is 0.05% to 0.37% of its excursion, against a limit of 1%. On Cook's wiring as the app runs it, with the oscillators off, it matches an independent high-accuracy solve within 0.29% (the production check; DECISIONS.md, 2026-09-25). Both are unit tests, run on every change.
- **One step, and one second.** From states sampled along closed-loop runs, the GPU's step is compared with the reference's, and then a second of steps: the brain alone, then the whole loop with the body, the muscles, the head switch, touch, odour and the dish's wall, in both forms of the head switch's current, and on a lesioned contrast brain. The tolerances are PLAN §7.2's: after one step, 10⁻⁴ on each neuron's voltage, activation and recovery and on the muscles, and 10⁻² on the rods' velocities; over one second, an RMS error of 10⁻²; for the odour field, 10⁻⁵ of its largest concentration after one sub-step and 10⁻⁴ after a second. A one-second state is graded only where the reference agrees with itself at the GPU's solver tolerance, and up to a quarter may go ungraded. It passes on the Mac's GPU in Chrome and in Safari, and on CI's software GPU on every change that touches it. In Safari on 2026-09-30: all 21 of the brain's one-step states and 19 of its 21 one-second states, 2 not graded; all 312 of the loop's one-step states and 131 of its 145 one-second states, 14 not graded; and the odour field's three checks.
- **Long runs, by statistics.** Floating-point differences grow in these dynamics, so long runs are compared by their statistics, not step by step: 265 seeds a side for 60 s each, the two sides equivalent within ±5%. On the refit in Chrome the mid-body curvature's standard deviation differs by −0.0003 against a margin of ±0.0372, and the frequency by 0.00004 Hz against ±0.0043 (DECISIONS.md, 2026-09-28). In Safari the long runs last passed on the milestone 4 model (2026-09-27) and were not run again on the refit.
- **The app in Safari.** Eleven scenarios, from each layout through lesions, the contrast brain, food, touch and a link's note, run without an error once the page is ready, the GPU stepping the worm and every view drawing (DECISIONS.md, 2026-09-30).
- **The frame rate.** In real windows on an M5 Max, Chrome holds 120 frames a second up to 30 times real time and Safari 60 up to 23 times, against the spec's 60 at real time and PLAN's target of 10 times in Chrome. Asked for more than its GPU can step, each keeps its frames and runs the worm slower than asked (DECISIONS.md, 2026-09-30).
- **What the GPU can't promise.** A link reproduces a setup, but the worm's path can differ between GPUs: they may compute the same arithmetic differently in its last bits, which the dynamics amplify. The app says so.

## Known simplifications

[FIDELITY.md](FIDELITY.md) grades every part of the model, from measured in the worm down to assumed, with what would raise it. These are the simplifications that bear most on reading the results above, each with why it was made.

**In the model.**

- **Every neuron is the same graded, passive cell** (Kunert et al. 2014), with no spikes, plateaus or differences between cell types. Most of the worm's neurons are graded, and no set of cell-type models covers all 302, so the published whole-network model is used as it stands.
- **A synapse's strength is its size in the micrographs**, times one conductance per unit. No physiology gives strengths connection by connection (spec §2.4).
- **Synapse signs are inferred**: from transmitter and receptor expression for 46% of chemical connections, from the transmitter alone for 39%, and with no basis, so no fast effect, for 14%; seven rest on physiology. No signed functional connectome of the whole animal exists; `docs/sign-audit.md` checks the command circuit's against the literature.
- **The rhythm is a hypothesis.** Which cells generate the worm's rhythm is unsettled. The model takes one documented candidate, a proprioceptive switch in the head, oscillators in the A- and B-type motor neurons and front-to-back proprioceptive coupling, in a form of its own with tuned gains (spec §2.4).
- **The head switch and proprioception inject currents with no reversal potential** in the chosen fit, which drive some neurons outside the range any synapse could take them to. A conductance form, bounded, is built beside it, but no fit the rules could choose uses it (DECISIONS.md, 2026-09-29).
- **There is no neuromodulation** and no signalling outside synapses, so nothing that depends on them can emerge: slowing on food, dwelling against roaming, and the change in reversals with time off food among them (spec §2.4).
- **Only AWC-ON and the gentle-touch receptors sense anything.** The odour's current takes a form of the project's own around a measured adapting threshold, and a touch is a 500 ms current pulse.
- **The body is two-dimensional**, after Boyle, Berri & Cohen 2012: resistive force theory stands in for agar, the muscles' placement along the body is assumed, and the body can pass through itself, which a worm can't.
- **The odour is a two-dimensional layer of air** over uniform agar, with loss and release rates of the project's own around butanone's measured diffusion coefficient, and a lawn only emits odour. Trials start from the field's steady state, as if the source had long been there.
- **The noise is a coloured current**, not white. With white noise the results changed with the time step; the coloured current, its correlation time calibrated, keeps them within chance across steps (DECISIONS.md, 2026-09-28). The spec expects noise to make the spontaneous reversals; in track R's model the head switch makes them, and noise lowers their rate.
- **The wiring is assembled from several animals**, with some connections extrapolated where no micrographs existed, and connectomes vary between individuals.
- **One fixed step.** The loop advances by 2.5 ms. The network's voltages and activations take a second-order linearly implicit scheme, checked against a high-accuracy solve with the oscillators off; an oscillator's period converges at first order, and the body's step is semi-implicit Euler (PLAN §3.4). So each fit's result is compared at half the step before it is taken as final (PLAN §7.2), and every fit the comparison took but the refit moved with the step.

**In the measures.** Where a published measure could only be approximated, the approximation and its reason (spec §8):

- **The eigenworms are taken on trust.** The basis is the file Stephens et al.'s group distributes with WormPose, which names no source, so its identity with the 2008 basis is inferred; a published set of real postures is consistent with it, its first four modes capturing 96.46% of their variance.
- **The starting postures' origin is as their tutorial states it**: 6,655 real postures that the OIST tutorials introduce as coming from Stephens et al.'s experiment.
- **The pass bands sit wider than a real worm's values**, since the model is simpler than a worm: 85% of posture variance, for instance, against the 95% real worms reach.
- **Frequency is counted, not fitted**: half the mid-body curvature's crossings of each bout's mean, over forward bouts of 10 s or more. A worm whose bouts all end at the 10 s floor holds one undulation each, so the count then reports the rhythm that ends its bouts, as the refit's does.
- **Wavelength follows from the frequency**: the distance between two rods over the frequency times the lag at which their curvatures correlate best, so it moves when the frequency does.
- **No touch latency is graded.** No verified latency exists, so checkpoint 2 would grade a reversal within 2 s and report the latency.
- **Each touch is judged against a sham-touched twin**, not against the worm before the touch, which the cited papers use: a silenced worm's own drift came within 0.001 of counting as a reflex in the first before-and-after test (p = 0.051, above).
- **The chemotaxis index counts every worm run**, and stops a worm within 0.5 cm of a spot, as sodium azide does on a real plate. Its reference, about 0.87 for butanone, is read from a figure, as one of the lesion rows' is.
- **Chemotaxis' mechanism would be judged by sign alone**, since the studies that measured it used salts, not butanone.
- **Each worm would run alone**, 100 of them, where the assay the index comes from puts a population on one plate.
- **The reversal target is read from a figure** (Gray, Hill & Bargmann 2005, Fig. 1E): 1.8 a minute, the average at 6 to 16 minutes off food. The model has no food history, so it can't follow the rate's fall with time off food.
- **The speed target outruns the other targets' wave.** At 0.30 Hz and 0.65 body lengths a wave travels 0.195 body lengths a second, under the 0.22 the calibration aimed for; real worms slip against their wave (PLAN §7.3).
- **The crawling bands rest on Fang-Yen et al. 2010 and Ramot et al. 2008.** Berri et al. 2009, which the spec also names, was not used.
