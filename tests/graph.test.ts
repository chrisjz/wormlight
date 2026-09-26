// The 3D graph's layout and wiring on the real data (spec §7).

import { describe, expect, it } from 'vitest';
import { validateWormlightData, type Chemical } from '../src/data/schema.ts';
import { DEFAULT_LAYOUT, graphLayout, isCordNeuron, unbendNeurons } from '../src/render/layout.ts';
import { linkKind, Wiring } from '../src/ui/connections.ts';
import { badgeKey, GROUP_TITLES, inspect, musclesByNeuron, type GroupKind, type Row } from '../src/ui/inspection.ts';
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

describe('the inspector', () => {
  const wiring = new Wiring(data);
  const muscles = musclesByNeuron(data);
  const look = (name: string) => inspect(data, wiring, muscles, at(name));

  it("lists AVAL's partners by kind, strongest first", () => {
    const aval = look('AVAL');
    expect(aval.groups.map((g) => [g.kind, g.rows.length])).toEqual([
      ['out', 43],
      ['in', 65],
      ['gap', 44],
    ]);
    for (const g of aval.groups) {
      for (let k = 1; k < g.rows.length; k++) expect(g.rows[k].sections).toBeLessThanOrEqual(g.rows[k - 1].sections);
    }
  });

  // What each row should say, worked out from the data alone: its partner, strength, sign, and the badge's
  // label and cited work.
  const { signBasis } = data.meta;
  const CHEMICAL = {
    physiology: { label: 'Physiology', cite: undefined },
    expression: { label: 'Expression', cite: signBasis.expression },
    rule: { label: 'Transmitter rule', cite: signBasis.ruleIdentities },
    none: { label: 'No sign', cite: null },
  } as const;
  const chemicalCite = (c: Chemical) => (c.signSource === 'physiology' ? c.citation : CHEMICAL[c.signSource].cite);
  const MUSCLE = {
    receptor: { label: 'Receptors', cite: signBasis.receptor },
    none: { label: 'No ACh or GABA', cite: null },
  } as const;
  const summary = (r: Row) => [r.name, r.sections, r.sign, r.provenance.label, r.provenance.cite];
  const byName = (a: unknown[], b: unknown[]) =>
    String(a[0]).localeCompare(String(b[0])) || Number(a[1]) - Number(b[1]);

  it("lists every neuron's connections as the data has them, each with its sign's source", () => {
    for (const [i, neuron] of data.neurons.entries()) {
      const { name } = neuron;
      const expected: Record<GroupKind, unknown[][]> = {
        out: data.chemical
          .filter((c) => c.pre === name && c.post !== name)
          .map((c) => [c.post, c.sections, c.sign, CHEMICAL[c.signSource].label, chemicalCite(c)]),
        in: data.chemical
          .filter((c) => c.post === name && c.pre !== name)
          .map((c) => [c.pre, c.sections, c.sign, CHEMICAL[c.signSource].label, chemicalCite(c)]),
        gap: data.gap
          .filter((g) => g.a === name || g.b === name)
          .map((g) => [g.a === name ? g.b : g.a, g.sections, null, 'EM', 'cook2019']),
        muscle: data.neuromuscular
          .filter((j) => j.pre === name)
          .map((j) => [j.muscle, j.sections, j.sign, MUSCLE[j.signSource].label, MUSCLE[j.signSource].cite]),
      };
      const shown = inspect(data, wiring, muscles, i);
      expect(shown.name).toBe(name);
      const kinds = (Object.keys(GROUP_TITLES) as GroupKind[]).filter((k) => expected[k].length > 0);
      expect(
        shown.groups.map((g) => g.kind),
        name,
      ).toEqual(kinds);
      for (const g of shown.groups) {
        expect(g.title).toBe(GROUP_TITLES[g.kind]);
        expect(g.rows.map(summary).sort(byName), `${name} ${g.kind}`).toEqual(expected[g.kind].sort(byName));
        for (const [k, row] of g.rows.entries()) {
          expect(row.neuron).toBe(g.kind === 'muscle' ? null : wiring.names.indexOf(row.name));
          if (k > 0) expect(row.sections).toBeLessThanOrEqual(g.rows[k - 1].sections);
        }
      }
    }
  });

  it('keys every badge shown by its explanation, best evidence first', () => {
    for (const i of data.neurons.keys()) {
      const rows = inspect(data, wiring, muscles, i).groups.flatMap((g) => g.rows);
      const key = badgeKey(rows);
      expect(key.map((p) => p.detail).sort()).toEqual([...new Set(rows.map((r) => r.provenance.detail))].sort());
      for (let k = 1; k < key.length; k++) expect(key[k].level).toBeLessThanOrEqual(key[k - 1].level);
    }
    // A cell whose synapses and junctions onto muscle both lack a sign explains each separately.
    const labels = badgeKey(look('CEPDL').groups.flatMap((g) => g.rows)).map((p) => p.label);
    expect(labels).toContain('No sign');
    expect(labels).toContain('No ACh or GABA');
  });

  it('cites the paper behind a physiology sign', () => {
    const aib = look('AWCL').groups[0].rows.find((r) => r.name === 'AIBL');
    expect(aib?.provenance.cite).toBe('chalasani2007');
  });

  it("shows a motor neuron's muscles, and gap junctions without a sign", () => {
    const vb6 = look('VB6');
    const onMuscle = vb6.groups.find((g) => g.kind === 'muscle');
    expect(onMuscle?.rows.length).toBe(data.neuromuscular.filter((j) => j.pre === 'VB6').length);
    expect(onMuscle?.rows.every((r) => r.neuron === null && r.provenance.label === 'Receptors')).toBe(true);
    expect(vb6.groups.find((g) => g.kind === 'gap')?.rows.every((r) => r.sign === null)).toBe(true);
  });

  it('says which neurons release no identified transmitter', () => {
    const silent = data.neurons.find((n) => n.transmitters.length === 0)!;
    expect(look(silent.name).facts[0].value).toMatch(/^no release identified/);
  });
});
