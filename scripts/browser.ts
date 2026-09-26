// Headless Chrome for the harnesses that need a GPU: the visual tests (scripts/visual) and GPU parity
// (scripts/gpu). Both serve the app with vite and drive it through puppeteer-core.
//
//   CHROME_PATH=...   the Chrome binary (default: the macOS app)
//   WEBGPU_CI=1       adds the flags for WebGPU on a GPU-less runner

import { spawn } from 'node:child_process';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { ROOT } from './data/sources.ts';

export const ci = process.env.WEBGPU_CI === '1';

export const withTimeout = <T>(promise: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), ms))]);

// Run vite with these arguments (`preview` serves dist/, none the dev server) on a port, resolving once it
// listens. vite runs detached, so killing its process group stops it for certain, and it is killed on any
// exit or interruption, so a failure can't leave it holding the port or a CI step open.
export async function serve(args: string[], port: number): Promise<() => void> {
  const name = ['vite', ...args].join(' ');
  const server = spawn('npx', ['vite', ...args, '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
    detached: true,
  });
  const stop = (): void => {
    try {
      if (server.pid) process.kill(-server.pid, 'SIGKILL');
    } catch {
      server.kill('SIGKILL');
    }
  };
  process.on('exit', stop);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      stop();
      process.exit(130);
    });
  }
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      server.stdout.on('data', (d: Buffer) => {
        if (String(d).includes(String(port))) resolve();
      });
      server.on('exit', () => reject(new Error(`${name} exited: is the port free?`)));
    }),
    20000,
    name,
  ).catch((e: unknown) => {
    stop();
    throw e;
  });
  return stop;
}

// On CI, WebGPU is SwiftShader, the software Vulkan that ships with Chrome, reached through ANGLE's Vulkan
// backend with Universe's flags; locally it is the machine's own GPU. Puppeteer's own time limit on a call
// into the page is lifted, so each harness's withTimeout is the one that applies.
export async function launchChrome(width: number, height: number): Promise<Browser> {
  return puppeteer.launch({
    protocolTimeout: 0,
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: [
      '--enable-unsafe-webgpu',
      '--hide-scrollbars',
      `--window-size=${width},${height}`,
      ...(ci
        ? [
            '--no-sandbox',
            '--use-angle=vulkan',
            '--enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE',
            '--disable-vulkan-surface',
          ]
        : []),
    ],
    defaultViewport: { width, height, deviceScaleFactor: 1 },
  });
}

export async function closeChrome(browser: Browser | null): Promise<void> {
  if (!browser) return;
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))]);
  browser.process()?.kill('SIGKILL');
}

// Everything the page's WebGPU adapter says about itself, since a software GPU's name alone can mislead.
export async function describeAdapter(page: Page): Promise<string> {
  const adapter = await page.evaluate(`(async () => {
    if (!navigator.gpu) return 'none: this browser has no WebGPU';
    const a = await navigator.gpu.requestAdapter();
    const i = a && a.info;
    if (!i) return 'none';
    return ['vendor', 'architecture', 'device', 'description', 'isFallbackAdapter']
      .map((k) => k + '=' + JSON.stringify(i[k]))
      .join(' ');
  })()`);
  return String(adapter);
}

// Errors the page reports, collected as they happen.
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e instanceof Error ? e.message : String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warn') errors.push(`console.${m.type()}: ${m.text()}`);
  });
  return errors;
}
