// The glow on the model (PLAN §1): its source at the model's rest, its scale, the channel that carries it, and its
// colours, which style.css, the palette and the shaders each write.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { activations } from '../src/render/glow.ts';
import { GLOW_COLOUR, GLOW_FLOOR, glowBrightness, glowHalo, NEUTRAL } from '../src/render/palette.ts';
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

describe('the activity channel', () => {
  it('tells its listeners of each reading, remembers that it has had one, and stops when asked', () => {
    const activity = new Activity(3);
    expect(activity.published).toBe(false);
    expect(Array.from(activity.glow.value)).toEqual([0.5, 0.5, 0.5]);
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
