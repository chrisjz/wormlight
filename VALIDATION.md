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
<!-- /harness:checkpoint-0 -->

<!-- harness:checkpoint-1 -->
<!-- /harness:checkpoint-1 -->
