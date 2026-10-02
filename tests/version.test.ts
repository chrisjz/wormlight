// The versions a link carries (PLAN §1): the data's, a digest the data build writes into the runtime file, and the
// model's, a number held to a fingerprint of short runs of the app's world on the CPU reference.

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { dataVersion } from '../scripts/data/version.ts';
import { HISTORY, type Pinned } from '../scripts/ci/versions.ts';
import { validateWormlightData } from '../src/data/schema.ts';
import { DISH_RADIUS, FIRST_LAWN, lawnField, lawnSources } from '../src/sim/env/dish.ts';
import { NEURAL_STEP } from '../src/sim/numerics.ts';
import { BACK, FRONT } from '../src/sim/touch.ts';
import { MODEL_VERSION } from '../src/sim/version.ts';
import type { World, WorldState } from '../src/sim/world.ts';
import { Brains } from '../src/ui/experiment.ts';
import { appWorld } from '../src/ui/start.ts';
import { readJson, readRepo } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));

// The fingerprints pinned for each model version, with the data they were taken on, oldest first (PLAN §1). An entry
// is never changed, which CI checks against main (scripts/ci/versions.ts): a change that moves a fingerprint, or the
// data's version, adds one, with a new MODEL_VERSION unless only the data changed.
const PINNED = readJson<Pinned[]>(HISTORY);

// The app steps its odour field in blocks of this many of the worm's steps (PLAN §1, "One step").
const BLOCK = 64;

// A sum rounded as PLAN §1 sets: to nine significant figures, or nine decimal places below 1, so that engines that
// differ in their last bits agree; the rods' velocities to seven, since a wall's stiff contact makes them the part
// those last bits move most (DECISIONS.md, 2026-10-02).
const rounded = (x: number, digits = 9): string =>
  String(Number(Math.abs(x) >= 1 ? x.toPrecision(digits) : x.toFixed(digits)));

// The state a run is judged by, each part named here rather than read from the state's fields, so that renaming or
// adding one changes nothing: every neuron's voltage, activation, recovery and noise current; each rod's place,
// angle and velocity; each muscle's activation; the head switch's state and current; AWC-ON's threshold and current;
// and each touch receptor's current.
const judged = (s: WorldState): [string, number | ArrayLike<number>, number?][] => [
  ['voltage', s.brain.voltage],
  ['activation', s.brain.activation],
  ['recovery', s.brain.recovery],
  ['noise', s.brain.noise],
  ['x', s.x],
  ['y', s.y],
  ['theta', s.theta],
  ['velocity', s.velocity, 7],
  ['muscles', s.muscles],
  ['switch', s.h],
  ['switch current', s.switchCurrent],
  ['AWC threshold', s.awcThreshold],
  ['AWC current', s.awcCurrent],
  ['touch', s.touchApplied],
];

// Each part summed, arrays both as they stand and weighted by place, so that values trading places show too, and
// hashed.
function print(state: WorldState): string {
  const parts = judged(state).map(([name, value, digits]) => {
    if (typeof value === 'number') return `${name} ${rounded(value, digits)}`;
    let sum = 0;
    let placed = 0;
    for (let i = 0; i < value.length; i++) {
      sum += value[i];
      placed += ((i + 1) * value[i]) / value.length;
    }
    return `${name} ${rounded(sum, digits)} ${rounded(placed, digits)}`;
  });
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16);
}

// Step a world, doing what `at` holds for a step before it.
function run(world: World, steps: number, at: Record<number, () => void> = {}): string {
  for (let k = 0; k < steps; k++) {
    at[k]?.();
    world.step();
  }
  return print(world.snapshot());
}

// Five runs of 2 s of the app's world, each on a seed of its own:
// 1. intact on the first lawn's field;
// 2. the third rewiring with eight neurons lesioned, among them a B-type and an A-type, both AWCs and ALML, and a
//    touch at the front after 0.5 s;
// 3. a touch at the front after 0.5 s and at the back after 1.25 s, where the app's Front and Back touch;
// 4. the nose set at the wall and facing it;
// 5. an empty dish, then a lawn dropped 2 mm ahead of the nose after 0.48 s, the field stepped in the app's blocks.
function fingerprint(): string[] {
  const field = lawnField([FIRST_LAWN]);
  const brains = new Brains(data);
  const lesions = ['AVAL', 'AVBR', 'SMDDL', 'VB6', 'DA5', 'AWCL', 'AWCR', 'ALML'];
  const rewired = appWorld(data, 2, field, { network: brains.network(3), lesions });
  const touched = appWorld(data, 3, field);
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
  const empty = lawnField([]);
  const fed = appWorld(data, 5, empty);
  const blocks: Record<number, () => void> = {};
  for (let k = BLOCK; k < 800; k += BLOCK) blocks[k] = () => empty.step(BLOCK * NEURAL_STEP);
  const drop = blocks[3 * BLOCK];
  blocks[3 * BLOCK] = () => {
    drop();
    const [nx, ny] = fed.body.at(0);
    const [tx, ty] = fed.body.at(0.1);
    const d = Math.hypot(nx - tx, ny - ty);
    empty.setSources(lawnSources([[nx + (0.002 * (nx - tx)) / d, ny + (0.002 * (ny - ty)) / d]]));
  };
  return [
    run(appWorld(data, 1, field), 800),
    run(rewired, 800, { 200: () => rewired.touch(FRONT) }),
    run(touched, 800, { 200: () => touched.touch(FRONT), 500: () => touched.touch(BACK) }),
    run(wall, 800),
    run(fed, 800, blocks),
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
    // MODEL_VERSION; if only the data did, keep it. Either way add an entry to tests/model-versions.json with these values.
    expect({ model: MODEL_VERSION, data: data.meta.version, prints }).toEqual(latest);
  });

  it("takes the app's block of steps for the field", () => {
    expect(readRepo('src/ui/plateView.ts').toString('utf8')).toContain(`const COUPLING = ${BLOCK};`);
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
