import { describe, expect, it } from 'vitest';
import { PARAMS } from '../science/params.ts';
import { AwcSensor } from './sensing.ts';

const K = PARAMS.awcAdaptationScale.value;
const TAU = PARAMS.awcAdaptationTime.value;
const DT = 0.0025;

describe("AWC-ON's adaptive threshold", () => {
  it("takes Levy & Bargmann's K and τ", () => {
    const sensor = new AwcSensor(1);
    expect([sensor.scale, sensor.time]).toEqual([5.5, 17]);
  });

  it('settles at K(1 − e^(−C/K)), near C in weak odour and below K in any', () => {
    const sensor = new AwcSensor(1);
    for (const c of [0, 1e-9, 0.01, 1, 5.5, 20, 1000]) {
      expect(sensor.settled(c)).toBeCloseTo(K * (1 - Math.exp(-c / K)), 14);
      expect(sensor.settled(c)).toBeLessThanOrEqual(Math.min(c, K));
    }
    expect(sensor.settled(1e-9) / 1e-9).toBeCloseTo(1, 8);
  });

  it('starts adapted to where it is', () => {
    const sensor = new AwcSensor(1);
    sensor.adapt(3);
    expect(sensor.threshold).toBe(sensor.settled(3));
    // Held there, it stays.
    for (let k = 0; k < 400; k++) sensor.step(3, DT);
    expect(sensor.threshold).toBeCloseTo(sensor.settled(3), 14);
  });

  it('relaxes to a new concentration as e^(−t/τ), whatever the step', () => {
    for (const dt of [DT, 0.1, 1]) {
      const sensor = new AwcSensor(1);
      sensor.adapt(0.5);
      const start = sensor.threshold;
      const target = sensor.settled(4);
      for (let t = 0; t < TAU - 1e-9; t += dt) sensor.step(4, dt);
      expect((sensor.threshold - target) / (start - target), `${dt} s`).toBeCloseTo(Math.exp(-1), 10);
    }
  });

  it('counts a concentration below zero as none', () => {
    const a = new AwcSensor(2);
    const b = new AwcSensor(2);
    a.adapt(1);
    b.adapt(1);
    expect(a.step(-1e-12, DT)).toBe(b.step(0, DT));
    expect(a.threshold).toBe(b.threshold);
    a.adapt(-1);
    expect(a.threshold).toBe(0);
  });
});

describe("AWC-ON's current", () => {
  it('is g·(T − C)/(T + C): depolarising below the threshold, hyperpolarising above, bounded by g', () => {
    const sensor = new AwcSensor(4);
    sensor.threshold = 2;
    expect(sensor.current(1)).toBeCloseTo((4 * 1) / 3, 14);
    expect(sensor.current(2)).toBe(0);
    expect(sensor.current(6)).toBeCloseTo((4 * -4) / 8, 14);
    for (const c of [0, 1e-6, 0.5, 2, 50, 1e9]) {
      expect(Math.abs(sensor.current(c))).toBeLessThanOrEqual(4);
    }
  });

  it('gives exactly g when the odour is removed, whatever it was adapted to', () => {
    for (const c of [1e-6, 0.3, 5.5, 100]) {
      const sensor = new AwcSensor(3.7);
      sensor.adapt(c);
      expect(sensor.step(0, DT)).toBe(3.7);
    }
  });

  it('is at rest with neither odour nor threshold, and fully off at the first whiff', () => {
    const sensor = new AwcSensor(5);
    expect(sensor.step(0, DT)).toBe(0);
    expect(sensor.current(1e-9)).toBe(-5);
  });

  it('takes the threshold after the step, so an adapted sensor feels its own concentration', () => {
    const sensor = new AwcSensor(1);
    sensor.adapt(1);
    const before = sensor.threshold;
    const current = sensor.step(2, DT);
    expect(sensor.threshold).toBeGreaterThan(before);
    expect(current).toBe(sensor.current(2));
  });
});
