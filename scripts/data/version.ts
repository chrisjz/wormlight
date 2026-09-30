// The data's version, which a link carries (PLAN §1, §2.3): the first eight hexadecimal digits of the SHA-256 of what
// the model reads from the runtime file, its neurons, muscles and connections, as JSON in the file's order, so that a
// change to the file's notes, citations or licences leaves it.

import { createHash } from 'node:crypto';
import type { WormlightData } from '../../src/data/schema.ts';

export function dataVersion(data: Omit<WormlightData, 'meta'>): string {
  const { neurons, muscles, chemical, gap, neuromuscular } = data;
  return createHash('sha256')
    .update(JSON.stringify({ neurons, muscles, chemical, gap, neuromuscular }))
    .digest('hex')
    .slice(0, 8);
}
