// One worm of the chemotaxis assay on the CPU reference (PLAN §7.4, checkpoint 4's protocol, which checkpoint 0's
// chemotaxis clause runs on the silenced network): a World started with its centroid at the dish's centre, from
// a real posture drawn by its seed, sensing the assay's steady field, run until any part of its body comes
// within 0.5 cm of either spot's centre, as sodium azide stops a worm there, or its time runs out.

import type { WormlightData } from '../data/schema.ts';
import { CAPTURE_RADIUS, CONTROL, SPOT } from '../sim/env/dish.ts';
import { NEURAL_STEP } from '../sim/numerics.ts';
import type { AwcSide, Odour } from '../sim/sensing.ts';
import { MOTION_SAMPLE } from './motion.ts';
import { startingWorld, type StartOptions } from './trial.ts';

export interface ChemotaxisOptions extends StartOptions {
  seconds: number;
  // The assay's field, at its steady state.
  odour: Odour;
  // Where the centroid starts (m from the dish's centre): the assay's is the centre itself.
  at?: readonly [number, number];
}

export type Spot = 'odour' | 'control';

export interface ChemotaxisRecord {
  seed: number;
  posture: number;
  turn: number;
  awcSide: AwcSide;
  // False if the body left the finite numbers, in which case the run stops there.
  finite: boolean;
  // The spot the worm reached, and when (s), or null if it reached neither in the run's time.
  reached: Spot | null;
  time: number | null;
  // The simulated time run (s).
  seconds: number;
  // The nearest any part of the body came to each spot's centre (m).
  closest: Record<Spot, number>;
  // The centroid at the start and the end (m from the dish's centre), and the farthest it got from its start.
  start: [number, number];
  end: [number, number];
  farthest: number;
  unconverged: number;
}

// The nearest any rod's centre lies to a point (m). The rods lie 21 µm apart along the midline.
function nearest(x: ArrayLike<number>, y: ArrayLike<number>, [px, py]: readonly [number, number]): number {
  let best = Infinity;
  for (let i = 0; i < x.length; i++) best = Math.min(best, Math.hypot(x[i] - px, y[i] - py));
  return best;
}

export function runChemotaxis(data: WormlightData, options: ChemotaxisOptions): ChemotaxisRecord {
  const { seed, seconds } = options;
  const { world, start, posture } = startingWorld(data, options);
  const { body } = world;
  const centroid = (): [number, number] => {
    let x = 0;
    let y = 0;
    for (let i = 0; i < body.rods; i++) {
      x += body.x[i];
      y += body.y[i];
    }
    return [x / body.rods, y / body.rods];
  };
  // The same posture moved so its centroid sits at the dish's centre, with AWC-ON adapted there.
  const [cx, cy] = centroid();
  const [ax, ay] = options.at ?? [0, 0];
  body.pose(posture, ax - cx, ay - cy);
  world.adapt();
  const from = centroid();
  const closest = { odour: Infinity, control: Infinity };
  // The spot the body now reaches, if any, noting how near it has come to each.
  const at = (): Spot | null => {
    closest.odour = Math.min(closest.odour, nearest(body.x, body.y, SPOT));
    closest.control = Math.min(closest.control, nearest(body.x, body.y, CONTROL));
    return closest.odour <= CAPTURE_RADIUS ? 'odour' : closest.control <= CAPTURE_RADIUS ? 'control' : null;
  };
  const every = Math.round(MOTION_SAMPLE / NEURAL_STEP);
  const steps = Math.round(seconds / NEURAL_STEP);
  let farthest = 0;
  let finite = true;
  let reached = at();
  let step = 0;
  while (reached === null && step < steps) {
    world.step();
    step++;
    if (!body.x.every(Number.isFinite) || !body.y.every(Number.isFinite)) {
      finite = false;
      break;
    }
    if (step % every === 0) {
      const [x, y] = centroid();
      farthest = Math.max(farthest, Math.hypot(x - from[0], y - from[1]));
    }
    reached = at();
  }
  return {
    seed,
    posture: start.index,
    turn: start.turn,
    awcSide: world.awcSide,
    finite,
    reached,
    time: reached === null ? null : step * NEURAL_STEP,
    seconds: step * NEURAL_STEP,
    closest,
    start: from,
    end: finite ? centroid() : from,
    farthest,
    unconverged: world.brain.unconverged,
  };
}
