// Counter-based random numbers for neural noise (PLAN §3.5). A hash of (seed, step, index) gives the same
// 32-bit integer here and in WGSL, so the GPU draws the same noise without carrying generator state.

// One step of the 32-bit PCG generator (default multiplier and increment, RXS-M-XS output, as in the
// reference pcg-c), used as a hash and nested to hash several inputs. DECISIONS.md gives its sources.
export function pcg(v: number): number {
  const state = (Math.imul(v, 747796405) + 2891336453) >>> 0;
  const word = Math.imul((state >>> ((state >>> 28) + 4)) ^ state, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
}

export function hash(seed: number, step: number, index: number): number {
  return pcg((index + pcg((step + pcg(seed >>> 0)) >>> 0)) >>> 0);
}

// A uniform strictly inside (0, 1): (⌊h / 2⁹⌋ + 0.5) · 2⁻²³, an odd multiple of 2⁻²⁴. That takes 24
// significant bits, so f32 holds it exactly, from 2⁻²⁴ to 1 − 2⁻²⁴.
export function uniform(h: number): number {
  return ((h >>> 9) + 0.5) * 2 ** -23;
}

// A standard normal draw from two hashes, by Box–Muller.
export function gaussianFrom(h1: number, h2: number): number {
  return Math.sqrt(-2 * Math.log(uniform(h1))) * Math.cos(2 * Math.PI * uniform(h2));
}

// A standard normal draw for one neuron at one step.
export function gaussian(seed: number, step: number, neuron: number): number {
  return gaussianFrom(hash(seed, step, 2 * neuron), hash(seed, step, 2 * neuron + 1));
}
