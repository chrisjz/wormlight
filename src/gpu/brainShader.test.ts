import { describe, expect, it } from 'vitest';
import {
  BRAIN_SHADER,
  LOOP_SCALARS,
  LOOP_SCALARS_AT,
  NEURON_WORDS,
  PARAM_WORDS,
  STATE_WORDS,
  STATUS_WORDS,
} from './brainShader.ts';

// A struct's fields in order, every one a 4-byte scalar.
function fields(name: string): string[] {
  const body = BRAIN_SHADER.match(new RegExp(`struct ${name} \\{([^}]*)\\}`))?.[1];
  if (!body) throw new Error(`no struct ${name}`);
  return [...body.matchAll(/^\s*(\w+): (f32|u32),$/gm)].map((m) => m[1]);
}

describe("the kernel's layout", () => {
  it('declares the words the host writes, the loop scalars where it puts them', () => {
    const params = fields('Params');
    expect(params).toHaveLength(PARAM_WORDS);
    expect(params[8]).toBe('dt');
    expect(params[20]).toBe('rods');
    expect(params.slice(LOOP_SCALARS_AT, LOOP_SCALARS_AT + LOOP_SCALARS.length)).toEqual([...LOOP_SCALARS]);
    expect(fields('State')).toHaveLength(STATE_WORDS);
    expect(fields('NeuronConstants')).toHaveLength(NEURON_WORDS);
    expect(fields('Status')).toHaveLength(STATUS_WORDS);
  });

  it("stays within WebGPU's default limits: 8 storage buffers and 16,384 bytes of workgroup memory", () => {
    expect(BRAIN_SHADER.match(/var<storage/g)).toHaveLength(8);
    const bytes = [...BRAIN_SHADER.matchAll(/var<workgroup> \w+: array<(f32|vec4<f32>), (\d+)>/g)].reduce(
      (sum, m) => sum + (m[1] === 'f32' ? 4 : 16) * Number(m[2]),
      0,
    );
    expect(bytes).toBe(15360);
    expect(bytes).toBeLessThanOrEqual(16384);
  });
});
