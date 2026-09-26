# Validation

How Wormlight's behaviour compares with the real worm's, by the checkpoints PLAN §7 fixes in advance. The behavioural harness runs each checkpoint on the CPU reference (`npm run harness -- --checkpoint <n>`) and writes its results below, between the markers; the prose around them is written by hand. Whether the GPU matches the CPU reference is checked separately, by GPU parity (PLAN §7.2).

## Where it stands

| Checkpoint          | Status                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| 0: silenced network | The crawling clause runs from milestone 3; the touch and chemotaxis clauses wait for milestone 4 |
| 1: crawling         | Runs from milestone 3; a fail until research track R succeeds                                    |
| 2 to 5              | Not reached: they need forward crawling, which checkpoint 1's crawl gate guards (PLAN §7.4)      |
| 6: wiring test      | Not reached                                                                                      |

Crawling does not yet emerge from the connectome (DECISIONS.md, 2026-09-26), and calibration waits for track R. Until then the harness runs on provisional parameters: the best of the planned model's 96 go/no-go draws, draw 46, with the noise off (PLAN §6.2). Its results describe that draw, not a calibrated model. While the intact model doesn't crawl, checkpoint 0's crawling clause can't fail for lack of wiring, so its pass says nothing about the wiring (PLAN §9).

## How the trials run

- **Trials.** 20 of 120 s for each checkpoint, seeds 1 to 20. Each starts from a real worm's posture, one of 6,655 from Stephens et al.'s experiment, drawn by its seed and turned to a random heading (PLAN §7.4); checkpoint 0 silences the network on the same postures. The "Posture" column gives the row of the pinned `shapes.csv` a trial started from.
- **Motion** (PLAN §7.1). The centroid's velocity towards the head, over the centred second, sampled every 0.1 s: forward above +0.01 body lengths per second, backward below −0.01, a pause between. A reversal is backward motion of 1 s or more. Every measure starts after a trial's first 10 s.
- **Checkpoint 1's measures** (PLAN §7.4). The kinematics over forward bouts of 10 s or more, pooled over trials; the variance the first four eigenworms capture in postures sampled at 4 Hz, pooled over trials, self-intersecting ones left out; and the share of trials with a forward bout of 20 s or more.
- **Not run yet.** The convergence check's comparison of checkpoint 1's metrics at dt and dt/2 (PLAN §7.2).

## Results

<!-- harness:checkpoint-0 -->

### Checkpoint 0: the silenced network, crawling clause — **Pass**

Run on 2026-09-26 at `417359e`: 20 trials of 120 s, seeds 1 to 20, on the provisional parameters, not calibrated (PLAN §6.2): g_osc = 798 pS, τ_w = 1.53 s, θ_osc = −11.5 mV, g_sw = 258 pA, g_p = 16.7 pA, g_nmj = 2.45 per EM section, θ_nmj = 3.48 EM sections, σ_n = 0 pA·√s. Every measure starts after each trial's first 10 s. Every trial stayed finite, and no brain solve failed to converge.

No forward bout of 10 s or more in any trial is the pass. There were 0; the longest forward run lasted 0.0 s. Backward activity, reported and not graded: 0 reversals of 1 s or more, 0.00 a minute.

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

<!-- /harness:checkpoint-0 -->

<!-- harness:checkpoint-1 -->

### Checkpoint 1: crawling — **Fail**

Run on 2026-09-26 at `417359e`: 20 trials of 120 s, seeds 1 to 20, on the provisional parameters, not calibrated (PLAN §6.2): g_osc = 798 pS, τ_w = 1.53 s, θ_osc = −11.5 mV, g_sw = 258 pA, g_p = 16.7 pA, g_nmj = 2.45 per EM section, θ_nmj = 3.48 EM sections, σ_n = 0 pA·√s. Every measure starts after each trial's first 10 s. Every trial stayed finite, and no brain solve failed to converge.

| Clause                                       | Measured | Pass      | Partial   | Grade    | Kind               |
| -------------------------------------------- | -------- | --------- | --------- | -------- | ------------------ |
| Frequency (Hz)                               | 0.045    | 0.20–0.45 | 0.10–0.60 | **Fail** | Calibration target |
| Wavelength (body lengths)                    | 3.54     | 0.50–0.80 | 0.40–1.00 | **Fail** | Calibration target |
| Speed (body lengths/s)                       | 0.029    | 0.12–0.30 | 0.06–0.50 | **Fail** | Calibration target |
| Posture variance the four eigenworms capture | 99.5%    | ≥ 85%     | ≥ 70%     | **Pass** | Predicted          |
| Trials with a forward bout of 20 s or more   | 0%       | ≥ 80%     | ≥ 50%     | **Fail** | Predicted          |

The kinematics come from 47 forward bouts of 10 s or more, 527.2 s in all. The rear rod's curvature followed the front's best at a lag of 1.98 s, correlation 0.80. The eigenworm clause pools 8,820 postures sampled at 4 Hz; 0 self-intersecting ones were left out. The kinematic clauses are calibration targets, but the parameters are provisional, not calibrated.

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
