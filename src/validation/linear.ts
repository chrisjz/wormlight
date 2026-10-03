// Linear algebra for track D0's analyses (DECISIONS.md, 2026-10-03), where the Jacobian of the brain at a fixed point
// is neither symmetric nor small: a general matrix's eigenvalues, by balancing, reduction to upper Hessenberg form by
// stabilised elementary similarity transforms, and Francis's double-shift QR iteration (the classic EISPACK
// algorithms, as Press et al.'s Numerical Recipes give them); an eigenvector of a known eigenvalue, by inverse
// iteration in complex arithmetic; and a linear system's response to a constant input over a time, by the trapezoid
// rule. Matrices are dense and row-major: entry (i, j) of an n × n matrix at i·n + j.

// Every eigenvalue of a real n × n matrix, its real and imaginary parts; a complex pair comes as two entries.
export function eigenvalues(matrix: ArrayLike<number>, n: number): { re: Float64Array; im: Float64Array } {
  // Work 1-based in an (n + 1) × (n + 1) array, as the algorithms are written.
  const N = n + 1;
  const a = new Float64Array(N * N);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) a[(i + 1) * N + j + 1] = matrix[i * n + j];
  const at = (i: number, j: number): number => i * N + j;
  balance(a, n, at);
  hessenberg(a, n, at);
  // Below the subdiagonal the reduction leaves its multipliers; the iteration reads them as zero.
  for (let i = 3; i <= n; i++) for (let j = 1; j <= i - 2; j++) a[at(i, j)] = 0;
  return hqr(a, n, at);
}

// Scale rows and columns by powers of 2 so that each row and column have about the same norm (Parlett & Reinsch),
// which leaves the eigenvalues and improves their accuracy.
function balance(a: Float64Array, n: number, at: (i: number, j: number) => number): void {
  const radix = 2;
  const square = radix * radix;
  let last = false;
  while (!last) {
    last = true;
    for (let i = 1; i <= n; i++) {
      let r = 0;
      let c = 0;
      for (let j = 1; j <= n; j++) {
        if (j === i) continue;
        c += Math.abs(a[at(j, i)]);
        r += Math.abs(a[at(i, j)]);
      }
      if (c === 0 || r === 0) continue;
      let g = r / radix;
      let f = 1;
      const s = c + r;
      while (c < g) {
        f *= radix;
        c *= square;
      }
      g = r * radix;
      while (c > g) {
        f /= radix;
        c /= square;
      }
      if ((c + r) / f < 0.95 * s) {
        last = false;
        g = 1 / f;
        for (let j = 1; j <= n; j++) a[at(i, j)] *= g;
        for (let j = 1; j <= n; j++) a[at(j, i)] *= f;
      }
    }
  }
}

// Reduce to upper Hessenberg form by Gaussian elimination with pivoting, a similarity transform.
function hessenberg(a: Float64Array, n: number, at: (i: number, j: number) => number): void {
  for (let m = 2; m < n; m++) {
    let x = 0;
    let i = m;
    for (let j = m; j <= n; j++) {
      if (Math.abs(a[at(j, m - 1)]) > Math.abs(x)) {
        x = a[at(j, m - 1)];
        i = j;
      }
    }
    if (i !== m) {
      for (let j = m - 1; j <= n; j++) [a[at(i, j)], a[at(m, j)]] = [a[at(m, j)], a[at(i, j)]];
      for (let j = 1; j <= n; j++) [a[at(j, i)], a[at(j, m)]] = [a[at(j, m)], a[at(j, i)]];
    }
    if (x === 0) continue;
    for (i = m + 1; i <= n; i++) {
      let y = a[at(i, m - 1)];
      if (y === 0) continue;
      y /= x;
      a[at(i, m - 1)] = y;
      for (let j = m; j <= n; j++) a[at(i, j)] -= y * a[at(m, j)];
      for (let j = 1; j <= n; j++) a[at(j, m)] += y * a[at(j, i)];
    }
  }
}

const sign = (a: number, b: number): number => (b >= 0 ? Math.abs(a) : -Math.abs(a));

// The eigenvalues of an upper Hessenberg matrix by Francis's double-shift QR iteration, with exceptional shifts at the
// 10th and 20th iterations; it throws if an eigenvalue hasn't converged in 60.
function hqr(a: Float64Array, n: number, at: (i: number, j: number) => number): { re: Float64Array; im: Float64Array } {
  const wr = new Float64Array(n + 1);
  const wi = new Float64Array(n + 1);
  let anorm = 0;
  for (let i = 1; i <= n; i++) for (let j = Math.max(i - 1, 1); j <= n; j++) anorm += Math.abs(a[at(i, j)]);
  let nn = n;
  let t = 0;
  let p = 0;
  let q = 0;
  let r = 0;
  let s!: number;
  let w!: number;
  let x!: number;
  let y!: number;
  let z!: number;
  while (nn >= 1) {
    let its = 0;
    let l: number;
    do {
      for (l = nn; l >= 2; l--) {
        s = Math.abs(a[at(l - 1, l - 1)]) + Math.abs(a[at(l, l)]);
        if (s === 0) s = anorm;
        if (Math.abs(a[at(l, l - 1)]) + s === s) {
          a[at(l, l - 1)] = 0;
          break;
        }
      }
      x = a[at(nn, nn)];
      if (l === nn) {
        wr[nn] = x + t;
        wi[nn--] = 0;
      } else {
        y = a[at(nn - 1, nn - 1)];
        w = a[at(nn, nn - 1)] * a[at(nn - 1, nn)];
        if (l === nn - 1) {
          p = 0.5 * (y - x);
          q = p * p + w;
          z = Math.sqrt(Math.abs(q));
          x += t;
          if (q >= 0) {
            z = p + sign(z, p);
            wr[nn - 1] = wr[nn] = x + z;
            if (z) wr[nn] = x - w / z;
            wi[nn - 1] = wi[nn] = 0;
          } else {
            wr[nn - 1] = wr[nn] = x + p;
            wi[nn - 1] = -(wi[nn] = z);
          }
          nn -= 2;
        } else {
          if (its === 60) throw new Error('the QR iteration did not converge in 60 iterations');
          if (its === 10 || its === 20) {
            t += x;
            for (let i = 1; i <= nn; i++) a[at(i, i)] -= x;
            s = Math.abs(a[at(nn, nn - 1)]) + Math.abs(a[at(nn - 1, nn - 2)]);
            y = x = 0.75 * s;
            w = -0.4375 * s * s;
          }
          ++its;
          let m: number;
          for (m = nn - 2; m >= l; m--) {
            z = a[at(m, m)];
            r = x - z;
            s = y - z;
            p = (r * s - w) / a[at(m + 1, m)] + a[at(m, m + 1)];
            q = a[at(m + 1, m + 1)] - z - r - s;
            r = a[at(m + 2, m + 1)];
            s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s;
            q /= s;
            r /= s;
            if (m === l) break;
            const u = Math.abs(a[at(m, m - 1)]) * (Math.abs(q) + Math.abs(r));
            const v = Math.abs(p) * (Math.abs(a[at(m - 1, m - 1)]) + Math.abs(z) + Math.abs(a[at(m + 1, m + 1)]));
            if (u + v === v) break;
          }
          for (let i = m + 2; i <= nn; i++) {
            a[at(i, i - 2)] = 0;
            if (i !== m + 2) a[at(i, i - 3)] = 0;
          }
          for (let k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[at(k, k - 1)];
              q = a[at(k + 1, k - 1)];
              r = 0;
              if (k !== nn - 1) r = a[at(k + 2, k - 1)];
              x = Math.abs(p) + Math.abs(q) + Math.abs(r);
              if (x !== 0) {
                p /= x;
                q /= x;
                r /= x;
              }
            }
            s = sign(Math.sqrt(p * p + q * q + r * r), p);
            if (s === 0) continue;
            if (k === m) {
              if (l !== m) a[at(k, k - 1)] = -a[at(k, k - 1)];
            } else a[at(k, k - 1)] = -s * x;
            p += s;
            x = p / s;
            y = q / s;
            z = r / s;
            q /= p;
            r /= p;
            for (let j = k; j <= nn; j++) {
              p = a[at(k, j)] + q * a[at(k + 1, j)];
              if (k !== nn - 1) {
                p += r * a[at(k + 2, j)];
                a[at(k + 2, j)] -= p * z;
              }
              a[at(k + 1, j)] -= p * y;
              a[at(k, j)] -= p * x;
            }
            const mmin = nn < k + 3 ? nn : k + 3;
            for (let i = l; i <= mmin; i++) {
              p = x * a[at(i, k)] + y * a[at(i, k + 1)];
              if (k !== nn - 1) {
                p += z * a[at(i, k + 2)];
                a[at(i, k + 2)] -= p * r;
              }
              a[at(i, k + 1)] -= p * q;
              a[at(i, k)] -= p;
            }
          }
        }
      }
    } while (l < nn - 1);
  }
  return { re: wr.slice(1), im: wi.slice(1) };
}

// A dense complex LU factorisation with partial pivoting, solved in place.
function complexSolve(re: Float64Array, im: Float64Array, n: number, bre: Float64Array, bim: Float64Array): void {
  for (let k = 0; k < n; k++) {
    let p = k;
    let best = -1;
    for (let i = k; i < n; i++) {
      const m = Math.hypot(re[i * n + k], im[i * n + k]);
      if (m > best) {
        best = m;
        p = i;
      }
    }
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        [re[k * n + j], re[p * n + j]] = [re[p * n + j], re[k * n + j]];
        [im[k * n + j], im[p * n + j]] = [im[p * n + j], im[k * n + j]];
      }
      [bre[k], bre[p]] = [bre[p], bre[k]];
      [bim[k], bim[p]] = [bim[p], bim[k]];
    }
    // A pivot of 0 is moved off by a tiny amount, as inverse iteration at an exact eigenvalue wants.
    let pr = re[k * n + k];
    const pi = im[k * n + k];
    if (pr === 0 && pi === 0) pr = re[k * n + k] = 1e-300;
    const d = pr * pr + pi * pi;
    for (let i = k + 1; i < n; i++) {
      const ar = re[i * n + k];
      const ai = im[i * n + k];
      if (ar === 0 && ai === 0) continue;
      // f = a_ik / a_kk.
      const fr = (ar * pr + ai * pi) / d;
      const fi = (ai * pr - ar * pi) / d;
      for (let j = k + 1; j < n; j++) {
        const kr = re[k * n + j];
        const ki = im[k * n + j];
        re[i * n + j] -= fr * kr - fi * ki;
        im[i * n + j] -= fr * ki + fi * kr;
      }
      bre[i] -= fr * bre[k] - fi * bim[k];
      bim[i] -= fr * bim[k] + fi * bre[k];
      re[i * n + k] = 0;
      im[i * n + k] = 0;
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let sr = bre[i];
    let si = bim[i];
    for (let j = i + 1; j < n; j++) {
      sr -= re[i * n + j] * bre[j] - im[i * n + j] * bim[j];
      si -= re[i * n + j] * bim[j] + im[i * n + j] * bre[j];
    }
    const pr = re[i * n + i];
    const pi = im[i * n + i];
    const d = pr * pr + pi * pi;
    bre[i] = (sr * pr + si * pi) / d;
    bim[i] = (si * pr - sr * pi) / d;
  }
}

// The eigenvector of a known eigenvalue λ = re + i·im, by three steps of inverse iteration from a vector of ones,
// shifted a relative 10⁻¹⁰ off λ, normalised to unit length with its largest component real and positive.
export function eigenvector(
  matrix: ArrayLike<number>,
  n: number,
  lambda: { re: number; im: number },
): { re: Float64Array; im: Float64Array } {
  const shift = { re: lambda.re * (1 + 1e-10) + 1e-12, im: lambda.im * (1 + 1e-10) };
  let xr = new Float64Array(n).fill(1);
  let xi = new Float64Array(n);
  for (let step = 0; step < 3; step++) {
    const re = Float64Array.from(matrix);
    const im = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      re[i * n + i] -= shift.re;
      im[i * n + i] -= shift.im;
    }
    complexSolve(re, im, n, xr, xi);
    let norm = 0;
    for (let i = 0; i < n; i++) norm += xr[i] * xr[i] + xi[i] * xi[i];
    norm = Math.sqrt(norm);
    xr = xr.map((v) => v / norm);
    xi = xi.map((v) => v / norm);
  }
  // Rotate so that the largest component is real and positive.
  let k = 0;
  for (let i = 1; i < n; i++) if (Math.hypot(xr[i], xi[i]) > Math.hypot(xr[k], xi[k])) k = i;
  const m = Math.hypot(xr[k], xi[k]);
  const [cr, ci] = [xr[k] / m, -xi[k] / m];
  return {
    re: Float64Array.from(xr, (v, i) => v * cr - xi[i] * ci),
    im: Float64Array.from(xr, (v, i) => v * ci + xi[i] * cr),
  };
}

// A real dense LU factorisation with partial pivoting, and its solve.
function luFactor(a: Float64Array, n: number): Int32Array {
  const piv = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(a[i * n + k]) > Math.abs(a[p * n + k])) p = i;
    piv[k] = p;
    if (p !== k) for (let j = 0; j < n; j++) [a[k * n + j], a[p * n + j]] = [a[p * n + j], a[k * n + j]];
    const pivot = a[k * n + k];
    if (pivot === 0) throw new Error('a singular matrix');
    for (let i = k + 1; i < n; i++) {
      const f = (a[i * n + k] /= pivot);
      if (f === 0) continue;
      for (let j = k + 1; j < n; j++) a[i * n + j] -= f * a[k * n + j];
    }
  }
  return piv;
}
function luSolve(a: Float64Array, piv: Int32Array, n: number, b: Float64Array): void {
  for (let k = 0; k < n; k++) {
    if (piv[k] !== k) [b[k], b[piv[k]]] = [b[piv[k]], b[k]];
    for (let i = k + 1; i < n; i++) b[i] -= a[i * n + k] * b[k];
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= a[i * n + j] * b[j];
    b[i] = s / a[i * n + i];
  }
}

// x(t) for ẋ = J x + b from x(0) = 0, J⁻¹(e^{tJ} − I) b, by the trapezoid rule at step h: finite whatever J's
// stability, and A-stable, so a stiff mode can't make it diverge.
export function linearResponse(
  J: ArrayLike<number>,
  n: number,
  b: ArrayLike<number>,
  t: number,
  h: number,
): Float64Array {
  const steps = Math.round(t / h);
  const left = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) left[i] = -0.5 * h * J[i];
  for (let i = 0; i < n; i++) left[i * n + i] += 1;
  const piv = luFactor(left, n);
  let x = new Float64Array(n);
  for (let s = 0; s < steps; s++) {
    const rhs = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) sum += J[i * n + j] * x[j];
      rhs[i] = x[i] + 0.5 * h * sum + h * b[i];
    }
    luSolve(left, piv, n, rhs);
    x = rhs;
  }
  return x;
}
