// Capture the visual tests' views as PNGs from the built app in headless Chrome, after Universe Atlas's
// scripts/capture-views.mjs. Each frame is read back through the app's window.__snap, which renders into a
// texture of its own: on the software GPUs of CI every canvas-side readback returns black.
//
//   npm run build && npm run visual:capture [-- outDir]      (default visual-out)
//   CHROME_PATH=...   the Chrome binary (default: the macOS app)
//   WEBGPU_CI=1       adds the flags for WebGPU on a GPU-less runner (Chrome's SwiftShader), and runs the app
//                     with ?norender=1
//   ONLY=<name>       captures one view
//
// A capture fails if the page reports an error, the app never becomes ready, or the frame is one colour:
// a dead render pass reads back as a uniform frame, the failure this net exists to catch. The log names the
// Chrome version and the GPU adapter that drew the frames, since both change the pixels.

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import puppeteer, { type Browser } from 'puppeteer-core';
import { ROOT } from '../data/sources.ts';
import { HEIGHT, VIEWS, WIDTH } from './views.ts';

const PORT = Number(process.env.PREVIEW_PORT ?? 5219);
const ci = process.env.WEBGPU_CI === '1';
const outDir = resolve(ROOT, process.argv[2] ?? 'visual-out');
const views = process.env.ONLY ? VIEWS.filter((v) => v.name === process.env.ONLY) : VIEWS;
if (views.length === 0) {
  console.error(`no view is named ${process.env.ONLY}; the views are ${VIEWS.map((v) => v.name).join(', ')}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const withTimeout = <T>(promise: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), ms))]);

// Serve dist/. vite runs detached, so killing its process group stops it for certain, and it is killed on
// any exit, so a failure before the captures can't leave it holding the step open.
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'inherit'],
  detached: true,
});
const stopServer = (): void => {
  try {
    if (server.pid) process.kill(-server.pid, 'SIGKILL');
  } catch {
    server.kill('SIGKILL');
  }
};
process.on('exit', stopServer);

let failed = 0;
let browser: Browser | null = null;
try {
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
  browser = await puppeteer.launch({
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
  console.log(`Chrome ${await browser.version()}`);
  let adapterLogged = false;
  for (const view of views) {
    const file = join(outDir, `${view.name}.png`);
    rmSync(file, { force: true });
    rmSync(join(outDir, `diff-${view.name}.png`), { force: true });
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e instanceof Error ? e.message : String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warn') errors.push(`console.${m.type()}: ${m.text()}`);
    });
    // The overlays are hidden from the start: the tests see only GPU pixels, and the graph isn't lifted
    // above a footer whose height would depend on the runner's fonts.
    await page.evaluateOnNewDocument(`
      new MutationObserver((_, watcher) => {
        if (!document.head) return;
        const style = document.createElement('style');
        style.textContent = '#app > :not(#gpu) { display: none !important; }';
        document.head.append(style);
        watcher.disconnect();
      }).observe(document, { childList: true, subtree: true });
    `);
    const query = [view.query, ci ? 'norender=1' : ''].filter(Boolean).join('&');
    try {
      await page.goto(`http://localhost:${PORT}/?${query}`, { waitUntil: 'networkidle0', timeout: 60000 });
      await withTimeout(
        page.evaluate(() => (globalThis as unknown as { __ready: Promise<void> }).__ready),
        60000,
        'the app becoming ready',
      );
      if (!adapterLogged) {
        const adapter = await page.evaluate(() => (globalThis as unknown as { __adapter?: string }).__adapter);
        console.log(`GPU adapter: ${adapter ?? 'unknown'}`);
        adapterLogged = true;
      }
      const dataUrl = await withTimeout(
        page.evaluate(() => (globalThis as unknown as { __snap: () => Promise<string> }).__snap()),
        60000,
        'the snapshot',
      );
      const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
      writeFileSync(file, png);
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
      await withTimeout(page.close(), 10000, 'closing the page').catch(() => undefined);
    }
  }
} catch (e) {
  failed = Math.max(failed, 1);
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
} finally {
  if (browser) {
    await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))]);
    browser.process()?.kill('SIGKILL');
  }
  stopServer();
}

if (failed > 0) {
  console.error(`${failed} view(s) failed`);
  process.exit(1);
}
console.log(`captured → ${outDir}`);
process.exit(0);
