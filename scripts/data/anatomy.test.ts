import { describe, expect, it } from 'vitest';
import { bodyFrame, checkAxes, muscles, oscillator, position, sensing } from './anatomy.ts';
import type { Morphology, Point } from './nml.ts';

const cell = (soma: Point, ys: number[]): Morphology => ({
  soma,
  points: [soma, ...ys.map((y): Point => [soma[0], y, soma[2]])],
});

describe('bodyFrame and position', () => {
  const cells = new Map([
    ['AWCL', cell([4, -250, 40], [-350])],
    ['PLML', cell([2, 400, 8], [50, 450])],
  ]);
  const frame = bodyFrame(cells);

  it('runs from the most anterior point to the most posterior', () => {
    expect(frame).toEqual({ noseUm: -350, tailUm: 450 });
  });

  it('places a soma as a fraction of that length, keeping its raw coordinates', () => {
    expect(position(frame, cells.get('PLML') as Morphology)).toEqual({
      s: 0.9375,
      reconstructionUm: [2, 400, 8],
      source: 'c302',
    });
  });

  it('puts AWC at its dendrite tip and PLM along its process', () => {
    expect(sensing(frame, 'AWCL', cells.get('AWCL') as Morphology)).toEqual({ kind: 'tip', s: 0 });
    expect(sensing(frame, 'PLML', cells.get('PLML') as Morphology)).toEqual({ kind: 'field', s0: 0.5, s1: 1 });
    expect(sensing(frame, 'AIYL', cells.get('PLML') as Morphology)).toEqual({ kind: 'none' });
  });
});

describe('checkAxes', () => {
  // The twelve dorsal/ventral sensory pairs the check reads, each ending at the nose (y = -350) at the
  // given z, with left cells at +x and right cells at -x.
  function head(dorsalZ: number, ventralZ: number, leftX = 4): Map<string, Morphology> {
    const cells = new Map<string, Morphology>();
    for (const base of ['CEP', 'IL1', 'IL2', 'OLQ', 'URA', 'URY']) {
      for (const side of ['L', 'R']) {
        const x = side === 'L' ? leftX : -leftX;
        cells.set(`${base}D${side}`, { soma: [x, -300, dorsalZ], points: [[x, -350, dorsalZ]] });
        cells.set(`${base}V${side}`, { soma: [x, -300, ventralZ], points: [[x, -350, ventralZ]] });
      }
    }
    cells.set('AWCL', cell([leftX, 0, 40], []));
    cells.set('AWCR', cell([-leftX, 0, 40], []));
    return cells;
  }

  it('accepts left cells at larger x and dorsal dendrites ending higher at the nose', () => {
    expect(checkAxes(head(60, 56)).nosePairs).toBe(12);
  });

  it('refuses a mirrored lateral axis or a flipped dorsal one', () => {
    expect(() => checkAxes(head(60, 56, -4))).toThrow(/left cells/);
    expect(() => checkAxes(head(56, 60))).toThrow(/dorsal axis/);
  });
});

describe('oscillator', () => {
  it('assigns A-type, B-type and head-switch generators, and none elsewhere', () => {
    expect(['VA12', 'DA9', 'VB1', 'DB7', 'SMDDL', 'SMDVR', 'AS1', 'VD1', 'SMBDL'].map(oscillator)).toEqual([
      'A',
      'A',
      'B',
      'B',
      'headSwitch',
      'headSwitch',
      null,
      null,
      null,
    ]);
  });
});

describe('muscles', () => {
  const names = [...[1, 2, 3, 4].map((i) => `dBWML${i}`), ...[1, 2, 3].map((i) => `vBWML${i}`)];
  const placed = muscles(names);
  const at = (name: string) => placed.find((m) => m.name === name);

  it('puts every quadrant on one grid, so muscle i covers slot i', () => {
    expect(at('dBWML2')).toEqual({ name: 'dBWML2', quadrant: 'DL', index: 2, s0: 0.25, s1: 0.5 });
    expect(at('vBWML2')).toMatchObject({ s0: 0.25, s1: 0.5 });
  });

  it("stretches a short quadrant's last muscle over the remaining slots", () => {
    expect(at('vBWML3')).toMatchObject({ s0: 0.5, s1: 1 });
    expect(at('dBWML4')).toMatchObject({ s0: 0.75, s1: 1 });
  });

  it('refuses a name it does not recognise', () => {
    expect(() => muscles(['pm1'])).toThrow(/unexpected muscle/);
  });
});
