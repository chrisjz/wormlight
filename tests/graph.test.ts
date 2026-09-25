// The 3D graph's layout and wiring on the real data (spec §7).

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { DEFAULT_LAYOUT, graphLayout, isCordNeuron } from '../src/render/layout.ts';
import { linkKind, Wiring } from '../src/ui/connections.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const positions = graphLayout(data.neurons);
const at = (name: string): number => data.neurons.findIndex((n) => n.name === name);

describe('the graph layout', () => {
  it('keeps every neuron in its order along the body', () => {
    const order = data.neurons.map((n, i) => [n.position.s, positions[3 * i]] as const).sort((a, b) => a[0] - b[0]);
    for (let k = 1; k < order.length; k++) {
      if (order[k][0] > order[k - 1][0]) expect(order[k][1]).toBeGreaterThan(order[k - 1][1]);
    }
  });

  it('straightens the posed bend: the ventral-cord neurons lie within 6 µm of the axis', () => {
    const tolerance = 6 * DEFAULT_LAYOUT.crossScale;
    const cord = data.neurons.flatMap((n, i) => (isCordNeuron(n.name) ? [i] : []));
    expect(cord).toHaveLength(75);
    const off = cord.filter((i) => Math.hypot(positions[3 * i + 1], positions[3 * i + 2]) > tolerance);
    // A few cord somata sit off the cord's line in the reconstruction itself.
    expect(off.length).toBeLessThanOrEqual(3);
  });

  it('gives the head, a sixth of the body, over a third of the drawn length', () => {
    const head = data.neurons.flatMap((n, i) => (n.position.s < 1 / 6 ? [positions[3 * i]] : []));
    expect(Math.max(...head) - Math.min(...head)).toBeGreaterThan(DEFAULT_LAYOUT.length / 3);
  });

  it("keeps the reconstruction's cross-section, scaled, ahead of the cord, with the animal's left on +z", () => {
    // Ahead of the cord the midline holds still, so offsets between neurons are the reconstruction's own.
    const front = Math.min(
      ...data.neurons.filter((n) => isCordNeuron(n.name)).map((n) => n.position.reconstructionUm[1]),
    );
    const head = data.neurons.flatMap((n, i) => (n.position.reconstructionUm[1] < front ? [i] : []));
    expect(head.length).toBeGreaterThan(100);
    const [a, b] = [head[0], head[head.length - 1]];
    const [xa, , za] = data.neurons[a].position.reconstructionUm;
    const [xb, , zb] = data.neurons[b].position.reconstructionUm;
    const k = DEFAULT_LAYOUT.crossScale;
    expect(positions[3 * a + 1] - positions[3 * b + 1]).toBeCloseTo((za - zb) * k, 4);
    expect(positions[3 * a + 2] - positions[3 * b + 2]).toBeCloseTo((xa - xb) * k, 4);
    // ALML and ALMR, the anterior touch cells, sit on the left and right of the body.
    expect(positions[3 * at('ALML') + 2]).toBeGreaterThan(positions[3 * at('ALMR') + 2]);
  });
});

describe('the wiring the graph draws', () => {
  const wiring = new Wiring(data);

  it('lists each chemical connection once out and once in, and each gap junction at both ends', () => {
    const autapses = data.chemical.filter((c) => c.pre === c.post).length;
    const all = data.neurons.flatMap((_, i) => wiring.of(i));
    expect(all.filter((c) => c.kind === 'out')).toHaveLength(data.chemical.length - autapses);
    expect(all.filter((c) => c.kind === 'in')).toHaveLength(data.chemical.length - autapses);
    expect(all.filter((c) => c.kind === 'gap')).toHaveLength(2 * data.gap.length);
  });

  it("gives AVAL's connections, strongest first, with their signs", () => {
    const aval = wiring.of(at('AVAL'));
    const out = data.chemical.filter((c) => c.pre === 'AVAL' && c.post !== 'AVAL');
    const inward = data.chemical.filter((c) => c.post === 'AVAL' && c.pre !== 'AVAL');
    const gaps = data.gap.filter((g) => g.a === 'AVAL' || g.b === 'AVAL');
    expect(aval.filter((c) => c.kind === 'out')).toHaveLength(out.length);
    expect(aval.filter((c) => c.kind === 'in')).toHaveLength(inward.length);
    expect(aval.filter((c) => c.kind === 'gap')).toHaveLength(gaps.length);
    for (let k = 1; k < aval.length; k++) expect(aval[k].sections).toBeLessThanOrEqual(aval[k - 1].sections);
    const first = out.reduce((a, b) => (b.sections > a.sections ? b : a));
    const listed = aval.find((c) => c.kind === 'out' && wiring.names[c.partner] === first.post);
    expect(listed?.signSource).toBe(first.signSource);
    expect(linkKind(listed!)).toBe(first.sign > 0 ? 'excitatory' : first.sign < 0 ? 'inhibitory' : 'unsigned');
  });
});
