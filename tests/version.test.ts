// The versions a link carries (PLAN §1): the data's, a digest the data build writes into the runtime file, and the
// model's, a number held to a fingerprint of short runs of the app's world on the CPU reference.

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { dataVersion } from '../scripts/data/version.ts';
import { validateWormlightData } from '../src/data/schema.ts';
import { DISH_RADIUS, FIRST_LAWN, lawnField } from '../src/sim/env/dish.ts';
import { MODEL_VERSION } from '../src/sim/version.ts';
import type { World, WorldState } from '../src/sim/world.ts';
import { Brains } from '../src/ui/experiment.ts';
import { appWorld } from '../src/ui/start.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));

// The fingerprints pinned for each model version, with the data they were taken on, oldest first. An entry is never
// changed: a change that moves a fingerprint adds one, with a new MODEL_VERSION unless only the data changed.
const PINNED: { model: number; data: string; prints: string[] }[] = [
  {
    model: 1,
    data: '4dc6ffca',
    prints: ['1809cb0485ebee1d', 'c72ae9ce7677dfa1', 'c8e0d7da84937814', 'cbd589c743245c34', '4a3e2bf2f07330d3'],
  },
];

// A sum rounded as PLAN §1 sets: to nine significant figures, or nine decimal places below 1, so that engines that
// differ in their last bits agree.
const rounded = (x: number): string => String(Number(Math.abs(x) >= 1 ? x.toPrecision(9) : x.toFixed(9)));

// A world's state summed array by array, each array by its values and by its values weighted by their place, so
// that values trading places show too, and hashed.
function print(state: WorldState): string {
  const parts: string[] = [];
  const add = (key: string, value: unknown): void => {
    if (typeof value === 'number') parts.push(`${key} ${rounded(value)}`);
    else if (ArrayBuffer.isView(value)) {
      const a = value as unknown as ArrayLike<number>;
      let sum = 0;
      let placed = 0;
      for (let i = 0; i < a.length; i++) {
        sum += a[i];
        placed += ((i + 1) * a[i]) / a.length;
      }
      parts.push(`${key} ${rounded(sum)} ${rounded(placed)}`);
    } else if (value !== null && typeof value === 'object') {
      for (const k of Object.keys(value).sort()) add(`${key}.${k}`, (value as Record<string, unknown>)[k]);
    } else parts.push(`${key} ${String(value)}`);
  };
  add('state', state);
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16);
}

const run = (world: World, steps: number): string => {
  for (let k = 0; k < steps; k++) world.step();
  return print(world.snapshot());
};

// Five runs of 2 s of the app's world, each on a seed of its own: intact on the first lawn's field; the third
// rewiring with three neurons lesioned; a touch at the front after 0.5 s; the head pressed against the wall; and an
// empty dish.
function fingerprint(): string[] {
  const field = lawnField([FIRST_LAWN]);
  const brains = new Brains(data);
  const wall = appWorld(data, 4, field);
  // The body lies straight through the dish's centre, so moving it along its own line puts the nose at the wall,
  // facing it.
  const { x, y } = wall.body;
  const reach = Math.hypot(x[0], y[0]);
  const [ux, uy] = [x[0] / reach, y[0] / reach];
  for (let i = 0; i < x.length; i++) {
    x[i] += (DISH_RADIUS - reach) * ux;
    y[i] += (DISH_RADIUS - reach) * uy;
  }
  wall.adapt();
  const touched = appWorld(data, 3, field);
  for (let k = 0; k < 200; k++) touched.step();
  touched.touch(0.1);
  return [
    run(appWorld(data, 1, field), 800),
    run(appWorld(data, 2, field, { network: brains.network(3), lesions: ['AVAL', 'AVBR', 'SMDDL'] }), 800),
    run(touched, 600),
    run(wall, 800),
    run(appWorld(data, 5, lawnField([])), 800),
  ];
}

describe('the data version', () => {
  it("is the digest of the runtime data's neurons, muscles and connections", () => {
    expect(data.meta.version).toBe(dataVersion(data));
  });

  it('leaves out the notes, and follows any change to what the model reads', () => {
    const noted = { ...data, meta: { ...data.meta, citations: {} } };
    expect(dataVersion(noted)).toBe(data.meta.version);
    const moved = { ...data, gap: data.gap.map((g, i) => (i === 0 ? { ...g, sections: g.sections + 1 } : g)) };
    expect(dataVersion(moved)).not.toBe(data.meta.version);
  });
});

describe('the model version', () => {
  it('is the latest pinned, and its fingerprint is pinned with the data it was taken on', () => {
    const prints = fingerprint();
    const latest = PINNED.at(-1);
    // A failure here means the worm now behaves differently in a setup a link can name. If the model changed, raise
    // MODEL_VERSION; if only the data did, keep it. Either way add an entry to PINNED with these values.
    expect({ model: MODEL_VERSION, data: data.meta.version, prints }).toEqual(latest);
  });

  it('rises with every entry that keeps the data, and never falls', () => {
    for (let k = 1; k < PINNED.length; k++) {
      const [was, now] = [PINNED[k - 1], PINNED[k]];
      expect(now.model).toBeGreaterThanOrEqual(was.model);
      if (now.data === was.data) expect(now.model).toBeGreaterThan(was.model);
    }
    const pairs = PINNED.map((p) => `${p.model} ${p.data}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});
