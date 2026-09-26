import { describe, expect, it } from 'vitest';
import { Body, boyleBody } from '../sim/body/body.ts';
import {
  addPosture,
  covariance,
  emptySums,
  poolSums,
  resample,
  selfIntersects,
  tangentAngles,
  varianceCaptured,
} from './posture.ts';

// A 4 × 4 Hadamard basis with unit columns, as in the eigenworm check's tests.
const hadamard = [
  [0.5, 0.5, 0.5, 0.5],
  [-0.5, 0.5, -0.5, 0.5],
  [0.5, -0.5, -0.5, 0.5],
  [-0.5, -0.5, 0.5, 0.5],
];

// A sinusoidal posture of 100 angles, as tangent directions head to tail, with its mean removed.
const wave = (amplitude: number, phase: number): number[] =>
  Array.from({ length: 100 }, (_, k) => amplitude * Math.sin(2 * Math.PI * ((k + 0.5) / 100 / 0.65) + phase));

describe('postures', () => {
  it('resamples a midline at equal steps along its length', () => {
    // Two pieces, of lengths 1 and 3, resampled at five points: every unit along the way.
    const points = resample([0, 0, 1, 0, 1, 3], 5);
    expect(Array.from(points)).toEqual([0, 0, 1, 0, 1, 1, 1, 2, 1, 3]);
  });

  it('takes tangent angles unwrapped along the body, with their mean removed', () => {
    // A circle's worth of turning, which atan2 alone would wrap from π to −π.
    const n = 12;
    const points = Array.from({ length: n + 1 }, (_, k) => {
      const a = (2 * Math.PI * k) / n - Math.PI / 2;
      return [Math.cos(a), Math.sin(a)];
    }).flat();
    const angles = tangentAngles(points);
    for (let k = 1; k < n; k++) expect(angles[k] - angles[k - 1]).toBeCloseTo((2 * Math.PI) / n, 12);
    expect(angles.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 12);
  });

  it('finds a midline that crosses itself, and not one that only bends', () => {
    expect(selfIntersects([0, 0, 2, 0, 2, 1, 1, 1, 1, -1])).toBe(true);
    expect(selfIntersects([0, 0, 2, 0, 2, 1, 0, 1])).toBe(false);
    // Adjacent pieces share a point without crossing.
    expect(selfIntersects([0, 0, 1, 0, 0, 0.001])).toBe(false);
  });

  it('pools trials exactly, and measures the variance the first modes capture', () => {
    // Postures along the first mode, plus a little along the third: the first two modes capture all but that.
    const a = emptySums(4);
    const b = emptySums(4);
    for (let t = 0; t < 10; t++) {
      const along = (k: number): number => Math.sin(t) * hadamard[k][0] + 0.1 * Math.cos(3 * t) * hadamard[k][2];
      addPosture(t < 5 ? a : b, [0, 1, 2, 3].map(along));
    }
    const all = emptySums(4);
    for (const s of [a, b]) {
      all.count += s.count;
      s.sum.forEach((v, i) => (all.sum[i] += v));
      s.products.forEach((v, i) => (all.products[i] += v));
    }
    expect(poolSums([a, b], 4)).toEqual(all);
    const c = covariance(poolSums([a, b], 4));
    const first = varianceCaptured(c, hadamard, 1);
    expect(first).toBeGreaterThan(0.9);
    expect(first).toBeLessThan(1);
    expect(varianceCaptured(c, hadamard, 3)).toBeCloseTo(1, 12);
  });

  it('reads back the posture a body was laid in', () => {
    const body = new Body(boyleBody());
    for (const phase of [0, 1, 2]) {
      const posture = wave(0.8, phase);
      body.pose(posture.map((a) => a + 0.7));
      const angles = tangentAngles(resample(body.midline()));
      const mean = posture.reduce((x, y) => x + y, 0) / posture.length;
      // 49 rods carry the midline's 100 pieces, so it comes back smoothed between them, by 0.043 rad at most.
      for (let k = 0; k < 100; k++) expect(Math.abs(angles[k] - (posture[k] - mean))).toBeLessThan(0.05);
      // The rods sit at their rest spacing along it, each square to the line through its neighbours, with
      // t = (sin θ, −cos θ) running head to tail.
      const ls = body.params.segmentLength;
      for (let i = 1; i < body.rods; i++) {
        const gap = Math.hypot(body.x[i] - body.x[i - 1], body.y[i] - body.y[i - 1]);
        expect(gap / ls).toBeGreaterThan(0.99);
        expect(gap / ls).toBeLessThanOrEqual(1 + 1e-12);
      }
      for (let i = 1; i < body.rods - 1; i++) {
        const [dx, dy] = [body.x[i + 1] - body.x[i - 1], body.y[i + 1] - body.y[i - 1]];
        const [tx, ty] = [Math.sin(body.theta[i]), -Math.cos(body.theta[i])];
        expect((tx * dx + ty * dy) / Math.hypot(dx, dy)).toBeCloseTo(1, 12);
      }
    }
  });
});
