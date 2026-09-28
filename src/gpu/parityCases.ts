// The CPU side of GPU parity (PLAN §7.2): the states both brains start from, the thresholds they are held
// to, and the allowance for the noise's rounding. It needs no GPU, so the tests check it directly; parity.ts
// runs the GPU against it. Two of the checks were changed after results (DECISIONS.md, 2026-09-26): one step
// is compared with the CPU reference solved at the GPU's own tolerance, and one second only from states that
// are well posed, a rule tightened after results again (2026-09-27).

import type { WormlightData } from '../data/schema.ts';
import { Brain, type BrainState, type Oscillators } from '../sim/brain/brain.ts';
import { lesion, type Network } from '../sim/brain/network.ts';
import { gaussianFrom, hash, uniform } from '../sim/brain/rng.ts';
import { FIRST_LAWN, lawnField, steadyField, type Lawn } from '../sim/env/dish.ts';
import type { OdourField } from '../sim/env/odour.ts';
import { NEURAL_STEP, ODOUR_SUBSTEP } from '../sim/numerics.ts';
import { BACK, FRONT, tap, TOUCH_STEPS, type Touch, type TouchReceptor } from '../sim/touch.ts';
import { currentParams, World, type LoopParams, type WorldOptions, type WorldState } from '../sim/world.ts';

// Trial values for the loop that supplies the states; calibration (PLAN §7.3) sets the real ones. The
// B-types' drive threshold is in the range where they cycle (DECISIONS.md, 2026-09-26), and the noise, about
// 2 mV of wander on a lone neuron, keeps every voltage moving.
const PARITY_LOOP: LoopParams = {
  oscillatorGain: 2,
  recoveryTime: 1,
  driveThreshold: -16,
  switchGain: 100,
  proprioceptiveGain: 10,
  neuromuscularGain: 1,
  neuromuscularThreshold: 5,
  noise: 0.01,
};
export const SEED = 1;
const WARMUP = 2; // s before the first state
const INTERVAL = 0.5; // s between states
const STATES = 20;
export const SECOND = Math.round(1 / NEURAL_STEP);
export const SAMPLES = 10; // over the second

// PLAN §7.2's thresholds. The recovery variable's, graded since 2026-09-26, is the voltage's, with a floor
// of 1.
export const ONE_STEP = { voltage: 1e-4, activation: 1e-4, recovery: 1e-4 };
export const ONE_SECOND = { rms: 1e-2 };
// The check fails if more than a quarter of the states are ill posed: it would no longer test much.
export const MOST_ILL_POSED = 0.25;
// A one-second state is well posed, and graded, only if the CPU reference, rerun at the GPU's solver tolerance,
// stays within this share of the threshold of itself, which leaves the GPU's f32 arithmetic room. Changed after
// results (DECISIONS.md, 2026-09-27): it was the whole threshold.
export const WELL_POSED = 1 / 3;
export const FLOOR = 1; // mV for voltage; activation's and recovery's are 1

export interface ParityCase {
  label: string;
  state: BrainState;
  input: Float64Array;
}

// What both brains are built from.
export interface ParitySetup {
  network: Network;
  threshold: Float64Array;
  oscillators: Oscillators | null;
  noise: number;
  seed: number;
  cases: ParityCase[];
}

export function paritySetup(data: WormlightData): ParitySetup {
  const world = new World(data, PARITY_LOOP, { seed: SEED });
  const { brain } = world;
  const cases: ParityCase[] = [];
  const rest = new Brain(brain.network, brain.threshold);
  rest.setOscillators(brain.oscillators);
  cases.push({ label: 'rest', state: rest.snapshot(), input: new Float64Array(brain.n) });
  const every = Math.round(INTERVAL / NEURAL_STEP);
  const first = Math.round(WARMUP / NEURAL_STEP);
  for (let k = 1; cases.length <= STATES; k++) {
    world.step();
    if (k >= first && (k - first) % every === 0) {
      // The input the brain just stepped with, held for the steps to come.
      cases.push({
        label: `t = ${world.time.toFixed(1)} s`,
        state: brain.snapshot(),
        input: Float64Array.from(brain.input),
      });
    }
  }
  return {
    network: brain.network,
    threshold: brain.threshold,
    oscillators: brain.oscillators,
    noise: brain.noise,
    seed: brain.seed,
    cases,
  };
}

// The paths the main states don't take, in one case: a lesioned network, no oscillators and no noise, from the
// last state, whose one-second run restarts the integrator halfway. The thresholds stay the intact
// network's (PLAN §3.3).
export const VARIANT_LESIONS = ['AVAL', 'AVAR', 'AVBL', 'AVBR'];
export function variantSetup(setup: ParitySetup): ParitySetup {
  const from = setup.cases[setup.cases.length - 1];
  return {
    network: lesion(setup.network, VARIANT_LESIONS),
    threshold: setup.threshold,
    oscillators: null,
    noise: 0,
    seed: setup.seed,
    cases: [
      {
        label: 'lesioned',
        state: { ...from.state, recovery: new Float64Array(0), previousRecovery: new Float64Array(0) },
        input: from.input,
      },
    ],
  };
}

export function cpuBrain(setup: ParitySetup, c: ParityCase, tolerance?: number): Brain {
  const brain = new Brain(setup.network, setup.threshold, { tolerance });
  brain.setOscillators(setup.oscillators);
  brain.noise = setup.noise;
  brain.seed = setup.seed;
  brain.restore(c.state);
  brain.input.set(c.input);
  return brain;
}

// WGSL's accuracy for f32 (the Floating Point Accuracy section of the WGSL specification), bounding how far
// the shader's gaussian_from(h1, h2) may be from the exact value.
const ulp = (x: number): number => (x === 0 ? 0 : 2 ** (Math.floor(Math.log2(Math.abs(x))) - 23));
export function gaussianBound(h1: number, h2: number): number {
  const log = Math.log(uniform(h1));
  // log: an absolute 2⁻²¹ on [0.5, 2] and 3 ULP elsewhere; the product with −2 is exact.
  const dL = 2 * (uniform(h1) >= 0.5 ? 2 ** -21 : 3 * ulp(log));
  const L = -2 * log;
  // sqrt, inherited from 1/inverseSqrt: inverseSqrt's 2 ULP, at most 2⁻²² of its value, carried into the
  // quotient, then 2.5 ULP for the division, on top of L's error carried through. The shader holds L at 0 or
  // above, as the exact value is.
  const R = Math.sqrt(L);
  const carried = Math.max(Math.sqrt(L + dL) - R, R - Math.sqrt(Math.max(L - dL, 0)));
  const dR = carried + 2 ** -22 * (R + carried) + 2.5 * ulp(R + carried);
  // cos: an absolute 2⁻¹¹ on [−π, π], and its argument's error from f32's π and one rounding, 2 ULP of π.
  const dCos = 2 ** -11 + 2 * ulp(Math.PI);
  const cos = Math.cos(2 * Math.PI * uniform(h2));
  const bound = Math.abs(cos) * dR + (R + dR) * dCos;
  // The final product's rounding.
  return bound + ulp(Math.abs(R * cos) + bound) / 2;
}

// The noise as a brain has it: σ_n, its hash's seed, and τ_n, above 0 for the coloured current.
export type NoiseSetup = Pick<ParitySetup, 'noise' | 'seed' | 'network'> & { noiseCorrelation?: number };

// The most the shader's rounding can move each neuron's coloured current over one step from `before`, the state's
// own, in pA: η·decay + spread·gaussian, with η rounded to f32 on the way in, dt, τ_n and σ_n held as f32, exp's
// 3 + 2|x| ULP, the square roots' 2⁻²² and 2.5 ULP as gaussianBound takes them, the division's 2.5 ULP, and a whole
// ULP for each rounding. All 0 with white noise, whose current carries nothing from step to step.
export function colouredBounds(setup: NoiseSetup, steps: number, before: ArrayLike<number>): Float64Array {
  const bounds = new Float64Array(setup.network.names.length);
  const tau = setup.noiseCorrelation ?? 0;
  if (setup.noise === 0 || tau === 0) return bounds;
  const x = NEURAL_STEP / tau;
  const decay = Math.exp(-x);
  // exp's own error, and its argument's: dt and τ_n rounded and their quotient's 2.5 ULP, 7 ULP of x in all.
  const dDecay = (3 + 2 * x) * ulp(decay) + decay * x * 7 * 2 ** -23;
  const a = setup.noise / Math.sqrt(2 * tau);
  const dA = a * (2 ** -23 + 2 ** -22) + 5 * ulp(a);
  const q = 1 - decay * decay;
  const dQ = 2 * decay * dDecay + ulp(decay * decay) + ulp(q);
  const root = Math.sqrt(q);
  const dRoot = dQ / (2 * root) + 2 ** -22 * root + 2.5 * ulp(root);
  const spread = a * root;
  const dSpread = dA * root + a * dRoot + ulp(spread);
  for (let i = 0; i < bounds.length; i++) {
    const h1 = hash(setup.seed, steps, 2 * i);
    const h2 = hash(setup.seed, steps, 2 * i + 1);
    const g = gaussianFrom(h1, h2);
    const eta = before[i];
    const kept = Math.abs(eta) * dDecay + decay * ulp(eta) + ulp(eta * decay);
    const drawn = dSpread * Math.abs(g) + spread * gaussianBound(h1, h2) + ulp(spread * g);
    bounds[i] = kept + drawn + ulp(Math.abs(eta * decay) + Math.abs(spread * g));
  }
  return bounds;
}

// The most the noise's rounding can move any voltage in one step: the implicit system's inverse is bounded by
// dt/C in the ∞-norm, since each row's diagonal exceeds its off-diagonal sum by at least C/dt. The coloured
// current's is its bound above; white noise's, its draw's.
export function noiseAllowance(setup: NoiseSetup, steps: number, before: ArrayLike<number>): number {
  if (setup.noise === 0) return 0;
  if ((setup.noiseCorrelation ?? 0) > 0) {
    return (NEURAL_STEP * Math.max(...colouredBounds(setup, steps, before))) / setup.network.capacitance;
  }
  let worst = 0;
  for (let i = 0; i < setup.network.names.length; i++) {
    const h1 = hash(setup.seed, steps, 2 * i);
    const h2 = hash(setup.seed, steps, 2 * i + 1);
    worst = Math.max(worst, gaussianBound(h1, h2));
  }
  return (setup.noise * Math.sqrt(NEURAL_STEP) * worst) / setup.network.capacitance;
}

export const worst = (
  a: Float64Array,
  b: Float64Array,
  scale: (i: number) => number,
): { share: number; error: number } => {
  let share = 0;
  let error = 0;
  for (let i = 0; i < a.length; i++) {
    const e = Math.abs(a[i] - b[i]);
    error = Math.max(error, e);
    share = Math.max(share, e / scale(i));
  }
  return { share, error };
};

export const rms = (a: Float64Array, b: Float64Array, floor: number): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += ((a[i] - b[i]) / Math.max(Math.abs(a[i]), floor)) ** 2;
  return Math.sqrt(sum / a.length);
};

// The loop's parity (PLAN §7.2, the body's row, set 2026-09-26 before any loop results): the same states, now
// whole worlds, the body, muscles and head switch included, and both sides run the whole loop. The velocities'
// threshold was changed after results from 10⁻⁴ to 10⁻², which an f32 assembly of this system can reach
// (DECISIONS.md, 2026-09-26). AWC-ON's threshold T is compared as the voltages are, with a floor of 0.01 µM
// (set 2026-09-27, before any results): within 10⁻⁴ after one step, and an RMS relative error of 10⁻² over
// one second.
export const LOOP_STEP = { velocity: 1e-2, muscle: 1e-4, awcThreshold: 1e-4 };
export const AWC_FLOOR = 0.01; // µM
export const LOOP_SECOND = { curvature: 1e-2, centroid: 1e-2 };
// The floors, absolute tolerances for a body at rest: 10⁻⁴ segment lengths per second and 10⁻⁴ rad/s; and for
// the centroid's travel, 0.01 body lengths.
export const velocityFloors = (world: World): [number, number, number] => {
  const floor = 1e-4 * world.body.params.segmentLength;
  return [floor, floor, 1e-4];
};
export const centroidFloor = (world: World): number =>
  0.01 * world.body.params.segmentLength * world.body.params.segments;

// Every world the loop's parity runs lies in the assay's odour field (PLAN §5.2), so AWC-ON has something to
// sense: the states from the dish's centre, and their copies moved across the dish and pressed against its
// wall, which smell odour their thresholds never adapted to, beside the spot for the copy pressed at bearing 0.
let assay: OdourField | null = null;
export function assayField(): OdourField {
  assay ??= steadyField('assay');
  return assay;
}

// The worlds the loop's parity runs: the trial values, and two variants that exercise the head switch, which
// with the trial values latches before the first state and never flips again. Lowering P_th to 0.5 makes it
// flip about forty times a minute; putting θ_osc at −1 mV, within the SMDs' drive, makes its gate turn on and
// off as well. The gating variant's seed makes AWCR AWC-ON, where the others' makes AWCL, and its states are
// also taken moved, so AWCR senses odour its threshold never adapted to. A fourth runs track R's model (PLAN §9):
// relative drive, g_nmj and θ_nmj in its units, the B-types' oscillator gain apart from the A-types', and the two
// class gains below 1. A fifth runs the trial values with the coloured noise, which carries a current in each
// neuron's state (DECISIONS.md, 2026-09-28). A sixth runs the values the app runs, the registry's, so the GPU is
// checked on whatever a fit sets.
export interface LoopSetup {
  name: string;
  params: LoopParams;
  switchThreshold?: number;
  seed?: number;
  // Whether its states are also taken moved, as the trial values' are.
  moved?: boolean;
  // States after the rest world's.
  states: number;
}
export const LOOP_SETUPS: readonly LoopSetup[] = [
  { name: 'trial', params: PARITY_LOOP, states: STATES },
  { name: 'flipping', params: PARITY_LOOP, switchThreshold: 0.5, states: 10 },
  {
    name: 'gating',
    params: { ...PARITY_LOOP, driveThreshold: -1 },
    switchThreshold: 0.5,
    seed: 4,
    moved: true,
    states: 10,
  },
  {
    name: 'track R',
    params: {
      ...PARITY_LOOP,
      oscillatorGainB: 1,
      gapGainB: 0.5,
      smdGain: 0.5,
      relativeDrive: true,
      neuromuscularGain: 10,
      neuromuscularThreshold: 0.2,
    },
    states: 10,
  },
  { name: 'coloured', params: { ...PARITY_LOOP, noiseCorrelation: 0.05 }, states: 10 },
  { name: 'registry', params: currentParams(), states: 10 },
];

export interface LoopCase {
  label: string;
  setup: LoopSetup;
  state: WorldState;
}

// The rest world and states from its closed loop, taken as paritySetup takes the brain's.
export function loopCases(data: WormlightData, setup: LoopSetup = LOOP_SETUPS[0]): LoopCase[] {
  const world = new World(data, setup.params, {
    seed: setup.seed ?? SEED,
    switchThreshold: setup.switchThreshold,
    odour: assayField(),
  });
  const cases: LoopCase[] = [{ label: 'rest', setup, state: world.snapshot() }];
  const every = Math.round(INTERVAL / NEURAL_STEP);
  const first = Math.round(WARMUP / NEURAL_STEP);
  for (let k = 1; cases.length <= setup.states; k++) {
    world.step();
    if (k >= first && (k - first) % every === 0) {
      cases.push({ label: `t = ${world.time.toFixed(1)} s`, setup, state: world.snapshot() });
    }
  }
  return cases;
}

// A CPU world at a state, its brain solved to the given tolerance (the reference's by default).
export function cpuWorld(
  data: WormlightData,
  state: WorldState,
  tolerance?: number,
  setup: LoopSetup = LOOP_SETUPS[0],
): World {
  const world = new World(data, setup.params, {
    seed: setup.seed ?? SEED,
    solver: { tolerance },
    switchThreshold: setup.switchThreshold,
    odour: assayField(),
  });
  world.restore(state);
  return world;
}

// A world for long-run parity: the registry's values, which the app runs, with the coloured noise from track R's
// refit on (DECISIONS.md, 2026-09-28), from its seed's start in the assay's field.
export function longWorld(data: WormlightData, seed: number): World {
  return new World(data, currentParams(), { seed, odour: assayField() });
}

// A world on the trial values, from its seed's start in the assay's field, or as the options say instead.
export function seededWorld(data: WormlightData, seed: number, options: WorldOptions = {}): World {
  return new World(data, PARITY_LOOP, { seed, odour: assayField(), ...options });
}
// A seed that puts AWCR ON, where SEED puts AWCL.
export const OTHER_SEED = 3;

// A state moved across the dish and turned by whole turns, which the CPU's arithmetic doesn't notice: the GPU
// must not either, so parity checks copies of its states moved 3 cm along each axis and turned 50 times. They
// move away from the spot, where the odour is weaker than at the centre and AWC-ON's threshold sits above it;
// the copy pressed against the wall at bearing 0 lies beside the spot, where the threshold sits below.
export function movedAndTurned(state: WorldState, dx: number, dy: number, turns: number): WorldState {
  return {
    ...state,
    x: state.x.map((x) => x + dx),
    y: state.y.map((y) => y + dy),
    theta: state.theta.map((t) => t + 2 * Math.PI * turns),
  };
}
export const COPIES: readonly { label: string; dx: number; dy: number; turns: number }[] = [
  { label: 'moved 3 cm each way', dx: -0.03, dy: -0.03, turns: 0 },
  { label: 'turned 50 times', dx: 0, dy: 0, turns: 50 },
];

// Copies pressed against the dish's wall, which the kernel and the CPU must both push back. Each is moved out
// to the wall at a bearing, and perhaps turned first so its head-to-tail line lies along the wall there, until
// its deepest rod is `depth` past the wall less that rod's radius. A 2 µm press is held by about 14 µN, well
// past the contact's 0.1 µm easing and deep enough that f32's few nanometres at 5 cm don't count; a 50 nm
// press sits inside the easing.
export interface WallCopy {
  label: string;
  depth: number; // m
  bearing: number; // rad, round the dish from +x
  along: boolean;
}
// Copies tapped as the state starts, front and back where the app's buttons tap, so the pulse switches on at
// the first step and, over one second, off at the 201st (PLAN §7.2, set 2026-09-27 before any touch ran); and,
// for one step, copies whose pulse took its last step just before the state, so it switches off at the first
// (added after review, stricter than the rule).
export const TAP_COPIES: readonly { label: string; s: number }[] = [
  { label: 'tapped front', s: FRONT },
  { label: 'tapped back', s: BACK },
];
export const ENDING_COPIES: readonly { label: string; s: number }[] = [
  { label: 'pulse ending front', s: FRONT },
  { label: 'pulse ending back', s: BACK },
];

// A state tapped at s as it starts, as World.touch taps it: `receptors` are the world's, `sets` every receptor's.
export function tapped(state: WorldState, receptors: readonly TouchReceptor[], sets: Touch, s: number): WorldState {
  const { mask, currents } = tap(sets, s);
  const hit = (k: number): boolean => (mask & (1 << receptors[k].index)) !== 0;
  return {
    ...state,
    touchLeft: Int32Array.from(state.touchLeft, (left, k) => (hit(k) ? TOUCH_STEPS : left)),
    touchCurrent: Float64Array.from(state.touchCurrent, (c, k) => (hit(k) ? currents[receptors[k].index] : c)),
  };
}

// A state whose pulse, from a tap at s, took its last step just before it, so it switches off at the first.
export function ending(state: WorldState, receptors: readonly TouchReceptor[], sets: Touch, s: number): WorldState {
  const { mask, currents } = tap(sets, s);
  const hit = (k: number): boolean => (mask & (1 << receptors[k].index)) !== 0;
  const current = (c: number, k: number): number => (hit(k) ? currents[receptors[k].index] : c);
  return {
    ...state,
    touchLeft: Int32Array.from(state.touchLeft, (left, k) => (hit(k) ? 0 : left)),
    touchCurrent: Float64Array.from(state.touchCurrent, current),
    touchApplied: Float64Array.from(state.touchApplied, current),
  };
}

export const WALL_COPIES: readonly WallCopy[] = [
  { label: 'pressed 2 µm into the wall', depth: 2e-6, bearing: 0, along: false },
  { label: 'along the wall, pressed 2 µm', depth: 2e-6, bearing: Math.PI / 3, along: true },
  { label: 'along the wall, pressed 50 nm', depth: 5e-8, bearing: Math.PI / 3, along: true },
];

export function againstWall(state: WorldState, radii: ArrayLike<number>, wall: number, copy: WallCopy): WorldState {
  const n = state.x.length;
  const cx = state.x.reduce((a, b) => a + b, 0) / n;
  const cy = state.y.reduce((a, b) => a + b, 0) / n;
  // Turned about its centroid, the whole body at once, which the CPU's arithmetic barely notices.
  const turn = copy.along
    ? Math.atan2(Math.cos(copy.bearing), -Math.sin(copy.bearing)) -
      Math.atan2(state.y[0] - state.y[n - 1], state.x[0] - state.x[n - 1])
    : 0;
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const x = Array.from(state.x, (xi, i) => (xi - cx) * c - (state.y[i] - cy) * s);
  const y = Array.from(state.y, (yi, i) => (state.x[i] - cx) * s + (yi - cy) * c);
  const [ux, uy] = [Math.cos(copy.bearing), Math.sin(copy.bearing)];
  let out = wall - 6e-4;
  // The wall curves, so the deepest rod's depth is found and corrected a few times.
  for (let k = 0; k < 6; k++) {
    let deepest = -Infinity;
    for (let i = 0; i < n; i++)
      deepest = Math.max(deepest, Math.hypot(x[i] + out * ux, y[i] + out * uy) - (wall - radii[i]));
    out += copy.depth - deepest;
  }
  return {
    ...state,
    x: Float64Array.from(x, (xi) => xi + out * ux),
    y: Float64Array.from(y, (yi) => yi + out * uy),
    theta: state.theta.map((t) => t + turn),
  };
}

// Each rod's two end points' velocities, the points its springs act on: its centre's, plus or minus R θ̇
// turned a quarter from its axis, at the step's starting angles.
export function endVelocities(world: World, theta: ArrayLike<number>, v: ArrayLike<number>): Float64Array {
  const { radii } = world.body.params;
  const out = new Float64Array(4 * radii.length);
  for (let i = 0; i < radii.length; i++) {
    const spin = radii[i] * v[3 * i + 2];
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? 1 : -1;
      out[4 * i + 2 * side] = v[3 * i] - sign * spin * Math.sin(theta[i]);
      out[4 * i + 2 * side + 1] = v[3 * i + 1] + sign * spin * Math.cos(theta[i]);
    }
  }
  return out;
}

// The odour field's parity (PLAN §7.2, set 2026-09-27 before any food was built): the GPU's stepped field
// against OdourField.step, every cell within these shares of the field's largest concentration, after one
// 4 ms sub-step and after one simulated second; and over the second, the change in the total odour within
// FIELD_SECOND of the CPU's.
export const FIELD_STEP = 1e-5;
export const FIELD_SECOND = 1e-4;
export const FIELD_TIMES = { step: ODOUR_SUBSTEP, second: 1 } as const;

// Where it starts: the app's steady lawn field, with a second lawn just dropped at the dish's centre.
export function fieldCase(): { start: OdourField; lawns: Lawn[] } {
  return { start: lawnField([FIRST_LAWN]), lawns: [FIRST_LAWN, [0, 0]] };
}
