// Which neuron a pointer is on. A neuron whose drawn disc covers the point wins, the nearest to the camera
// among several; failing that, the neuron whose disc comes closest, relative to a reach that keeps small
// discs clickable, and larger for touch.

export interface Projected {
  index: number;
  // Screen position (CSS pixels), distance in front of the camera, and drawn radius (CSS pixels).
  x: number;
  y: number;
  w: number;
  radius: number;
}

export function pick(neurons: readonly Projected[], x: number, y: number, reach: number): number | null {
  let covering: Projected | null = null;
  let near: Projected | null = null;
  let nearScore = Infinity;
  for (const n of neurons) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= n.radius) {
      if (!covering || n.w < covering.w) covering = n;
      continue;
    }
    const allowed = Math.max(n.radius, reach);
    if (d <= allowed) {
      const score = d / allowed;
      if (score < nearScore || (score === nearScore && near && n.w < near.w)) {
        near = n;
        nearScore = score;
      }
    }
  }
  return (covering ?? near)?.index ?? null;
}
