# Validation

How Wormlight's behaviour compares with the real worm's, by the checkpoints PLAN §7 fixes in advance. The behavioural harness runs each checkpoint on the CPU reference (`npm run harness -- --checkpoint <n>`) and writes its results below, between the markers; the prose around them is written by hand. Whether the GPU matches the CPU reference is checked separately, by GPU parity (PLAN §7.2).

## Where it stands

| Checkpoint          | Result      | Status                                                                                                                  |
| ------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| 0: silenced network | **Pass**    | Crawling, touch and chemotaxis clauses, on the planned model's provisional values; runs again on R's fit                |
| 1: crawling         | **Fail**    | On R's fit at the 2.5 ms step: speed partial, too few 20 s bouts; partial at half the step, so R is suspended (PLAN §9) |
| 2 to 6              | Not reached | They need forward crawling, which checkpoint 1's crawl gate guards (PLAN §7.4, §9)                                      |

Crawling as checkpoint 1 asks for it does not yet emerge from the connectome (DECISIONS.md, 2026-09-26 and 2026-09-27). Track R calibrated the planned model as it stands, then built its own model and calibrated that (PLAN §7.3, §9; DECISIONS.md, 2026-09-27). Checkpoint 1's section below grades R's fit. A rule set before the fit chose it over the planned model's as the real wiring's final fit, with three clauses at pass against two; the choice used these same trials. At the model's 2.5 ms step R's fit falls short of partial on the bout clause alone, but at half the step it reaches partial, so R is suspended until the numerics converge (DECISIONS.md, 2026-09-28). Checkpoint 0 last ran on the planned model's provisional values, the best of the go/no-go's 96 draws with the noise off (PLAN §6.2), and runs again on R's fit. On the values checkpoint 0 last ran on, the intact model didn't crawl, so its crawling clause couldn't fail for lack of wiring, and its pass says nothing about the wiring (PLAN §9). Its touch and chemotaxis clauses are the same: they ask that the silenced worm show no reflex and no chemotaxis, which it couldn't while it barely moved, and their passes will mean something alongside passes of checkpoints 2 to 4, which wait behind checkpoint 1's crawl gate.

## How the trials run

- **Trials.** 20 of 120 s for checkpoints 0 and 1, seeds 1 to 20. Each starts from a real worm's posture, one of 6,655 that the OIST Physics of Behavior tutorials introduce as coming from Stephens et al.'s experiment, drawn by its seed and turned to a random heading (PLAN §7.4); checkpoint 0 silences the network on the same postures. The "Posture" column gives the row of the pinned `shapes.csv` a trial started from.
- **Motion** (PLAN §7.1). The centroid's velocity towards the head, over the centred second, sampled every 0.1 s: forward above +0.01 body lengths per second, backward below −0.01, a pause between, which ends a bout. A reversal is backward motion of 1 s or more. Every measure starts after a trial's first 10 s.
- **Checkpoint 1's measures** (PLAN §7.4). The kinematics over forward bouts of 10 s or more, pooled over trials, the wavelength only from a wave running from head to tail; the variance the first four eigenworms capture in postures sampled at 4 Hz, pooled over trials, self-intersecting ones left out; and the share of trials with a forward bout of 20 s or more.
- **Touched trials** (checkpoint 0, PLAN §7.4). The same 20 trials again, each touched 5 times, 20 s apart from t = 20 s, alternating front (s = 0.2) and back (s = 0.8), odd seeds starting at the front: 50 anterior touches and 50 posterior. A touch starts with the step after its time. A reversal follows a touch if its first backward sample lies within the 2 s after it, and the untouched trial at the same seed and time gives the matched window. The speed before and after a touch is the mean of the velocity samples whose windows lie within the 2 s on either side. Fisher's exact test and the signed-rank test are one-sided, in the reflex's direction, at α = 0.05.
- **The chemotaxis assay** (checkpoint 0 now, checkpoint 4 once reached). Each worm runs alone for up to 60 min on the butanone spot's steady field, starting with its centroid at the dish's centre from the posture its seed draws, and stops when any part of its body comes within 0.5 cm of either spot's centre. CI = (at odour − at control) / every worm run.
- **The step.** The convergence check's comparison of checkpoint 1's metrics at dt and dt/2 was deferred until checkpoint 1 reached partial, and now runs (PLAN §7.2): neither fit converges at any step down to 0.3125 ms, so no result on this page is final (DECISIONS.md, 2026-09-28).

## Reading the results

- **R's fit crawls, but not for long enough, and how long depends on the time step.** Over its 34 forward bouts of 10 s or more, 614 s in all, a bend travels from head to tail, the rear lagging the front by 0.92 s. It moves at 0.063 body lengths per second, about two-sevenths of a real worm's 0.22 and twice the planned fit's 0.030, forward 43–83% of the time. But only 8 of the 20 trials hold a forward run of 20 s, against the 10 partial needs. At half the 2.5 ms step, 17 do, and the fit reaches partial; at a quarter, all 20 do, and its frequency falls to partial. A convergence study found two causes: a coarse step damps the white-noise current in every neuron, and the oscillators' stiff dynamics carry an error that depends on the whole parameter set (DECISIONS.md, 2026-09-28).
- **The body undulates at the head switch's cycle, and its reversals are the switch's slips.** The mid-body curvature's spectrum peaks at 0.155 Hz, the head switch's cycle, with a harmonic near 0.30 Hz and 30% of its power between 0.2 and 0.45 Hz, where a crawling worm's lies. The graded 0.232 Hz counts crossings of that waveform and falls between the two, so, as for the planned fit, neither it nor the wavelength describes one wave. All 78 reversals began within 3 s after a flip of the switch, and AVA's activation barely changed over them. With a weaker switch the worm crawls about as fast with almost no reversals (DECISIONS.md, 2026-09-27). At finer steps the reversals all but vanish, so these slips are the step's (DECISIONS.md, 2026-09-28).
- **The B-types carry the crawl, and the A-types and AVA make the reversals, at this step.** The fit left the B-types without their oscillator, but with the A-types lesioned the worm still crawls and never reverses, while with the B-types lesioned, or proprioception silenced, it makes no bout. With AVA lesioned it reverses a seventh as often. Its reversals come from the step: at finer steps it barely reverses at all (DECISIONS.md, 2026-09-27 and 2026-09-28).
- **Five of its eleven values sit on a bound,** three of them from a sample clipped into the box. Pushed one at a time past three of them, it moves no faster than 0.091 body lengths per second, short of the pass band's 0.12 (DECISIONS.md, 2026-09-27).
- **The planned model's fit** (DECISIONS.md, 2026-09-27) was led by its head switch's slower cycle, at 0.073 Hz, and moved at 0.030 body lengths per second, its forward runs cut by the switch at 13.6 s at most; checkpoint 1 graded its frequency partial and its speed and bouts fail.
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

Run on 2026-09-27 at `7c8ff61`: 20 trials of 120 s, seeds 1 to 20, on the calibrated parameters (PLAN §7.3), here to three significant figures: g_osc = 5000 pS, g_osc,B = 0 pS, τ_w = 1.36 s, θ_osc = −28 mV, g_sw = 400 pA, g_p = 1.64 pA, κ_gap,B = 0.228, g_nmj = 40 per unit of relative drive, θ_nmj = −0.172 relative drive, κ_SMD = 0.158, σ_n = 0.127 pA·√s. Every measure starts after each trial's first 10 s. Every trial stayed finite, and no brain solve failed to converge.

| Clause                                       | Measured | Pass      | Partial   | Grade       | Kind               |
| -------------------------------------------- | -------- | --------- | --------- | ----------- | ------------------ |
| Frequency (Hz)                               | 0.232    | 0.20–0.45 | 0.10–0.60 | **Pass**    | Calibration target |
| Wavelength (body lengths)                    | 0.59     | 0.50–0.80 | 0.40–1.00 | **Pass**    | Calibration target |
| Speed (body lengths/s)                       | 0.063    | 0.12–0.30 | 0.06–0.50 | **Partial** | Calibration target |
| Posture variance the four eigenworms capture | 97.3%    | ≥ 85%     | ≥ 70%     | **Pass**    | Predicted          |
| Trials with a forward bout of 20 s or more   | 40%      | ≥ 80%     | ≥ 50%     | **Fail**    | Predicted          |

The kinematics come from 34 forward bouts of 10 s or more, 614.1 s in all. Over them the mid-body curvature crossed its mean 285 times, 8.4 a bout; a full undulation crosses twice. The rear rod's curvature correlated best with the front's at a lag of 0.92 s (correlation 0.87). The eigenworm clause pools 8,820 postures sampled at 4 Hz; 0 self-intersecting postures were left out. The kinematic clauses are calibration targets, which the parameters were tuned against (PLAN §7.3), on seeds of their own, 1001 to 1020.

Diagnostics, reported and not graded (PLAN §7.4): the mid-body curvature's spectrum peaks at 0.155 Hz, with 30% of its power between 0.2 and 0.45 Hz; 78 of 78 reversals started within 3 s after a flip of the head switch; over reversals AVA's activation changed by −4.1 × 10⁻⁴ on average, against a standard deviation of 3.7 × 10⁻³.

| Seed | Posture | Forward / paused / backward | Longest forward run (s) | Reversals | Mean velocity (body lengths/s) | Self-intersecting postures |
| ---- | ------- | --------------------------- | ----------------------- | --------- | ------------------------------ | -------------------------- |
| 1    | 247     | 58% / 30% / 12%             | 43.6                    | 8         | 0.0335                         | 0                          |
| 2    | 5745    | 73% / 25% / 1%              | 33.0                    | 0         | 0.0443                         | 0                          |
| 3    | 2081    | 67% / 30% / 2%              | 19.9                    | 2         | 0.0352                         | 0                          |
| 4    | 2260    | 57% / 34% / 9%              | 15.4                    | 5         | 0.0371                         | 0                          |
| 5    | 6605    | 43% / 42% / 14%             | 16.9                    | 9         | 0.0218                         | 0                          |
| 6    | 2621    | 61% / 35% / 4%              | 16.2                    | 2         | 0.0313                         | 0                          |
| 7    | 394     | 56% / 37% / 6%              | 16.5                    | 3         | 0.0304                         | 0                          |
| 8    | 874     | 68% / 26% / 5%              | 30.8                    | 4         | 0.0355                         | 0                          |
| 9    | 2169    | 83% / 14% / 3%              | 25.2                    | 2         | 0.0486                         | 0                          |
| 10   | 4026    | 65% / 29% / 6%              | 12.4                    | 3         | 0.0320                         | 0                          |
| 11   | 162     | 56% / 34% / 9%              | 21.0                    | 5         | 0.0322                         | 0                          |
| 12   | 1032    | 54% / 40% / 5%              | 16.0                    | 4         | 0.0281                         | 0                          |
| 13   | 4410    | 58% / 35% / 6%              | 11.2                    | 3         | 0.0370                         | 0                          |
| 14   | 4877    | 67% / 31% / 1%              | 29.7                    | 0         | 0.0359                         | 0                          |
| 15   | 4679    | 55% / 33% / 12%             | 17.6                    | 8         | 0.0288                         | 0                          |
| 16   | 1398    | 65% / 32% / 2%              | 16.8                    | 2         | 0.0363                         | 0                          |
| 17   | 3516    | 49% / 42% / 8%              | 13.6                    | 6         | 0.0241                         | 0                          |
| 18   | 3956    | 56% / 37% / 6%              | 15.5                    | 3         | 0.0297                         | 0                          |
| 19   | 6488    | 59% / 32% / 8%              | 22.1                    | 5         | 0.0369                         | 0                          |
| 20   | 5323    | 64% / 29% / 7%              | 22.6                    | 4         | 0.0357                         | 0                          |

<!-- /harness:checkpoint-1 -->
