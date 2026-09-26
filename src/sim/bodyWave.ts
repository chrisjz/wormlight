// The body wave's statistics that long-run GPU parity compares while the worm doesn't crawl (PLAN §7.2):
// the mid-body curvature's standard deviation and its frequency from crossings of its mean, sampled every
// 0.1 s after a 10 s warm-up, as the go/no-go experiments measure them (scripts/experiments/go-no-go).

export const WAVE_WARM_UP = 10; // s
export const WAVE_SAMPLE = 0.1; // s
// The rod whose curvature is sampled: the middle of 49.
export const WAVE_ROD = 24;

export interface BodyWave {
  sd: number;
  frequency: number;
}

// From κL at mid-body, sampled every WAVE_SAMPLE seconds over `duration` seconds.
export function bodyWave(samples: readonly number[], duration: number): BodyWave {
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) if ((samples[i - 1] - mean) * (samples[i] - mean) < 0) crossings++;
  return {
    sd: Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length),
    frequency: crossings / 2 / duration,
  };
}
