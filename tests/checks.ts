// Shared pieces of the port and production checks (PLAN §7.2): reading the goldens the reference tools
// wrote, and scoring a model trajectory against them.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, sha256 } from '../scripts/data/sources.ts';

export const readRepo = (path: string): Buffer => readFileSync(join(ROOT, path));
export const readJson = <T>(path: string): T => JSON.parse(readRepo(path).toString('utf8')) as T;
export const digest = (path: string): string => sha256(readRepo(path));

// A golden trajectory: float32, little-endian, one row of `neurons` values per sample.
export function readTrajectory(path: string, neurons: number): Float32Array[] {
  const bytes = readRepo(path);
  const values = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  if (values.length % neurons !== 0) throw new Error(`${path} does not hold rows of ${neurons}`);
  return Array.from({ length: values.length / neurons }, (_, k) => values.subarray(k * neurons, (k + 1) * neurons));
}

// Each neuron's RMS error in V − V_th may be at most 1% of max(excursion range, 1 mV), the range being the
// reference's max − min over the compared samples.
export const TOLERANCE = 0.01;
const RANGE_FLOOR = 1;

export interface Score {
  neuron: string;
  // RMS error over max(range, 1 mV); NaN when the model's trajectory isn't finite.
  ratio: number;
  range: number;
}

const rank = (s: Score): number => (Number.isNaN(s.ratio) ? Infinity : s.ratio);

// Every neuron's score, worst first, a NaN before anything finite.
export function score(names: readonly string[], reference: Float32Array[], model: Float64Array[]): Score[] {
  if (reference.length !== model.length) throw new Error('the trajectories differ in length');
  return names
    .map((neuron, i) => {
      let squares = 0;
      let low = Infinity;
      let high = -Infinity;
      reference.forEach((row, k) => {
        squares += (model[k][i] - row[i]) ** 2;
        low = Math.min(low, row[i]);
        high = Math.max(high, row[i]);
      });
      const range = high - low;
      return { neuron, ratio: Math.sqrt(squares / reference.length) / Math.max(range, RANGE_FLOOR), range };
    })
    .sort((a, b) => rank(b) - rank(a));
}

// A score fails unless it is within tolerance, so a NaN fails.
export const failures = (scores: Score[]): Score[] => scores.filter((s) => !(s.ratio <= TOLERANCE));
