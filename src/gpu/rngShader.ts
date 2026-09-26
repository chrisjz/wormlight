// The noise's random numbers in WGSL (PLAN §3.5), mirroring src/sim/brain/rng.ts: the same hash gives the
// same 32-bit integers, since u32 arithmetic in WGSL wraps as Math.imul and >>> 0 do, and the same
// uniforms, which f32 holds exactly. The Gaussian differs only by the error WGSL allows log, sqrt and cos,
// which the parity check bounds (gaussianBound in parityCases.ts).

export const RNG_WGSL = /* wgsl */ `
fn pcg(v: u32) -> u32 {
  let state = v * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn hash(seed: u32, step: u32, index: u32) -> u32 {
  return pcg(index + pcg(step + pcg(seed)));
}

// (⌊h / 2⁹⌋ + 0.5) · 2⁻²³: exact in f32, strictly inside (0, 1).
fn unit(h: u32) -> f32 {
  return (f32(h >> 9u) + 0.5) * 1.1920928955078125e-7;
}

// Box–Muller. WGSL allows log an absolute error of 2⁻²¹ near 1, so for the few uniforms within that of 1 it
// may return a value at or above 0, and −2 log u is held at 0 rather than handed to sqrt negative. WGSL bounds
// cos's error only on [−π, π], so cos(2π u) is taken as −cos(π (2u − 1)), whose argument is computed exactly
// but for the rounding of π and of one product.
fn gaussian_from(h1: u32, h2: u32) -> f32 {
  return sqrt(max(-2.0 * log(unit(h1)), 0.0)) * -cos(3.1415927 * (2.0 * unit(h2) - 1.0));
}

fn gaussian(seed: u32, step: u32, neuron: u32) -> f32 {
  return gaussian_from(hash(seed, step, 2u * neuron), hash(seed, step, 2u * neuron + 1u));
}
`;
