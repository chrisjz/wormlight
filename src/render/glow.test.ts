import { describe, expect, it } from 'vitest';
import { activations, GCAMP6S, Glow } from './glow.ts';

// The glow's response to a brief pulse from rest, sampled every millisecond: when it peaks, and how long after the
// peak it falls to half.
function pulse(dt = 0.001): { peak: number; halfDecay: number } {
  const glow = new Glow(1);
  glow.reset([0]);
  let peak = 0;
  let top = 0;
  let half = NaN;
  for (let k = 1; k * dt < 5; k++) {
    glow.update([k === 1 ? 1 : 0], dt);
    const t = k * dt;
    if (glow.value[0] > top) {
      top = glow.value[0];
      peak = t;
    } else if (Number.isNaN(half) && glow.value[0] <= top / 2) half = t - peak;
  }
  return { peak, halfDecay: half };
}

describe('the glow', () => {
  it('peaks 179 ms after a brief pulse and falls to half 550 ms later, as GCaMP6s does (Chen et al. 2013)', () => {
    const { peak, halfDecay } = pulse();
    expect(peak).toBeCloseTo(0.179, 2);
    expect(halfDecay).toBeCloseTo(0.55, 2);
    expect(GCAMP6S.rise).toBeLessThan(GCAMP6S.decay);
  });

  it('shows an activation held steady as itself, and settles on a new one', () => {
    const glow = new Glow(2);
    glow.reset([0.2, 0.9]);
    for (let k = 0; k < 100; k++) glow.update([0.2, 0.9], 0.016);
    expect(glow.value[0]).toBeCloseTo(0.2, 6);
    expect(glow.value[1]).toBeCloseTo(0.9, 6);
    for (let k = 0; k < 1000; k++) glow.update([0.7, 0.1], 0.016);
    expect(glow.value[0]).toBeCloseTo(0.7, 6);
    expect(glow.value[1]).toBeCloseTo(0.1, 6);
  });

  it('rises no faster than its slow stage allows, and does so at any frame rate', () => {
    const at = (dt: number): number => {
      const glow = new Glow(1);
      glow.reset([0]);
      for (let t = 0; t < 0.5 - 1e-9; t += dt) glow.update([1], dt);
      return glow.value[0];
    };
    // Half a second after a step the glow is well short of the step, and nearly the same sampled at 60 or 10 Hz.
    expect(at(1 / 60)).toBeGreaterThan(0.3);
    expect(at(1 / 60)).toBeLessThan(0.6);
    expect(Math.abs(at(1 / 60) - at(0.1))).toBeLessThan(0.05);
  });

  it('starts at the first activations it is given, rests at ½ before them, and ignores a step of no time', () => {
    const glow = new Glow(2);
    expect(Array.from(glow.value)).toEqual([0.5, 0.5]);
    glow.update([0.25, 1], 0.1);
    expect(Array.from(glow.value)).toEqual([0.25, 1]);
    glow.update([0, 0], 0);
    expect(Array.from(glow.value)).toEqual([0.25, 1]);
  });

  it("takes each neuron's activation as the model's sigmoid of its voltage above its threshold", () => {
    const a = activations([-35, -27, -43], [-35, -35, -35], 0.125);
    expect(a[0]).toBeCloseTo(0.5, 6);
    expect(a[1]).toBeCloseTo(1 / (1 + Math.exp(-1)), 6);
    expect(a[2]).toBeCloseTo(1 / (1 + Math.exp(1)), 6);
  });
});
