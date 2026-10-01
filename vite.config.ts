import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// The release the code was last numbered as, and the commit it is built from: CI's, or the checkout's, or none
// outside a git checkout (src/build.ts; PLAN §8, "Releases").
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const commit = ((): string | null => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
})();

// GitHub Pages serves a project site from /wormlight/; the deploy job sets
// BASE_PATH for that, and a custom domain would set it back to /.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  define: {
    __WORMLIGHT_RELEASE__: JSON.stringify(version),
    __WORMLIGHT_COMMIT__: JSON.stringify(commit),
  },
  // The harnesses serve pages that run for minutes; an edit mid-run mustn't reload them (scripts/browser.ts).
  server: { hmr: process.env.WORMLIGHT_HMR !== 'off' },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
