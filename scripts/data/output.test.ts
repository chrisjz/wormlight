// The committed runtime file, checked against the figures PLAN.md records. `npm run data:check` proves
// the file is what the build writes; these tests pin what the build writes.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateWormlightData, type SignSource } from '../../src/data/schema.ts';
import { ROOT } from './sources.ts';

const data = validateWormlightData(JSON.parse(readFileSync(join(ROOT, 'public/data/wormlight.v1.json'), 'utf8')));
const neuron = (name: string) => data.neurons.find((n) => n.name === name);
const round2 = (x: number): number => Math.round(x * 100) / 100;
const bySource = (source: SignSource) => data.chemical.filter((c) => c.signSource === source);

describe('the committed runtime file', () => {
  it('holds the whole connectome', () => {
    expect(data.neurons).toHaveLength(302);
    expect(data.muscles).toHaveLength(95);
    expect(data.chemical).toHaveLength(3709);
    expect(data.gap).toHaveLength(1095);
    expect(data.neuromuscular).toHaveLength(956);
    expect(data.chemical.reduce((sum, c) => sum + c.sections, 0)).toBe(20965);
    expect(data.gap.reduce((sum, g) => sum + g.sections, 0)).toBe(5864);
    expect(data.neuromuscular.reduce((sum, j) => sum + j.sections, 0)).toBe(5515);
  });

  it('signs chemical synapses with the coverage of PLAN §2.4', () => {
    const sections = (source: SignSource) => bySource(source).reduce((sum, c) => sum + c.sections, 0);
    // Fenyves signs 1,763 connections. The seven physiology overrides take seven of them, and 40 are set
    // aside because their presynaptic transmitter is not one of the cell's Wang identities.
    const counts = (['physiology', 'expression', 'rule', 'none'] as const).map((source) => bySource(source).length);
    expect(counts).toEqual([7, 1716, 1453, 533]);
    expect([sections('physiology'), sections('expression'), sections('rule'), sections('none')]).toEqual([
      91, 11427, 7392, 2055,
    ]);
  });

  it('signs AWC to AIY inhibitory and AWC to AIB excitatory, from Chalasani et al. 2007', () => {
    for (const c of bySource('physiology')) {
      expect(c.citation).toBe('chalasani2007');
      expect(c.sign).toBe(c.post.startsWith('AIY') ? -1 : 1);
    }
    expect(data.chemical.find((c) => c.pre === 'AWCL' && c.post === 'AIYL')).toMatchObject({ sign: -1, sections: 22 });
  });

  it('signs neuromuscular connections by receptor, leaving 32 cells and 366 sections with no fast effect', () => {
    const none = data.neuromuscular.filter((j) => j.sign === 0);
    expect(new Set(none.map((j) => j.pre)).size).toBe(32);
    expect(none.reduce((sum, j) => sum + j.sections, 0)).toBe(366);
    const inhibitory = new Set(data.neuromuscular.filter((j) => j.sign === -1).map((j) => j.pre));
    expect([...inhibitory].filter((n) => !/^(DD|VD)\d+$/.test(n)).sort()).toEqual([
      'AVL',
      'RMED',
      'RMEL',
      'RMER',
      'RMEV',
    ]);
  });

  it('places the touch fields where PLAN §4.2 says, and AWC at the nose', () => {
    const field = (name: string) => {
      const sensing = neuron(name)?.sensing;
      return sensing?.kind === 'field' ? [round2(sensing.s0), round2(sensing.s1)] : null;
    };
    expect(field('ALML')).toEqual([0.05, 0.39]);
    expect(field('AVM')).toEqual([0.04, 0.37]);
    expect(field('PVM')).toEqual([0.24, 0.67]);
    expect(field('PLMR')).toEqual([0.5, 0.97]);
    expect(neuron('AWCR')?.sensing).toEqual({ kind: 'tip', s: 0.0001 });
    expect(data.neurons.filter((n) => n.sensing.kind !== 'none')).toHaveLength(8);
  });

  it('orders somas from nose to tail and sides them correctly', () => {
    expect(neuron('AWCL')?.position.s).toBeLessThan(neuron('ALML')?.position.s ?? 0);
    expect(neuron('ALML')?.position.s).toBeLessThan(neuron('PLML')?.position.s ?? 0);
    const x = (name: string) => neuron(name)?.position.reconstructionUm[0] ?? NaN;
    expect(x('ALML')).toBeGreaterThan(x('ALMR'));
  });

  it('keeps the reconstruction frame the positions are measured in', () => {
    expect(neuron('AWCL')?.position).toEqual({ s: 0.1022, reconstructionUm: [3.8, -267.95, 38.95], source: 'c302' });
  });

  it('carries 21 A-type, 18 B-type and 4 head-switch generators', () => {
    const count = (kind: string) => data.neurons.filter((n) => n.oscillator === kind).length;
    expect([count('A'), count('B'), count('headSwitch')]).toEqual([21, 18, 4]);
  });

  it('lines the four quadrants up on one grid, with ventral-left short one cell at the tail', () => {
    const quadrant = (q: string) => data.muscles.filter((m) => m.quadrant === q);
    expect(['DL', 'DR', 'VL', 'VR'].map((q) => quadrant(q).length)).toEqual([24, 24, 23, 24]);
    const span = (name: string) => {
      const m = data.muscles.find((muscle) => muscle.name === name);
      return [m?.s0, m?.s1];
    };
    expect(span('vBWML17')).toEqual(span('vBWMR17'));
    expect(span('vBWML22')).toEqual(span('dBWML22'));
    expect(span('vBWML23')).toEqual([0.9167, 1]);
  });
});
