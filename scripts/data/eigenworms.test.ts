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
  });
});
