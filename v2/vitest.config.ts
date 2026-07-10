import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    globals: true,
    setupFiles: ['./src/vitest.setup.ts'],
  },
  resolve: {
    // Client builds of svelte/@testing-library — without this, vitest picks SSR exports
    // and component render() fails with lifecycle_function_unavailable.
    conditions: ['browser'],
    alias: {
      $lib: '/src/lib',
    },
  },
});
