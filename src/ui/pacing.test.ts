import { describe, expect, it } from 'vitest';
import { FRAME_CAP, Pacer, Rates } from './pacing.ts';

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

describe("the pacer's cap on a frame", () => {
  it('runs no more than the cap in a frame, and keeps the rest owed for the next', () => {
    const pacer = new Pacer(STEP, 100);
    // A tenth of a second at 10× owes 400 steps.
    expect(pacer.advance(0.1, 10, true, false)).toBe(100);
    expect(pacer.advance(0, 10, true, false)).toBe(100);
    expect(pacer.advance(0, 10, true, false)).toBe(100);
    expect(pacer.advance(0, 10, true, false)).toBe(100);
    expect(pacer.advance(0, 10, true, false)).toBe(0);
  });

  it('leaves a speed the cap allows as it was', () => {
    const [capped, free] = [new Pacer(STEP, FRAME_CAP), new Pacer(STEP)];
    // 30× at 60 frames a second is 200 steps a frame, and 10× at 120 is 33 or 34.
    for (const [rate, speed] of [
      [60, 30],
      [120, 10],
      [60, 1],
    ]) {
      for (let k = 0; k < 240; k++) {
        expect(capped.advance(1 / rate, speed, true, false)).toBe(free.advance(1 / rate, speed, true, false));
      }
    }
  });

  it('holds a saturated GPU to the cap a frame, the debt still bounded at a tenth of a second', () => {
    const pacer = new Pacer(STEP, FRAME_CAP);
    let steps = 0;
    // Asked for 100×, every other frame finding the GPU busy: each frame that runs takes the cap.
    for (let k = 0; k < 120; k++) {
      const n = pacer.advance(1 / 60, 100, true, k % 2 === 1);
      expect(n === 0 || n === FRAME_CAP).toBe(true);
      steps += n;
    }
    expect(steps).toBe(60 * FRAME_CAP);
  });

  it("is a ceiling at the display's rate: 256 steps a frame at 60 frames a second is 38.4×", () => {
    expect((FRAME_CAP * 60 * STEP).toFixed(1)).toBe('38.4');
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
