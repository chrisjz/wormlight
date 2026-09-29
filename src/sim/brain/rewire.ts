// The contrast brain (spec §4, PLAN §3.5): the same model on a degree-preserving rewiring of Cook's chemical
// synapses, a port of nematode's directed double-edge swap (quantumnematode/connectome/rewiring.py). Each swap
// takes two connections (a→b) and (c→d) to (a→d) and (c→b), refusing any that would make a self-loop or repeat a
// connection, so every neuron keeps its number of inputs and of outputs. A connection keeps its presynaptic
// neuron, its section count and its sign, and only where it lands changes, so every neuron keeps its outgoing
// strength and its mix of excitatory and inhibitory outputs. Unsigned connections move like the rest, since they
// are part of the anatomy's degrees. Autapses stay where they are, as nematode's `preserve_autapses` keeps them;
// gap junctions, the neuromuscular map and every neuron's identity aren't touched. The draws come from this
// project's counter-based hash, not numpy's generator, so a rewiring here is not nematode's at the same seed.

import type { Chemical, WormlightData } from '../../data/schema.ts';
import { hash } from './rng.ts';

export const CONTRAST = {
  // The primary null's seeded rewirings (PLAN §3.5), numbered from 1.
  rewirings: 10,
  // Accepted swaps wanted per connection, and attempts allowed per swap wanted: nematode's defaults.
  swapsPerEdge: 10,
  attemptsPerSwap: 100,
  // The hash's seed for every rewiring, "null" in ASCII, set before any rewiring was drawn; each rewiring draws on
  // the lane of its number.
  seed: 0x6e756c6c,
} as const;

// A connection of a rewired brain: its presynaptic neuron, section count, sign and the sign's source are those of
// the real wiring's connection from that neuron to `original`, which it now lands elsewhere than.
export interface Rewired extends Chemical {
  original: string;
}

export interface Rewiring {
  chemical: Rewired[];
  // Swaps wanted, accepted and attempted. Fewer accepted than wanted means the attempts ran out, as nematode
  // reports and doesn't reseed.
  wanted: number;
  swaps: number;
  attempts: number;
}

// Rewire a list of chemical connections, keeping its order: rewiring k of the primary null.
export function rewire(chemical: readonly Chemical[], k: number): Rewiring {
  if (!Number.isInteger(k) || k < 1) throw new Error(`rewiring ${k} isn't a whole number from 1`);
  const names = [...new Set(chemical.flatMap((c) => [c.pre, c.post]))];
  const id = new Map(names.map((name, i) => [name, i]));
  const n = names.length;
  const key = (pre: number, post: number): number => pre * n + post;
  const pre = Int32Array.from(chemical, (c) => id.get(c.pre) as number);
  const post = Int32Array.from(chemical, (c) => id.get(c.post) as number);
  const present = new Set<number>();
  for (let i = 0; i < chemical.length; i++) {
    const at = key(pre[i], post[i]);
    if (present.has(at)) throw new Error(`${chemical[i].pre}>${chemical[i].post} is repeated`);
    present.add(at);
  }
  // Only the connections that aren't autapses take part; each keeps its slot, and with it its record.
  const slots = chemical.flatMap((c, i) => (c.pre === c.post ? [] : [i]));
  const edges = slots.length;
  const wanted = CONTRAST.swapsPerEdge * edges;
  const cap = CONTRAST.attemptsPerSwap * wanted;
  // Two draws an attempt, each a slot, as numpy's rng.integers(0, n) draws them.
  const draw = (counter: number): number => slots[Math.floor((hash(CONTRAST.seed, k, counter) / 2 ** 32) * edges)];
  let swaps = 0;
  let attempts = 0;
  while (swaps < wanted && attempts < cap) {
    const i = draw(2 * attempts);
    const j = draw(2 * attempts + 1);
    attempts++;
    if (i === j) continue;
    const [a, b, c, d] = [pre[i], post[i], pre[j], post[j]];
    if (a === d || c === b) continue;
    if (present.has(key(a, d)) || present.has(key(c, b))) continue;
    present.delete(key(a, b));
    present.delete(key(c, d));
    present.add(key(a, d));
    present.add(key(c, b));
    post[i] = d;
    post[j] = b;
    swaps++;
  }
  return {
    chemical: chemical.map((c, i) => ({ ...c, post: names[post[i]], original: c.post })),
    wanted,
    swaps,
    attempts,
  };
}

// The runtime data with rewiring k in place of Cook's chemical synapses; every other part is the real wiring's.
export type ContrastData = Omit<WormlightData, 'chemical'> & { chemical: Rewired[] };
export function contrastData(data: WormlightData, k: number): ContrastData {
  if (k > CONTRAST.rewirings) throw new Error(`there are ${CONTRAST.rewirings} rewirings, not ${k}`);
  const { chemical, swaps, wanted } = rewire(data.chemical, k);
  if (swaps < wanted) throw new Error(`rewiring ${k} made ${swaps} of its ${wanted} swaps`);
  return { ...data, chemical };
}
