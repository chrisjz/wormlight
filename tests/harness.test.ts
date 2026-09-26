// The harness's trials on the CPU reference: a World started from a real posture, sampled for checkpoints 0
// and 1 (PLAN §7.4).

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { provisionalParams, World } from '../src/sim/world.ts';
import { SEEDS } from '../src/validation/checkpoints.ts';
import { resample, tangentAngles } from '../src/validation/posture.ts';
import { runTrial, startingPosture, startingWorld } from '../src/validation/trial.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));

// Stand-ins for the real postures, which unit tests don't download: sinusoids of different phases.
const POSTURES = Array.from({ length: 7 }, (_, p) =>
  Array.from({ length: 100 }, (_, k) => 0.6 * Math.sin(2 * Math.PI * ((k + 0.5) / 65) + p)),
).map((row) => {
  const mean = row.reduce((a, b) => a + b, 0) / row.length;
  return row.map((a) => a - mean);
});

describe('a trial', () => {
  it('draws its starting posture from its seed', () => {
    const draws = SEEDS.map((seed) => startingPosture(seed, 6655));
    for (const d of draws) {
      expect(Number.isInteger(d.index) && d.index >= 0 && d.index < 6655).toBe(true);
      expect(d.turn).toBeGreaterThan(0);
      expect(d.turn).toBeLessThan(2 * Math.PI);
    }
    expect(new Set(draws.map((d) => d.index)).size).toBe(draws.length);
    expect(startingPosture(3, 6655)).toEqual(draws[2]);
  });

  it('starts the world from its posture, turned', () => {
    for (const seed of [1, 5, 9]) {
      const { world, start } = startingWorld(data, {
        seed,
        seconds: 0,
        params: provisionalParams(),
        postures: POSTURES,
      });
      expect(start).toEqual(startingPosture(seed, POSTURES.length));
      const points = resample(world.body.midline());
      const angles = tangentAngles(points);
      const posture = POSTURES[start.index];
      for (let k = 0; k < 100; k++) expect(Math.abs(angles[k] - posture[k])).toBeLessThan(0.05);
      // The turn: the head's first piece points along the posture's first angle turned by it.
      const head = Math.atan2(points[3] - points[1], points[2] - points[0]);
      const off = head - (posture[0] + start.turn);
      expect(Math.abs(Math.atan2(Math.sin(off), Math.cos(off)))).toBeLessThan(0.05);
    }
    expect(() => new World(data, provisionalParams(), { posture: POSTURES[0], heading: 0 })).toThrow(/not both/);
  });

  it('runs the silenced network, which stays still', () => {
    const r = runTrial(data, { seed: 3, seconds: 12, params: provisionalParams(), postures: POSTURES, silenced: true });
    expect(r.finite).toBe(true);
    for (const v of r.velocity) expect(Math.abs(v)).toBeLessThan(0.01);
  });

  it('records aligned samples from 10 s, and postures at 4 Hz', () => {
    const r = runTrial(data, { seed: 2, seconds: 12, params: provisionalParams(), postures: POSTURES });
    expect(r.finite).toBe(true);
    // Velocity from 10 s to the last sample whose second-long window ends by 12 s: 10.0 to 11.5 s.
    expect(r.velocity.length).toBe(16);
    for (const a of [r.mid, r.front, r.rear]) expect(a.length).toBe(r.velocity.length);
    // Postures at 10.0, 10.25, … 12.0 s.
    expect(r.postures.count + r.selfIntersecting).toBe(9);
    expect(r.posture).toBe(startingPosture(2, POSTURES.length).index);
  });
});
