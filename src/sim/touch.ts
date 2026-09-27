// Touch (PLAN §4.2). A tap at body coordinate s stimulates every touch receptor whose process covers s, holding
// it 10 mV above rest for 500 ms with a current computed once from its input conductance in the intact real
// wiring, the same for every brain and lesion. A receptor's stimulus is on or off, never stronger: a tap turns
// it on for the next 500 ms, restarting a pulse already on (DECISIONS.md, 2026-09-27).

import type { WormlightData } from '../data/schema.ts';
import { PARAMS } from '../science/params.ts';
import { inputConductance, midpointActivation } from './brain/brain.ts';
import { cookNetwork } from './brain/network.ts';
import { NEURAL_STEP } from './numerics.ts';

export interface TouchReceptor {
  neuron: number;
  name: string;
  // Its receptive field, in body coordinates from the nose (0) to the tail tip (1).
  from: number;
  to: number;
  // The current that holds it 10 mV above rest (pA).
  current: number;
}

// A pulse's length in steps: 500 ms at the neural step.
export const TOUCH_STEPS = Math.round(PARAMS.touchDuration.value / 1000 / NEURAL_STEP);

// Where the app's buttons tap: the middle of the ALM and PLM fields (DECISIONS.md, 2026-09-27).
export const FRONT = 0.2;
export const BACK = 0.8;

const receptorsOf = new WeakMap<WormlightData, readonly TouchReceptor[]>();

// Every touch receptor in the data, each neuron that senses along its process, with its current.
export function touchReceptors(data: WormlightData): readonly TouchReceptor[] {
  let receptors = receptorsOf.get(data);
  if (!receptors) {
    const network = cookNetwork(data);
    const rest = midpointActivation(network);
    receptors = data.neurons.flatMap((n, neuron) =>
      n.sensing.kind === 'field'
        ? [
            {
              neuron,
              name: n.name,
              from: n.sensing.s0,
              to: n.sensing.s1,
              current: PARAMS.touchAmplitude.value * inputConductance(network, rest, neuron),
            },
          ]
        : [],
    );
    receptorsOf.set(data, receptors);
  }
  return receptors;
}

// Whether a receptor's field covers a body coordinate.
export const covers = (receptor: { from: number; to: number }, s: number): boolean =>
  s >= receptor.from && s <= receptor.to;
