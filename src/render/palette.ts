// The graph's colours, shared by the renderer and the legend. The GCaMP green of style.css is kept for
// activity, which milestone 2 brings, so nothing here uses it.

import type { CellClass } from '../data/schema.ts';

export const CLASS_COLOURS: Record<CellClass, string> = {
  sensory: '#8cc1e2',
  interneuron: '#e6e0d3',
  motor: '#d4a674',
  pharyngeal: '#7a8781',
};

export type LinkKind = 'excitatory' | 'inhibitory' | 'unsigned' | 'gap';

export const LINK_COLOURS: Record<LinkKind, string> = {
  excitatory: '#f0875a',
  inhibitory: '#6e9ef4',
  unsigned: '#98a39e',
  gap: '#dfe3df',
};

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
