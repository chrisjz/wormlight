import { defineConfig } from 'vitest/config';

// GitHub Pages serves a project site from /wormlight/; the deploy job sets
// BASE_PATH for that, and a custom domain would set it back to /.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  // The harnesses serve pages that run for minutes; an edit mid-run mustn't reload them (scripts/browser.ts).
  server: { hmr: process.env.WORMLIGHT_HMR !== 'off' },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
