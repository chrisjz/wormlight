import { describe, expect, it } from 'vitest';
import { PARAMS } from '../science/params.ts';
import { LAWN_RADIUS, MAX_LAWNS } from '../sim/env/dish.ts';
import { AGAR_SHADER, FRAME_WORDS, packFrame } from './plateShaders.ts';

// The Frame struct's fields and their offsets in words, by WGSL's layout rules for the types it uses.
function frameLayout(): { names: string[]; offsets: Map<string, number>; words: number } {
  const body = AGAR_SHADER.match(/struct Frame \{([^}]*)\}/)?.[1];
  if (!body) throw new Error('no struct Frame');
  const offsets = new Map<string, number>();
  let at = 0;
  const names: string[] = [];
  for (const [, name, type] of body.matchAll(/^\s*(\w+): (.+),$/gm)) {
    const array = /^array<vec4<f32>, (\d+)>$/.exec(type);
    const [size, align] =
      type === 'f32' ? [1, 1] : type === 'vec2<f32>' ? [2, 2] : array ? [4 * Number(array[1]), 4] : [NaN, 1];
    if (Number.isNaN(size)) throw new Error(`an unexpected type ${type}`);
    at = Math.ceil(at / align) * align;
    offsets.set(name, at);
    names.push(name);
    at += size;
  }
  return { names, offsets, words: Math.ceil(at / 4) * 4 };
}

describe("the plate's frame", () => {
  it('has the words the renderer writes, the lawns from word 12', () => {
    const { names, offsets, words } = frameLayout();
    expect(names).toEqual([
      'centre_high',
      'centre_low',
      'half',
      'pixel',
      'dish',
      'k',
      'field_extent',
      'lawn_count',
      'lawn_radius',
      'lawns',
    ]);
    expect(offsets.get('lawns')).toBe(12);
    expect(words).toBe(FRAME_WORDS);
  });

  it("packs each value at its field's offset, and clears lawns no longer there", () => {
    const { offsets } = frameLayout();
    const at = (name: string): number => offsets.get(name) ?? -1;
    const centre: [number, number] = [0.0123456789, -0.0234567891];
    const out = new Float32Array(FRAME_WORDS).fill(7);
    packFrame(
      {
        centre,
        half: [0.003, 0.002],
        pixel: 1e-6,
        dish: 0.05,
        lawns: [
          [0.045, 0],
          [-0.02, 0.01],
        ],
      },
      0.1024,
      out,
    );
    expect(out[at('centre_high')]).toBe(Math.fround(centre[0]));
    expect(out[at('centre_high') + 1]).toBe(Math.fround(centre[1]));
    expect(out[at('centre_low')]).toBe(Math.fround(centre[0] - Math.fround(centre[0])));
    expect([out[at('half')], out[at('half') + 1]]).toEqual([Math.fround(0.003), Math.fround(0.002)]);
    expect(out[at('pixel')]).toBe(Math.fround(1e-6));
    expect(out[at('dish')]).toBe(Math.fround(0.05));
    expect(out[at('k')]).toBe(Math.fround(PARAMS.awcAdaptationScale.value));
    expect(out[at('field_extent')]).toBe(Math.fround(0.1024));
    expect(out[at('lawn_count')]).toBe(2);
    expect(out[at('lawn_radius')]).toBe(Math.fround(LAWN_RADIUS));
    expect(Array.from(out.subarray(at('lawns'), at('lawns') + 8))).toEqual(
      [0.045, 0, 0, 0, -0.02, 0.01, 0, 0].map((v) => Math.fround(v)),
    );
    // The frame before held other values everywhere; nothing past the lawns keeps them.
    expect(Array.from(out.subarray(at('lawns') + 8)).every((v) => v === 0)).toBe(true);
    expect(() =>
      packFrame({ centre, half: [1, 1], pixel: 1, dish: 1, lawns: Array(MAX_LAWNS + 1).fill([0, 0]) }, 1),
    ).toThrow(/at most/);
  });
});
