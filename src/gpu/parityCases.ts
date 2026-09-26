// The CPU side of GPU parity (PLAN §7.2): the states both brains start from, the thresholds they are held
// to, and the allowance for the noise's rounding. It needs no GPU, so the tests check it directly; parity.ts
// runs the GPU against it. Two of the checks were changed after results (DECISIONS.md, 2026-09-26): one step
// is compared with the CPU reference solved at the GPU's own tolerance, and one second only from states that
// are well posed.

import type { WormlightData } from '../data/schema.ts';
import { Brain, type BrainState, type Oscillators } from '../sim/brain/brain.ts';
import { lesion, type Network } from '../sim/brain/network.ts';
import { hash, uniform } from '../sim/brain/rng.ts';
import { NEURAL_STEP } from '../sim/numerics.ts';
import { World, type LoopParams, type WorldState } from '../sim/world.ts';

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

// The most the noise's rounding can move any voltage in one step: the implicit system's inverse is bounded by
// dt/C in the ∞-norm, since each row's diagonal exceeds its off-diagonal sum by at least C/dt.
export function noiseAllowance(setup: Pick<ParitySetup, 'noise' | 'seed' | 'network'>, steps: number): number {
  if (setup.noise === 0) return 0;
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
// (DECISIONS.md, 2026-09-26).
export const LOOP_STEP = { velocity: 1e-2, muscle: 1e-4 };
export const LOOP_SECOND = { curvature: 1e-2, centroid: 1e-2 };
// The floors, absolute tolerances for a body at rest: 10⁻⁴ segment lengths per second and 10⁻⁴ rad/s; and for
// the centroid's travel, 0.01 body lengths.
export const velocityFloors = (world: World): [number, number, number] => {
  const floor = 1e-4 * world.body.params.segmentLength;
  return [floor, floor, 1e-4];
};
export const centroidFloor = (world: World): number =>
  0.01 * world.body.params.segmentLength * world.body.params.segments;

// The worlds the loop's parity runs: the trial values, and two variants that exercise the head switch, which
// with the trial values latches before the first state and never flips again. Lowering P_th to 0.5 makes it
// flip about forty times a minute; putting θ_osc at −1 mV, within the SMDs' drive, makes its gate turn on and
// off as well.
export interface LoopSetup {
  name: string;
  params: LoopParams;
  switchThreshold?: number;
  // States after the rest world's.
  states: number;
}
export const LOOP_SETUPS: readonly LoopSetup[] = [
  { name: 'trial', params: PARITY_LOOP, states: STATES },
  { name: 'flipping', params: PARITY_LOOP, switchThreshold: 0.5, states: 10 },
  { name: 'gating', params: { ...PARITY_LOOP, driveThreshold: -1 }, switchThreshold: 0.5, states: 10 },
];

export interface LoopCase {
  label: string;
  setup: LoopSetup;
  state: WorldState;
}

// The rest world and states from its closed loop, taken as paritySetup takes the brain's.
export function loopCases(data: WormlightData, setup: LoopSetup = LOOP_SETUPS[0]): LoopCase[] {
  const world = new World(data, setup.params, { seed: SEED, switchThreshold: setup.switchThreshold });
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
    seed: SEED,
    solver: { tolerance },
    switchThreshold: setup.switchThreshold,
  });
  world.restore(state);
  return world;
}

// A world for long-run parity: the trial values, from its seed's start.
export function seededWorld(data: WormlightData, seed: number): World {
  return new World(data, PARITY_LOOP, { seed });
}

// A state moved across the dish and turned by whole turns, which the CPU's arithmetic doesn't notice: the GPU
// must not either, so parity checks copies of its states moved 3 cm and turned 50 times.
export function movedAndTurned(state: WorldState, dx: number, dy: number, turns: number): WorldState {
  return {
    ...state,
    x: state.x.map((x) => x + dx),
    y: state.y.map((y) => y + dy),
    theta: state.theta.map((t) => t + 2 * Math.PI * turns),
  };
}
export const COPIES: readonly { label: string; dx: number; dy: number; turns: number }[] = [
  { label: 'moved 3 cm', dx: 0.03, dy: -0.03, turns: 0 },
  { label: 'turned 50 times', dx: 0, dy: 0, turns: 50 },
];

// How far a copy pressed against the dish's wall has its deepest rod in: as deep as a worm's own muscles, a
// micronewton or so a rod, press it, and deep enough that f32's few nanometres at 5 cm don't count.
export const WALL_DEPTH = 2e-6; // m

// A copy of a state moved against the dish's wall, which the kernel and the CPU must both push back: its
// centroid out along +x, and its deepest rod `depth` past the wall less that rod's radius.
export function againstWall(state: WorldState, radii: ArrayLike<number>, wall: number, depth = WALL_DEPTH): WorldState {
  const n = state.x.length;
  const cx = state.x.reduce((a, b) => a + b, 0) / n;
  const cy = state.y.reduce((a, b) => a + b, 0) / n;
  let dx = wall - 6e-4 - cx;
  const dy = -cy;
  // The wall curves, so the deepest rod's depth is found and corrected a few times.
  for (let k = 0; k < 4; k++) {
    let deepest = -Infinity;
    for (let i = 0; i < n; i++)
      deepest = Math.max(deepest, Math.hypot(state.x[i] + dx, state.y[i] + dy) - (wall - radii[i]));
    dx += depth - deepest;
  }
  return { ...state, x: state.x.map((x) => x + dx), y: state.y.map((y) => y + dy) };
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
