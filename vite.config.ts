import { defineConfig } from 'vitest/config';

// GitHub Pages serves a project site from /wormlight/; the deploy job sets
// BASE_PATH for that, and a custom domain would set it back to /.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  test: {
    include: ['src/**/*.test.ts'],
  },
});
