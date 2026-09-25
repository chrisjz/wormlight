// Compare captured views (capture.ts) with the baselines in tests/visual/baseline/, after Universe Atlas's
// scripts/compare-views.mjs. A view fails when more than 0.1% of its pixels (400 of 400,000) differ beyond
// pixelmatch's perceptual threshold. The frames are sparse, so a looser limit misses real regressions: at
// 0.5%, losing every link or swapping the signs in the VB6 view passed. CI reproduces its own baselines
// exactly, and a local GPU comes within 0.03% of them.
//
//   npm run visual:compare [-- candidateDir]      (default visual-out)
//   ONLY=<name>                 compares one view
//   VISUAL_NEW_BASELINES=1      lets a view without a baseline pass, for the run that adds it
//
// Baselines come from CI, since SwiftShader's pixels differ from a local GPU's. Take them only from the
// `visual` artifact of a run on a branch of this repository, at the commit being baselined, never from a
// fork's run, and copy only the <view>.png files into tests/visual/baseline/, never diff-*.png.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { ROOT } from '../data/sources.ts';
import { VIEWS } from './views.ts';

const candidates = resolve(ROOT, process.argv[2] ?? 'visual-out');
const baselines = join(ROOT, 'tests/visual/baseline');
const RATIO_MAX = 0.001;
const THRESHOLD = 0.12;
const allowNew = process.env.VISUAL_NEW_BASELINES === '1';

const views = process.env.ONLY ? VIEWS.filter((v) => v.name === process.env.ONLY) : VIEWS;
if (views.length === 0) {
  console.error(`no view is named ${process.env.ONLY}`);
  process.exit(1);
}
let failed = 0;
let missing = 0;
for (const { name } of views) {
  const file = `${name}.png`;
  const capture = join(candidates, file);
  const base = join(baselines, file);
  if (!existsSync(capture)) {
    failed++;
    console.error(`✗ ${file}: not captured`);
    continue;
  }
  if (!existsSync(base)) {
    if (allowNew) {
      missing++;
      console.warn(`~ ${file}: no baseline yet; commit this capture to tests/visual/baseline/`);
    } else {
      failed++;
      console.error(`✗ ${file}: no baseline (set VISUAL_NEW_BASELINES=1 for the run that adds it)`);
    }
    continue;
  }
  const a = PNG.sync.read(readFileSync(base));
  const b = PNG.sync.read(readFileSync(capture));
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
    console.error(`✗ ${file}: ${(ratio * 100).toFixed(3)}% of pixels differ (limit ${RATIO_MAX * 100}%)`);
  } else {
    console.log(`✓ ${file} (${(ratio * 100).toFixed(3)}% differ)`);
  }
}
if (failed > 0) {
  console.error(`${failed} view(s) failed; any diff-*.png are in ${candidates}`);
  process.exit(1);
}
console.log(`all ${views.length - missing} baselined views match${missing ? ` (${missing} awaiting baselines)` : ''}`);
