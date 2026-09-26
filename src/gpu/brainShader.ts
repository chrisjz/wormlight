// The neural step in WGSL (PLAN §3.4), mirroring Brain.step in src/sim/brain/brain.ts line for line: the
// voltages by BDF2 (implicit Euler without a history), solved by Jacobi-preconditioned conjugate gradients
// warm-started from the last step; then activation and the oscillators' recovery by BDF2 at the new
// voltages. The whole network runs in one workgroup, each invocation holding its neurons' state in
// registers, so a dispatch can take many steps with nothing but barriers between them.

import { RNG_WGSL } from './rngShader.ts';

export const WORKGROUP = 256;
// Neurons per invocation: the network may have up to WORKGROUP × PER neurons.
export const PER_INVOCATION = 2;
export const MAX_NEURONS = WORKGROUP * PER_INVOCATION;

// The uniform block, in the order the shader declares it: eight u32 then twelve f32.
export const PARAM_WORDS = 20;
// Per neuron: v, v₋₁, s, s₋₁, w, w₋₁ and two words of padding.
export const STATE_WORDS = 8;
// Per neuron: threshold, oscillator shift θ, whether it oscillates, and padding.
export const NEURON_WORDS = 4;
// The status block: steps taken (the noise's counter), the step size of the history as f32 bits (0 for
// none), the last solve's iterations, unconverged solves, the most iterations in the last dispatch, and the
// iterations over it.
export const STATUS_WORDS = 8;

const body = (per: number): string => {
  // A loop over the invocation's own neurons, i = lid + k·WORKGROUP, skipping any past the last.
  const own = (inner: string): string => `
    for (var k = 0u; k < ${per}u; k++) {
      let i = lid + k * ${WORKGROUP}u;
      if (i < n) {${inner}
      }
    }`;
  // (diag(d) − G) applied to the vector published in shared_x, for neuron i.
  const product = (vector: string): string => `
        var product = d[k] * ${vector}[k];
        for (var e = topology[i]; e < topology[i + 1u]; e++) {
          product -= gap_weight[e] * shared_x[topology[params.gap_index_at + e]];
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
  _pad0: u32,
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
  _pad1: f32,
}

struct NeuronConstants {
  threshold: f32,
  shift: f32,
  oscillates: f32,
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
}

@group(0) @binding(0) var<uniform> params: Params;
// Gap rows' starts (n + 1), then chemical rows' starts (n + 1), gap partners, chemical presynaptic neurons.
@group(0) @binding(1) var<storage, read> topology: array<u32>;
@group(0) @binding(2) var<storage, read> gap_weight: array<f32>;
// Each chemical synapse's conductance and reversal potential, in row order.
@group(0) @binding(3) var<storage, read> chemical: array<vec2<f32>>;
@group(0) @binding(4) var<storage, read> neurons: array<NeuronConstants>;
@group(0) @binding(5) var<storage, read> input: array<f32>;
@group(0) @binding(6) var<storage, read_write> state: array<State>;
@group(0) @binding(7) var<storage, read_write> status: Status;

const FHN_A: f32 = 0.7;
const FHN_B: f32 = 0.8;

// A vector the matrix product reads at other neurons, and the activation the synapses see this step.
var<workgroup> shared_x: array<f32, ${WORKGROUP * per}>;
var<workgroup> shared_s: array<f32, ${WORKGROUP * per}>;
var<workgroup> partial: array<vec4<f32>, ${WORKGROUP}>;

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

@compute @workgroup_size(${WORKGROUP})
fn advance(@builtin(local_invocation_index) lid: u32) {
  let n = params.n;
  let dt = params.dt;
  let c = params.capacitance / dt;
  let v0 = 1.0 / (2.0 * params.slope);
  let noise = params.noise / sqrt(dt);

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
  ${own(`
        let here = state[i];
        v[k] = here.v;
        v_prev[k] = here.v_prev;
        s[k] = here.s;
        s_prev[k] = here.s_prev;
        w[k] = here.w;
        w_prev[k] = here.w_prev;`)}

  var steps = status.steps;
  var history = bitcast<f32>(status.history);
  var last = 0u;
  var peak = 0u;
  var iterations_sum = 0u;
  var failures = 0u;
  for (var t = 0u; t < params.steps; t++) {
    // BDF2: (3y′ − 4y + y₋₁) / 2dt = f(y′), written as (a y′ − h) / dt with a = 3/2 and h = 2y − y₋₁/2.
    // Implicit Euler: a = 1 and h = y.
    let bdf2 = history == dt;
    let a = select(1.0, 1.5, bdf2);
    ${own(`
        shared_s[i] = select(s[k], 2.0 * s[k] - s_prev[k], bdf2);`)}
    workgroupBarrier();

    // Each neuron's row of the system: leak, gap-junction and synaptic conductances with the synapses'
    // activation extrapolated to the new step, and the oscillator's current linearised about this step's
    // voltage, implicit where the cubic stabilises and explicit where it destabilises.
    ${own(`
        var g = a * c + params.leak;
        var current = c * select(v[k], 2.0 * v[k] - 0.5 * v_prev[k], bdf2) + params.leak * params.leak_potential + input[i];
        if (params.noise > 0.0) {
          current += noise * gaussian(params.seed, steps, i);
        }
        for (var e = topology[i]; e < topology[i + 1u]; e++) {
          g += gap_weight[e];
        }
        for (var e = topology[params.chem_start_at + i]; e < topology[params.chem_start_at + i + 1u]; e++) {
          let synapse = chemical[e];
          let conductance = synapse.x * shared_s[topology[params.chem_index_at + e]];
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
        shared_x[i] = x[k];`)}
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
      // total() ended on a barrier, so every read of shared_x has been made.
      ${own(`
        shared_x[i] = p[k];`)}
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
          let h = dt / params.osc_recovery;
          let w_history = select(w[k], 2.0 * w[k] - 0.5 * w_prev[k], bdf2);
          w_prev[k] = w[k];
          w[k] = (w_history + h * (xo + FHN_A)) / (a + h * FHN_B);
        }`)}
    history = dt;
    steps += 1u;
  }

  ${own(`
        state[i] = State(v[k], v_prev[k], s[k], s_prev[k], w[k], w_prev[k], 0.0, 0.0);`)}
  if (lid == 0u) {
    status.steps = steps;
    status.history = bitcast<u32>(history);
    status.iterations = last;
    status.unconverged += failures;
    status.peak_iterations = peak;
    status.total_iterations = iterations_sum;
  }
}
`;
};

export const BRAIN_SHADER = body(PER_INVOCATION);
