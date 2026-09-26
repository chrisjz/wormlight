// The world the app starts from (spec §5): the worm straight at the dish's centre, on the provisional
// parameters (PLAN §6.2), heading where its seed says, by a hash no noise draw, head-switch draw or trial's
// posture draw uses.

import type { WormlightData } from '../data/schema.ts';
import { hash, uniform } from '../sim/brain/rng.ts';
import { provisionalParams, World } from '../sim/world.ts';

export const startingHeading = (seed: number): number => 2 * Math.PI * uniform(hash(seed, 0, 0xfffffffc));

export function appWorld(data: WormlightData, seed: number): World {
  const world = new World(data, provisionalParams(), { seed, heading: startingHeading(seed) });
  const { x, y } = world.body;
  const cx = x.reduce((a, b) => a + b, 0) / x.length;
  const cy = y.reduce((a, b) => a + b, 0) / y.length;
  for (let i = 0; i < x.length; i++) {
    x[i] -= cx;
    y[i] -= cy;
  }
  return world;
}
