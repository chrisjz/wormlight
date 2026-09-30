// The README's picture of the app: the built app in headless Chrome on this machine's GPU, its split view with the
// worm paused three quarters of a minute into a run and a neuron selected, at twice the pixels of a 1440 × 900
// window.
//
//   npm run build && npm run docs:screenshot
//
// It writes docs/images/app.png. No gate checks it: it is drawn on whatever GPU runs it, so it is taken again by
// hand when the app's look changes.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeChrome, launchChrome, serve, withTimeout } from '../browser.ts';
import { ROOT } from '../data/sources.ts';

const PORT = Number(process.env.PREVIEW_PORT ?? 5225);
const [WIDTH, HEIGHT] = [1440, 900];
// A worm and a time fixed by the link, so the picture can be taken again.
const LINK = process.argv[2] ?? '?seed=7&t=45&paused=1&neuron=AVAL';
const OUT = join(ROOT, 'docs', 'images', 'app.png');

const stopServer = await serve(['preview'], PORT);
const browser = await launchChrome(WIDTH, HEIGHT);
let failed: unknown = null;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:${PORT}/${LINK}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await withTimeout(
    page.evaluate(() => (globalThis as unknown as { __ready: Promise<void> }).__ready),
    60000,
    'the app becoming ready',
  );
  // A moment for the fonts and the first frames.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  writeFileSync(OUT, await page.screenshot({ type: 'png' }));
  console.log(`Wrote ${OUT} from ${LINK}.`);
} catch (e) {
  failed = e;
} finally {
  await closeChrome(browser);
  stopServer();
}
if (failed) {
  console.error(failed);
  process.exit(1);
}
process.exit(0);
