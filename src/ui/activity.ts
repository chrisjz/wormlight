// The running worm's activity, shared by the views (PLAN §1, "The glow"): the plate reads its neurons' voltages
// back from the GPU and advances the glow, and the graph draws it.

import { Glow } from '../render/glow.ts';

export class Activity {
  readonly glow: Glow;
  // Whether the glow has had a reading, which a view that starts late would otherwise miss.
  published = false;
  private readonly listeners = new Set<() => void>();

  constructor(neurons: number) {
    this.glow = new Glow(neurons);
  }

  // Tell the listeners the glow has moved on.
  publish(): void {
    this.published = true;
    for (const listener of this.listeners) listener();
  }

  // Call `listener` after each change; returns what stops it.
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
