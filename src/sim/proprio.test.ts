import { describe, expect, it } from 'vitest';
import { Body, boyleBody } from './body/body.ts';
import { curvature, HeadSwitch, regionMean } from './proprio.ts';

describe('curvature', () => {
  // Lay the body's rods on a circular arc of radius r, turning anticlockwise (towards the dorsal side) or
  // clockwise from head to tail.
  function arc(radius: number, anticlockwise: boolean): Body {
    const body = new Body(boyleBody());
    const ls = body.params.segmentLength;
    const turn = anticlockwise ? 1 : -1;
    // From the origin along +x, curving towards +y (anticlockwise) or −y.
    for (let i = 0; i < body.rods; i++) {
      const angle = (i * ls) / radius;
      body.x[i] = radius * Math.sin(angle);
      body.y[i] = turn * radius * (1 - Math.cos(angle));
    }
    return body;
  }

  it('is κL, positive for a bend towards the dorsal side', () => {
    const length = 1e-3;
    for (const anticlockwise of [true, false]) {
      const body = arc(0.4e-3, anticlockwise);
      const k = new Float64Array(body.rods);
      curvature(body, k);
      expect([k[0], k[48]]).toEqual([0, 0]);
      // Rods an arc length ℓ apart: each chord turns by α = ℓ/r and is 2r sin(α/2) long.
      const alpha = body.params.segmentLength / 0.4e-3;
      const exact = (alpha / (2 * 0.4e-3 * Math.sin(alpha / 2))) * length;
      for (let i = 1; i < 48; i++) expect(k[i]).toBeCloseTo((anticlockwise ? 1 : -1) * exact, 6);
      expect(Math.abs(k[24])).toBeCloseTo(length / 0.4e-3, 3);
    }
  });

  it('bends towards the dorsal side when the dorsal muscles contract', () => {
    const body = new Body(boyleBody());
    body.dorsal.fill(1);
    for (let n = 0; n < 1000; n++) body.step(0.0025);
    const k = new Float64Array(body.rods);
    curvature(body, k);
    expect(regionMean(k, 0.2, 0.8)).toBeGreaterThan(1);
  });
});

describe('regionMean', () => {
  const k = Float64Array.from({ length: 49 }, (_, i) => i);

  it('averages the interior rods inside the region, or takes the nearest one', () => {
    // Rods 12 to 24 lie in [0.25, 0.5].
    expect(regionMean(k, 0.25, 0.5)).toBe(18);
    // [0.001, 0.01] holds no rod; the nearest interior one is rod 1.
    expect(regionMean(k, 0.001, 0.01)).toBe(1);
    // The end rods, which have no curvature, are never read.
    expect(regionMean(k, 0.99, 1)).toBe(47);
  });
});

describe('the head switch', () => {
  it('reverses the drive when P = K + b dK/dt reaches the threshold, with hysteresis', () => {
    const sw = new HeadSwitch(0.046, 2.33);
    // Steps of 1 s keep the derivative term small, so these values test the hysteresis itself.
    const dt = 1;
    expect(sw.h).toBe(1);
    // A steady dorsal bend short of the threshold does nothing; reaching it switches to ventral drive.
    expect(sw.update(2.0, dt, true)).toBe(false);
    expect(sw.update(2.0, dt, true)).toBe(false);
    expect(sw.update(2.4, dt, true)).toBe(true);
    expect(sw.h).toBe(0);
    // Now a dorsal bend does nothing, and only a ventral one past −P_th switches back.
    expect(sw.update(2.4, dt, true)).toBe(false);
    expect(sw.update(0, dt, true)).toBe(false);
    expect(sw.update(-2.2, dt, true)).toBe(false);
    expect(sw.update(-2.4, dt, true)).toBe(true);
    expect(sw.h).toBe(1);
  });

  it('anticipates with the derivative term', () => {
    const sw = new HeadSwitch(0.046, 2.33);
    sw.update(1.0, 0.0025, true);
    // K = 1.1 rising at 40 per second: P = 1.1 + 0.046 × 40 = 2.94.
    expect(sw.update(1.1, 0.0025, true)).toBe(true);
  });

  it('holds while not gated on, tracking K so its derivative stays true', () => {
    const sw = new HeadSwitch(0.046, 2.33);
    expect(sw.update(3, 0.0025, false)).toBe(false);
    expect(sw.h).toBe(1);
    // Gated on again with K steady, P is K: past the threshold, so it switches.
    expect(sw.update(3, 0.0025, true)).toBe(true);
  });
});
