import { describe, expect, it } from 'vitest';
import { bodyFrame, checkAxes, muscles, oscillator, position, sensing } from './anatomy.ts';
import type { Morphology } from './nml.ts';

const cell = (soma: [number, number, number], ys: number[]): Morphology => ({
  soma,
  points: [soma, ...ys.map((y): [number, number, number] => [soma[0], y, soma[2]])],
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

  it('places a soma as a fraction of that length, keeping its lateral and dorsal offsets', () => {
    expect(position(frame, cells.get('PLML') as Morphology)).toEqual({
      s: 0.9375,
      lateralUm: 2,
      dorsalUm: 8,
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
  it('accepts left cells at larger x and the ventral cord at smaller z', () => {
    const cells = new Map([
      ['AWCL', cell([4, 0, 40], [])],
      ['AWCR', cell([-4, 0, 40], [])],
      ['VB1', cell([0, 0, -20], [])],
    ]);
    expect(checkAxes(cells)).toEqual({ leftLarger: 1, pairs: 1 });
  });

  it('refuses mirrored axes', () => {
    const mirrored = new Map([
      ['AWCL', cell([-4, 0, 40], [])],
      ['AWCR', cell([4, 0, 40], [])],
    ]);
    expect(() => checkAxes(mirrored)).toThrow(/left cells/);
    const flipped = new Map([
      ['AWCL', cell([4, 0, -40], [])],
      ['AWCR', cell([-4, 0, -40], [])],
      ['VB1', cell([0, 0, 20], [])],
    ]);
    expect(() => checkAxes(flipped)).toThrow(/dorsal axis/);
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
  it('spaces each quadrant evenly from nose to tail', () => {
    const names = [...[1, 2, 3, 4].map((i) => `dBWML${i}`), ...[1, 2].map((i) => `vBWMR${i}`)];
    const placed = muscles(names);
    expect(placed.find((m) => m.name === 'dBWML2')).toEqual({
      name: 'dBWML2',
      quadrant: 'DL',
      index: 2,
      s0: 0.25,
      s1: 0.5,
    });
    expect(placed.find((m) => m.name === 'vBWMR2')).toEqual({
      name: 'vBWMR2',
      quadrant: 'VR',
      index: 2,
      s0: 0.5,
      s1: 1,
    });
  });

  it('refuses a name it does not recognise', () => {
    expect(() => muscles(['pm1'])).toThrow(/unexpected muscle/);
  });
});
