// Compare captured views (capture.ts) with the baselines in tests/visual/baseline/, after Universe Atlas's
// scripts/compare-views.mjs. A view fails when more than 0.5% of its pixels differ beyond pixelmatch's
// perceptual threshold: loose enough for rasteriser noise, tight enough that a missing draw or a broken
// shader shows.
//
//   npm run visual:compare [-- candidateDir]      (default visual-out)
//
// Baselines come from CI, since lavapipe's pixels differ from a local GPU's: download the `visual` artifact
// from a run, copy its PNGs into tests/visual/baseline/ and commit them. A view with no baseline warns but
// passes, so a new view lands first and gets its baseline from its first CI run.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { ROOT } from '../data/sources.ts';
import { VIEWS } from './views.ts';

const candidates = join(ROOT, process.argv[2] ?? 'visual-out');
const baselines = join(ROOT, 'tests/visual/baseline');
const RATIO_MAX = 0.005;
const THRESHOLD = 0.12;

const captured = readdirSync(candidates).filter((f) => f.endsWith('.png') && !f.startsWith('diff-'));
if (captured.length === 0) {
  console.error(`no captures in ${candidates}: run visual:capture first`);
  process.exit(1);
}
const expected = new Set(VIEWS.map((v) => `${v.name}.png`));
let failed = 0;
let missing = 0;
for (const file of captured.sort()) {
  if (!expected.has(file)) continue;
  const base = join(baselines, file);
  if (!existsSync(base)) {
    missing++;
    console.warn(`~ ${file}: no baseline yet; commit this capture to tests/visual/baseline/`);
    continue;
  }
  const a = PNG.sync.read(readFileSync(base));
  const b = PNG.sync.read(readFileSync(join(candidates, file)));
  if (a.width !== b.width || a.height !== b.height) {
    failed++;
    console.error(`✗ ${file}: ${b.width}×${b.height} against a ${a.width}×${a.height} baseline`);
    continue;
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const differing = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: THRESHOLD });
  const ratio = differing / (a.width * a.height);
  if (ratio > RATIO_MAX) {
    failed++;
    writeFileSync(join(candidates, `diff-${file}`), PNG.sync.write(diff));
    console.error(`✗ ${file}: ${(ratio * 100).toFixed(2)}% of pixels differ (limit ${RATIO_MAX * 100}%)`);
  } else {
    console.log(`✓ ${file} (${(ratio * 100).toFixed(3)}% differ)`);
  }
}
for (const name of process.env.ONLY ? [] : expected) {
  if (!captured.includes(name)) {
    failed++;
    console.error(`✗ ${name}: not captured`);
  }
}
if (failed > 0) {
  console.error(`${failed} view(s) regressed; diff-*.png written to ${candidates}`);
  process.exit(1);
}
console.log(
  `all ${captured.length - missing} baselined views match${missing ? ` (${missing} awaiting baselines)` : ''}`,
);
