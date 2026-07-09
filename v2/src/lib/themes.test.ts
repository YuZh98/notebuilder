import { describe, it, expect } from 'vitest';
import { THEMES, normalizeThemeId, applyTheme } from './themes';

describe('THEMES registry', () => {
  it('contains the seven v1 themes in v1 order', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['', 'plain', 'mono', 'study', 'sketch', 'aurora', 'cyber']);
    expect(THEMES[0].name).toBe('Dark (default)');
    expect(THEMES[1].chip).toBe('B&W');
  });
});

describe('normalizeThemeId', () => {
  it('passes through valid ids', () => {
    expect(normalizeThemeId('cyber')).toBe('cyber');
    expect(normalizeThemeId('')).toBe('');
  });
  it('migrates legacy toggle values', () => {
    expect(normalizeThemeId('dark')).toBe('');
    expect(normalizeThemeId('light')).toBe('plain');
  });
  it('falls back to default on unknown or null', () => {
    expect(normalizeThemeId('neon')).toBe('');
    expect(normalizeThemeId(null)).toBe('');
  });
});

describe('applyTheme', () => {
  it('stamps and clears body[data-theme]', () => {
    applyTheme('sketch');
    expect(document.body.dataset.theme).toBe('sketch');
    applyTheme('');
    expect('theme' in document.body.dataset).toBe(false);
  });
});
