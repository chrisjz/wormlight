// Long-run GPU parity's statistics are the go/no-go experiments' (PLAN §7.2).

import { describe, expect, it } from 'vitest';
import { summarise } from '../scripts/experiments/go-no-go/loop.ts';
import { bodyWave } from '../src/sim/bodyWave.ts';

describe('the body wave', () => {
  it('is measured as the go/no-go experiments measure it', () => {
    const samples = Array.from({ length: 500 }, (_, i) => 3 * Math.sin(2 * Math.PI * 0.3 * i * 0.1 + 0.4) + 0.2);
    const theirs = summarise({ forward: 0, path: 0, k3: samples, k5: samples, k6: samples, flips: 0, duration: 50 });
    const ours = bodyWave(samples, 50);
    expect(ours.sd).toBe(theirs.sdMid);
    expect(ours.frequency).toBe(theirs.freq);
    expect(ours.frequency).toBeCloseTo(0.3, 2);
  });
});
