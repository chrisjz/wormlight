// The graph's colours, shared by the renderer and the legend. The GCaMP green of style.css is kept for activity:
// the glow alone uses it (PLAN §1).

import type { CellClass } from '../data/schema.ts';

export const CLASS_COLOURS: Record<CellClass, string> = {
  sensory: '#8cc1e2',
  interneuron: '#e6e0d3',
  motor: '#d4a674',
  pharyngeal: '#7a8781',
};

// The glow's GCaMP green, style.css's --glow; the brightness of a neuron at no activity, as a share of it; and how far
// a neuron's glow must rise above its own rest for its chemical synapses to be drawn, faintly, while none is selected
// (DECISIONS.md, 2026-10-02: a fixed ¾, which the refit's head switch reached by driving neurons far outside the
// model's range, and which track S's fit almost never does).
export const GLOW_COLOUR = '#5dfc8f';
// style.css's --muted: while the neurons glow, each one's faint rim and a lesioned one's hollow outline.
export const NEUTRAL = '#8c9a92';
export const GLOW_FLOOR = 0.06;
export const ACTIVE_RISE = 0.1;

// How strongly a neuron's synapses are lit while it glows at g, resting at r: from 0 as it rises past ACTIVE_RISE
// above its rest to 1 at full glow, and null, not lit, below that.
export function activeStrength(g: number, r: number): number | null {
  const rise = g - r;
  return rise > ACTIVE_RISE ? Math.min(1, (rise - ACTIVE_RISE) / (1 - r - ACTIVE_RISE)) : null;
}

// A neuron's brightness and halo at a glow g, on the one fixed scale (PLAN §1): brightness rises as g², so rest,
// at ½, reads dim; the halo grows over the half above rest.
export const glowBrightness = (g: number): number => GLOW_FLOOR + (1 - GLOW_FLOOR) * g * g;
export const glowHalo = (g: number): number => Math.max(0, 2 * g - 1) ** 2;

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
