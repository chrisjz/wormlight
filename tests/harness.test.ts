// The harness's trials on the CPU reference: a World started from a real posture, sampled for checkpoints 0
// and 1, touched for checkpoint 0's touch clause, and run in the chemotaxis assay (PLAN §7.4).

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { CAPTURE_RADIUS, CONTROL, SPOT, steadyField } from '../src/sim/env/dish.ts';
import { BACK, FRONT } from '../src/sim/touch.ts';
import { PLANNED } from '../src/science/planned.ts';
import { plannedParams, World } from '../src/sim/world.ts';
import { runChemotaxis } from '../src/validation/chemotaxis.ts';
import { SEEDS } from '../src/validation/checkpoints.ts';
import { resample, tangentAngles } from '../src/validation/posture.ts';
import { runTrial, startingPosture, startingWorld } from '../src/validation/trial.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
// The trial's mechanics, on the planned model's go/no-go values, whose noise is off.
const MECHANICS = plannedParams(PLANNED.provisional);

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
        params: MECHANICS,
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
    expect(() => new World(data, MECHANICS, { posture: POSTURES[0], heading: 0 })).toThrow(/not both/);
  });

  it('runs the silenced network, which stays still', () => {
    const r = runTrial(data, { seed: 3, seconds: 12, params: MECHANICS, postures: POSTURES, silenced: true });
    expect(r.finite).toBe(true);
    for (const v of r.velocity) expect(Math.abs(v)).toBeLessThan(0.01);
  });

  it('records aligned samples from 10 s, and postures at 4 Hz', () => {
    const r = runTrial(data, { seed: 2, seconds: 12, params: MECHANICS, postures: POSTURES });
    expect(r.finite).toBe(true);
    // Velocity from 10 s to the last sample whose second-long window ends by 12 s: 10.0 to 11.5 s.
    expect(r.velocity.length).toBe(16);
    for (const a of [r.mid, r.front, r.rear]) expect(a.length).toBe(r.velocity.length);
    // Postures at 10.0, 10.25, … 12.0 s.
    expect(r.postures.count + r.selfIntersecting).toBe(9);
    expect(r.posture).toBe(startingPosture(2, POSTURES.length).index);
  });
});

describe('a touched trial', () => {
  const options = { seed: 2, seconds: 13, params: MECHANICS, postures: POSTURES };

  it('is its untouched twin until the touch, and records the receptors each touch reached', () => {
    const plain = runTrial(data, options);
    const touched = runTrial(data, {
      ...options,
      touches: [
        { time: 10.5, s: FRONT },
        { time: 11.5, s: BACK },
      ],
    });
    expect(touched.touches).toEqual([
      { time: 10.5, s: FRONT, reached: ['ALML', 'ALMR', 'AVM'] },
      { time: 11.5, s: BACK, reached: ['PLML', 'PLMR'] },
    ]);
    // The sample at 10.0 s, whose window ends at the touch, is the same; the next, whose window runs 0.1 s past
    // it, isn't: the touch starts with the step after its time, neither earlier nor later.
    expect(touched.velocity[0]).toBe(plain.velocity[0]);
    expect(touched.velocity[1]).not.toBe(plain.velocity[1]);
    expect(plain.touches).toEqual([]);
  });

  it('reaches the body of a silenced worm only at rounding level, where an intact one responds', () => {
    // Touched front and back, then 3 s on: with every synapse cut, no receptor either touch reaches has a way to
    // the muscles, and the integrator's restarts and the voltage solve's sums leave only rounding.
    const apart = (silenced: boolean, seed: number): number => {
      const make = (): World => new World(data, MECHANICS, { seed, silenced, posture: POSTURES[seed] });
      const [plain, touched] = [make(), make()];
      for (let k = 0; k < 2000; k++) {
        if (k === 400) touched.touch(FRONT);
        if (k === 1200) touched.touch(BACK);
        plain.step();
        touched.step();
      }
      let most = 0;
      for (let i = 0; i < plain.body.rods; i++) {
        most = Math.max(
          most,
          Math.abs(plain.body.x[i] - touched.body.x[i]),
          Math.abs(plain.body.y[i] - touched.body.y[i]),
        );
      }
      return most;
    };
    for (const seed of [1, 2, 3]) {
      expect(apart(true, seed)).toBeLessThan(1e-10);
      expect(apart(false, seed)).toBeGreaterThan(1e-9);
    }
  });

  it('refuses a touch between steps, or outside the trial', () => {
    for (const time of [10.001, 13, -1]) {
      expect(() => runTrial(data, { ...options, touches: [{ time, s: FRONT }] })).toThrow(/doesn't fall on a step/);
    }
    expect(() =>
      runTrial(data, {
        ...options,
        touches: [
          { time: 10.5, s: FRONT },
          { time: 10.5, s: BACK },
        ],
      }),
    ).toThrow(/doesn't fall on a step/);
  });
});

describe('a worm in the chemotaxis assay', () => {
  const odour = steadyField('assay');
  const options = { seed: 4, seconds: 1, params: MECHANICS, postures: POSTURES, silenced: true, odour };

  it("starts from its trial's posture with its centroid at the dish's centre", () => {
    const r = runChemotaxis(data, options);
    expect(r.finite).toBe(true);
    expect(Math.hypot(...r.start)).toBeLessThan(1e-12);
    expect(r.posture).toBe(startingPosture(4, POSTURES.length).index);
    expect(r).toMatchObject({ reached: null, time: null, seconds: 1 });
    // The farthest the centroid got includes where it ended.
    const end = r.end ?? [NaN, NaN];
    expect(r.farthest).toBeGreaterThanOrEqual(Math.hypot(end[0] - r.start[0], end[1] - r.start[1]));
    // 45 mm from each spot's centre, less up to half a body length.
    for (const d of [r.closest.odour, r.closest.control]) {
      expect(d).toBeGreaterThan(SPOT[0] - 0.5e-3);
      expect(d).toBeLessThan(SPOT[0]);
    }
  });

  it('stops a worm when any part of it comes within 0.5 cm of a spot', () => {
    // A body half a millimetre long either side of its centroid lies wholly within the circle from 4 mm, and
    // wholly outside it from 6 mm.
    const inside = runChemotaxis(data, { ...options, at: [SPOT[0] - 4e-3, 0] });
    expect(inside).toMatchObject({ reached: 'odour', time: 0, seconds: 0 });
    expect(inside.closest.odour).toBeLessThan(CAPTURE_RADIUS);
    expect(runChemotaxis(data, { ...options, at: [CONTROL[0] + 4e-3, 0] }).reached).toBe('control');
    const outside = runChemotaxis(data, { ...options, at: [SPOT[0] - 6e-3, 0] });
    expect(outside.reached).toBe(null);
    expect(outside.closest.odour).toBeGreaterThan(CAPTURE_RADIUS);
    expect(outside.closest.odour).toBeLessThan(6.5e-3);
  });
});
