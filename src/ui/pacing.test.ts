import { describe, expect, it } from 'vitest';
import { Pacer, Rates } from './pacing.ts';

const STEP = 0.0025;

describe('the pacer', () => {
  it('runs real time at 60 frames a second, a fraction carried from frame to frame', () => {
    const pacer = new Pacer(STEP);
    let steps = 0;
    for (let k = 0; k < 60; k++) steps += pacer.advance(1 / 60, 1, true, false);
    expect(steps).toBe(400);
  });

  it('scales with the speed, and runs nothing paused', () => {
    const pacer = new Pacer(STEP);
    expect(pacer.advance(0.05, 10, true, false)).toBe(200);
    expect(pacer.advance(0.05, 0.25, true, false)).toBe(5);
    expect(pacer.advance(0.05, 1, false, false)).toBe(0);
  });

  it('counts a long gap as a tenth of a second', () => {
    expect(new Pacer(STEP).advance(5, 1, true, false)).toBe(40);
  });

  it('runs nothing while the GPU is busy, and lets no debt build past a tenth of a second', () => {
    const pacer = new Pacer(STEP);
    for (let k = 0; k < 30; k++) expect(pacer.advance(1 / 60, 10, true, true)).toBe(0);
    // A second at 10×, owed while busy, comes back as a tenth of a second's worth.
    expect(pacer.advance(1 / 60, 10, true, false)).toBe(401);
  });
});

describe('the rates', () => {
  it('give frames and simulated seconds a wall second', () => {
    const rates = new Rates();
    for (let k = 0; k <= 30; k++) rates.record(k * (1000 / 60), 10 / 60);
    const { fps, speed } = rates.get();
    expect(fps).toBeCloseTo(60, 6);
    expect(speed).toBeCloseTo(10, 6);
  });
});
