import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Second entry: a Study-only Reader bundled into a single chunk. build-reader.mjs then inlines
// the emitted JS/CSS (and KaTeX woff2 fonts) into one self-contained committed template.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  build: {
    target: 'safari16',
    outDir: 'dist-reader',
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: fileURLToPath(new URL('./reader.html', import.meta.url)),
      output: { inlineDynamicImports: true },
    },
  },
});
