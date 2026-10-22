import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver; Svelte dimension bindings (bind:clientWidth etc.) need one.
// Observations never fire in tests — components fall back to their zero-size defaults.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
