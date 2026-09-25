// The go/no-go harness recomposes the World's loop; with no switch set it must be that loop, and its
// removals and silencing must be the World's lesions and silenced network.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../../../src/data/schema.ts';
import { NEURAL_STEP } from '../../../src/sim/numerics.ts';
import { World, type WorldOptions } from '../../../src/sim/world.ts';
import { ROOT } from '../../data/sources.ts';
import { Recorder, runVariant, type Draw, type Metrics, type Variant } from './loop.ts';
import { draw } from './variants.ts';

const data = validateWormlightData(JSON.parse(readFileSync(join(ROOT, 'public/data/wormlight.v1.json'), 'utf8')));
const SECONDS = 12;

function runWorld(p: Draw, options: WorldOptions): Metrics {
  const world = new World(
    data,
    {
      oscillatorGain: p.gOsc,
      recoveryTime: p.tauW,
      driveThreshold: p.theta,
      switchGain: p.gSw,
      proprioceptiveGain: p.gP,
      neuromuscularGain: p.gNmj,
      neuromuscularThreshold: p.tNmj,
      noise: 0,
    },
    options,
  );
  const recorder = new Recorder(world.body);
  let last = world.headSwitch.h;
  const steps = Math.round(SECONDS / NEURAL_STEP);
  for (let s = 1; s <= steps; s++) {
    world.step();
    if (world.headSwitch.h !== last) {
      recorder.flips++;
      last = world.headSwitch.h;
    }
    recorder.sample(s, world.curvature);
  }
  return recorder.metrics(steps);
}

describe('the go/no-go harness', () => {
  const cases: [string, Variant, WorldOptions][] = [
    ['the plan as merged', {}, {}],
    ['a removal, as a lesion', { remove: ['AVBL', 'AVBR'] }, { lesions: ['AVBL', 'AVBR'] }],
    ['the silenced network', { silenced: true }, { silenced: true }],
  ];
  // Draw 0 bends the body at about 0.5 Hz, so the comparison has something to compare.
  const p = draw(0, false);
  it.each(cases)('runs %s as the World does', (_name, variant, options) => {
    expect(runVariant(data, p, variant, SECONDS)).toEqual(runWorld(p, options));
  });

  it('compares runs that move', () => {
    expect(runWorld(p, {}).sdMid).toBeGreaterThan(0.1);
  });
});
