// The app's starting world (src/ui/start.ts): the worm straight at the dish's centre, heading where its seed
// says, on the provisional parameters.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { provisionalParams } from '../src/sim/world.ts';
import { appWorld, startingHeading } from '../src/ui/start.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));

describe("the app's starting world", () => {
  it('lies straight at the centre of the dish, heading where its seed says', () => {
    for (const seed of [1, 7, 123456789]) {
      const world = appWorld(data, seed);
      const { x, y } = world.body;
      const n = x.length;
      expect(Math.abs(x.reduce((a, b) => a + b, 0) / n)).toBeLessThan(1e-15);
      expect(Math.abs(y.reduce((a, b) => a + b, 0) / n)).toBeLessThan(1e-15);
      // The head leads: the direction from the tail to the head is the heading.
      const heading = Math.atan2(y[0] - y[n - 1], x[0] - x[n - 1]);
      const off = heading - startingHeading(seed);
      expect(Math.abs(Math.atan2(Math.sin(off), Math.cos(off)))).toBeLessThan(1e-12);
      expect(world.params).toEqual(provisionalParams());
      expect(world.brain.seed).toBe(seed);
    }
  });

  it('draws different headings for different seeds', () => {
    const headings = [1, 2, 3, 4, 5].map(startingHeading);
    expect(new Set(headings.map((h) => h.toFixed(6))).size).toBe(5);
    for (const h of headings) {
      expect(h).toBeGreaterThan(0);
      expect(h).toBeLessThan(2 * Math.PI);
    }
  });
});
