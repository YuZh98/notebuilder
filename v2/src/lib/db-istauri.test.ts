import { describe, it, expect } from 'vitest';
import { isTauri } from './db';

describe('isTauri', () => {
  it('is false without the webview bridge and true once it exists', () => {
    const w = window as unknown as Record<string, unknown>;
    expect(isTauri()).toBe(false);
    w.__TAURI_INTERNALS__ = {};
    try {
      expect(isTauri()).toBe(true);
    } finally {
      delete w.__TAURI_INTERNALS__;
    }
  });
});
