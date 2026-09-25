// The 3D graph's layout and wiring on the real data (spec §7).

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { DEFAULT_LAYOUT, graphLayout, isCordNeuron, unbendNeurons } from '../src/render/layout.ts';
import { linkKind, Wiring } from '../src/ui/connections.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const positions = graphLayout(data.neurons);
const at = (name: string): number => data.neurons.findIndex((n) => n.name === name);

describe('the graph layout', () => {
  const body = unbendNeurons(data.neurons);
  const cord = data.neurons.flatMap((n, i) => (isCordNeuron(n.name) ? [i] : []));

  it('keeps every neuron in its order along the unbent body, and ties together', () => {
    const order = Array.from(body.arc, (arc, i) => [arc, positions[3 * i]] as const).sort((a, b) => a[0] - b[0]);
    for (let k = 1; k < order.length; k++) {
      if (order[k][0] > order[k - 1][0]) expect(order[k][1]).toBeGreaterThan(order[k - 1][1]);
      else expect(order[k][1]).toBe(order[k - 1][1]);
    }
  });

  it('unbends the posed bend: the ventral-cord somata lie on the axis', () => {
    expect(cord).toHaveLength(75);
    const off = cord.map((i) => Math.hypot(body.dorsal[i], body.lateral[i])).sort((a, b) => a - b);
    // A few cord somata sit off the cord's line in the reconstruction itself, VD7 and VB7 by the vulva.
    expect(off[37]).toBeLessThan(1);
    expect(off[74]).toBeLessThan(8);
  });

  it('gives the head, a sixth of the unbent body, over two fifths of the drawn length', () => {
    const head = data.neurons.flatMap((_, i) => (body.arc[i] < body.length / 6 ? [positions[3 * i]] : []));
    expect(head.length).toBeGreaterThan(151);
    expect(Math.max(...head) - Math.min(...head)).toBeGreaterThan((2 / 5) * DEFAULT_LAYOUT.length);
  });

  it("keeps the head ahead of the cord rigid, and the animal's left on +z", () => {
    // Ahead of the cord the midline is straight, so unbending there only turns the head: every distance
    // between two somata is kept.
    const start = Math.min(...cord.map((i) => body.arc[i]));
    const head = data.neurons.flatMap((_, i) => (body.arc[i] < start - 1 ? [i] : []));
    expect(head.length).toBeGreaterThan(140);
    for (const a of head) {
      for (const b of head) {
        const pa = data.neurons[a].position.reconstructionUm;
        const pb = data.neurons[b].position.reconstructionUm;
        const unbent = Math.hypot(
          body.arc[a] - body.arc[b],
          body.dorsal[a] - body.dorsal[b],
          body.lateral[a] - body.lateral[b],
        );
        expect(unbent).toBeCloseTo(Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]), 6);
      }
    }
    // ALML and ALMR, the anterior touch cells, sit on the left and right of the body.
    expect(positions[3 * at('ALML') + 2]).toBeGreaterThan(0);
    expect(positions[3 * at('ALMR') + 2]).toBeLessThan(0);
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
