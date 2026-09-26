// Forward and backward motion, bouts and reversals (PLAN §7.1), and checkpoint 1's kinematics over forward
// bouts (PLAN §7.4), from a trial's samples every 0.1 s.

// Samples are 0.1 s apart; velocity is taken over the centred 1 s window; motion counts as forward or
// backward beyond ±0.01 body lengths per second; every measure starts after a trial's first 10 s.
export const MOTION_SAMPLE = 0.1; // s
const PER_SECOND = Math.round(1 / MOTION_SAMPLE);
export const VELOCITY_WINDOW = 1; // s
export const MOTION_FLOOR = 0.01; // body lengths per second
export const MEASURE_FROM = 10; // s
// A forward bout counts for the kinematics from 10 s, a reversal from 1 s.
export const BOUT_MIN = 10; // s
export const REVERSAL_MIN = 1; // s
// The rods whose curvature gives the frequency (mid-body, of 49) and the wavelength: 0.125 body lengths apart,
// at most 0.31 of a wavelength anywhere in checkpoint 1's partial band (0.4–1.0), so a wave's lag stays within
// half a period and its direction shows.
export const MID_ROD = 24;
export const FRONT_ROD = 14;
export const REAR_ROD = 20;
// The longest lag the wavelength's search reaches, half the shortest bout, so every lag pairs at least half of
// each bout's samples.
export const LAG_MAX = BOUT_MIN / 2; // s

// The centroid's velocity towards the head, in body lengths per second, at each sample from `from` whose
// window lies within the samples: its displacement over the centred window, projected on the unit vector
// from the centroid to the head at the window's middle. `centroid` and `head` are [x0, y0, x1, y1, …].
export function forwardVelocity(
  centroid: ArrayLike<number>,
  head: ArrayLike<number>,
  length: number,
  from = Math.round(MEASURE_FROM / MOTION_SAMPLE),
): Float64Array {
  const half = Math.round(VELOCITY_WINDOW / MOTION_SAMPLE / 2);
  const n = centroid.length / 2;
  const first = Math.max(from, half);
  const out = new Float64Array(Math.max(0, n - half - first));
  for (let k = first; k < n - half; k++) {
    const dx = centroid[2 * (k + half)] - centroid[2 * (k - half)];
    const dy = centroid[2 * (k + half) + 1] - centroid[2 * (k - half) + 1];
    const hx = head[2 * k] - centroid[2 * k];
    const hy = head[2 * k + 1] - centroid[2 * k + 1];
    out[k - first] = (dx * hx + dy * hy) / Math.hypot(hx, hy) / (2 * half * MOTION_SAMPLE) / length;
  }
  return out;
}

export interface Run {
  start: number;
  length: number;
}

// The maximal runs of samples moving forward (sign 1) or backward (sign −1) beyond the floor; a pause, or
// motion the other way, ends one.
export function runs(velocity: ArrayLike<number>, sign: 1 | -1): Run[] {
  const out: Run[] = [];
  let start = -1;
  for (let k = 0; k <= velocity.length; k++) {
    const moving = k < velocity.length && sign * velocity[k] > MOTION_FLOOR;
    if (moving && start < 0) start = k;
    if (!moving && start >= 0) {
      out.push({ start, length: k - start });
      start = -1;
    }
  }
  return out;
}

// A run's duration in seconds, counting each sample as 0.1 s.
export const seconds = (run: Run): number => run.length / PER_SECOND;

// Forward bouts long enough for the kinematics, and reversals.
export const bouts = (velocity: ArrayLike<number>, min = BOUT_MIN): Run[] =>
  runs(velocity, 1).filter((r) => seconds(r) >= min - 1e-9);
export const reversals = (velocity: ArrayLike<number>): Run[] =>
  runs(velocity, -1).filter((r) => seconds(r) >= REVERSAL_MIN - 1e-9);

// One trial's samples over its forward bouts: velocity, and curvature (κL) at the three rods.
export interface BoutSamples {
  velocity: ArrayLike<number>;
  mid: ArrayLike<number>;
  front: ArrayLike<number>;
  rear: ArrayLike<number>;
  bouts: readonly Run[];
}

export interface Kinematics {
  // The bouts' count and total duration (s), and the mid-body curvature's crossings of each bout's mean.
  bouts: number;
  duration: number;
  crossings: number;
  // Body lengths per second, Hz, and body lengths; null when not measured.
  speed: number | null;
  frequency: number | null;
  wavelength: number | null;
  // Why the wavelength wasn't measured, if it wasn't.
  unmeasured: string | null;
  // The lag (s) at which the rear rod's curvature best follows the front's, and that correlation.
  lag: number | null;
  correlation: number | null;
}

const slice = (a: ArrayLike<number>, r: Run): number[] => Array.from({ length: r.length }, (_, i) => a[r.start + i]);
const mean = (a: readonly number[]): number => a.reduce((x, y) => x + y, 0) / a.length;

// The kinematics pooled over every trial's bouts (PLAN §7.4). Speed is the mean forward velocity. Frequency
// is half the mid-body curvature's crossings of each bout's mean over the bouts' duration. Wavelength is the
// rods' separation over the frequency times the lag at which the rear rod's curvature correlates best with
// the front's, the correlations summed over bouts. Lags are searched both ways, within half a period and
// LAG_MAX, and the peak must fall strictly inside on the rear's side, the wave running from head to tail;
// it is refined by a parabola through its neighbours. A peak at no lag, a backward one, or one at the edge,
// where a wave's direction can't be told, is no head-to-tail wave.
export function kinematics(trials: readonly BoutSamples[], separation: number): Kinematics {
  const all = trials.flatMap((t) => t.bouts.map((r) => ({ t, r })));
  const samples = all.reduce((n, { r }) => n + r.length, 0);
  const duration = samples / PER_SECOND;
  const none = {
    bouts: all.length,
    duration,
    crossings: 0,
    speed: null,
    frequency: null,
    wavelength: null,
    unmeasured: 'no bout of 10 s',
    lag: null,
    correlation: null,
  };
  if (all.length === 0) return none;
  let forward = 0;
  let crossings = 0;
  for (const { t, r } of all) {
    forward += slice(t.velocity, r).reduce((a, b) => a + b, 0);
    const mid = slice(t.mid, r);
    const m = mean(mid);
    for (let i = 1; i < mid.length; i++) if ((mid[i - 1] - m) * (mid[i] - m) < 0) crossings++;
  }
  const speed = forward / samples;
  const frequency = crossings / 2 / duration;
  const measured = { ...none, crossings, speed, frequency };
  if (frequency === 0) return { ...measured, unmeasured: 'no mid-body bending' };
  const half = Math.min(Math.floor(PER_SECOND / (2 * frequency)), Math.round(LAG_MAX * PER_SECOND));
  const centred = all.map(({ t, r }) => {
    const front = slice(t.front, r);
    const rear = slice(t.rear, r);
    const [mf, mr] = [mean(front), mean(rear)];
    return { front: front.map((v) => v - mf), rear: rear.map((v) => v - mr) };
  });
  // The pooled correlation of the front rod's curvature with the rear's `lag` samples later.
  const correlation = (lag: number): number => {
    let sum = 0;
    let ff = 0;
    let rr = 0;
    for (const { front, rear } of centred) {
      for (let i = Math.max(0, -lag); i < front.length && i + lag < rear.length; i++) {
        sum += front[i] * rear[i + lag];
        ff += front[i] ** 2;
        rr += rear[i + lag] ** 2;
      }
    }
    return ff > 0 && rr > 0 ? sum / Math.sqrt(ff * rr) : 0;
  };
  const c = new Map<number, number>();
  for (let lag = -half; lag <= half; lag++) c.set(lag, correlation(lag));
  const at = (lag: number): number => c.get(lag) ?? 0;
  let best = -half;
  for (let lag = -half + 1; lag <= half; lag++) if (at(lag) > at(best)) best = lag;
  if (best <= 0 || best >= half) {
    return { ...measured, unmeasured: 'no head-to-tail wave', lag: best / PER_SECOND, correlation: at(best) };
  }
  const [a, b, d] = [at(best - 1), at(best), at(best + 1)];
  const curve = a - 2 * b + d;
  const shift = curve < 0 ? Math.max(-0.5, Math.min(0.5, (a - d) / (2 * curve))) : 0;
  const lag = (best + shift) / PER_SECOND;
  return { ...measured, wavelength: separation / (frequency * lag), unmeasured: null, lag, correlation: b };
}
