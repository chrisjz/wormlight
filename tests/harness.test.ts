// The harness's trials on the CPU reference: a World started from a real posture, sampled for checkpoints 0
// and 1 (PLAN §7.4).

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { provisionalParams, World } from '../src/sim/world.ts';
import { SEEDS } from '../src/validation/checkpoints.ts';
import { resample, tangentAngles } from '../src/validation/posture.ts';
import { runTrial, startingPosture } from '../src/validation/trial.ts';
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
    const { index, turn } = startingPosture(5, POSTURES.length);
    const world = new World(data, provisionalParams(), { posture: POSTURES[index].map((a) => a + turn) });
    const angles = tangentAngles(resample(world.body.midline()));
    for (let k = 0; k < 100; k++) expect(Math.abs(angles[k] - POSTURES[index][k])).toBeLessThan(0.05);
    expect(() => new World(data, provisionalParams(), { posture: POSTURES[0], heading: 0 })).toThrow(/not both/);
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
