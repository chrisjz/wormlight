// The CPU side of GPU parity (PLAN §7.2): the Gaussian's error bound and the states both brains start from.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { hash, uniform } from '../src/sim/brain/rng.ts';
import { gaussianBound, paritySetup } from '../src/gpu/parityCases.ts';
import { readJson } from './checks.ts';

// The shader's Box–Muller as f32 arithmetic with correctly rounded log, sqrt and cos: the best a GPU can do.
function gaussianF32(h1: number, h2: number): number {
  const f = Math.fround;
  const r = f(Math.sqrt(f(-2 * f(Math.log(uniform(h1))))));
  const angle = f(f(Math.PI) * f(2 * uniform(h2) - 1));
  return f(r * f(-f(Math.cos(angle))));
}

const exact = (h1: number, h2: number): number =>
  Math.sqrt(-2 * Math.log(uniform(h1))) * Math.cos(2 * Math.PI * uniform(h2));

describe("the bound on the shader's Gaussian", () => {
  const top = 2 ** 32 - 1;
  const pairs = [
    [0, 0],
    [0, top],
    [top, 0],
    [top, top],
    ...Array.from({ length: 2000 }, (_, k) => [hash(9, k, 0), hash(9, k, 1)]),
  ];

  it('covers f32 arithmetic, the edge hashes included', () => {
    for (const [h1, h2] of pairs) {
      expect(Math.abs(gaussianF32(h1, h2) - exact(h1, h2))).toBeLessThanOrEqual(gaussianBound(h1, h2));
    }
  });

  it('is dominated by the 2⁻¹¹ WGSL allows cos, so stays small', () => {
    for (const [h1, h2] of pairs) expect(gaussianBound(h1, h2)).toBeLessThan(6 * 2 ** -11);
  });
});

describe('the parity states', () => {
  const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
  const setup = paritySetup(data);

  it('are the rest state and twenty from a closed-loop run, each with its input and history', () => {
    expect(setup.cases).toHaveLength(21);
    expect(setup.cases[0].state.history).toBe(0);
    for (const c of setup.cases.slice(1)) {
      expect(c.state.history).toBeGreaterThan(0);
      expect(c.input.some((x) => x !== 0)).toBe(true);
    }
  });

  it('are active: every state moves voltages by millivolts from the last', () => {
    for (let k = 2; k < setup.cases.length; k++) {
      const a = setup.cases[k - 1].state.voltage;
      const b = setup.cases[k].state.voltage;
      expect(Math.max(...a.map((v, i) => Math.abs(v - b[i])))).toBeGreaterThan(1);
    }
  });
});
