// The simulation step in WGSL, mirroring the CPU reference step for step, the same equations in the same
// order. The brain (PLAN §3.4) is Brain.step in src/sim/brain/brain.ts: the voltages by BDF2 (implicit Euler
// without a history), solved by Jacobi-preconditioned conjugate gradients warm-started from the last step;
// then activation and the oscillators' recovery by BDF2 at the new voltages. With `looping` on, each step is
// World.step in src/sim/world.ts (PLAN §1): curvature, the proprioceptive currents, AWC-ON's sensing and the
// head switch, the brain, the neuromuscular layer, and the body under resistive force theory, whose
// block-tridiagonal system is solved by block cyclic reduction (PLAN §5.1). The whole simulation runs in one
// workgroup, each invocation holding its neurons' and its rod's state in registers, so a dispatch can take many
// steps with nothing but barriers between them.
//
// f32 alone can't hold the body finely enough: its stiffest springs stretch by nanometres or less, far below
// f32's resolution at dish-wide coordinates. So each rod's position and angle are kept as a coarse part on a
// power-of-two grid and a small remainder; its cosine, sine and the turn between segments come from series of
// our own, since WGSL allows cos, sin and atan2 errors far larger than the body can take; a spring's stretch is
// taken from squared lengths, which cancel less than a square root's difference does; and the rotation's
// unknown is scaled by the body's radius, so the 3 × 3 blocks the solver inverts have entries of one size.
// None of this changes the model. Compilers that reassociate floating-point arithmetic, as Metal's does, give
// back some of the precision; parity measures what is left (DECISIONS.md, 2026-09-26).

import { WALL_SOFTENING } from '../sim/numerics.ts';
import { RNG_WGSL } from './rngShader.ts';

const WORKGROUP = 256;
// Neurons per invocation: the network may have up to WORKGROUP × PER neurons.
const PER_INVOCATION = 2;
export const MAX_NEURONS = WORKGROUP * PER_INVOCATION;
// Block cyclic reduction runs on 2⁶ − 1 rows, the rods and then identity rows.
const BCR_ROWS = 63;
const BCR_LEVELS = 5;
export const MAX_RODS = BCR_ROWS;
export const MAX_MUSCLES = 128;

// The uniform block, in the order the shader declares it: the brain's eight u32 and twelve f32, then the
// loop's twelve u32 and twenty-four f32, which are LOOP_SCALARS.
export const PARAM_WORDS = 56;
export const LOOP_SCALARS_AT = 32;
export const LOOP_SCALARS = [
  'proprio_gain',
  'switch_gain',
  'drive_threshold',
  'switch_b',
  'switch_threshold',
  'muscle_gain',
  'muscle_threshold',
  'muscle_tau',
  'body_length',
  'radius',
  'lateral_k',
  'diagonal_k',
  'muscle_k',
  'lateral_b',
  'diagonal_b',
  'muscle_b',
  'drag_normal',
  'drag_tangential',
  'wall',
  'awc_gain',
  'awc_scale',
  'awc_time',
  'awc_along',
  'odour_cell',
] as const;
export type LoopScalar = (typeof LOOP_SCALARS)[number];
// Per neuron: v, v₋₁, s, s₋₁, w, w₋₁ and two words of padding.
export const STATE_WORDS = 8;
// Per neuron: threshold, oscillator shift θ, whether it oscillates, its proprioceptive field's side and
// rods, the side the head switch drives it on, and padding.
export const NEURON_WORDS = 8;
// The status block: steps taken (the noise's counter), the step size of the history as f32 bits (0 for
// none), the last solve's iterations, and since the state was last set, the unconverged solves, the most
// iterations in one solve and the iterations in all; then the head switch (its state, the head's last
// curvature, whether there is one, and its current), and AWC-ON's adaptive threshold.
export const STATUS_WORDS = 16;
// Per rod in the body buffer: x, y and θ, each as a coarse part on its grid and a remainder, then ẋ, ẏ, θ̇,
// the whole turns taken out of θ, and two words of padding; the muscles' activations follow.
export const ROD_WORDS = 12;
// The grids: 2⁻²⁰ m, about a micrometre, and 2⁻¹⁰ rad. Coarse parts are exact multiples, up to 16 m and
// 16,384 rad, and each remainder stays within half a step of its grid.
export const POSITION_GRID = 2 ** -20;
export const ANGLE_GRID = 2 ** -10;
// A turn as the angle grid nearest holds it, 6434 steps; the kernel takes the rest of 2π from the remainder.
export const TURN_GRID = Math.round((2 * Math.PI) / ANGLE_GRID) * ANGLE_GRID;
// Per segment: the lateral and diagonal rest lengths, the shortest muscle, the efficacy and the diagonal rest
// length squared.
export const SEGMENT_WORDS = 5;
// Per rod: its radius, its rotational drag, and W² in units of 2⁻⁴⁰ m², where W is the dish's radius less
// the rod's: its whole part as two 16-bit halves, each exact in f32, and its fraction. The wall's depth is
// found from these exactly enough to agree with the CPU's to far below a nanometre.
export const ROD_CONSTANTS = 5;
// The dish's radius the kernel can hold: the squares of the coarse parts, in grid units, must fit a u32.
export const MAX_WALL = 0.06; // m
// AWC-ON's neuron when it has none, and what the odour texture holds in cells outside the dish.
export const NO_NEURON = 0xffffffff;
export const OUTSIDE = -1;

// The pool of workgroup memory: the brain's two vectors while it steps, the body's blocks while it steps.
const POOL = {
  x: 0,
  s: MAX_NEURONS,
  d: 0,
  b: 9 * 64,
  c: 18 * 64,
  r: 27 * 64,
  sol: 30 * 64,
  size: 33 * 64,
};

const body = (per: number): string => {
  // A loop over the invocation's own neurons, i = lid + k·WORKGROUP, skipping any past the last.
  const own = (inner: string): string => `
    for (var k = 0u; k < ${per}u; k++) {
      let i = lid + k * ${WORKGROUP}u;
      if (i < n) {${inner}
      }
    }`;
  // (diag(d) − G) applied to the vector published in the pool's x, for neuron i.
  const product = (vector: string): string => `
        var product = d[k] * ${vector}[k];
        for (var e = topology[i]; e < topology[i + 1u]; e++) {
          product -= weights[e] * pool[${POOL.x}u + topology[params.gap_index_at + e]];
        }`;
  return /* wgsl */ `
struct Params {
  n: u32,
  steps: u32,
  seed: u32,
  max_iterations: u32,
  chem_start_at: u32,
  gap_index_at: u32,
  chem_index_at: u32,
  looping: u32,
  dt: f32,
  capacitance: f32,
  leak: f32,
  leak_potential: f32,
  rise: f32,
  decay: f32,
  slope: f32,
  noise: f32,
  osc_gain: f32,
  osc_recovery: f32,
  tolerance: f32,
  _pad0: f32,
  // The loop outside the brain, read only while looping.
  rods: u32,
  muscles: u32,
  nm_start_at: u32,
  nm_pre_at: u32,
  cover_at: u32,
  head_from: u32,
  head_to: u32,
  nm_weight_at: u32,
  rod_const_at: u32,
  segment_const_at: u32,
  awc_on: u32,
  awc_rod: u32,
  proprio_gain: f32,
  switch_gain: f32,
  drive_threshold: f32,
  switch_b: f32,
  switch_threshold: f32,
  muscle_gain: f32,
  muscle_threshold: f32,
  muscle_tau: f32,
  body_length: f32,
  radius: f32,
  lateral_k: f32,
  diagonal_k: f32,
  muscle_k: f32,
  lateral_b: f32,
  diagonal_b: f32,
  muscle_b: f32,
  drag_normal: f32,
  drag_tangential: f32,
  wall: f32,
  awc_gain: f32,
  awc_scale: f32,
  awc_time: f32,
  awc_along: f32,
  odour_cell: f32,
}

struct NeuronConstants {
  threshold: f32,
  shift: f32,
  oscillates: f32,
  field_side: f32,
  field_from: u32,
  field_to: u32,
  switch_side: f32,
  _pad: f32,
}

struct State {
  v: f32,
  v_prev: f32,
  s: f32,
  s_prev: f32,
  w: f32,
  w_prev: f32,
  _pad0: f32,
  _pad1: f32,
}

struct Status {
  steps: u32,
  history: u32,
  iterations: u32,
  unconverged: u32,
  peak_iterations: u32,
  total_iterations: u32,
  _pad0: u32,
  _pad1: u32,
  h: f32,
  previous_k: f32,
  has_previous: u32,
  switch_current: f32,
  awc_threshold: f32,
  _pad3: f32,
  _pad4: f32,
  _pad5: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
// Gap rows' starts (n + 1), chemical rows' starts (n + 1), gap partners, chemical presynaptic neurons; then,
// while looping, the neuromuscular rows' starts and presynaptic neurons, and the muscles covering each
// segment, dorsal left and right and ventral left and right.
@group(0) @binding(1) var<storage, read> topology: array<u32>;
// Gap conductances; then, while looping, the signed neuromuscular section counts, each rod's radius and
// rotational drag, and each segment's constants (SEGMENT_WORDS).
@group(0) @binding(2) var<storage, read> weights: array<f32>;
// Each chemical synapse's conductance and reversal potential, in row order.
@group(0) @binding(3) var<storage, read> chemical: array<vec2<f32>>;
@group(0) @binding(4) var<storage, read> neurons: array<NeuronConstants>;
@group(0) @binding(5) var<storage, read> input: array<f32>;
@group(0) @binding(6) var<storage, read_write> state: array<State>;
@group(0) @binding(7) var<storage, read_write> status: Status;
@group(0) @binding(8) var<storage, read_write> body: array<f32>;
// The odour AWC-ON senses, per cell of a square grid centred on the dish, OUTSIDE in cells beyond its wall.
@group(0) @binding(9) var odour: texture_2d<f32>;

const FHN_A: f32 = 0.7;
const FHN_B: f32 = 0.8;

// Workgroup memory comes to 15,364 bytes of the 16,384 WebGPU guarantees, and the bindings above hold the 8
// storage buffers a stage may have by default; the tests hold both to those limits.
var<workgroup> pool: array<f32, ${POOL.size}>;
var<workgroup> partial: array<vec4<f32>, ${WORKGROUP}>;
// While looping: each rod's curvature, each segment's dorsal and ventral activation, each muscle's, each
// segment's run from its first rod to its second, the coarse parts' difference and the remainders' kept apart,
// and the rods' angles' cosines and sines.
var<workgroup> kappa: array<f32, 64>;
var<workgroup> dorsal: array<f32, 64>;
var<workgroup> ventral: array<f32, 64>;
var<workgroup> muscle_a: array<f32, ${MAX_MUSCLES}>;
var<workgroup> seg_hx: array<f32, 64>;
var<workgroup> seg_lx: array<f32, 64>;
var<workgroup> seg_hy: array<f32, 64>;
var<workgroup> seg_ly: array<f32, 64>;
var<workgroup> rod_c: array<f32, 64>;
var<workgroup> rod_s: array<f32, 64>;
// The odour where AWC-ON senses, which one invocation reads for all.
var<workgroup> smelt: f32;

${RNG_WGSL}

// Every invocation's value summed over the workgroup, returned to all of them as a uniform value.
fn total(lid: u32, value: vec4<f32>) -> vec4<f32> {
  partial[lid] = value;
  for (var stride = ${WORKGROUP / 2}u; stride > 0u; stride /= 2u) {
    workgroupBarrier();
    if (lid < stride) {
      partial[lid] += partial[lid + stride];
    }
  }
  let sum = workgroupUniformLoad(&partial[0]);
  workgroupBarrier();
  return sum;
}

// WGSL lets an implementation assume floats are finite, so NaN and infinity are recognised by their bits.
fn finite(x: f32) -> bool {
  return (bitcast<u32>(x) & 0x7f800000u) != 0x7f800000u;
}

// The cosine and sine of hi + lo, for an angle within about a half turn, to about 10⁻⁷. The angle is reduced by
// multiples of π/2 in three parts (Cody and Waite), then Taylor series on [−π/4, π/4]. A compiler that
// reassociates the reduction may fold the three parts into f32's π/2, costing 4 × 10⁻⁸ for each quarter turn
// taken out; the kernel keeps angles within a half turn, so at most two.
fn cos_sin(hi: f32, lo: f32) -> vec2<f32> {
  let k = round(hi * 0.63661977);
  let r = ((hi - k * 1.5703125) - k * 4.837512969970703125e-4) - k * 7.54978995489188216e-8 + lo;
  let r2 = r * r;
  let sn = r + r * r2 * (-0.16666667 + r2 * (0.008333334 + r2 * (-1.984127e-4 + r2 * 2.7557319e-6)));
  let cs = 1.0 + r2 * (-0.5 + r2 * (0.041666668 + r2 * (-0.0013888889 + r2 * (2.4801588e-5 - r2 * 2.7557319e-7))));
  switch (i32(k) & 3) {
    case 0: {
      return vec2<f32>(cs, sn);
    }
    case 1: {
      return vec2<f32>(-sn, cs);
    }
    case 2: {
      return vec2<f32>(-cs, -sn);
    }
    default: {
      return vec2<f32>(sn, -cs);
    }
  }
}

// atan on [−1, 1] to about 10⁻⁷: past tan(π/8), atan t = π/4 + atan((t − 1)/(t + 1)), then its series.
fn atan_unit(t: f32) -> f32 {
  let a = abs(t);
  var base = 0.0;
  var u = a;
  if (a > 0.41421357) {
    base = 0.7853982;
    u = (a - 1.0) / (a + 1.0);
  }
  let u2 = u * u;
  let series = u * (1.0 + u2 * (-0.33333334 + u2 * (0.2 + u2 * (-0.14285715 + u2 * (0.11111111 + u2 * (-0.09090909 + u2 * (0.07692308 - u2 * 0.06666667)))))));
  return sign(t) * (base + series);
}

// atan2 to about 10⁻⁷ on every platform.
fn atan2_exact(y: f32, x: f32) -> f32 {
  if (abs(y) <= abs(x)) {
    let a = atan_unit(y / x);
    if (x > 0.0) {
      return a;
    }
    return select(a - 3.1415927, a + 3.1415927, y >= 0.0);
  }
  let a = atan_unit(x / y);
  return select(-1.5707964 - a, 1.5707964 - a, y > 0.0);
}

// Move whole grid steps from a remainder to its coarse part: both stay exact.
fn carry(hi: ptr<function, f32>, lo: ptr<function, f32>, grid: f32, inverse: f32) {
  let q = round(*lo * inverse) * grid;
  *hi += q;
  *lo -= q;
}

// 1 − e^(−x) for x ≥ 0: below 0.1, where 1 − exp(−x) would cancel, its series, truncated at 2 × 10⁻⁸ of the
// result, under f32's rounding.
fn one_less_exp(x: f32) -> f32 {
  if (x < 0.1) {
    return x * (1.0 - x * (1.0 / 2.0 - x * (1.0 / 6.0 - x * (1.0 / 24.0 - x * (1.0 / 120.0)))));
  }
  return 1.0 - exp(-x);
}

// The odour at a point (OdourField.sample): bilinear between cell centres, cells outside the dish left out and
// the others' weights renormalised.
fn concentration(x: f32, y: f32) -> f32 {
  let cells = i32(textureDimensions(odour).x);
  let middle = f32(cells) / 2.0 - 0.5;
  let gx = clamp(x / params.odour_cell + middle, 0.0, f32(cells - 1));
  let gy = clamp(y / params.odour_cell + middle, 0.0, f32(cells - 1));
  let i = min(i32(floor(gx)), cells - 2);
  let j = min(i32(floor(gy)), cells - 2);
  let fx = gx - f32(i);
  let fy = gy - f32(j);
  var sum = 0.0;
  var weight = 0.0;
  for (var corner = 0; corner < 4; corner++) {
    let a = corner & 1;
    let b = corner >> 1u;
    let value = textureLoad(odour, vec2<i32>(i + a, j + b), 0).r;
    let w = select(1.0 - fx, fx, a == 1) * select(1.0 - fy, fy, b == 1);
    if (value != ${OUTSIDE.toFixed(1)}) {
      sum += w * value;
      weight += w;
    }
  }
  return select(0.0, sum / weight, weight > 0.0);
}

fn logistic(x: f32) -> f32 {
  return 1.0 / (1.0 + exp(clamp(-x, -80.0, 80.0)));
}

// The mean curvature over rods first to last, inclusive.
fn region_mean(first: u32, last: u32) -> f32 {
  var sum = 0.0;
  for (var i = first; i <= last; i++) {
    sum += kappa[i];
  }
  return sum / f32(last - first + 1u);
}

// A 3 × 3 block of the pool, stored by rows, as a matrix; and back.
fn block(at: u32) -> mat3x3<f32> {
  return mat3x3<f32>(
    pool[at], pool[at + 3u], pool[at + 6u],
    pool[at + 1u], pool[at + 4u], pool[at + 7u],
    pool[at + 2u], pool[at + 5u], pool[at + 8u],
  );
}

fn put_block(at: u32, m: mat3x3<f32>) {
  for (var r = 0u; r < 3u; r++) {
    for (var c = 0u; c < 3u; c++) {
      pool[at + 3u * r + c] = m[c][r];
    }
  }
}

fn vector(at: u32) -> vec3<f32> {
  return vec3<f32>(pool[at], pool[at + 1u], pool[at + 2u]);
}

fn put_vector(at: u32, v: vec3<f32>) {
  pool[at] = v.x;
  pool[at + 1u] = v.y;
  pool[at + 2u] = v.z;
}

fn inverse3(m: mat3x3<f32>) -> mat3x3<f32> {
  let a = m[0];
  let b = m[1];
  let c = m[2];
  let bc = cross(b, c);
  let det = dot(a, bc);
  return transpose(mat3x3<f32>(bc, cross(c, a), cross(a, b))) * (1.0 / det);
}

fn outer(u: vec3<f32>, v: vec3<f32>) -> mat3x3<f32> {
  return mat3x3<f32>(u * v.x, u * v.y, u * v.z);
}

// One element joining side sa of rod m to side sb of rod m + 1 (Body.element): its generalised directions for
// each rod, the rotation's scaled by the radius, and the spring's force.
struct Element {
  ga: vec3<f32>,
  gb: vec3<f32>,
  f: f32,
}

// The stretch rest − L is taken as (rest² − L²)/(rest + L), from the rest length and its square.
fn element(m: u32, sa: f32, sb: f32, k: f32, rest: f32, rest2: f32) -> Element {
  let ra = sa * weights[params.rod_const_at + ${ROD_CONSTANTS}u * m];
  let rb = sb * weights[params.rod_const_at + ${ROD_CONSTANTS}u * (m + 1u)];
  let ca = rod_c[m];
  let sna = rod_s[m];
  let cb = rod_c[m + 1u];
  let snb = rod_s[m + 1u];
  let dx = (seg_hx[m] + seg_lx[m]) + (rb * cb - ra * ca);
  let dy = (seg_hy[m] + seg_ly[m]) + (rb * snb - ra * sna);
  let len2 = dx * dx + dy * dy;
  let len = sqrt(len2);
  let nx = dx / len;
  let ny = dy / len;
  var e: Element;
  e.ga = vec3<f32>(-nx, -ny, -ra * (-sna * nx + ca * ny) / params.radius);
  e.gb = vec3<f32>(nx, ny, rb * (-snb * nx + cb * ny) / params.radius);
  e.f = k * ((rest2 - len2) / (rest + len));
  return e;
}

// The four elements of segment m, as (ga, gb, f, β): the dorsal and ventral laterals, cuticle and muscle
// together, then the two diagonals.
fn segment_element(m: u32, which: u32) -> Element {
  let at = params.segment_const_at + ${SEGMENT_WORDS}u * m;
  let rest_lateral = weights[at];
  let rest_diagonal = weights[at + 1u];
  let shortest = weights[at + 2u];
  let efficacy = weights[at + 3u];
  if (which < 2u) {
    let side = select(-1.0, 1.0, which == 0u);
    let a = efficacy * clamp(select(ventral[m], dorsal[m], which == 0u), 0.0, 1.0);
    let muscle = params.muscle_k * a;
    let muscle_rest = rest_lateral - a * (rest_lateral - shortest);
    let k = params.lateral_k + muscle;
    let rest = (params.lateral_k * rest_lateral + muscle * muscle_rest) / k;
    return element(m, side, side, k, rest, rest * rest);
  }
  let sa = select(-1.0, 1.0, which == 2u);
  return element(m, sa, -sa, params.diagonal_k, rest_diagonal, weights[at + 4u]);
}

fn segment_damping(m: u32, which: u32) -> f32 {
  if (which < 2u) {
    let efficacy = weights[params.segment_const_at + ${SEGMENT_WORDS}u * m + 3u];
    let a = efficacy * clamp(select(ventral[m], dorsal[m], which == 0u), 0.0, 1.0);
    return params.lateral_b + params.muscle_b * a;
  }
  return params.diagonal_b;
}

// One row of the body's system (Body.assemble): rod i's drag, the elements of segment i as their first rod (and
// its coupling to rod i + 1) and those of segment i − 1 as their second (and its coupling to rod i − 1), with
// the rotation's unknown scaled to ρθ̇. Rows past the last rod are the identity.
struct Row {
  d: mat3x3<f32>,
  b: mat3x3<f32>,
  c: mat3x3<f32>,
  r: vec3<f32>,
}

// Rod i's row, its centre at (xh + xl, yh + yl).
fn assemble_row(i: u32, rods: u32, xh: f32, xl: f32, yh: f32, yl: f32) -> Row {
  var row = Row();
  row.d = mat3x3<f32>(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(0.0, 0.0, 1.0));
  if (i >= rods) {
    return row;
  }
  let segments = rods - 1u;
  let cs = rod_c[i];
  let sn = rod_s[i];
  let cross_drag = (params.drag_normal - params.drag_tangential) * cs * sn;
  row.d = mat3x3<f32>(
    vec3<f32>(params.drag_normal * cs * cs + params.drag_tangential * sn * sn, cross_drag, 0.0),
    vec3<f32>(cross_drag, params.drag_normal * sn * sn + params.drag_tangential * cs * cs, 0.0),
    vec3<f32>(0.0, 0.0, weights[params.rod_const_at + ${ROD_CONSTANTS}u * i + 1u] / (params.radius * params.radius)),
  );
  // The dish's wall, as Body.wallContact has it: a spring and a damper like a diagonal element's along the
  // wall's normal, both easing in over the first WALL_SOFTENING of penetration. Near the wall, the depth
  // ρ − W is found as (ρ² − W²)/(ρ + W), with ρ² − W² taken exactly: the coarse parts' squares and W²'s
  // whole part differenced as integers, in units of 2⁻⁴⁰ m², then its fraction and the small cross terms
  // added in f32. f32 alone knows ρ at 5 cm only to a few nanometres, as deep as a light press.
  let at = params.rod_const_at + ${ROD_CONSTANTS}u * i;
  let centre = vec2<f32>(xh + xl, yh + yl);
  let rho = length(centre);
  let reach = params.wall - weights[at];
  if (rho - reach > -1e-6) {
    let gx = u32(abs(round(xh * ${2 ** 20}.0)));
    let gy = u32(abs(round(yh * ${2 ** 20}.0)));
    let whole = u32(weights[at + 2u]) * 65536u + u32(weights[at + 3u]);
    let coarse = f32(bitcast<i32>(gx * gx + gy * gy - whole));
    let fine = (2.0 * (xh * xl + yh * yl) + xl * xl + yl * yl) * ${2 ** 40}.0;
    let depth = (coarse - weights[at + 4u] + fine) / ${2 ** 40}.0 / (rho + reach);
    if (depth > 0.0) {
    let n = centre / rho;
    let ease = min(depth / ${WALL_SOFTENING}, 1.0);
    let beta = params.diagonal_b * ease;
    row.r += vec3<f32>(n * (-params.diagonal_k * depth * ease), 0.0);
    row.d += mat3x3<f32>(
      vec3<f32>(beta * n.x * n.x, beta * n.x * n.y, 0.0),
      vec3<f32>(beta * n.x * n.y, beta * n.y * n.y, 0.0),
      vec3<f32>(0.0),
    );
    }
  }
  if (i < segments) {
    for (var which = 0u; which < 4u; which++) {
      let e = segment_element(i, which);
      let beta = segment_damping(i, which);
      row.r += e.f * e.ga;
      row.d += outer(e.ga, e.ga) * beta;
      row.b += outer(e.ga, e.gb) * beta;
    }
  }
  if (i > 0u) {
    for (var which = 0u; which < 4u; which++) {
      let e = segment_element(i - 1u, which);
      let beta = segment_damping(i - 1u, which);
      row.r += e.f * e.gb;
      row.d += outer(e.gb, e.gb) * beta;
      row.c += outer(e.gb, e.ga) * beta;
    }
  }
  return row;
}

fn put_row(i: u32, row: Row) {
  put_block(${POOL.d}u + 9u * i, row.d);
  put_block(${POOL.b}u + 9u * i, row.b);
  put_block(${POOL.c}u + 9u * i, row.c);
  put_vector(${POOL.r}u + 3u * i, row.r);
}

// Block cyclic reduction of the rows in the pool, the solution left in its sol: at each level, each kept row
// folds in its neighbours s rows away, whose own blocks stay as they were for the way back; then back through
// the levels, each row eliminated at a level solved from the two it was folded into. Every row reads before
// any writes.
fn cyclic_reduction(lid: u32) {
  for (var level = 0u; level < ${BCR_LEVELS}u; level++) {
    let stride = 1u << level;
    let i = 2u * stride * (lid + 1u) - 1u;
    let kept = i < ${BCR_ROWS}u;
    var dm = mat3x3<f32>();
    var bm = mat3x3<f32>();
    var cm = mat3x3<f32>();
    var rv = vec3<f32>(0.0);
    if (kept) {
      let lo = i - stride;
      let hi = i + stride;
      let alpha = block(${POOL.c}u + 9u * i) * inverse3(block(${POOL.d}u + 9u * lo));
      let gamma = block(${POOL.b}u + 9u * i) * inverse3(block(${POOL.d}u + 9u * hi));
      dm = block(${POOL.d}u + 9u * i) - alpha * block(${POOL.b}u + 9u * lo) - gamma * block(${POOL.c}u + 9u * hi);
      rv = vector(${POOL.r}u + 3u * i) - alpha * vector(${POOL.r}u + 3u * lo) - gamma * vector(${POOL.r}u + 3u * hi);
      cm = alpha * block(${POOL.c}u + 9u * lo) * -1.0;
      bm = gamma * block(${POOL.b}u + 9u * hi) * -1.0;
    }
    workgroupBarrier();
    if (kept) {
      put_block(${POOL.d}u + 9u * i, dm);
      put_block(${POOL.b}u + 9u * i, bm);
      put_block(${POOL.c}u + 9u * i, cm);
      put_vector(${POOL.r}u + 3u * i, rv);
    }
    workgroupBarrier();
  }
  if (lid == 0u) {
    let i = (${BCR_ROWS}u - 1u) / 2u;
    put_vector(${POOL.sol}u + 3u * i, inverse3(block(${POOL.d}u + 9u * i)) * vector(${POOL.r}u + 3u * i));
  }
  workgroupBarrier();
  for (var level = ${BCR_LEVELS}u; level > 0u; level--) {
    let stride = 1u << (level - 1u);
    let i = stride * (2u * lid + 1u) - 1u;
    if (i < ${BCR_ROWS}u) {
      var rv = vector(${POOL.r}u + 3u * i);
      if (i >= stride) {
        rv -= block(${POOL.c}u + 9u * i) * vector(${POOL.sol}u + 3u * (i - stride));
      }
      if (i + stride < ${BCR_ROWS}u) {
        rv -= block(${POOL.b}u + 9u * i) * vector(${POOL.sol}u + 3u * (i + stride));
      }
      put_vector(${POOL.sol}u + 3u * i, inverse3(block(${POOL.d}u + 9u * i)) * rv);
    }
    workgroupBarrier();
  }
}

@compute @workgroup_size(${WORKGROUP})
fn advance(@builtin(local_invocation_index) lid: u32) {
  let n = params.n;
  let dt = params.dt;
  let c = params.capacitance / dt;
  let v0 = 1.0 / (2.0 * params.slope);
  let noise = params.noise / sqrt(dt);
  let looping = params.looping == 1u;
  let rods = params.rods;
  let segments = rods - 1u;

  var v: array<f32, ${per}>;
  var v_prev: array<f32, ${per}>;
  var s: array<f32, ${per}>;
  var s_prev: array<f32, ${per}>;
  var w: array<f32, ${per}>;
  var w_prev: array<f32, ${per}>;
  var d: array<f32, ${per}>;
  var b: array<f32, ${per}>;
  var x: array<f32, ${per}>;
  var r: array<f32, ${per}>;
  var z: array<f32, ${per}>;
  var p: array<f32, ${per}>;
  var q: array<f32, ${per}>;
  var drive_in: array<f32, ${per}>;
  ${own(`
        let here = state[i];
        v[k] = here.v;
        v_prev[k] = here.v_prev;
        s[k] = here.s;
        s_prev[k] = here.s_prev;
        w[k] = here.w;
        w_prev[k] = here.w_prev;`)}

  // The rod and the muscle this invocation holds, while looping: each coordinate in its coarse part and
  // remainder.
  var xh = 0.0;
  var xl = 0.0;
  var yh = 0.0;
  var yl = 0.0;
  var th = 0.0;
  var tl = 0.0;
  var turns = 0.0;
  var velocity = vec3<f32>(0.0);
  var activation = 0.0;
  if (looping && lid < rods) {
    let at = ${ROD_WORDS}u * lid;
    xh = body[at];
    xl = body[at + 1u];
    yh = body[at + 2u];
    yl = body[at + 3u];
    th = body[at + 4u];
    tl = body[at + 5u];
    turns = body[at + 9u];
  }
  if (looping && lid < params.muscles) {
    activation = body[${ROD_WORDS}u * rods + lid];
  }

  var steps = status.steps;
  var history = bitcast<f32>(status.history);
  // The head switch, kept alike by every invocation.
  var h = status.h;
  var previous_k = status.previous_k;
  var has_previous = status.has_previous;
  var switch_current = status.switch_current;
  var awc_threshold = status.awc_threshold;
  var last = 0u;
  var peak = 0u;
  var iterations_sum = 0u;
  var failures = 0u;
  for (var t = 0u; t < params.steps; t++) {
    ${own(`
        drive_in[k] = input[i];`)}
    var restart = false;
    if (looping) {
      // Each segment's run from its first rod to its second, the coarse parts' difference and the remainders'
      // kept apart in workgroup memory until they are summed: a compiler that reassociates, as Metal's does,
      // would otherwise rejoin each rod's parts first and lose the precision they hold. The rods' places go in,
      // every segment reads its two, and only then do the differences overwrite them.
      if (lid < rods) {
        seg_hx[lid] = xh;
        seg_lx[lid] = xl;
        seg_hy[lid] = yh;
        seg_ly[lid] = yl;
      }
      workgroupBarrier();
      var run = vec4<f32>(0.0);
      if (lid < segments) {
        run = vec4<f32>(
          seg_hx[lid + 1u] - seg_hx[lid],
          seg_lx[lid + 1u] - seg_lx[lid],
          seg_hy[lid + 1u] - seg_hy[lid],
          seg_ly[lid + 1u] - seg_ly[lid],
        );
      }
      workgroupBarrier();
      if (lid < segments) {
        seg_hx[lid] = run.x;
        seg_lx[lid] = run.y;
        seg_hy[lid] = run.z;
        seg_ly[lid] = run.w;
      }

      // The body's curvature, scaled by its length and positive towards the dorsal side, and the brain's
      // present voltages and activations for the head switch's gate.
      ${own(`
        pool[${POOL.x}u + i] = v[k];
        pool[${POOL.s}u + i] = s[k];`)}
      workgroupBarrier();
      if (lid < rods) {
        var curvature = 0.0;
        if (lid > 0u && lid + 1u < rods) {
          let a = vec2<f32>(seg_hx[lid - 1u] + seg_lx[lid - 1u], seg_hy[lid - 1u] + seg_ly[lid - 1u]);
          let bb = vec2<f32>(seg_hx[lid] + seg_lx[lid], seg_hy[lid] + seg_ly[lid]);
          let turn = atan2_exact(a.x * bb.y - a.y * bb.x, a.x * bb.x + a.y * bb.y);
          curvature = turn / ((length(a) + length(bb)) / 2.0) * params.body_length;
        }
        kappa[lid] = curvature;
      }

      // The odour where AWC-ON senses (World.smell), read by the invocation holding the rod before that point.
      if (lid == params.awc_rod) {
        let f = params.awc_along;
        smelt = concentration(xh + (xl + f * (run.x + run.y)), yh + (yl + f * (run.z + run.w)));
      }

      // The network's drive on the SMDs (World.headDrive): for each, the voltage its partners and leak would
      // hold it at, less its threshold, with links among the SMDs at their rest values.
      let rest = params.rise / (params.rise + 2.0 * params.decay);
      var term = vec4<f32>(0.0);
      ${own(`
        let constants = neurons[i];
        if (constants.switch_side != 0.0) {
          var g = params.leak;
          var current = params.leak * params.leak_potential;
          for (var e = topology[i]; e < topology[i + 1u]; e++) {
            let j = topology[params.gap_index_at + e];
            let partner = neurons[j];
            g += weights[e];
            current += weights[e] * select(pool[${POOL.x}u + j], partner.threshold, partner.switch_side != 0.0);
          }
          for (var e = topology[params.chem_start_at + i]; e < topology[params.chem_start_at + i + 1u]; e++) {
            let j = topology[params.chem_index_at + e];
            let synapse = chemical[e];
            let conductance = synapse.x * select(pool[${POOL.s}u + j], rest, neurons[j].switch_side != 0.0);
            g += conductance;
            current += conductance * synapse.y;
          }
          term += vec4<f32>(current / g - constants.threshold, 1.0, 0.0, 0.0);
        }`)}
      // total() begins after kappa is written and ends on a barrier, so kappa is ready after it.
      let drive = total(lid, term);
      let gated = drive.y > 0.0 && drive.x / drive.y > params.drive_threshold;

      // The head switch (HeadSwitch.update), from the head's curvature: every invocation reaches the same
      // state, so none needs to be told it.
      let k_head = region_mean(params.head_from, params.head_to);
      let pk = k_head + select(0.0, params.switch_b * (k_head - previous_k) / dt, has_previous == 1u);
      previous_k = k_head;
      has_previous = 1u;
      if (gated) {
        if (h == 1.0 && pk >= params.switch_threshold) {
          h = 0.0;
        } else if (h == 0.0 && pk <= -params.switch_threshold) {
          h = 1.0;
        }
      }
      let current = select(0.0, params.switch_gain * (h - 0.5), gated);
      // The switch current jumps when it flips or is gated on or off; BDF2 across a jump is first order.
      restart = current != switch_current;
      switch_current = current;

      // AWC-ON's threshold follows the odour (AwcSensor.step), alike in every invocation; the smell was read
      // before total()'s barriers.
      let held = max(smelt, 0.0);
      let settled = params.awc_scale * one_less_exp(held / params.awc_scale);
      awc_threshold += (settled - awc_threshold) * one_less_exp(dt / params.awc_time);
      let awc_sum = awc_threshold + held;
      let awc_current = select(0.0, params.awc_gain * (awc_threshold - held) / awc_sum, awc_sum > 0.0);

      // Each neuron's input: its proprioceptive field's curvature, AWC-ON's current and the switch's.
      ${own(`
        let constants = neurons[i];
        if (constants.field_side != 0.0) {
          drive_in[k] += params.proprio_gain * constants.field_side * region_mean(constants.field_from, constants.field_to);
        }
        if (i == params.awc_on) {
          drive_in[k] += awc_current;
        }
        drive_in[k] += constants.switch_side * current;`)}
    }

    // BDF2: (3y′ − 4y + y₋₁) / 2dt = f(y′), written as (a y′ − h) / dt with a = 3/2 and h = 2y − y₋₁/2.
    // Implicit Euler: a = 1 and h = y.
    let bdf2 = history == dt && !restart;
    let a = select(1.0, 1.5, bdf2);
    // Every read of the pool above was made before total()'s barriers.
    ${own(`
        pool[${POOL.s}u + i] = select(s[k], 2.0 * s[k] - s_prev[k], bdf2);`)}
    workgroupBarrier();

    // Each neuron's row of the system: leak, gap-junction and synaptic conductances with the synapses'
    // activation extrapolated to the new step, and the oscillator's current linearised about this step's
    // voltage, implicit where the cubic stabilises and explicit where it destabilises.
    ${own(`
        var g = a * c + params.leak;
        var current = c * select(v[k], 2.0 * v[k] - 0.5 * v_prev[k], bdf2) + params.leak * params.leak_potential + drive_in[k];
        if (params.noise > 0.0) {
          current += noise * gaussian(params.seed, steps, i);
        }
        for (var e = topology[i]; e < topology[i + 1u]; e++) {
          g += weights[e];
        }
        for (var e = topology[params.chem_start_at + i]; e < topology[params.chem_start_at + i + 1u]; e++) {
          let synapse = chemical[e];
          let conductance = synapse.x * pool[${POOL.s}u + topology[params.chem_index_at + e]];
          g += conductance;
          current += conductance * synapse.y;
        }
        let constants = neurons[i];
        if (constants.oscillates > 0.0) {
          let xo = (v[k] - constants.threshold - constants.shift) / v0;
          let stabilising = params.osc_gain * max(xo * xo - 1.0, 0.0);
          g += stabilising;
          current += params.osc_gain * v0 * (xo - xo * xo * xo / 3.0 - w[k]) + stabilising * v[k];
        }
        d[k] = g;
        b[k] = current;
        x[k] = v[k];
        pool[${POOL.x}u + i] = x[k];`)}
    workgroupBarrier();

    // Conjugate gradients from x = v, stopping as the CPU's do.
    var sums = vec4<f32>(0.0);
    ${own(`${product('x')}
        r[k] = b[k] - product;
        z[k] = r[k] / d[k];
        p[k] = z[k];
        sums += vec4<f32>(b[k] * b[k], r[k] * r[k], r[k] * z[k], 0.0);`)}
    let start = total(lid, sums);
    let goal = params.tolerance * params.tolerance * start.x;
    var rr = start.y;
    var rz = start.z;
    var iterations = 0u;
    var converged = true;
    loop {
      if (rr <= goal) {
        break;
      }
      if (iterations == params.max_iterations || !finite(rr)) {
        converged = false;
        break;
      }
      // total() ended on a barrier, so every read of the pool has been made.
      ${own(`
        pool[${POOL.x}u + i] = p[k];`)}
      workgroupBarrier();
      var pq = vec4<f32>(0.0);
      ${own(`${product('p')}
        q[k] = product;
        pq.x += p[k] * q[k];`)}
      let alpha = rz / total(lid, pq).x;
      var next = vec4<f32>(0.0);
      ${own(`
        x[k] += alpha * p[k];
        r[k] -= alpha * q[k];
        z[k] = r[k] / d[k];
        next += vec4<f32>(r[k] * r[k], r[k] * z[k], 0.0, 0.0);`)}
      let reduced = total(lid, next);
      let beta = reduced.y / rz;
      rr = reduced.x;
      rz = reduced.y;
      ${own(`
        p[k] = z[k] + beta * p[k];`)}
      iterations++;
    }
    last = iterations;
    peak = max(peak, iterations);
    iterations_sum += iterations;
    if (!converged) {
      failures += 1u;
    }

    // Activation by BDF2 with φ at the new voltages, which is linear in s, and the recovery likewise.
    ${own(`
        let constants = neurons[i];
        let phi = 1.0 / (1.0 + exp(clamp(-params.slope * (x[k] - constants.threshold), -80.0, 80.0)));
        let s_history = select(s[k], 2.0 * s[k] - 0.5 * s_prev[k], bdf2);
        s_prev[k] = s[k];
        s[k] = (s_history + dt * params.rise * phi) / (a + dt * (params.rise * phi + params.decay));
        v_prev[k] = v[k];
        v[k] = x[k];
        if (constants.oscillates > 0.0) {
          let xo = (v[k] - constants.threshold - constants.shift) / v0;
          let hr = dt / params.osc_recovery;
          let w_history = select(w[k], 2.0 * w[k] - 0.5 * w_prev[k], bdf2);
          w_prev[k] = w[k];
          w[k] = (w_history + hr * (xo + FHN_A)) / (a + hr * FHN_B);
        }`)}

    if (looping) {
      // The neuromuscular layer (Muscles.step and .segments): each muscle's drive from the new activations,
      // its activation relaxing towards the drive's logistic, and each segment's dorsal and ventral mean.
      ${own(`
        pool[${POOL.s}u + i] = s[k];`)}
      workgroupBarrier();
      if (lid < params.muscles) {
        var u = 0.0;
        for (var e = topology[params.nm_start_at + lid]; e < topology[params.nm_start_at + lid + 1u]; e++) {
          u += weights[params.nm_weight_at + e] * pool[${POOL.s}u + topology[params.nm_pre_at + e]];
        }
        let goal = logistic(params.muscle_gain * (u - params.muscle_threshold));
        activation = goal + (activation - goal) * exp(-dt / params.muscle_tau);
        muscle_a[lid] = activation;
      }
      workgroupBarrier();
      if (lid < segments) {
        let at = params.cover_at;
        dorsal[lid] = (muscle_a[topology[at + lid]] + muscle_a[topology[at + segments + lid]]) / 2.0;
        ventral[lid] = (muscle_a[topology[at + 2u * segments + lid]] + muscle_a[topology[at + 3u * segments + lid]]) / 2.0;
      }
      if (lid < rods) {
        let u = cos_sin(th, tl);
        rod_c[lid] = u.x;
        rod_s[lid] = u.y;
      }
      // After this barrier the pool's brain vectors are no longer read, and the body's blocks take their place.
      workgroupBarrier();

      // The body (Body.step): the symmetric block-tridiagonal system (Ξ − B) q̇ = G, solved by block cyclic
      // reduction.
      if (lid < ${BCR_ROWS}u) {
        put_row(lid, assemble_row(lid, rods, xh, xl, yh, yl));
      }
      workgroupBarrier();
      cyclic_reduction(lid);

      // Each rod moves by its velocity over the step, into its remainders, whose whole grid steps then carry
      // into the coarse parts.
      if (lid < rods) {
        let zv = vector(${POOL.sol}u + 3u * lid);
        velocity = vec3<f32>(zv.x, zv.y, zv.z / params.radius);
        xl += dt * velocity.x;
        yl += dt * velocity.y;
        tl += dt * velocity.z;
        carry(&xh, &xl, ${POSITION_GRID}, ${1 / POSITION_GRID}.0);
        carry(&yh, &yl, ${POSITION_GRID}, ${1 / POSITION_GRID}.0);
        carry(&th, &tl, ${ANGLE_GRID}, ${1 / ANGLE_GRID}.0);
        // Past a half turn, the angle comes back by a whole turn, counted: by the grid's nearest step to 2π,
        // exactly, and the rest of 2π taken from the remainder. So cos_sin never reduces by more than two
        // quarter turns, whose folding by a reassociating compiler would grow with each.
        if (abs(th) > 3.1415927) {
          let way = sign(th);
          th -= way * ${TURN_GRID};
          tl -= way * ${2 * Math.PI - TURN_GRID};
          turns += way;
        }
      }
      // The next step rewrites the rods' shared places and the pool only after every read of them.
      workgroupBarrier();
    }
    history = dt;
    steps += 1u;
  }

  ${own(`
        state[i] = State(v[k], v_prev[k], s[k], s_prev[k], w[k], w_prev[k], 0.0, 0.0);`)}
  if (looping) {
    if (lid < rods) {
      let at = ${ROD_WORDS}u * lid;
      body[at] = xh;
      body[at + 1u] = xl;
      body[at + 2u] = yh;
      body[at + 3u] = yl;
      body[at + 4u] = th;
      body[at + 5u] = tl;
      body[at + 6u] = velocity.x;
      body[at + 7u] = velocity.y;
      body[at + 8u] = velocity.z;
      body[at + 9u] = turns;
    }
    if (lid < params.muscles) {
      body[${ROD_WORDS}u * rods + lid] = activation;
    }
  }
  // Every invocation read the status at the start; it is rewritten only after all of them have.
  storageBarrier();
  if (lid == 0u) {
    if (looping) {
      status.h = h;
      status.previous_k = previous_k;
      status.has_previous = has_previous;
      status.switch_current = switch_current;
      status.awc_threshold = awc_threshold;
    }
    status.steps = steps;
    status.history = bitcast<u32>(history);
    status.iterations = last;
    status.unconverged += failures;
    status.peak_iterations = max(status.peak_iterations, peak);
    status.total_iterations += iterations_sum;
  }
}
`;
};

export const BRAIN_SHADER = body(PER_INVOCATION);
