# Validation

How Wormlight's behaviour compares with the real worm's, by the checkpoints PLAN §7 fixes in advance. The behavioural harness runs each checkpoint on the CPU reference (`npm run harness -- --checkpoint <n>`) and writes its results below, between the markers, as `npm run equivalence` writes §7.2's comparison of the step; the prose around them is written by hand. Whether the GPU matches the CPU reference is checked separately, by GPU parity (PLAN §7.2).

## Where it stands

| Checkpoint          | Result      | Status                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0: silenced network | **Pass**    | Crawling, touch and chemotaxis clauses, on the planned model's provisional values; runs again on the fit chosen after R's third round                                                                                                                                                                                                                                                                                          |
| 1: crawling         | **Fail**    | On R's refit: frequency just under partial, speed and 20 s bouts fail; within its margins at half the step (PLAN §7.2), so final; a survey of a conductance form of the head switch and proprioception found partial crawlers in two of sixteen searches, so a third, last round of R ran on it, by rules set before it ran, and none of its four picks passed §7.2's comparison, so the refit stays and R has ended (PLAN §9) |
| 2 to 6              | Not reached | They need forward crawling, which checkpoint 1's crawl gate guards (PLAN §7.4, §9)                                                                                                                                                                                                                                                                                                                                             |

Crawling as checkpoint 1 asks for it does not yet emerge from the connectome (DECISIONS.md, 2026-09-26 to 2026-09-29). Track R calibrated the planned model as it stands, then built its own model and calibrated it three times: first with white noise, whose result changed with the time step; then, after two numerics studies, with a coloured noise; and in a second round with a two-stage calibration (PLAN §7.3, §9; DECISIONS.md). Checkpoint 1's section below grades R's refit, which fails, and §7.2's comparison, below it, finds each of the refit's measures within its margin at half the step, so the result is final. By a rule set before the refit, only a fit that passes that comparison can be chosen: the planned fit fails it, so R's refit is the real wiring's final fit, and since checkpoint 1 stays below partial, R's first round ends (PLAN §9; DECISIONS.md, 2026-09-28). Without that rule, checkpoint 1's ranking alone would have chosen the planned fit. A review then found R's model reaching partial inside its bounds, where the calibration's objective ranked it below the refit for making no reversal, so a second round changed the calibration (PLAN §9). One of its four probe searches found the crawl and graded partial on seeds of its own, but its full run didn't: that fit fails §7.2's comparison and checkpoint 1, so the refit stays chosen. The probe's pick passes §7.2's comparison and grades partial on checkpoint 1's own trials, but only the full run's fit can be chosen, so it is recorded as exploratory. A third round, R's last, was paused: an investigation found that crawl resting on two currents with no reversal potential, the head switch's and proprioception's, which drive neurons far outside the model's reversal range, and the model without a backward mode, so a conductance form of the currents was built beside them, and a survey of it found two of sixteen searches reaching a partial crawl, slow and without reversals; the round ran on that form, by rules set before it ran. Its four picks crawled, three of them partial on checkpoint 1 over §7.2's trials, but each one's frequency and wavelength moved past their margins at half the step, while its speed held, so none could be chosen: the refit stays the real wiring's final fit, and R has ended (PLAN §9; DECISIONS.md, 2026-09-29). Checkpoint 0 last ran on the planned model's provisional values, the best of the go/no-go's 96 draws with the noise off (PLAN §6.2), and runs again on the chosen fit. On the values checkpoint 0 last ran on, the intact model didn't crawl, so its crawling clause couldn't fail for lack of wiring, and its pass says nothing about the wiring (PLAN §9). Its touch and chemotaxis clauses are the same: they ask that the silenced worm show no reflex and no chemotaxis, which it couldn't while it barely moved, and their passes will mean something alongside passes of checkpoints 2 to 4, which wait behind checkpoint 1's crawl gate.

## How the trials run

- **Trials.** 20 of 120 s for checkpoints 0 and 1, seeds 1 to 20. Each starts from a real worm's posture, one of 6,655 that the OIST Physics of Behavior tutorials introduce as coming from Stephens et al.'s experiment, drawn by its seed and turned to a random heading (PLAN §7.4); checkpoint 0 silences the network on the same postures. The "Posture" column gives the row of the pinned `shapes.csv` a trial started from.
- **Motion** (PLAN §7.1). The centroid's velocity towards the head, over the centred second, sampled every 0.1 s: forward above +0.01 body lengths per second, backward below −0.01, a pause between, which ends a bout. A reversal is backward motion of 1 s or more. Every measure starts after a trial's first 10 s.
- **Checkpoint 1's measures** (PLAN §7.4). The kinematics over forward bouts of 10 s or more, pooled over trials, the wavelength only from a wave running from head to tail; the variance the first four eigenworms capture in postures sampled at 4 Hz, pooled over trials, self-intersecting ones left out; and the share of trials with a forward bout of 20 s or more.
- **Touched trials** (checkpoint 0, PLAN §7.4). The same 20 trials again, each touched 5 times, 20 s apart from t = 20 s, alternating front (s = 0.2) and back (s = 0.8), odd seeds starting at the front: 50 anterior touches and 50 posterior. A touch starts with the step after its time. A reversal follows a touch if its first backward sample lies within the 2 s after it, and the untouched trial at the same seed and time gives the matched window. The speed before and after a touch is the mean of the velocity samples whose windows lie within the 2 s on either side. Fisher's exact test and the signed-rank test are one-sided, in the reflex's direction, at α = 0.05.
- **The chemotaxis assay** (checkpoint 0 now, checkpoint 4 once reached). Each worm runs alone for up to 60 min on the butanone spot's steady field, starting with its centroid at the dish's centre from the posture its seed draws, and stops when any part of its body comes within 0.5 cm of either spot's centre. CI = (at odour − at control) / every worm run.
- **The step** (PLAN §7.2). The comparison of checkpoint 1's measures at dt and dt/2 was deferred until checkpoint 1 reached partial, then run when R's first fit reached partial only at half the step: neither that fit nor the planned model's converged at any step down to 0.3125 ms, with white noise. The model now runs a coloured noise current, and the comparison is an equivalence test on 200 trials a step, each clause's 95% interval for the difference within a margin. R's refit passes it; the planned fit fails it, and so does R's second round's fit (the last section below; DECISIONS.md, 2026-09-28 and 2026-09-29).

## Reading the results

- **R's refit moves by its head switch alone.** Without the switch it doesn't move; with all 18 B-types lesioned it still moves forward 72% of the time, against 81%. The fit holds the B-types about 30 mV below threshold, their oscillator's 3.9 nS with θ_osc at its floor clamping them, and its A-types never fire, a review found (DECISIONS.md, 2026-09-28).
- **Its forward runs end at about 10 s.** In every trial it moves forward 79–82% of the time, yet no forward run lasts past 10.3 s. All 54 reversals began within 3 s after a flip of the head switch, whose cycle puts the mid-body spectrum's peak at 0.082 Hz, with 1% of its power between 0.2 and 0.45 Hz, where a crawling worm's lies. Its 12 bouts of 10 s hold one undulation each, the mid-body crossing its mean twice a bout, so the graded 0.099 Hz is the switch's, not a wave's, and can't pass 0.100 Hz: one undulation in a bout of at least 10 s. It moves at 0.029 body lengths per second, about an eighth of a real worm's 0.22 (DECISIONS.md, 2026-09-28).
- **Its head switch drives neurons past their reversal range.** The switch injects a current with no reversal potential into the SMDs, which holds them near ±210 mV. At each sample 16 neurons on average sit outside the model's reversal range, −48 to 0 mV, where no chemical synapse or leak could take them, and 8 sit more than 10 mV outside it, the voltages running from −219 to +203 mV over every step (checkpoint 1's diagnostics below). The rest sit within 10 mV of it, pulled there through gap junctions or by the oscillators, a review found. Published head switches keep their units bounded (DECISIONS.md, 2026-09-29), so a conductance form of the switch's and proprioception's currents is built beside them, which no fit uses yet (DECISIONS.md, 2026-09-29).
- **Its result doesn't depend on the step.** Over 200 trials a step, each measure's 95% interval for the difference between 2.5 and 1.25 ms lies within its margin: the frequency's and the speed's within 0.0003 of zero, and the reversals', at 1.51 and 1.58 a minute, within 0.22. So the failure is the model's, not the numerics'. But with the frequency pinned and no 20 s bout at either step, two of the clauses couldn't have failed here, and the stiff A-type dynamics behind the first fit's step bias never occur, so the pass speaks for this fit alone (DECISIONS.md, 2026-09-28).
- **Five of its twelve values sit on a bound:** g_osc at 5 nS and κ_gap,B at 1, their tops; θ_osc at −28 mV and θ_nmj at −0.3, their floors; and τ_n at 0.2 s, its top. The noise, σ_n = 0.0594 pA·√s, ends about a third of the way to its bound. Each value on a bound pushes the same way, quieting the motor circuits (DECISIONS.md, 2026-09-28).
- **R's second round's fit** (DECISIONS.md, 2026-09-29) moves at 0.036 body lengths per second. All 168 of its reversals follow a flip of the head switch, and its mid-body spectrum peaks at the switch's 0.082 Hz, as the refit's does; with the switch removed it doesn't move, and with the B-types lesioned it still moves forward 77% of the time, a review found. Its graded frequency and wavelength come from bouts piled at the 10 s floor and move with the step, so its result isn't final and it can't be chosen.
- **The second round's probe found a crawler the rules can't choose** (DECISIONS.md, 2026-09-29). Seed 14's pick passes §7.2's comparison over 200 paired seeds and grades partial on checkpoint 1's own trials: 0.341 Hz, 0.50 body lengths, 0.103 body lengths per second and a 20 s bout in every trial. The head switch paces it, the B-types give it thrust, and it never reverses. It sits in a corner of the parameters' box that the full run's search never reached, and only the full run's fit could be chosen, so it is recorded as exploratory. Its crawl needs the head switch's and proprioception's currents to drive neurons far outside the reversal range, an investigation found (DECISIONS.md, 2026-09-29).
- **The survey of the bounded model found two slow crawlers the rules can't choose** (DECISIONS.md, 2026-09-29). With the head switch and proprioception as conductances, 2 of 16 searches graded partial on seeds of their own: 0.129 and 0.186 Hz, 0.061 body lengths per second, at partial's floor, and no reversal. Their head switch's gate stays open throughout, so its rhythm, not the network's, paces them, and at half the step one of them is partial by 0.00001, a review found. They are exploratory, and R's third round runs on the bounded model by rules of its own.
- **R's first fit, with white noise** (DECISIONS.md, 2026-09-27 and 2026-09-28), crawled faster, at 0.063 body lengths per second in bouts at 0.232 Hz, with 8 of 20 trials holding a 20 s run. But its reversals and the length of its runs came from the time step: at half the step 17 trials held one and it reached partial. The convergence studies traced this to the white noise, which a coarse step damps, and to the oscillators' stiff dynamics; the coloured noise and the refit followed.
- **The planned model's fit** (DECISIONS.md, 2026-09-27) was led by its head switch's slower cycle, at 0.073 Hz, and moved at 0.030 body lengths per second, its forward runs cut by the switch at 13.6 s at most; checkpoint 1 graded its frequency partial and its speed and bouts fail. It fails §7.2's comparison: at half the step its frequency, wavelength, speed and reversal rate all move outside their margins, so its result isn't final and it can't be chosen (DECISIONS.md, 2026-09-28).
- **On the planned model's provisional parameters** (DECISIONS.md, 2026-09-26), it fell into one slow cycle instead: its bend deepened over about a minute as it crept to a halt, then flipped, and it moved forward for about 25 s. Checkpoint 0's section below ran the silenced network on those parameters.
- **The silenced worm barely moves.** In the 120 s trials it never passes the motion floor, and over an hour in the assay no centroid got more than 0.17 mm from its start, against 40 mm to either spot's capture circle.
- **The touches reach no muscle.** Neither place's receptors, ALML, ALMR and AVM at the front and PLML and PLMR at the back, has a neuromuscular junction, so with their synapses cut a touch reaches the body only through the numerics: chiefly the integrator's restarts at its pulse's edges, and at rounding level the voltage solve's sums over every neuron. It moves no velocity sample by more than 2.7 × 10⁻⁷ body lengths per second; with the restarts switched off, 11 of the 20 touched trials still part from their twins, by up to 1.7 × 10⁻⁹. This page first said that with the restarts off a touched world stepped bit for bit as its twin, which held only for the seed first tried (DECISIONS.md).
- **The posterior clause passed at p = 0.051.** Its test compares the speeds before and after each touch, and the silenced worm creeps. In 30 of the 50 windows before a posterior touch it crept backward, and its speed rose after 26 of them: backward creep dying away. Over the same windows the untouched twins give the same rank sum, 808, and the same p, so the near-significance is the creep's, not the touch's. The test has no control for a worm's own trend, so checkpoint 0's reruns, and checkpoints 2 and 3, grade each touch against a sham-touched twin instead (PLAN §7.4).
- **The chemotaxis band is loose for a worm that moves.** A worm that moves but has no bias fails ±0.1 over 30 worms by chance 15% of the time if each worm has a one-in-five chance of reaching a spot, and 58% if every worm reaches one. The silenced worm doesn't move, so this run isn't affected; reruns grade the clause instead by a two-sided exact binomial test on arrivals (PLAN §7.4; DECISIONS.md, 2026-09-27).
- **The eigenworm clause passes a worm that barely moves.** Smooth bends are shapes the four eigenworms capture almost entirely; the clause measures how worm-like the postures are, not whether the worm moves.

## Results

<!-- harness:checkpoint-0 -->

### Checkpoint 0: the silenced network — **Pass**

Run on 2026-09-27 at `a633c02`: 20 trials of 120 s, seeds 1 to 20, each run untouched and touched, and 30 worms in the assay for up to 60 min, seeds 1 to 30, on the provisional parameters, not calibrated (PLAN §6.2): g_osc = 798 pS, τ_w = 1.53 s, θ_osc = −11.5 mV, g_sw = 258 pA, g_p = 16.7 pA, g_nmj = 2.45 per EM section, θ_nmj = 3.48 EM sections, σ_n = 0 pA·√s. Every trial's measures start after its first 10 s. Every trial and worm stayed finite, and no brain solve failed to converge.

| Clause          | Measured                                                                                                                         | Passes if                                                                                 | Grade    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------- |
| Crawling        | 0 forward bouts of 10 s or more                                                                                                  | None in any trial                                                                         | **Pass** |
| Anterior touch  | A reversal within 2 s after 0 of 50 touches (0%), and in 0 of the matched windows; p = 1.0                                       | Under 40%, or not more often than in the matched windows (Fisher's exact test, one-sided) | **Pass** |
| Posterior touch | Forward velocity 0.0000 before, 0.0000 after (body lengths/s), rising after 31 of 50 touches by 4.2 × 10⁻⁶ on average; p = 0.051 | No significant rise (Wilcoxon's signed-rank test, one-sided)                              | **Pass** |
| Chemotaxis      | CI 0.00: 0 of 30 at the odour, 0 at the control                                                                                  | Within ±0.1 of zero                                                                       | **Pass** |

Every clause is predicted, since nothing is calibrated to it: each passes if a behaviour that should need the connectome is absent without it.

#### Crawling

There were 0 forward bouts of 10 s or more; the longest forward run lasted 0.0 s. Backward activity, reported and not graded: 0 reversals of 1 s or more, 0.00 a minute.

| Seed | Posture | Forward / paused / backward | Longest forward run (s) | Reversals | Mean velocity (body lengths/s) | Self-intersecting postures |
| ---- | ------- | --------------------------- | ----------------------- | --------- | ------------------------------ | -------------------------- |
| 1    | 247     | 0% / 100% / 0%              | 0.0                     | 0         | 0.0000                         | 0                          |
| 2    | 5745    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0002                        | 0                          |
| 3    | 2081    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0001                         | 0                          |
| 4    | 2260    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0001                        | 0                          |
| 5    | 6605    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0001                        | 0                          |
| 6    | 2621    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0003                         | 0                          |
| 7    | 394     | 0% / 100% / 0%              | 0.0                     | 0         | −0.0002                        | 0                          |
| 8    | 874     | 0% / 100% / 0%              | 0.0                     | 0         | 0.0000                         | 0                          |
| 9    | 2169    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0000                         | 0                          |
| 10   | 4026    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0001                         | 0                          |
| 11   | 162     | 0% / 100% / 0%              | 0.0                     | 0         | 0.0000                         | 0                          |
| 12   | 1032    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0001                        | 0                          |
| 13   | 4410    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0000                         | 0                          |
| 14   | 4877    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0000                         | 0                          |
| 15   | 4679    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0011                         | 0                          |
| 16   | 1398    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0002                        | 0                          |
| 17   | 3516    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0000                         | 0                          |
| 18   | 3956    | 0% / 100% / 0%              | 0.0                     | 0         | −0.0001                        | 0                          |
| 19   | 6488    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0000                         | 0                          |
| 20   | 5323    | 0% / 100% / 0%              | 0.0                     | 0         | 0.0000                         | 0                          |

#### Touch

The same trials ran again, each touched 5 times, 20 s apart from t = 20 s, alternating front (F, s = 0.2) and back (B, s = 0.8), odd seeds starting at the front: 50 anterior touches and 50 posterior. Each front touch reached ALML, ALMR, AVM; each back touch reached PLML, PLMR. The matched windows are the untouched trials', at the same seed and time. The signed-rank test takes the 50 posterior touches whose forward velocity changed at all, with a rank sum of 808 for those after which it rose. Reported, not graded: over the same windows in the untouched trials, the same test gives a rank sum of 808, p = 0.051, and no velocity sample of a touched trial differs from its twin's by more than 2.7 × 10⁻⁷ body lengths per second. Backward activity in the touched trials, reported and not graded: 0 reversals of 1 s or more, 0.00 a minute.

| Seed | Touches   | Anterior touches followed by a reversal | Matched windows with one | Posterior touches: forward velocity before → after (body lengths/s) | Reversals |
| ---- | --------- | --------------------------------------- | ------------------------ | ------------------------------------------------------------------- | --------- |
| 1    | F B F B F | 0 of 3                                  | 0 of 3                   | 0.0000 → 0.0000                                                     | 0         |
| 2    | B F B F B | 0 of 2                                  | 0 of 2                   | −0.0002 → −0.0002                                                   | 0         |
| 3    | F B F B F | 0 of 3                                  | 0 of 3                   | 0.0001 → 0.0001                                                     | 0         |
| 4    | B F B F B | 0 of 2                                  | 0 of 2                   | −0.0001 → −0.0001                                                   | 0         |
| 5    | F B F B F | 0 of 3                                  | 0 of 3                   | −0.0001 → 0.0000                                                    | 0         |
| 6    | B F B F B | 0 of 2                                  | 0 of 2                   | 0.0004 → 0.0003                                                     | 0         |
| 7    | F B F B F | 0 of 3                                  | 0 of 3                   | −0.0001 → −0.0001                                                   | 0         |
| 8    | B F B F B | 0 of 2                                  | 0 of 2                   | 0.0000 → 0.0000                                                     | 0         |
| 9    | F B F B F | 0 of 3                                  | 0 of 3                   | 0.0001 → 0.0001                                                     | 0         |
| 10   | B F B F B | 0 of 2                                  | 0 of 2                   | 0.0002 → 0.0002                                                     | 0         |
| 11   | F B F B F | 0 of 3                                  | 0 of 3                   | 0.0000 → 0.0000                                                     | 0         |
| 12   | B F B F B | 0 of 2                                  | 0 of 2                   | −0.0001 → −0.0001                                                   | 0         |
| 13   | F B F B F | 0 of 3                                  | 0 of 3                   | 0.0000 → 0.0000                                                     | 0         |
| 14   | B F B F B | 0 of 2                                  | 0 of 2                   | 0.0000 → 0.0000                                                     | 0         |
| 15   | F B F B F | 0 of 3                                  | 0 of 3                   | 0.0008 → 0.0007                                                     | 0         |
| 16   | B F B F B | 0 of 2                                  | 0 of 2                   | −0.0003 → −0.0002                                                   | 0         |
| 17   | F B F B F | 0 of 3                                  | 0 of 3                   | 0.0000 → 0.0000                                                     | 0         |
| 18   | B F B F B | 0 of 2                                  | 0 of 2                   | −0.0002 → −0.0002                                                   | 0         |
| 19   | F B F B F | 0 of 3                                  | 0 of 3                   | 0.0000 → 0.0000                                                     | 0         |
| 20   | B F B F B | 0 of 2                                  | 0 of 2                   | 0.0000 → 0.0000                                                     | 0         |

#### Chemotaxis

Each worm ran alone in checkpoint 4's assay: the butanone spot's steady field, the worm's centroid starting at the dish's centre, 45 mm from each spot, and the run stopping when any part of its body came within 5 mm of a spot's centre. 0 worms reached the odour, 0 the control and 30 neither. The nearest any worm came was 44.47 mm from the odour spot's centre and 44.44 mm from the control's; the farthest any centroid got from its start was 0.173 mm.

| Seed | Posture | AWC-ON | Reached | Nearest the odour spot (mm) | Nearest the control (mm) | Farthest from the start (mm) |
| ---- | ------- | ------ | ------- | --------------------------- | ------------------------ | ---------------------------- |
| 1    | 247     | AWCL   | Neither | 44.72                       | 44.62                    | 0.025                        |
| 2    | 5745    | AWCL   | Neither | 44.47                       | 44.54                    | 0.043                        |
| 3    | 2081    | AWCR   | Neither | 44.77                       | 44.64                    | 0.035                        |
| 4    | 2260    | AWCR   | Neither | 44.75                       | 44.74                    | 0.062                        |
| 5    | 6605    | AWCR   | Neither | 44.84                       | 44.81                    | 0.054                        |
| 6    | 2621    | AWCR   | Neither | 44.62                       | 44.63                    | 0.058                        |
| 7    | 394     | AWCL   | Neither | 44.55                       | 44.54                    | 0.012                        |
| 8    | 874     | AWCL   | Neither | 44.55                       | 44.61                    | 0.047                        |
| 9    | 2169    | AWCR   | Neither | 44.68                       | 44.84                    | 0.046                        |
| 10   | 4026    | AWCL   | Neither | 44.56                       | 44.44                    | 0.064                        |
| 11   | 162     | AWCL   | Neither | 44.68                       | 44.66                    | 0.010                        |
| 12   | 1032    | AWCL   | Neither | 44.53                       | 44.47                    | 0.031                        |
| 13   | 4410    | AWCL   | Neither | 44.82                       | 44.80                    | 0.021                        |
| 14   | 4877    | AWCR   | Neither | 44.64                       | 44.70                    | 0.021                        |
| 15   | 4679    | AWCL   | Neither | 44.71                       | 44.78                    | 0.173                        |
| 16   | 1398    | AWCR   | Neither | 44.82                       | 44.77                    | 0.032                        |
| 17   | 3516    | AWCL   | Neither | 44.52                       | 44.55                    | 0.017                        |
| 18   | 3956    | AWCL   | Neither | 44.88                       | 44.75                    | 0.051                        |
| 19   | 6488    | AWCL   | Neither | 44.77                       | 44.72                    | 0.033                        |
| 20   | 5323    | AWCR   | Neither | 44.58                       | 44.44                    | 0.075                        |
| 21   | 1014    | AWCL   | Neither | 44.89                       | 44.89                    | 0.046                        |
| 22   | 645     | AWCL   | Neither | 44.56                       | 44.50                    | 0.028                        |
| 23   | 5014    | AWCR   | Neither | 44.68                       | 44.70                    | 0.017                        |
| 24   | 4945    | AWCL   | Neither | 44.92                       | 44.89                    | 0.021                        |
| 25   | 1543    | AWCR   | Neither | 44.52                       | 44.54                    | 0.034                        |
| 26   | 4604    | AWCR   | Neither | 44.82                       | 44.86                    | 0.027                        |
| 27   | 680     | AWCR   | Neither | 44.88                       | 44.89                    | 0.052                        |
| 28   | 5128    | AWCR   | Neither | 44.79                       | 44.76                    | 0.021                        |
| 29   | 820     | AWCL   | Neither | 44.52                       | 44.55                    | 0.035                        |
| 30   | 479     | AWCL   | Neither | 44.77                       | 44.71                    | 0.016                        |

<!-- /harness:checkpoint-0 -->

<!-- harness:checkpoint-1 -->

### Checkpoint 1: crawling — **Fail**

Run on 2026-09-29 at `c58765c`: 20 trials of 120 s, seeds 1 to 20, on the calibrated parameters (PLAN §7.3), here to three significant figures: g_osc = 5000 pS, g_osc,B = 3900 pS, τ_w = 2.64 s, θ_osc = −28 mV, g_sw = 312 pA, g_p = 0.19 pA, κ_gap,B = 1, g_nmj = 7.55 per unit of relative drive, θ_nmj = −0.3 relative drive, κ_SMD = 0.718, σ_n = 0.0594 pA·√s, τ_n = 0.2 s. Every measure starts after each trial's first 10 s. Every trial stayed finite, and no brain solve failed to converge.

| Clause                                       | Measured | Pass      | Partial   | Grade    | Kind               |
| -------------------------------------------- | -------- | --------- | --------- | -------- | ------------------ |
| Frequency (Hz)                               | 0.099    | 0.20–0.45 | 0.10–0.60 | **Fail** | Calibration target |
| Wavelength (body lengths)                    | 0.71     | 0.50–0.80 | 0.40–1.00 | **Pass** | Calibration target |
| Speed (body lengths/s)                       | 0.029    | 0.12–0.30 | 0.06–0.50 | **Fail** | Calibration target |
| Posture variance the four eigenworms capture | 98.4%    | ≥ 85%     | ≥ 70%     | **Pass** | Predicted          |
| Trials with a forward bout of 20 s or more   | 0%       | ≥ 80%     | ≥ 50%     | **Fail** | Predicted          |

The kinematics come from 12 forward bouts of 10 s or more, 120.8 s in all. Over them the mid-body curvature crossed its mean 24 times, 2.0 a bout; a full undulation crosses twice. The rear rod's curvature correlated best with the front's at a lag of 1.78 s (correlation 0.93). The eigenworm clause pools 8,820 postures sampled at 4 Hz; 0 self-intersecting postures were left out. The kinematic clauses are calibration targets, which the parameters were tuned against (PLAN §7.3), on seeds of their own, 1001 to 1020.

Diagnostics, reported and not graded (PLAN §7.4): the mid-body curvature's spectrum peaks at 0.082 Hz, with 1% of its power between 0.2 and 0.45 Hz; 54 of 54 reversals started within 3 s after a flip of the head switch; over reversals AVA's activation changed by −5.1 × 10⁻⁴ on average, against a standard deviation of 1.1 × 10⁻³; 16.0 neurons on average sat outside the model's reversal range, −48 to 0 mV, at each sample, and 22 at most; 8.0 on average, and 9 at most, sat more than 10 mV outside it; the voltages ran from −218.8 to 203.1 mV over every step of the measured windows.

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
