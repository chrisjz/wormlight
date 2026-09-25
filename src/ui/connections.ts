// A neuron's connections, as the graph draws them: its chemical synapses out and in, and its gap junctions.

import type { Sign, SignSource, WormlightData } from '../data/schema.ts';
import type { LinkKind } from '../render/palette.ts';

export interface Connection {
  partner: number;
  kind: 'out' | 'in' | 'gap';
  sections: number;
  sign: Sign;
  // Where a chemical connection's sign comes from; gap junctions have none.
  signSource: SignSource | null;
}

export class Wiring {
  readonly names: readonly string[];
  private readonly lists: Connection[][];
  // Every neuron's total EM sections over all its connections, and the largest single connection.
  readonly degree: Float64Array;
  readonly largest: number;

  constructor(data: WormlightData) {
    this.names = data.neurons.map((n) => n.name);
    const at = new Map(this.names.map((name, i) => [name, i]));
    const index = (name: string): number => {
      const i = at.get(name);
      if (i === undefined) throw new Error(`unknown neuron ${name}`);
      return i;
    };
    this.lists = this.names.map(() => []);
    this.degree = new Float64Array(this.names.length);
    let largest = 0;
    for (const c of data.chemical) {
      const pre = index(c.pre);
      const post = index(c.post);
      if (pre === post) continue;
      this.lists[pre].push({
        partner: post,
        kind: 'out',
        sections: c.sections,
        sign: c.sign,
        signSource: c.signSource,
      });
      this.lists[post].push({ partner: pre, kind: 'in', sections: c.sections, sign: c.sign, signSource: c.signSource });
      this.degree[pre] += c.sections;
      this.degree[post] += c.sections;
      largest = Math.max(largest, c.sections);
    }
    for (const g of data.gap) {
      const a = index(g.a);
      const b = index(g.b);
      this.lists[a].push({ partner: b, kind: 'gap', sections: g.sections, sign: 0, signSource: null });
      this.lists[b].push({ partner: a, kind: 'gap', sections: g.sections, sign: 0, signSource: null });
      this.degree[a] += g.sections;
      this.degree[b] += g.sections;
      largest = Math.max(largest, g.sections);
    }
    for (const list of this.lists) list.sort((x, y) => y.sections - x.sections || x.partner - y.partner);
    this.largest = largest;
  }

  // A neuron's connections, strongest first; autapses are left out.
  of(neuron: number): readonly Connection[] {
    return this.lists[neuron];
  }
}

export function linkKind(c: Connection): LinkKind {
  if (c.kind === 'gap') return 'gap';
  return c.sign > 0 ? 'excitatory' : c.sign < 0 ? 'inhibitory' : 'unsigned';
}

// How a connection is drawn: wider and more opaque the more EM sections it has.
export function linkStyle(sections: number, largest: number): { width: number; alpha: number } {
  const t = Math.sqrt(sections / largest);
  return { width: 1 + 3 * t, alpha: 0.45 + 0.5 * t };
}
