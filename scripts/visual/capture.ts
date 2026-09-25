// Capture the visual tests' views as PNGs from the built app in headless Chrome, after Universe Atlas's
// scripts/capture-views.mjs. Each frame is read back through the app's window.__snap, which renders into a
// texture of its own: on the software GPUs of CI every canvas-side readback returns black.
//
//   npm run build && npm run visual:capture [-- outDir]      (default visual-out)
//   CHROME_PATH=...   the Chrome binary (default: the macOS app)
//   WEBGPU_CI=1       adds the flags for WebGPU on Mesa lavapipe, and runs the app with ?norender=1
//   ONLY=<name>       captures one view
//
// A capture fails if the page reports an error, the app never becomes ready, or the frame is one colour:
// a dead render pass reads back as a uniform frame, the failure this net exists to catch.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import puppeteer, { type Page } from 'puppeteer-core';
import { ROOT } from '../data/sources.ts';
import { HEIGHT, VIEWS, WIDTH } from './views.ts';

const PORT = Number(process.env.PREVIEW_PORT ?? 5219);
const ci = Boolean(process.env.WEBGPU_CI);
const outDir = join(ROOT, process.argv[2] ?? 'visual-out');
mkdirSync(outDir, { recursive: true });

const withTimeout = <T>(promise: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), ms))]);

// Serve dist/. vite runs detached, so killing its process group stops it for certain.
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'inherit'],
  detached: true,
});
await withTimeout(
  new Promise<void>((resolve, reject) => {
    server.stdout.on('data', (d: Buffer) => {
      if (String(d).includes(String(PORT))) resolve();
    });
    server.on('exit', () => reject(new Error('vite preview exited: is dist/ built and the port free?')));
  }),
  20000,
  'vite preview',
);

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: [
    '--enable-unsafe-webgpu',
    '--hide-scrollbars',
    `--window-size=${WIDTH},${HEIGHT}`,
    ...(ci
      ? [
          '--no-sandbox',
          '--use-angle=vulkan',
          '--enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE',
          '--disable-vulkan-surface',
        ]
      : []),
  ],
  defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
});

let failed = 0;
try {
  const views = process.env.ONLY ? VIEWS.filter((v) => v.name === process.env.ONLY) : VIEWS;
  for (const view of views) {
    const page: Page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e instanceof Error ? e.message : String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warn') errors.push(`console.${m.type()}: ${m.text()}`);
    });
    const query = [view.query, ci ? 'norender=1' : ''].filter(Boolean).join('&');
    try {
      await page.goto(`http://localhost:${PORT}/?${query}`, { waitUntil: 'networkidle0', timeout: 60000 });
      await withTimeout(
        page.evaluate(() => (globalThis as unknown as { __ready: Promise<void> }).__ready),
        60000,
        'the app becoming ready',
      );
      const dataUrl = await withTimeout(
        page.evaluate(() => (globalThis as unknown as { __snap: () => Promise<string> }).__snap()),
        60000,
        'the snapshot',
      );
      const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
      writeFileSync(join(outDir, `${view.name}.png`), png);
      const { data } = PNG.sync.read(png);
      const first = data.readUInt32BE(0);
      let uniform = true;
      for (let o = 4; uniform && o < data.length; o += 4) uniform = data.readUInt32BE(o) === first;
      if (uniform) throw new Error('the frame is a single colour');
      if (errors.length > 0) throw new Error(errors.join('; '));
      console.log(`✓ ${view.name}`);
    } catch (e) {
      failed++;
      console.error(`✗ ${view.name}: ${e instanceof Error ? e.message : String(e)}`);
      for (const error of errors) console.error(`    ${error}`);
    } finally {
      await page.close().catch(() => undefined);
    }
  }
} finally {
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))]);
  browser.process()?.kill('SIGKILL');
  try {
    if (server.pid) process.kill(-server.pid, 'SIGKILL');
  } catch {
    server.kill('SIGKILL');
  }
}

if (failed > 0) {
  console.error(`${failed} view(s) failed`);
  process.exit(1);
}
console.log(`captured → ${outDir}`);
process.exit(0);
