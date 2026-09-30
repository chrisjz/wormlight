// The glow (spec §7, PLAN §1): each neuron's activation φ(V − V_th), filtered as GCaMP6s would smooth it. It is
// drawn, never fed back, so its constants are display choices, not model parameters (DECISIONS.md, 2026-09-30).

// GCaMP6s after one action potential in mouse V1 in vivo (Chen et al. 2013, Supplementary Table 3): a rise to peak
// of 179 ms and a half-decay of 550 ms. Two first-order stages in series reproduce both with these time constants
// (s), derived here, taking the half-decay from the peak.
export const GCAMP6S = { rise: 0.0706, decay: 0.686 } as const;

// Each neuron's activation, the model's sigmoid of its voltage above its threshold (PLAN §3.1), from 0 to 1.
export function activations(
  voltage: ArrayLike<number>,
  threshold: ArrayLike<number>,
  slope: number,
  out = new Float32Array(voltage.length),
): Float32Array {
  for (let i = 0; i < voltage.length; i++) out[i] = 1 / (1 + Math.exp(-slope * (voltage[i] - threshold[i])));
  return out;
}

// The two stages for every neuron, stepped in the worm's time from activations sampled at each step: each stage
// relaxes exactly towards its input, held over the step. They have unit gain, so an activation held steady shows
// as itself. Until it is first given activations, the glow is at rest, ½.
export class Glow {
  // The filtered activation, the glow's value, per neuron; in f64, as in f32 a stage stalls short of its input once
  // each step's change falls below the value's rounding.
  readonly value: Float64Array;
  private readonly first: Float64Array;
  private started = false;

  constructor(n: number) {
    this.value = new Float64Array(n).fill(0.5);
    this.first = new Float64Array(n).fill(0.5);
  }

  // Start both stages at these activations, as a neuron long at them would be.
  reset(activation: ArrayLike<number>): void {
    this.value.set(activation);
    this.first.set(activation);
    this.started = true;
  }

  // Advance by dt seconds of the worm's time, the activation held at these values; the first call starts there.
  update(activation: ArrayLike<number>, dt: number): void {
    if (!this.started) return this.reset(activation);
    if (!(dt > 0)) return;
    const a = 1 - Math.exp(-dt / GCAMP6S.rise);
    const b = 1 - Math.exp(-dt / GCAMP6S.decay);
    for (let i = 0; i < this.value.length; i++) {
      this.first[i] += a * (activation[i] - this.first[i]);
      this.value[i] += b * (this.first[i] - this.value[i]);
    }
  }
}
