// The glow on the model (PLAN §1): its source at the model's rest, its scale, the channel that carries it, and its
// colours, which style.css, the palette and the shaders each write.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { activations, Glow, restingGlow } from '../src/render/glow.ts';
import {
  ACTIVE_RISE,
  activeStrength,
  GLOW_COLOUR,
  GLOW_FLOOR,
  glowBrightness,
  glowHalo,
  NEUTRAL,
} from '../src/render/palette.ts';
import { NEURAL_STEP } from '../src/sim/numerics.ts';
import { HALO_SHADER, NEURON_SHADER, wgslColour } from '../src/render/shaders.ts';
import { midpointActivation, restActivation } from '../src/sim/brain/brain.ts';
import { World } from '../src/sim/world.ts';
import { Activity } from '../src/ui/activity.ts';
import { appWorld } from '../src/ui/start.ts';
import { readJson, readRepo } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));

describe("the glow's source", () => {
  // Track S's model, which the app runs since its fit was chosen, rests the D-types 7.4 mV above their thresholds
  // (DECISIONS.md, 2026-10-02), so their glow rests at φ(7.4 mV), about 0.72, and every other neuron's at ½.
  it("is ½ for every neuron at the model's rest but the D-types, which rest at their offset's φ", () => {
    const world = appWorld(data, 1);
    const { voltage, threshold, network, activation, offset } = world.brain;
    const a = activations(voltage, threshold, network.slope);
    const dType = (i: number): boolean => /^(DD|VD)\d+$/.test(network.names[i]);
    const atOffset = 1 / (1 + Math.exp(-network.slope * 7.4));
    expect(atOffset).toBeCloseTo(0.716, 3);
    Array.from(a).forEach((x, i) => expect(x, network.names[i]).toBeCloseTo(dType(i) ? atOffset : 0.5, 6));
    // The model's own rest: each neuron's activation is the fixed point of ds/dt = rise φ (1 − s) − decay s at its φ,
    // rise / (rise + 2 decay) at φ = ½.
    const s = midpointActivation(network);
    expect(0.5 * network.rise * (1 - s) - network.decay * s).toBeCloseTo(0, 12);
    Array.from(activation).forEach((x, i) =>
      expect(x, network.names[i]).toBeCloseTo(restActivation(network, offset[i]), 12),
    );
  });

  it("gives each neuron's glow at rest from the brain's offsets, as the model rests", () => {
    const world = appWorld(data, 1);
    const { voltage, threshold, network, offset } = world.brain;
    const atRest = activations(voltage, threshold, network.slope);
    const rest = restingGlow(offset, network.slope);
    Array.from(rest).forEach((x, i) => expect(x, network.names[i]).toBeCloseTo(atRest[i], 6));
  });

  it('takes a lesioned world by its intact thresholds, as the model does', () => {
    const intact = new World(data, appWorld(data, 1).params, { seed: 1 });
    const cut = new World(data, intact.params, { seed: 1, lesions: ['AVAL'] });
    expect(cut.brain.threshold).toEqual(intact.brain.threshold);
  });
});

describe("the glow's scale", () => {
  it('runs from its floor at no activity to full, dim at rest, with a halo only above rest', () => {
    expect(glowBrightness(0)).toBeCloseTo(GLOW_FLOOR, 12);
    expect(GLOW_FLOOR).toBe(0.06);
    expect(glowBrightness(1)).toBeCloseTo(1, 12);
    expect(glowBrightness(0.5)).toBeCloseTo(0.06 + 0.94 * 0.25, 12);
    expect(glowHalo(0.5)).toBe(0);
    expect(glowHalo(0.25)).toBe(0);
    expect(glowHalo(1)).toBe(1);
    for (let g = 0; g < 1; g += 0.05) {
      expect(glowBrightness(g + 0.05)).toBeGreaterThan(glowBrightness(g));
      expect(glowHalo(g + 0.05)).toBeGreaterThanOrEqual(glowHalo(g));
    }
  });
});

describe('the synapses lit while the neurons glow, with none selected (DECISIONS.md, 2026-10-02)', () => {
  it("light as a neuron's glow rises past ACTIVE_RISE above its own rest, more as it rises, and fully at full glow", () => {
    expect(ACTIVE_RISE).toBe(0.1);
    expect(activeStrength(0.5, 0.5)).toBeNull();
    expect(activeStrength(0.6, 0.5)).toBeNull();
    expect(activeStrength(0.65, 0.5)).toBeCloseTo(0.125, 12);
    expect(activeStrength(1, 0.5)).toBe(1);
    // A D-type at its rest, about 0.72, lights nothing, though a fixed ¾ would sit only just above it.
    expect(activeStrength(0.716, 0.716)).toBeNull();
    expect(activeStrength(0.85, 0.716)).toBeCloseTo((0.85 - 0.716 - 0.1) / (1 - 0.716 - 0.1), 12);
    for (let g = 0.61; g < 1; g += 0.01)
      expect(activeStrength(g + 0.01, 0.5)).toBeGreaterThan(activeStrength(g, 0.5) ?? 0);
  });

  it("light some on the app's model as its worm crawls", () => {
    // The app's world, its glow read as the plate reads it, about once a frame at 60 frames a second.
    const world = appWorld(data, 1);
    const { network, offset } = world.brain;
    const rest = restingGlow(offset, network.slope);
    const glow = new Glow(rest.length);
    const a = new Float32Array(rest.length);
    const frame = Math.round(1 / 60 / NEURAL_STEP);
    let lit = 0;
    let frames = 0;
    for (let s = 1; s <= Math.round(20 / NEURAL_STEP); s++) {
      world.step();
      if (s % frame !== 0) continue;
      glow.update(activations(world.brain.voltage, world.brain.threshold, network.slope, a), frame * NEURAL_STEP);
      if (world.time < 10) continue;
      frames++;
      if (Array.from(glow.value).some((g, i) => activeStrength(g, rest[i]) !== null)) lit++;
    }
    expect(lit / frames).toBeGreaterThan(0.25);
  });
});

describe('the activity channel', () => {
  it('tells its listeners of each reading, remembers that it has had one, and stops when asked', () => {
    const activity = new Activity(3);
    expect(activity.published).toBe(false);
    expect(Array.from(activity.glow.value)).toEqual([0.5, 0.5, 0.5]);
    expect(Array.from(activity.rest)).toEqual([0.5, 0.5, 0.5]);
    let heard = 0;
    const stop = activity.subscribe(() => heard++);
    activity.publish();
    activity.publish();
    expect(heard).toBe(2);
    expect(activity.published).toBe(true);
    stop();
    activity.publish();
    expect(heard).toBe(2);
    expect(activity.request).toBeNull();
  });
});

describe("the glow's colours", () => {
  const css = readRepo('src/style.css').toString('utf8');
  const token = (name: string): string | undefined => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)?.[1];

  it("are style.css's, and the shaders take them from the palette", () => {
    expect(token('glow')?.toLowerCase()).toBe(GLOW_COLOUR);
    expect(token('muted')?.toLowerCase()).toBe(NEUTRAL);
    expect(HALO_SHADER).toContain(`const GLOW = ${wgslColour(GLOW_COLOUR)};`);
    expect(NEURON_SHADER).toContain(`const RIM = ${wgslColour(NEUTRAL)};`);
    expect(wgslColour('#ff8000')).toBe('vec3f(1.0000, 0.5020, 0.0000)');
  });
});
