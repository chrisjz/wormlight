import { describe, expect, it } from 'vitest';
import { axisWarp, isCordNeuron, midline, unbend } from './layout';

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
  it('follows a straight line through its points exactly, and runs on along it beyond them', () => {
    const points = Array.from({ length: 20 }, (_, i) => [2 + 0.1 * i * 10, i * 10, -5 + 0.3 * i * 10] as const);
    const line = midline(points, 15);
    for (const y of [-100, 0, 35, 111, 190, 500]) {
      const [x, , z] = line(y);
      expect(x).toBeCloseTo(2 + 0.1 * y, 9);
      expect(z).toBeCloseTo(-5 + 0.3 * y, 9);
    }
  });
});

describe('unbend', () => {
  // A cord bent into a circular arc of radius 400 µm in the y–z plane, sampled every 2 µm, and somata placed
  // at known distances along it and known offsets across it.
  const R = 400;
  const at = (theta: number, up: number, left: number): [number, number, number] => [
    left,
    (R + up) * Math.sin(theta),
    (R + up) * Math.cos(theta) - R,
  ];
  const cord = Array.from({ length: 401 }, (_, k) => at(-0.5 + k / 400, 0, 0));
  const [y0, y1] = [R * Math.sin(-0.5), R * Math.sin(0.5)];
  const somata = [at(-0.3, 12, 0), at(0, -8, 5), at(0.2, 30, -9), at(0.41, 3, 2)];
  const body = unbend(
    somata,
    somata.map((p) => (p[1] - y0) / (y1 - y0)),
    midline(cord, 4),
  );

  it('measures each soma along the bent line and across it', () => {
    [-0.3, 0, 0.2, 0.41].forEach((theta, i) => expect(body.arc[i]).toBeCloseTo(R * (theta + 0.5), 1));
    expect(Array.from(body.dorsal)).toEqual([12, -8, 30, 3].map((v) => expect.closeTo(v, 1) as number));
    expect(Array.from(body.lateral)).toEqual([0, 5, -9, 2].map((v) => expect.closeTo(v, 1) as number));
  });

  it('measures the body as the arc from nose to tail tip', () => {
    expect(body.length).toBeCloseTo(R, 0);
  });
});

describe('isCordNeuron', () => {
  it('names the ventral-cord motor neurons and nothing else', () => {
    for (const name of ['AS1', 'DA9', 'DB7', 'DD6', 'VA12', 'VB11', 'VC6', 'VD13'])
      expect(isCordNeuron(name)).toBe(true);
    for (const name of ['AVAL', 'RMDVL', 'SMDDR', 'DVA', 'VB', 'PDA', 'DVB']) expect(isCordNeuron(name)).toBe(false);
  });
});
