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

// The two stages' exact response to a unit step at time 0, from rest at 0.
const stepResponse = (t: number): number => {
  const { rise, decay } = GCAMP6S;
  return t <= 0 ? 0 : 1 - (decay * Math.exp(-t / decay) - rise * Math.exp(-t / rise)) / (decay - rise);
};

// The largest error of the glow, read once every `frame` seconds, against the exact response to a unit step that
// lands at each of eleven phases within a frame.
function sampledError(frame: number): number {
  let worst = 0;
  for (let k = 0; k < 11; k++) {
    const onset = 0.2 + (frame * k) / 11;
    const glow = new Glow(1);
    glow.reset([0]);
    for (let t = frame; t < 3; t += frame) {
      glow.update([t >= onset ? 1 : 0], frame);
      worst = Math.max(worst, Math.abs(glow.value[0] - stepResponse(t - onset)));
    }
  }
  return worst;
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

  it('rises as the two stages in series do, slower than the slow stage alone', () => {
    const glow = new Glow(1);
    glow.reset([0]);
    for (let k = 0; k < 500; k++) glow.update([1], 0.001);
    // Half a second after a step: 0.462, where the 686 ms stage alone would be at 0.518.
    expect(glow.value[0]).toBeCloseTo(stepResponse(0.5), 3);
    expect(stepResponse(0.5)).toBeCloseTo(0.462, 3);
    expect(glow.value[0]).toBeLessThan(1 - Math.exp(-0.5 / GCAMP6S.decay) - 0.05);
  });

  it('errs by little read once a frame at 1×, and by under a tenth of full scale at 10×', () => {
    // At 60 frames a second, a frame spans 1/60 s of the worm's time at 1× and 1/6 s at 10×, and a step lands anywhere
    // within one: the error is the sampling's (PLAN §1).
    expect(sampledError(1 / 60)).toBeLessThan(0.015);
    expect(sampledError(1 / 6)).toBeLessThan(0.1);
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
