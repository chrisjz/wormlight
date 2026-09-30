// Measure the app's frame rate and the speed its worm runs at, on this machine's GPU (PLAN §9, milestone 3: 60 fps
// in real time, and the full step, with rendering and readback, against 10×; milestone 6: in real windows,
// DECISIONS.md 2026-09-30). The built app is loaded in its default split layout at each speed; after a few seconds
// to settle, it counts the page's frames itself each second, and the steps the GPU ran over those seconds.
//
//   npm run build && npm run plate:bench [-- 1 10 20]      (speeds; default 1 10 20 30 50)
//   -- --window     in a visible Chrome window, whose frames the display paces; keep it uncovered
//   -- --safari     in Safari, through safaridriver (scripts/safari.ts), in a window of its own; keep it uncovered
//   -- --view=plate the plate alone (or --view=graph), not the split layout
//   CHROME_PATH=...   the Chrome binary (default: the macOS app)
//
// Headless Chrome paces its frames itself, so it says what the GPU and the page can sustain, not what a display
// shows; a window says that. A speed is held if every second read has at least 57 frames and the worm runs within
// 2% of it, by the app's own rate each second and by the steps the GPU ran over them all (DECISIONS.md,
// 2026-09-30). The frames are counted here, not read from the app, whose rates say nothing once its frames stop, as
// a covered window's do.

import { NEURAL_STEP } from '../../src/sim/numerics.ts';
import { ADAPTER, closeChrome, launchChrome, serve, withTimeout } from '../browser.ts';
import { Safari } from '../safari.ts';

const PORT = Number(process.env.PREVIEW_PORT ?? 5223);
const SAFARI_PORT = Number(process.env.SAFARI_DRIVER_PORT ?? 4444);
const [WIDTH, HEIGHT] = [1440, 900];
const SETTLE = 3000; // ms
const SAMPLES = 6;
const LEAST_FRAMES = 57;
const SPEED_TOLERANCE = 0.02;

// One browser as the benchmark drives it: load the app and wait until it is ready, then run an async function's
// body in its page.
interface Driver {
  name: string;
  open(url: string): Promise<void>;
  evaluate<T>(body: string): Promise<T>;
  close(): Promise<void>;
}

async function chrome(window: boolean): Promise<Driver> {
  const browser = await launchChrome(WIDTH, HEIGHT, window);
  try {
    const page = (await browser.pages())[0] ?? (await browser.newPage());
    return {
      name: `${await browser.version()}${window ? ', in a window' : ', headless'}, ${WIDTH} × ${HEIGHT}`,
      async open(url) {
        await page.bringToFront();
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
        await withTimeout(
          page.evaluate(() => (globalThis as unknown as { __ready: Promise<void> }).__ready),
          60000,
          'the app becoming ready',
        );
      },
      evaluate: <T>(body: string) => page.evaluate(`(async () => { ${body} })()`) as Promise<T>,
      close: () => closeChrome(browser),
    };
  } catch (e) {
    await closeChrome(browser);
    throw e;
  }
}

async function safari(): Promise<Driver> {
  const s = await Safari.launch(SAFARI_PORT);
  try {
    await s.resize(WIDTH, HEIGHT);
    return {
      name: `Safari ${s.version}, in a window of ${WIDTH} × ${HEIGHT}`,
      // The app defines __rates once it is ready.
      open: (url) => s.open(url, '__rates', 60000),
      evaluate: <T>(body: string) => s.evaluate<T>(body),
      close: () => s.close(),
    };
  } catch (e) {
    await s.close();
    throw e;
  }
}

// In the page: count its frames; read the count, the clock, the app's own rates and the canvases' sizes; and wait
// for the GPU to finish what it was given, then read the steps it has run.
const COUNT = `
  globalThis.__benchFrames = 0;
  const count = () => { globalThis.__benchFrames++; requestAnimationFrame(count); };
  requestAnimationFrame(count);
  return [...document.querySelectorAll('canvas')].map((c) => c.width + ' × ' + c.height).join(', ');`;
const READ = `return { frames: globalThis.__benchFrames, now: performance.now(), rates: globalThis.__rates() };`;
const DRAIN = `const d = await globalThis.__drain(); return d && { ...d, now: performance.now() };`;
interface Read {
  frames: number;
  now: number;
  rates: { fps: number; speed: number } | null;
}
interface Drained {
  milliseconds: number;
  steps: number;
  now: number;
}

const args = process.argv.slice(2);
const FLAGS = ['--window', '--safari'];
const unknown = args.filter((a) => a.startsWith('--') && !FLAGS.includes(a) && !/^--view=(plate|graph)$/.test(a));
if (unknown.length > 0) throw new Error(`unknown option ${unknown.join(' ')}: --window, --safari, --view=plate|graph`);
const speeds = args.filter((a) => !a.startsWith('--')).map(Number);
const view = args.find((a) => a.startsWith('--view='))?.slice('--view='.length) ?? null;
const asked = speeds.length > 0 ? speeds : [1, 10, 20, 30, 50];
if (asked.some((s) => !(s > 0 && s <= 100))) throw new Error('speeds are between 0 and 100 times real time');
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const stopServer = await serve(['preview'], PORT);
let driver: Driver | null = null;
let failed: unknown = null;
try {
  driver = args.includes('--safari') ? await safari() : await chrome(args.includes('--window'));
  console.log(`${driver.name}${view ? `, ${view} alone` : ''}`);
  const rows: string[] = [];
  for (const speed of asked) {
    await driver.open(`http://localhost:${PORT}/?seed=1&speed=${speed}${view ? `&view=${view}` : ''}`);
    const canvases = await driver.evaluate<string>(COUNT);
    if (rows.length === 0) {
      console.log(`GPU adapter: ${await driver.evaluate<string>(ADAPTER)}`);
      console.log(`Canvases: ${canvases} pixels`);
    }
    await wait(SETTLE);
    const start = await driver.evaluate<Drained | null>(DRAIN);
    if (!start) throw new Error(`no plate runs at ${speed}×`);
    const frames: number[] = [];
    const rates: (number | null)[] = [];
    let last = await driver.evaluate<Read>(READ);
    for (let k = 0; k < SAMPLES; k++) {
      await wait(1000);
      const now = await driver.evaluate<Read>(READ);
      frames.push(((now.frames - last.frames) * 1000) / (now.now - last.now));
      rates.push(now.rates?.speed ?? null);
      last = now;
    }
    // The steps the GPU ran over the seconds read, and how long the work then waiting took to finish.
    const end = await driver.evaluate<Drained | null>(DRAIN);
    if (!end) throw new Error(`the plate stopped at ${speed}×`);
    const worm = ((end.steps - start.steps) * NEURAL_STEP * 1000) / (end.now - start.now);
    const within = (s: number | null): boolean => s !== null && Math.abs(s - speed) <= SPEED_TOLERANCE * speed;
    const least = Math.min(...frames);
    const held = least >= LEAST_FRAMES && rates.every(within) && within(worm);
    const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
    rows.push(
      `| ${speed}× | ${mean.toFixed(1)} | ${(Math.floor(10 * least) / 10).toFixed(1)} | ${worm.toFixed(2)}× | ${end.milliseconds.toFixed(1)} | ${held ? 'yes' : 'no'} |`,
    );
  }
  console.log('\n| Asked | Frames a second | Least in a second | Worm time a wall second | Queued work (ms) | Held |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) console.log(row);
} catch (e) {
  failed = e;
} finally {
  // A browser that won't close mustn't hide the run's result or leave the server up.
  await driver?.close().catch((e: unknown) => console.error(e));
  stopServer();
}
if (failed) {
  console.error(failed);
  process.exit(1);
}
process.exit(0);
