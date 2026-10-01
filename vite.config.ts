import { execSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The release the code was last numbered as, and the commit it is built from (src/build.ts; PLAN §8, "Releases"):
// CI's, or this checkout's when the project is its own repository, with whether the build has changes git hasn't
// committed outside the documents; none outside a git checkout of it.
const ROOT = realpathSync(fileURLToPath(new URL('.', import.meta.url)));
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const git = (args: string[]): string | null => {
  try {
    return execSync(['git', ...args].join(' '), { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
};
const top = process.env.GITHUB_SHA ? null : git(['rev-parse', '--show-toplevel']);
const own = top !== null && realpathSync(top) === ROOT;
const commit = process.env.GITHUB_SHA ?? (own ? git(['rev-parse', 'HEAD']) : null);
const dirty = own && (git(['status', '--porcelain', '--', '.', "':!*.md'"]) ?? '') !== '';

// GitHub Pages serves a project site from /wormlight/; the deploy job sets
// BASE_PATH for that, and a custom domain would set it back to /.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  define: {
    __WORMLIGHT_RELEASE__: JSON.stringify(version),
    __WORMLIGHT_COMMIT__: JSON.stringify(commit),
    __WORMLIGHT_DIRTY__: JSON.stringify(dirty),
  },
  // The harnesses serve pages that run for minutes; an edit mid-run mustn't reload them (scripts/browser.ts).
  server: { hmr: process.env.WORMLIGHT_HMR !== 'off' },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
