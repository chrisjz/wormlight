// Postures as Stephens et al. 2008 measured them (PLAN §7.4): tangent angles between equally spaced points
// along the midline, head first, with their mean removed; and the share of their variance the eigenworms
// capture, from the covariance of the postures pooled over trials.

export const POSTURE_ANGLES = 100;

// `points` points equally spaced by arc length along a polyline given as [x0, y0, x1, y1, …], ends included.
export function resample(line: ArrayLike<number>, points = POSTURE_ANGLES + 1): Float64Array {
  const n = line.length / 2;
  if (n < 2 || !Number.isInteger(n)) throw new Error('a midline needs at least two points');
  const along = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    along[i] = along[i - 1] + Math.hypot(line[2 * i] - line[2 * i - 2], line[2 * i + 1] - line[2 * i - 1]);
  }
  const length = along[n - 1];
  const out = new Float64Array(2 * points);
  let segment = 0;
  for (let k = 0; k < points; k++) {
    const s = (k / (points - 1)) * length;
    while (segment < n - 2 && along[segment + 1] < s) segment++;
    const span = along[segment + 1] - along[segment];
    const f = span > 0 ? Math.min(1, Math.max(0, (s - along[segment]) / span)) : 0;
    out[2 * k] = line[2 * segment] + f * (line[2 * segment + 2] - line[2 * segment]);
    out[2 * k + 1] = line[2 * segment + 1] + f * (line[2 * segment + 3] - line[2 * segment + 1]);
  }
  return out;
}

// The tangent angles between successive points, unwrapped along the body, with their mean removed.
export function tangentAngles(points: ArrayLike<number>): Float64Array {
  const n = points.length / 2 - 1;
  const angles = new Float64Array(n);
  let mean = 0;
  for (let k = 0; k < n; k++) {
    const a = Math.atan2(points[2 * k + 3] - points[2 * k + 1], points[2 * k + 2] - points[2 * k]);
    // Unwrapped: each angle within half a turn of the one before.
    angles[k] = k === 0 ? a : a - 2 * Math.PI * Math.round((a - angles[k - 1]) / (2 * Math.PI));
    mean += angles[k];
  }
  mean /= n;
  for (let k = 0; k < n; k++) angles[k] -= mean;
  return angles;
}

// Whether a polyline crosses itself: whether any two of its segments that share no point intersect.
export function selfIntersects(points: ArrayLike<number>): boolean {
  const n = points.length / 2 - 1;
  const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number =>
    (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  for (let i = 0; i < n; i++) {
    const [ax, ay, bx, by] = [points[2 * i], points[2 * i + 1], points[2 * i + 2], points[2 * i + 3]];
    for (let j = i + 2; j < n; j++) {
      const [cx, cy, dx, dy] = [points[2 * j], points[2 * j + 1], points[2 * j + 2], points[2 * j + 3]];
      const d1 = cross(ax, ay, bx, by, cx, cy);
      const d2 = cross(ax, ay, bx, by, dx, dy);
      const d3 = cross(cx, cy, dx, dy, ax, ay);
      const d4 = cross(cx, cy, dx, dy, bx, by);
      if (d1 * d2 <= 0 && d3 * d4 <= 0 && (d1 !== 0 || d2 !== 0)) return true;
    }
  }
  return false;
}

// Sums from which the covariance of postures is found, so trials run apart can be pooled exactly.
export interface PostureSums {
  count: number;
  sum: number[];
  // Row-major: products[i·n + j] sums a_i·a_j.
  products: number[];
}

export function emptySums(n = POSTURE_ANGLES): PostureSums {
  return { count: 0, sum: new Array<number>(n).fill(0), products: new Array<number>(n * n).fill(0) };
}

export function addPosture(sums: PostureSums, angles: ArrayLike<number>): void {
  const n = sums.sum.length;
  if (angles.length !== n) throw new Error(`a posture has ${n} angles, not ${angles.length}`);
  sums.count++;
  for (let i = 0; i < n; i++) {
    sums.sum[i] += angles[i];
    for (let j = 0; j < n; j++) sums.products[i * n + j] += angles[i] * angles[j];
  }
}

export function poolSums(all: readonly PostureSums[], n = POSTURE_ANGLES): PostureSums {
  const pooled = emptySums(n);
  for (const s of all) {
    pooled.count += s.count;
    for (let i = 0; i < n; i++) pooled.sum[i] += s.sum[i];
    for (let k = 0; k < n * n; k++) pooled.products[k] += s.products[k];
  }
  return pooled;
}

// The covariance about each angle's mean over the postures, as Stephens et al. took it.
export function covariance(sums: PostureSums): Float64Array {
  const n = sums.sum.length;
  const c = new Float64Array(n * n);
  if (sums.count === 0) return c;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      c[i * n + j] = sums.products[i * n + j] / sums.count - (sums.sum[i] / sums.count) * (sums.sum[j] / sums.count);
    }
  }
  return c;
}

// Σₖ eₖᵀ C eₖ / tr C over the first `used` modes, the columns of `basis` (rows are angles, head first).
export function varianceCaptured(c: Float64Array, basis: readonly (readonly number[])[], used = 4): number {
  const n = basis.length;
  if (c.length !== n * n) throw new Error(`the covariance is not ${n} × ${n}`);
  let trace = 0;
  for (let i = 0; i < n; i++) trace += c[i * n + i];
  let captured = 0;
  for (let k = 0; k < used; k++) {
    for (let i = 0; i < n; i++) {
      let row = 0;
      for (let j = 0; j < n; j++) row += c[i * n + j] * basis[j][k];
      captured += basis[i][k] * row;
    }
  }
  return captured / trace;
}
