# Validation

How Wormlight's behaviour compares with the real worm's, by the checkpoints PLAN §7 fixes in advance. The behavioural harness runs each checkpoint on the CPU reference (`npm run harness -- --checkpoint <n>`) and writes its results below, between the markers; the prose around them is written by hand. Whether the GPU matches the CPU reference is checked separately, by GPU parity (PLAN §7.2).

## Where it stands

| Checkpoint          | Result      | Status                                                                                       |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| 0: silenced network | **Pass**    | Crawling, touch and chemotaxis clauses, run in full once milestone 4 brought touch and odour |
| 1: crawling         | **Fail**    | A fail until research track R succeeds                                                       |
| 2 to 6              | Not reached | They need forward crawling, which checkpoint 1's crawl gate guards (PLAN §7.4, §9)           |

Crawling does not yet emerge from the connectome (DECISIONS.md, 2026-09-26), and calibration waits for track R. Until then the harness runs on provisional parameters: the best of the planned model's 96 go/no-go draws, draw 46, with the noise off (PLAN §6.2). Its results describe that draw, not a calibrated model. While the intact model doesn't crawl, checkpoint 0's crawling clause can't fail for lack of wiring, so its pass says nothing about the wiring (PLAN §9). Its touch and chemotaxis clauses are the same: they ask that the silenced worm show no reflex and no chemotaxis, which it can't while it barely moves, and their passes will mean something beside checkpoints 2 to 4, which wait for track R.

## How the trials run

- **Trials.** 20 of 120 s for each checkpoint, seeds 1 to 20. Each starts from a real worm's posture, one of 6,655 that the OIST Physics of Behavior tutorials introduce as coming from Stephens et al.'s experiment, drawn by its seed and turned to a random heading (PLAN §7.4); checkpoint 0 silences the network on the same postures. The "Posture" column gives the row of the pinned `shapes.csv` a trial started from.
- **Motion** (PLAN §7.1). The centroid's velocity towards the head, over the centred second, sampled every 0.1 s: forward above +0.01 body lengths per second, backward below −0.01, a pause between, which ends a bout. A reversal is backward motion of 1 s or more. Every measure starts after a trial's first 10 s.
- **Checkpoint 1's measures** (PLAN §7.4). The kinematics over forward bouts of 10 s or more, pooled over trials, the wavelength only from a wave running from head to tail; the variance the first four eigenworms capture in postures sampled at 4 Hz, pooled over trials, self-intersecting ones left out; and the share of trials with a forward bout of 20 s or more.
- **Touched trials** (checkpoint 0, PLAN §7.4). The same 20 trials again, each touched 5 times, 20 s apart from t = 20 s, alternating front (s = 0.2) and back (s = 0.8), odd seeds starting at the front: 50 anterior touches and 50 posterior. A touch starts with the step after its time. A reversal follows a touch if its first backward sample lies within the 2 s after it, and the untouched trial at the same seed and time gives the matched window. The speed before and after a touch is the mean of the velocity samples whose windows lie within the 2 s on either side. Fisher's exact test and the signed-rank test are one-sided, in the reflex's direction, at α = 0.05.
- **The chemotaxis assay** (checkpoint 0 now, checkpoint 4 once reached). Each worm runs alone for up to 60 min on the butanone spot's steady field, starting with its centroid at the dish's centre from the posture its seed draws, and stops when any part of its body comes within 0.5 cm of either spot's centre. CI = (at odour − at control) / every worm run.
- **Deferred.** The convergence check's comparison of checkpoint 1's metrics at dt and dt/2 waits until checkpoint 1 reaches partial (PLAN §7.2).

## Reading the results

- **The model doesn't crawl.** From every starting posture it falls into one cycle: its bend deepens over about a minute as it creeps to a halt, then flips, and it moves forward for about 25 s while the bend swings to the other side and back (DECISIONS.md, 2026-09-26).
- **Its bouts are half-episodes.** Each 25 s forward episode dips once to 0.00945 body lengths per second, just under the floor, so it counts as two bouts of about 11 s. At a floor of 0.009 the bout clause would pass; the floor was fixed before the trials and is kept.
- **Its frequency is a swing's timing.** The mid-body curvature crosses its mean once a bout, so the frequency and the wavelength computed from it don't describe an undulation.
- **The silenced worm barely moves.** In the 120 s trials it never passes the motion floor, and over an hour in the assay no centroid got more than 0.17 mm from its start, against 40 mm to either spot's capture circle.
- **The touches reach no muscle.** Neither place's receptors, ALML, ALMR and AVM at the front and PLML and PLMR at the back, has a neuromuscular junction, so with their synapses cut a touch reaches the body only through the integrator's restarts at its pulse's edges, and moves no velocity sample by more than 2.7 × 10⁻⁷ body lengths per second. With the restarts switched off, a touched world steps bit for bit as its twin.
- **The posterior clause passed at p = 0.051.** Its test compares the speeds before and after each touch, and the silenced worm creeps: over the same windows the untouched twins give the same rank sum, 808, and the same p, so the near-significance is the creep's, not the touch's. The test has no control for a worm's own trend; checkpoint 3 uses it too.
- **The eigenworm clause passes a worm that doesn't crawl.** Smooth bends are shapes the four eigenworms capture almost entirely; the clause measures how worm-like the postures are, not whether the worm moves.

## Results

<!-- harness:checkpoint-0 -->

### Checkpoint 0: the silenced network — **Pass**

Run on 2026-09-27 at `67dbcda`: 20 trials of 120 s, seeds 1 to 20, each run untouched and touched, and 30 worms in the assay for up to 60 min, seeds 1 to 30, on the provisional parameters, not calibrated (PLAN §6.2): g_osc = 798 pS, τ_w = 1.53 s, θ_osc = −11.5 mV, g_sw = 258 pA, g_p = 16.7 pA, g_nmj = 2.45 per EM section, θ_nmj = 3.48 EM sections, σ_n = 0 pA·√s. Every trial's measures start after its first 10 s. Every trial and worm stayed finite, and no brain solve failed to converge.

| Clause          | Measured                                                                                   | Passes if                                                                                 | Grade    |
| --------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------- |
| Crawling        | 0 forward bouts of 10 s or more                                                            | None in any trial                                                                         | **Pass** |
| Anterior touch  | A reversal within 2 s after 0 of 50 touches (0%), and in 0 of the matched windows; p = 1.0 | Under 40%, or not more often than in the matched windows (Fisher's exact test, one-sided) | **Pass** |
| Posterior touch | Forward velocity 0.0000 before, 0.0000 after (body lengths/s); p = 0.051                   | No significant rise (Wilcoxon's signed-rank test, one-sided)                              | **Pass** |
| Chemotaxis      | CI 0.00: 0 of 30 at the odour, 0 at the control                                            | Within ±0.1 of zero                                                                       | **Pass** |

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

The same trials ran again, each touched 5 times, 20 s apart from t = 20 s, alternating front (F, s = 0.2) and back (B, s = 0.8), odd seeds starting at the front: 50 anterior touches and 50 posterior. Each front touch reached ALML, ALMR, AVM; each back touch PLML, PLMR. The matched windows are the untouched trials', at the same seed and time. The signed-rank test takes the 50 posterior touches whose forward velocity changed at all, with a rank sum of 808 for those after which it rose. Reported, not graded: over the same windows in the untouched trials, the same test gives a rank sum of 808, p = 0.051, and no velocity sample of a touched trial differs from its twin's by more than 2.7 × 10⁻⁷ body lengths per second. Backward activity in the touched trials, reported and not graded: 0 reversals of 1 s or more, 0.00 a minute.

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

Run on 2026-09-26 at `a4c48dd`: 20 trials of 120 s, seeds 1 to 20, on the provisional parameters, not calibrated (PLAN §6.2): g_osc = 798 pS, τ_w = 1.53 s, θ_osc = −11.5 mV, g_sw = 258 pA, g_p = 16.7 pA, g_nmj = 2.45 per EM section, θ_nmj = 3.48 EM sections, σ_n = 0 pA·√s. Every measure starts after each trial's first 10 s. Every trial stayed finite, and no brain solve failed to converge.

| Clause                                       | Measured | Pass      | Partial   | Grade    | Kind               |
| -------------------------------------------- | -------- | --------- | --------- | -------- | ------------------ |
| Frequency (Hz)                               | 0.045    | 0.20–0.45 | 0.10–0.60 | **Fail** | Calibration target |
| Wavelength (body lengths)                    | 5.82     | 0.50–0.80 | 0.40–1.00 | **Fail** | Calibration target |
| Speed (body lengths/s)                       | 0.029    | 0.12–0.30 | 0.06–0.50 | **Fail** | Calibration target |
| Posture variance the four eigenworms capture | 99.5%    | ≥ 85%     | ≥ 70%     | **Pass** | Predicted          |
| Trials with a forward bout of 20 s or more   | 0%       | ≥ 80%     | ≥ 50%     | **Fail** | Predicted          |

The kinematics come from 47 forward bouts of 10 s or more, 527.2 s in all. Over them the mid-body curvature crossed its mean 47 times, 1.0 a bout; a full undulation crosses twice. The rear rod's curvature correlated best with the front's at a lag of 0.48 s (correlation 0.96). The eigenworm clause pools 8,820 postures sampled at 4 Hz; 0 self-intersecting postures were left out. The kinematic clauses are calibration targets, but the parameters are provisional, not calibrated.

| Seed | Posture | Forward / paused / backward | Longest forward run (s) | Reversals | Mean velocity (body lengths/s) | Self-intersecting postures |
| ---- | ------- | --------------------------- | ----------------------- | --------- | ------------------------------ | -------------------------- |
| 1    | 247     | 23% / 77% / 0%              | 11.6                    | 0         | 0.0081                         | 0                          |
| 2    | 5745    | 30% / 70% / 0%              | 11.6                    | 0         | 0.0110                         | 0                          |
| 3    | 2081    | 31% / 69% / 0%              | 11.6                    | 0         | 0.0111                         | 0                          |
| 4    | 2260    | 21% / 79% / 0%              | 11.6                    | 0         | 0.0075                         | 0                          |
| 5    | 6605    | 21% / 79% / 0%              | 11.6                    | 0         | 0.0074                         | 0                          |
| 6    | 2621    | 28% / 72% / 0%              | 11.6                    | 0         | 0.0098                         | 0                          |
| 7    | 394     | 24% / 76% / 0%              | 11.6                    | 0         | 0.0083                         | 0                          |
| 8    | 874     | 30% / 70% / 0%              | 11.6                    | 0         | 0.0110                         | 0                          |
| 9    | 2169    | 31% / 69% / 0%              | 11.6                    | 0         | 0.0109                         | 0                          |
| 10   | 4026    | 25% / 75% / 0%              | 11.6                    | 0         | 0.0084                         | 0                          |
| 11   | 162     | 29% / 71% / 0%              | 11.6                    | 0         | 0.0103                         | 0                          |
| 12   | 1032    | 21% / 79% / 0%              | 11.6                    | 0         | 0.0074                         | 0                          |
| 13   | 4410    | 21% / 79% / 0%              | 11.6                    | 0         | 0.0075                         | 0                          |
| 14   | 4877    | 30% / 70% / 0%              | 11.6                    | 0         | 0.0107                         | 0                          |
| 15   | 4679    | 36% / 64% / 0%              | 11.6                    | 0         | 0.0116                         | 0                          |
| 16   | 1398    | 21% / 79% / 0%              | 11.6                    | 0         | 0.0078                         | 0                          |
| 17   | 3516    | 21% / 79% / 0%              | 11.6                    | 0         | 0.0075                         | 0                          |
| 18   | 3956    | 31% / 69% / 0%              | 11.6                    | 0         | 0.0112                         | 0                          |
| 19   | 6488    | 30% / 70% / 0%              | 11.6                    | 0         | 0.0110                         | 0                          |
| 20   | 5323    | 29% / 71% / 0%              | 11.6                    | 0         | 0.0105                         | 0                          |

<!-- /harness:checkpoint-1 -->
