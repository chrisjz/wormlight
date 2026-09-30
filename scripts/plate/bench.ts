// Measure the app's frame rate and the speed its worm runs at, on this machine's GPU (PLAN §9, milestone 3: 60 fps
// in real time, and the full step, with rendering and readback, against 10×; milestone 6: in real windows,
// DECISIONS.md 2026-09-30). The built app is loaded in its default split layout at each speed; after a few seconds
// to settle, it reads the plate's rates once a second.
//
//   npm run build && npm run plate:bench [-- 1 10 20]      (speeds; default 1 10 20 30 50)
//   -- --window     in a visible Chrome window, whose frames the display paces
//   -- --safari     in Safari, through safaridriver (scripts/safari.ts), in a window of its own
//   -- --view=plate the plate alone (or --view=graph), not the split layout
//   CHROME_PATH=...   the Chrome binary (default: the macOS app)
//
// Headless Chrome paces its frames itself, so it says what the GPU and the page can sustain, not what a display
// shows; a window says that. A speed is held if every second read has at least 57 frames and the worm runs within
// 2% of it (DECISIONS.md, 2026-09-30).

import { ADAPTER, closeChrome, describeAdapter, launchChrome, serve, withTimeout } from '../browser.ts';
import { Safari } from '../safari.ts';

const PORT = Number(process.env.PREVIEW_PORT ?? 5223);
const SAFARI_PORT = Number(process.env.SAFARI_PORT ?? 4444);
const [WIDTH, HEIGHT] = [1440, 900];
const SETTLE = 3000; // ms
const SAMPLES = 6;
const LEAST_FRAMES = 57;
const SPEED_TOLERANCE = 0.02;

interface Rates {
  fps: number;
  speed: number;
}
interface Drained {
  milliseconds: number;
  steps: number;
}

// One browser as the benchmark drives it: load the app and wait until it is ready, then read it.
interface Driver {
  name: string;
  open(url: string): Promise<void>;
  adapter(): Promise<string>;
  rates(): Promise<Rates | null>;
  drain(): Promise<Drained | null>;
  close(): Promise<void>;
}

const RATES = 'return globalThis.__rates();';
const DRAIN = 'return await globalThis.__drain();';

async function chrome(window: boolean): Promise<Driver> {
  const browser = await launchChrome(WIDTH, HEIGHT, window);
  let page = await browser.newPage();
  return {
    name: `Chrome ${await browser.version()}${window ? ', in a window' : ', headless'}, ${WIDTH} × ${HEIGHT}`,
    async open(url) {
      await page.close();
      page = await browser.newPage();
      await page.bringToFront();
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
      await withTimeout(
        page.evaluate(() => (globalThis as unknown as { __ready: Promise<void> }).__ready),
        60000,
        'the app becoming ready',
      );
    },
    adapter: () => describeAdapter(page),
    rates: () => page.evaluate(`(() => { ${RATES} })()`) as Promise<Rates | null>,
    drain: () => page.evaluate(`(async () => { ${DRAIN} })()`) as Promise<Drained | null>,
    close: () => closeChrome(browser),
  };
}

async function safari(): Promise<Driver> {
  const s = await Safari.launch(SAFARI_PORT);
  await s.resize(WIDTH, HEIGHT);
  return {
    name: `Safari ${s.version}, in a window of ${WIDTH} × ${HEIGHT}`,
    // The app defines __rates once it is ready.
    open: (url) => s.open(url, '__rates', 60000),
    adapter: () => s.evaluate<string>(ADAPTER),
    rates: () => s.evaluate<Rates | null>(RATES),
    drain: () => s.evaluate<Drained | null>(DRAIN),
    close: () => s.close(),
  };
}

const args = process.argv.slice(2);
const speeds = args.filter((a) => !a.startsWith('--')).map(Number);
const view = args.find((a) => a.startsWith('--view='))?.slice('--view='.length) ?? null;
const asked = speeds.length > 0 ? speeds : [1, 10, 20, 30, 50];
if (asked.some((s) => !(s > 0 && s <= 100))) throw new Error('speeds are between 0 and 100 times real time');

const stopServer = await serve(['preview'], PORT);
let driver: Driver | null = null;
try {
  driver = args.includes('--safari') ? await safari() : await chrome(args.includes('--window'));
  console.log(`${driver.name}${view ? `, ${view} alone` : ''}`);
  const rows: string[] = [];
  for (const speed of asked) {
    await driver.open(`http://localhost:${PORT}/?seed=1&speed=${speed}${view ? `&view=${view}` : ''}`);
    if (rows.length === 0) console.log(`GPU adapter: ${await driver.adapter()}`);
    await new Promise((resolve) => setTimeout(resolve, SETTLE));
    const samples: Rates[] = [];
    for (let k = 0; k < SAMPLES; k++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const r = await driver.rates();
      if (r) samples.push(r);
    }
    // Whether the GPU kept up: how long the work already submitted takes to finish.
    const drained = await driver.drain();
    if (samples.length === 0) throw new Error(`the plate reported no rates at ${speed}×`);
    const mean = (f: (s: Rates) => number): number => samples.reduce((a, s) => a + f(s), 0) / samples.length;
    const least = Math.min(...samples.map((s) => s.fps));
    const held = least >= LEAST_FRAMES && samples.every((s) => Math.abs(s.speed - speed) <= SPEED_TOLERANCE * speed);
    rows.push(
      `| ${speed}× | ${mean((s) => s.fps).toFixed(1)} | ${least.toFixed(1)} | ${mean((s) => s.speed).toFixed(2)}× | ${drained?.milliseconds.toFixed(1) ?? '–'} | ${held ? 'yes' : 'no'} |`,
    );
  }
  console.log('\n| Asked | Frames a second | Least in a second | Worm time a wall second | Queued work (ms) | Held |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) console.log(row);
} finally {
  await driver?.close();
  stopServer();
}
