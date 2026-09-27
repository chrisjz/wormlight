// The pinned inputs the behavioural harness and the calibration read: numeric CSVs, fetched or read from the
// cache and checked against their digests.

import { POSTURE_ANGLES } from '../../src/validation/posture.ts';
import { parseMatrix } from '../data/eigenworms.ts';
import { loadSources, pinById, readFile } from '../data/sources.ts';

export async function readPinned(id: string): Promise<number[][]> {
  const files = pinById(loadSources(), id).files;
  if (!files || files.length !== 1) throw new Error(`pin ${id} should hold one file`);
  return parseMatrix((await readFile(files[0])).toString('utf8'), `pin ${id}`);
}

// The real postures trials start from (PLAN §7.4).
export async function readPostures(): Promise<number[][]> {
  const postures = await readPinned('oist-postures');
  if (postures.some((p) => p.length !== POSTURE_ANGLES)) throw new Error(`postures need ${POSTURE_ANGLES} angles`);
  return postures;
}
