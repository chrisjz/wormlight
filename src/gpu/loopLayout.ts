// The loop outside the brain, as the GPU kernel holds it (PLAN §1): a CPU World's proprioceptive fields,
// head switch, neuromuscular layer, body and dish, packed into the shader's layout. Pure data, so tests
// without WebGPU can check it.

import type { World } from '../sim/world.ts';
import { MAX_MUSCLES, MAX_RODS, MAX_WALL, ROD_CONSTANTS, SEGMENT_WORDS, type LoopScalar } from './brainShader.ts';

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
  // Per rod its radius, rotational drag and W² for the wall (ROD_CONSTANTS); per segment its lateral and
  // diagonal rest lengths, shortest muscle length, efficacy and diagonal rest length squared, the square
  // taken in f64.
  rodConstants: Float32Array;
  segmentConstants: Float32Array;
  // The scalars, by their names in the shader.
  scalars: Record<LoopScalar, number>;
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
  const wall = body.params.wall;
  if (!(wall > 0 && wall <= MAX_WALL))
    throw new Error(`the GPU holds a dish of radius up to ${MAX_WALL} m, not ${wall}`);
  const fieldSide = new Float32Array(n);
  const fieldFrom = new Uint32Array(n);
  const fieldTo = new Uint32Array(n);
  for (const field of world.fields) {
    // The CPU would add two fields on one neuron; the shader holds one.
    if (fieldSide[field.neuron] !== 0) throw new Error(`neuron ${field.neuron} has two proprioceptive fields`);
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
    rodConstants: Float32Array.from({ length: ROD_CONSTANTS * rods }, (_, k) => {
      const i = Math.floor(k / ROD_CONSTANTS);
      // W² in units of 2⁻⁴⁰ m²: its whole part as two 16-bit halves, and its fraction.
      const square = (p.wall - p.radii[i]) ** 2 * 2 ** 40;
      const whole = Math.floor(square);
      return [p.radii[i], p.dragRotation[i], Math.floor(whole / 65536), whole % 65536, square - whole][
        k % ROD_CONSTANTS
      ];
    }),
    segmentConstants: Float32Array.from({ length: SEGMENT_WORDS * segments }, (_, k) => {
      const m = Math.floor(k / SEGMENT_WORDS);
      const diagonal = body.restDiagonal[m];
      return [body.restLateral[m], diagonal, body.shortest[m], p.efficacy[m], diagonal * diagonal][k % SEGMENT_WORDS];
    }),
    scalars: {
      proprio_gain: params.proprioceptiveGain,
      switch_gain: params.switchGain,
      drive_threshold: params.driveThreshold,
      switch_b: world.headSwitch.derivativeWeight,
      switch_threshold: world.headSwitch.threshold,
      muscle_gain: muscles.params.gain,
      muscle_threshold: muscles.params.threshold,
      muscle_tau: muscles.params.timeConstant,
      body_length: p.segmentLength * p.segments,
      radius,
      lateral_k: p.lateralStiffness,
      diagonal_k: p.diagonalStiffness,
      muscle_k: p.muscleStiffness,
      lateral_b: p.lateralDamping,
      diagonal_b: p.diagonalDamping,
      muscle_b: p.muscleDamping,
      drag_normal: p.dragNormal,
      drag_tangential: p.dragTangential,
      wall: p.wall,
    },
  };
}
