// Safari for the harnesses that need its WebGPU: safaridriver, the WebDriver server macOS ships with Safari,
// spoken to over W3C WebDriver's HTTP protocol, so no dependency. It drives the real Safari, in a window of its
// own, on this Mac's GPU. It needs Safari → Settings → Developer → "Allow remote automation" turned on once;
// without it the session is refused, with a message saying so. One automated session can run at a time.

import { spawn, type ChildProcess } from 'node:child_process';
import { withTimeout } from './browser.ts';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export class Safari {
  readonly version: string;
  private readonly base: string;
  private readonly driver: ChildProcess;
  private closed = false;

  private constructor(base: string, driver: ChildProcess, version: string) {
    this.base = base;
    this.driver = driver;
    this.version = version;
  }

  // Start safaridriver on a port and open a session, with calls into the page allowed to run for an hour.
  static async launch(port: number): Promise<Safari> {
    const driver = spawn('safaridriver', ['-p', String(port)], { stdio: ['ignore', 'ignore', 'pipe'] });
    const stop = (): void => {
      driver.kill('SIGKILL');
    };
    process.on('exit', stop);
    const root = `http://localhost:${port}`;
    try {
      await withTimeout(
        (async () => {
          for (;;) {
            if (driver.exitCode !== null) throw new Error('safaridriver exited: is the port free?');
            try {
              const status = (await (await fetch(`${root}/status`)).json()) as { value?: { ready?: boolean } };
              if (status.value?.ready) return;
            } catch {
              // Not listening yet.
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        })(),
        10000,
        'safaridriver starting',
      );
      const session = (await command(root, 'POST', '/session', {
        capabilities: { alwaysMatch: { browserName: 'safari' } },
      })) as { sessionId: string; capabilities: { browserVersion?: string } };
      const safari = new Safari(
        `${root}/session/${session.sessionId}`,
        driver,
        session.capabilities.browserVersion ?? '?',
      );
      await command(safari.base, 'POST', '/timeouts', { script: 3_700_000, pageLoad: 120_000 });
      return safari;
    } catch (e) {
      stop();
      throw e;
    }
  }

  // Load a page, then wait until it defines a global, the sign its module has run.
  async open(url: string, global: string, ms = 60000): Promise<void> {
    await command(this.base, 'POST', '/url', { url });
    await withTimeout(
      (async () => {
        while (!(await this.sync(`return typeof globalThis[${JSON.stringify(global)}] === 'function';`))) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      })(),
      ms,
      `the page defining ${global}`,
    );
    // Errors from here on are kept for errors() to read; WebDriver has no way to read Safari's console.
    await this.sync(`
      const errors = (globalThis.__driverErrors = []);
      addEventListener('error', (e) => errors.push(String(e.message)));
      addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
      for (const kind of ['error', 'warn']) {
        const original = console[kind].bind(console);
        console[kind] = (...args) => {
          errors.push('console.' + kind + ': ' + args.map(String).join(' '));
          original(...args);
        };
      }
      return true;`);
  }

  // Await an expression in the page, an async function's body, and return its value as JSON carries it.
  async evaluate<T>(body: string): Promise<T> {
    const result = (await command(this.base, 'POST', '/execute/async', {
      script: `const done = arguments[arguments.length - 1];
        (async () => { ${body} })().then(
          (value) => done({ value }),
          (e) => done({ error: String((e && e.stack) || e) }),
        );`,
      args: [],
    })) as { value?: T; error?: string };
    if (result.error !== undefined) throw new Error(result.error);
    return result.value as T;
  }

  // Call a global the page defines, an async function of no arguments.
  call<T>(global: string): Promise<T> {
    return this.evaluate<T>(`return await globalThis[${JSON.stringify(global)}]();`);
  }

  async errors(): Promise<string[]> {
    return (await this.sync('return globalThis.__driverErrors ?? [];')) as string[];
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await command(this.base, 'DELETE', '');
    } finally {
      this.driver.kill('SIGKILL');
    }
  }

  private sync(script: string): Promise<Json> {
    return command(this.base, 'POST', '/execute/sync', { script, args: [] });
  }
}

// One WebDriver command; a WebDriver error is thrown with its message.
async function command(base: string, method: string, path: string, body?: Json): Promise<Json> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json()) as { value: Json };
  const value = json.value as { error?: string; message?: string } | null;
  if (value && typeof value === 'object' && 'error' in value && value.error) {
    throw new Error(`Safari: ${value.message || value.error}`);
  }
  return json.value;
}
