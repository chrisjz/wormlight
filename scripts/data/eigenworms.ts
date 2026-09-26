// The pinned eigenworm basis: a CSV whose columns are posture modes over tangent angles, head first. The
// build checks the file is the basis checkpoint 1 expects before anything relies on it.

export interface EigenwormCheck {
  angles: number;
  modes: number;
  // The largest departure of the columns from an orthonormal set.
  orthonormalError: number;
  // The one column that is the constant rotation mode, which the posture analysis removes.
  rotationMode: number;
}

// A plain decimal, optionally signed and in exponent form; blanks, hex and padding are refused.
const DECIMAL = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

export function parseMatrix(csv: string, what = 'eigenworm basis'): number[][] {
  return csv
    .trim()
    .split(/\r?\n/)
    .map((line, i) =>
      line.split(',').map((cell) => {
        if (!DECIMAL.test(cell)) throw new Error(`${what} row ${i + 1}: "${cell}" is not a number`);
        return Number(cell);
      }),
    );
}

// Check a square basis of `angles` modes: orthonormal columns, the constant rotation mode last, and the
// first `used` modes free of rotation (each sums to zero), as the posture analysis assumes. It cannot tell
// a tail-first file or reordered modes from the real one; the pin's digest does that.
export function checkEigenworms(rows: number[][], angles: number, used = 4): EigenwormCheck {
  if (rows.length !== angles || rows.some((row) => row.length !== angles)) {
    throw new Error(`eigenworm basis: expected ${angles} × ${angles}`);
  }
  const column = (j: number): number[] => rows.map((row) => row[j]);
  let orthonormalError = 0;
  for (let a = 0; a < angles; a++) {
    for (let b = a; b < angles; b++) {
      const dot = rows.reduce((sum, row) => sum + row[a] * row[b], 0);
      orthonormalError = Math.max(orthonormalError, Math.abs(dot - (a === b ? 1 : 0)));
    }
  }
  if (orthonormalError > 1e-4) throw new Error(`eigenworm basis: columns are not orthonormal (${orthonormalError})`);
  const constant = [...Array(angles).keys()].filter((j) => {
    const c = column(j);
    return c.every((v) => Math.abs(v - c[0]) < 1e-4);
  });
  if (constant.length !== 1) throw new Error(`eigenworm basis: expected one rotation mode, found ${constant.length}`);
  if (constant[0] !== angles - 1) {
    throw new Error(`eigenworm basis: the rotation mode is column ${constant[0] + 1}, expected the last`);
  }
  for (let j = 0; j < used; j++) {
    const sum = column(j).reduce((a, b) => a + b, 0);
    if (Math.abs(sum) > 1e-3) throw new Error(`eigenworm basis: mode ${j + 1} is not free of rotation (sum ${sum})`);
  }
  return { angles, modes: angles, orthonormalError, rotationMode: constant[0] + 1 };
}

export interface PostureCheck {
  count: number;
  angles: number;
  // The largest mean angle of any posture, which should be 0 but for rounding.
  largestMean: number;
}

// Check the real postures the harness starts trials from: rows of `angles` tangent angles, each with its mean
// removed, as the posture analysis produces them.
export function checkPostures(rows: number[][], angles: number): PostureCheck {
  if (rows.length === 0 || rows.some((row) => row.length !== angles)) {
    throw new Error(`postures: expected rows of ${angles} angles`);
  }
  const largestMean = Math.max(...rows.map((row) => Math.abs(row.reduce((a, b) => a + b, 0) / angles)));
  if (largestMean > 1e-4) throw new Error(`postures: a posture's mean angle is ${largestMean}, not 0`);
  return { count: rows.length, angles, largestMean };
}
