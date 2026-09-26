// Measure the app's frame rate and the speed its worm runs at, in headless Chrome on this machine's GPU (PLAN
// §9, milestone 3: 60 fps in real time, and the full step, with rendering and readback, against 10×). The
// built app is loaded in its default split layout at each speed; after a few seconds to settle, it reads the
// plate's rates once a second.
//
//   npm run build && npm run plate:bench [-- 1 10 20]      (speeds; default 1 10 20 30 50)
//   CHROME_PATH=...   the Chrome binary (default: the macOS app)
//
// Headless Chrome paces its frames itself, so this says what the GPU and the page can sustain, not what a
// display shows; the manual check in Chrome and Safari is /?stats=1 in a window.

import { closeChrome, describeAdapter, launchChrome, serve, withTimeout } from '../browser.ts';

const PORT = Number(process.env.PREVIEW_PORT ?? 5223);
const SETTLE = 3000; // ms
const SAMPLES = 6;
const speeds = process.argv.slice(2).map(Number);
const asked = speeds.length > 0 ? speeds : [1, 10, 20, 30, 50];
if (asked.some((s) => !(s > 0 && s <= 100))) throw new Error('speeds are between 0 and 100 times real time');

const stopServer = await serve(['preview'], PORT);
const browser = await launchChrome(1440, 900);
try {
  console.log(`Chrome ${await browser.version()}, 1440 × 900`);
  const rows: string[] = [];
  for (const speed of asked) {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/?seed=1&speed=${speed}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await withTimeout(
      page.evaluate(() => (globalThis as unknown as { __ready: Promise<void> }).__ready),
      60000,
      'the app becoming ready',
    );
    if (rows.length === 0) console.log(`GPU adapter: ${await describeAdapter(page)}`);
    await new Promise((resolve) => setTimeout(resolve, SETTLE));
    const samples: { fps: number; speed: number }[] = [];
    for (let k = 0; k < SAMPLES; k++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const r = await page.evaluate(() =>
        (globalThis as unknown as { __rates: () => { fps: number; speed: number } | null }).__rates(),
      );
      if (r) samples.push(r);
    }
    // Whether the GPU kept up: how long the work already submitted takes to finish.
    const drained = await page.evaluate(() =>
      (globalThis as unknown as { __drain: () => Promise<{ milliseconds: number; steps: number } | null> }).__drain(),
    );
    await page.close();
    if (samples.length === 0) throw new Error(`the plate reported no rates at ${speed}×`);
    const mean = (f: (s: { fps: number; speed: number }) => number): number =>
      samples.reduce((a, s) => a + f(s), 0) / samples.length;
    const least = Math.min(...samples.map((s) => s.fps));
    rows.push(
      `| ${speed}× | ${mean((s) => s.fps).toFixed(1)} | ${least.toFixed(1)} | ${mean((s) => s.speed).toFixed(2)}× | ${drained?.milliseconds.toFixed(1) ?? '–'} |`,
    );
  }
  console.log('\n| Asked | Frames a second | Least in a second | Worm time a wall second | Queued work (ms) |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const row of rows) console.log(row);
} finally {
  await closeChrome(browser);
  stopServer();
}
