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

// The two stages for every neuron, stepped in the worm's time from activations read now and then, as the app reads
// them once a frame. Between two readings the input is held at their mean, and both stages are advanced exactly
// for that input, so the only error is the sampling's: activity between readings is known only through them. At
// 10× and 60 frames a second a reading spans about one GCaMP rise, so a change that lasts less than a frame can be
// missed or blurred (PLAN §1). The stages have unit gain, so an activation held steady shows as itself. Until it is
// first given activations, the glow is ½, every neuron's rest but the D-types', which track S's model rests at about
// 0.72 (DECISIONS.md, 2026-10-02).
export class Glow {
  // The filtered activation, the glow's value, per neuron; in f64, as in f32 a stage stalls short of its input once
  // each step's change falls below the value's rounding.
  readonly value: Float64Array;
  private readonly first: Float64Array;
  private readonly last: Float64Array;
  private started = false;

  constructor(n: number) {
    this.value = new Float64Array(n).fill(0.5);
    this.first = new Float64Array(n).fill(0.5);
    this.last = new Float64Array(n).fill(0.5);
  }

  // Start both stages at these activations, as a neuron long at them would be.
  reset(activation: ArrayLike<number>): void {
    this.value.set(activation);
    this.first.set(activation);
    this.last.set(activation);
    this.started = true;
  }

  // Advance by dt seconds of the worm's time to these activations, read at its end; the first call starts there.
  update(activation: ArrayLike<number>, dt: number): void {
    if (!this.started) return this.reset(activation);
    if (!(dt > 0)) return;
    const { rise, decay } = GCAMP6S;
    const er = Math.exp(-dt / rise);
    const ed = Math.exp(-dt / decay);
    const cross = (rise / (rise - decay)) * (er - ed);
    for (let i = 0; i < this.value.length; i++) {
      // The input over the step, and each stage's exact response to it: the second stage from its own start and
      // from the first stage's, then the first.
      const u = 0.5 * (this.last[i] + activation[i]);
      this.value[i] = u + (this.value[i] - u) * ed + (this.first[i] - u) * cross;
      this.first[i] = u + (this.first[i] - u) * er;
      this.last[i] = activation[i];
    }
  }
}
