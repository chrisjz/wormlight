// A whole World on the GPU (PLAN §1): GpuWorld runs the brain and the loop outside it together, packed as
// loopLayout.ts has it, and trades state with the CPU's as a WorldState.

import { NEURAL_STEP } from '../sim/numerics.ts';
import type { Odour } from '../sim/sensing.ts';
import { covers } from '../sim/touch.ts';
import type { World, WorldState } from '../sim/world.ts';
import { GpuBrain, type GpuBrainOptions, type GpuBrainStatus } from './brain.ts';
import { awcLayout, packLoop, packOdour, type LoopLayout } from './loopLayout.ts';

// A whole World on the GPU: its brain and its loop, stepped together at the neural step.
export class GpuWorld {
  readonly brain: GpuBrain;
  readonly layout: LoopLayout;

  private constructor(brain: GpuBrain, layout: LoopLayout) {
    this.brain = brain;
    this.layout = layout;
  }

  // Build it from a CPU World, taking that world's network, thresholds, oscillators, noise, odour and state.
  // External forces on the body (Body.force) aren't carried: nothing applies them yet.
  static async create(device: GPUDevice, world: World, options: GpuBrainOptions = {}): Promise<GpuWorld> {
    const layout = packLoop(world);
    const brain = await GpuBrain.create(device, world.brain.network, world.brain.threshold, {
      ...options,
      loop: layout,
    });
    try {
      brain.setOscillators(world.brain.oscillators);
      brain.noise = world.brain.noise;
      brain.seed = world.brain.seed;
      const gpu = new GpuWorld(brain, layout);
      gpu.restore(world.snapshot());
      return gpu;
    } catch (e) {
      brain.destroy();
      throw e;
    }
  }

  // The loop's state is checked before either part is written, so a mismatch leaves the world as it was.
  restore(state: WorldState): void {
    this.brain.checkLoopState(state);
    this.brain.restore(state.brain);
    this.brain.restoreLoop(state);
  }

  // Take on another world made the same way, perhaps with another seed: its seed and noise, which AWC is ON and
  // so its gain, and its state. Its odour isn't taken; setOdour changes that.
  load(world: World): void {
    const state = world.snapshot();
    this.brain.checkLoopState(state);
    this.brain.setAwc(awcLayout(world));
    this.brain.seed = world.brain.seed;
    this.brain.noise = world.brain.noise;
    this.restore(state);
  }

  // The odour AWC-ON senses from the next step on, an OdourField or none, as a CPU World would sense it.
  setOdour(odour: Odour | null): void {
    this.brain.setOdour(packOdour(odour));
  }

  // Tap the body at coordinate s, as World.touch does. Returns how many receptors are stimulated.
  touch(s: number): number {
    const touched = this.layout.touch.filter((r) => covers(r, s));
    for (const r of touched) this.brain.touch(r.neuron);
    return touched.length;
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
