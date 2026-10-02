// GPU parity's long runs (PLAN §7.2), the parts that need no GPU: when a run is sampled, what one side's samples of
// it give, and how the two sides' runs are compared. src/gpu/loopParity.ts runs them on the CPU reference and the
// GPU side by side; the tests run them on the CPU alone.

import { bodyWave, WAVE_ROD, WAVE_SAMPLE, WAVE_WARM_UP, type BodyWave } from '../sim/bodyWave.ts';
import { NEURAL_STEP } from '../sim/numerics.ts';
import { equivalence, spreadRatio, type Equivalence, type SpreadRatio } from '../sim/stats.ts';
import { MID_ROD, MOTION_SAMPLE, measuredRun, runKinematics, type MotionSamples } from './motion.ts';

// The equivalence margin, as a share of the CPU's mean.
export const LONG_MARGIN = 0.05;

// Samples a run of `seconds` as a trial is sampled: `take` once at the start, then after each MOTION_SAMPLE of
// steps, which `advance` takes.
export async function sampleRun(
  seconds: number,
  advance: (steps: number) => void | Promise<void>,
  take: () => void,
): Promise<void> {
  const every = Math.round(MOTION_SAMPLE / NEURAL_STEP);
  take();
  for (let sample = 1; sample <= Math.round(seconds / MOTION_SAMPLE); sample++) {
    await advance(every);
    take();
  }
}

// One long run's measures on one side: whether its body stayed finite; its crawl, as checkpoint 1 measures a
// trial's, over the run's own forward bouts of 10 s or more, the speed and frequency null with none; and its body
// wave, which the long runs compared until checkpoint 1 was partial.
export interface LongMeasures {
  finite: boolean;
  bouts: number;
  speed: number | null;
  frequency: number | null;
  wave: BodyWave;
}

// From a run's samples, sampleRun's, of a body `length` long over `seconds`.
export function measureLongRun(taken: MotionSamples, length: number, seconds: number): LongMeasures {
  if (Math.abs(WAVE_SAMPLE - MOTION_SAMPLE) > 1e-12 || WAVE_ROD !== MID_ROD) {
    throw new Error('the body wave is sampled as the motion is, at the same rod');
  }
  const crawl = runKinematics(measuredRun(taken, length));
  const warm = Math.round(WAVE_WARM_UP / WAVE_SAMPLE);
  return {
    finite: taken.centroid.every(Number.isFinite) && taken.mid.every(Number.isFinite),
    bouts: crawl.bouts,
    speed: crawl.speed,
    frequency: crawl.frequency,
    // Over the samples after the warm-up, as the long runs took the body wave before.
    wave: bodyWave(taken.mid.slice(warm + 1), seconds - WAVE_WARM_UP),
  };
}

export interface LongComparison {
  // The crawl's speed and frequency over each side's runs with a bout, by Welch's two one-sided tests at ±5% of the
  // CPU's mean; null if either side has fewer than two such runs, which fails.
  speed: Equivalence | null;
  frequency: Equivalence | null;
  // The runs without a forward bout of 10 s on each side, left out and counted (PLAN §7.2), and those whose body
  // left the finite numbers, which fail.
  boutless: { cpu: number; gpu: number };
  broken: { cpu: number; gpu: number };
  // Reported, not graded: the body wave's SD and frequency compared the same way, and how the two sides' spreads of
  // the crawl's measures compare.
  wave: { sd: Equivalence; frequency: Equivalence };
  spread: { speed: SpreadRatio | null; frequency: SpreadRatio | null };
  // Solves that didn't converge, over every run, on each side.
  unconverged: { cpu: number; gpu: number };
  pass: boolean;
}

// The two sides' runs compared, at α = 0.05: the long runs pass if the speed and the frequency are each equivalent,
// every body stayed finite and every solve converged.
export function compareLongRuns(
  cpu: readonly LongMeasures[],
  gpu: readonly LongMeasures[],
  unconverged: { cpu: number; gpu: number },
): LongComparison {
  // Each side's values over its runs with a bout.
  const crawled = (side: readonly LongMeasures[], key: 'speed' | 'frequency'): number[] =>
    side.flatMap((m) => (m[key] === null ? [] : [m[key]]));
  const compared = <T>(key: 'speed' | 'frequency', test: (a: number[], b: number[]) => T): T | null => {
    const [a, b] = [crawled(cpu, key), crawled(gpu, key)];
    return a.length >= 2 && b.length >= 2 ? test(a, b) : null;
  };
  const speed = compared('speed', (a, b) => equivalence(a, b, LONG_MARGIN));
  const frequency = compared('frequency', (a, b) => equivalence(a, b, LONG_MARGIN));
  const waves = (side: readonly LongMeasures[], key: keyof BodyWave): number[] => side.map((m) => m.wave[key]);
  const count = (side: readonly LongMeasures[], is: (m: LongMeasures) => boolean): number => side.filter(is).length;
  const broken = { cpu: count(cpu, (m) => !m.finite), gpu: count(gpu, (m) => !m.finite) };
  return {
    speed,
    frequency,
    boutless: { cpu: count(cpu, (m) => m.bouts === 0), gpu: count(gpu, (m) => m.bouts === 0) },
    broken,
    wave: {
      sd: equivalence(waves(cpu, 'sd'), waves(gpu, 'sd'), LONG_MARGIN),
      frequency: equivalence(waves(cpu, 'frequency'), waves(gpu, 'frequency'), LONG_MARGIN),
    },
    spread: { speed: compared('speed', spreadRatio), frequency: compared('frequency', spreadRatio) },
    unconverged,
    pass:
      speed !== null &&
      speed.equivalent &&
      frequency !== null &&
      frequency.equivalent &&
      broken.cpu === 0 &&
      broken.gpu === 0 &&
      unconverged.cpu === 0 &&
      unconverged.gpu === 0,
  };
}
