import { describe, expect, it } from 'vitest';
import { checkEigenworms, parseMatrix } from './eigenworms.ts';

// A 4 × 4 Hadamard basis, scaled to unit columns: three rotation-free modes and the constant mode last.
const hadamard = [
  [0.5, 0.5, 0.5, 0.5],
  [-0.5, 0.5, -0.5, 0.5],
  [0.5, -0.5, -0.5, 0.5],
  [-0.5, -0.5, 0.5, 0.5],
];

describe('checkEigenworms', () => {
  it('accepts an orthonormal basis with one rotation mode', () => {
    expect(checkEigenworms(hadamard, 4, 3)).toEqual({ angles: 4, modes: 4, orthonormalError: 0, rotationMode: 4 });
  });

  it('checks the first four modes by default', () => {
    // The Hadamard basis's fourth column is the constant one, so the default check reaches it and fails.
    expect(() => checkEigenworms(hadamard, 4)).toThrow(/mode 4 is not free of rotation/);
  });

  it('refuses a basis with no rotation mode, and one with it anywhere but last', () => {
    // Mixing the constant column with another keeps the basis orthonormal but leaves no constant column.
    const mixed = hadamard.map((row) => [
      (row[0] + row[3]) / Math.SQRT2,
      row[1],
      row[2],
      (row[0] - row[3]) / Math.SQRT2,
    ]);
    expect(() => checkEigenworms(mixed, 4, 0)).toThrow(/expected one rotation mode, found 0/);
    const constantFirst = hadamard.map((row) => [row[3], row[0], row[1], row[2]]);
    expect(() => checkEigenworms(constantFirst, 4, 0)).toThrow(/rotation mode is column 1, expected the last/);
  });

  it('refuses a basis of the wrong size, one that is not orthonormal, and one whose used modes rotate', () => {
    expect(() => checkEigenworms(hadamard, 5, 3)).toThrow(/5 × 5/);
    const skewed = hadamard.map((row) => [row[0] * 2, ...row.slice(1)]);
    expect(() => checkEigenworms(skewed, 4, 3)).toThrow(/orthonormal/);
    expect(() => checkEigenworms(hadamard, 4, 4)).toThrow(/mode 4 is not free of rotation/);
  });
});

describe('parseMatrix', () => {
  it('reads comma-separated rows and refuses a cell that is not a number', () => {
    expect(parseMatrix('1,2\r\n3,4\n')).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(() => parseMatrix('1,x\n')).toThrow(/"x" is not a number/);
    expect(() => parseMatrix('1,,2\n')).toThrow(/"" is not a number/);
    expect(() => parseMatrix('1,0x10\n')).toThrow(/"0x10" is not a number/);
    expect(parseMatrix('-1.5e-3,+2,.5\n')).toEqual([[-0.0015, 2, 0.5]]);
  });
});
