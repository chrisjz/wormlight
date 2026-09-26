// The loop outside the brain, as the GPU runs it (PLAN §1): a CPU World's proprioceptive fields, head switch,
// neuromuscular layer and body, packed into the shader's layout, and a world's state in and out. GpuWorld
// runs a whole World on the GPU, the brain and the loop together, and trades state with the CPU's as a
// WorldState.

import type { World, WorldState } from '../sim/world.ts';
import { NEURAL_STEP } from '../sim/numerics.ts';
import { GpuBrain, type GpuBrainOptions, type GpuBrainStatus } from './brain.ts';
import { MAX_MUSCLES, MAX_RODS, SEGMENT_WORDS } from './brainShader.ts';

export interface LoopLayout {
  rods: number;
  muscles: number;
  // Per neuron: its proprioceptive field's side (0 for none) and first and last rod, and the side the head
  // switch drives it on (0 for none).
  fieldSide: Float32Array;
  fieldFrom: Uint32Array;
  fieldTo: Uint32Array;
  switchSide: Float32Array;
  // The rods whose curvature the head switch reads.
  headFrom: number;
  headTo: number;
  // The neuromuscular rows: each muscle's first entry, and each entry's presynaptic neuron and signed sections.
  nmStart: Uint32Array;
  nmPre: Uint32Array;
  nmWeight: Float32Array;
  // Per segment, the muscles covering it: dorsal left, dorsal right, ventral left, ventral right.
  cover: Uint32Array;
  // Per rod its radius and rotational drag; per segment its lateral and diagonal rest lengths, shortest
  // muscle length, efficacy and diagonal rest length squared, the square taken in f64.
  rodConstants: Float32Array;
  segmentConstants: Float32Array;
  // The scalars, in the shader's order from proprio_gain to drag_tangential.
  scalars: number[];
}

// The interior rods whose body coordinates lie in [from, to], as regionMean reads them, or the nearest one.
export function rodRange(segments: number, from: number, to: number): [number, number] {
  let first = -1;
  let last = -1;
  for (let i = 1; i < segments; i++) {
    const s = i / segments;
    if (s >= from - 1e-12 && s <= to + 1e-12) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first >= 0) return [first, last];
  const nearest = Math.min(segments - 1, Math.max(1, Math.round(((from + to) / 2) * segments)));
  return [nearest, nearest];
}

export function packLoop(world: World): LoopLayout {
  const { body, muscles, params } = world;
  const n = world.brain.n;
  const segments = body.params.segments;
  const rods = body.rods;
  const count = muscles.names.length;
  if (rods > MAX_RODS) throw new Error(`the GPU body holds at most ${MAX_RODS} rods, not ${rods}`);
  if (count > MAX_MUSCLES) throw new Error(`the GPU holds at most ${MAX_MUSCLES} muscles, not ${count}`);
  const fieldSide = new Float32Array(n);
  const fieldFrom = new Uint32Array(n);
  const fieldTo = new Uint32Array(n);
  for (const field of world.fields) {
    const [from, to] = rodRange(segments, field.from, field.to);
    fieldSide[field.neuron] = field.side;
    fieldFrom[field.neuron] = from;
    fieldTo[field.neuron] = to;
  }
  const switchSide = new Float32Array(n);
  for (const i of world.dorsalSwitch) switchSide[i] = 1;
  for (const i of world.ventralSwitch) switchSide[i] = -1;
  const [headFrom, headTo] = rodRange(segments, world.headFrom, world.headTo);
  const { cover } = muscles;
  const p = body.params;
  const radius = p.radius;
  return {
    rods,
    muscles: count,
    fieldSide,
    fieldFrom,
    fieldTo,
    switchSide,
    headFrom,
    headTo,
    nmStart: Uint32Array.from(muscles.start),
    nmPre: Uint32Array.from(muscles.pre),
    nmWeight: Float32Array.from(muscles.weight),
    cover: Uint32Array.from([...cover.DL, ...cover.DR, ...cover.VL, ...cover.VR]),
    rodConstants: Float32Array.from({ length: 2 * rods }, (_, k) =>
      k % 2 === 0 ? p.radii[k / 2] : p.dragRotation[(k - 1) / 2],
    ),
    segmentConstants: Float32Array.from({ length: SEGMENT_WORDS * segments }, (_, k) => {
      const m = Math.floor(k / SEGMENT_WORDS);
      const diagonal = body.restDiagonal[m];
      return [body.restLateral[m], diagonal, body.shortest[m], p.efficacy[m], diagonal * diagonal][k % SEGMENT_WORDS];
    }),
    scalars: [
      params.proprioceptiveGain,
      params.switchGain,
      params.driveThreshold,
      world.headSwitch.derivativeWeight,
      world.headSwitch.threshold,
      muscles.params.gain,
      muscles.params.threshold,
      muscles.params.timeConstant,
      p.segmentLength * p.segments,
      radius,
      p.lateralStiffness,
      p.diagonalStiffness,
      p.muscleStiffness,
      p.lateralDamping,
      p.diagonalDamping,
      p.muscleDamping,
      p.dragNormal,
      p.dragTangential,
    ],
  };
}

// A whole World on the GPU: its brain and its loop, stepped together at the neural step.
export class GpuWorld {
  readonly brain: GpuBrain;
  readonly layout: LoopLayout;

  private constructor(brain: GpuBrain, layout: LoopLayout) {
    this.brain = brain;
    this.layout = layout;
  }

  // Build it from a CPU World, taking that world's network, thresholds, oscillators, noise and state.
  static async create(device: GPUDevice, world: World, options: GpuBrainOptions = {}): Promise<GpuWorld> {
    const layout = packLoop(world);
    const brain = await GpuBrain.create(device, world.brain.network, world.brain.threshold, {
      ...options,
      loop: layout,
    });
    brain.setOscillators(world.brain.oscillators);
    brain.noise = world.brain.noise;
    brain.seed = world.brain.seed;
    const gpu = new GpuWorld(brain, layout);
    gpu.restore(world.snapshot());
    return gpu;
  }

  restore(state: WorldState): void {
    this.brain.restore(state.brain);
    this.brain.restoreLoop(state);
  }

  run(steps: number): void {
    this.brain.run(NEURAL_STEP, steps);
  }

  async read(): Promise<{ state: WorldState; status: GpuBrainStatus }> {
    const { state, status, loop } = await this.brain.read();
    if (!loop) throw new Error('the GPU world read back no loop');
    return { state: { ...loop, brain: state }, status };
  }

  destroy(): void {
    this.brain.destroy();
  }
}
