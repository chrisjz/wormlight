import { describe, expect, it } from 'vitest';
import { axisWarp, isCordNeuron, midline } from './layout';

describe('axisWarp', () => {
  const crowded = [0.1, 0.1, 0.11, 0.12, 0.12, 0.13, 0.5, 0.9];
  const warp = axisWarp(crowded, 0.6, 0.01);

  it('keeps the ends and the order along the body', () => {
    expect(warp(0)).toBeCloseTo(0, 12);
    expect(warp(1)).toBeCloseTo(1, 12);
    let last = -Infinity;
    for (let s = 0; s <= 1; s += 0.005) {
      expect(warp(s)).toBeGreaterThan(last);
      last = warp(s);
    }
  });

  it('gives a crowded stretch more room than its share of the body', () => {
    expect(warp(0.15) - warp(0.08)).toBeGreaterThan(3 * 0.07);
  });

  it('is the identity when density has no share', () => {
    const flat = axisWarp(crowded, 0, 0.01);
    for (const s of [0, 0.2, 0.77, 1]) expect(flat(s)).toBeCloseTo(s, 12);
  });
});

describe('midline', () => {
  it('follows a straight line through its points exactly, and holds its ends beyond them', () => {
    const points = Array.from({ length: 20 }, (_, i) => [2 + 0.1 * i * 10, i * 10, -5 + 0.3 * i * 10] as const);
    const line = midline(points, 30);
    for (const y of [0, 35, 111, 190]) {
      const [x, z] = line(y);
      expect(x).toBeCloseTo(2 + 0.1 * y, 9);
      expect(z).toBeCloseTo(-5 + 0.3 * y, 9);
    }
    expect(line(-100)).toEqual(line(0));
    expect(line(500)).toEqual(line(190));
  });
});

describe('isCordNeuron', () => {
  it('names the ventral-cord motor neurons and nothing else', () => {
    for (const name of ['AS1', 'DA9', 'DB7', 'DD6', 'VA12', 'VB11', 'VC6', 'VD13'])
      expect(isCordNeuron(name)).toBe(true);
    for (const name of ['AVAL', 'RMDVL', 'SMDDR', 'DVA', 'VB', 'PDA', 'DVB']) expect(isCordNeuron(name)).toBe(false);
  });
});
