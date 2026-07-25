export type ThemeId = '' | 'plain' | 'mono' | 'study' | 'sketch' | 'aurora' | 'cyber' | 'terminal';

export const THEMES: ReadonlyArray<{ id: ThemeId; chip: string; name: string }> = [
  { id: '', chip: 'Dark', name: 'Dark (default)' },
  { id: 'plain', chip: 'B&W', name: 'Black & White (plain)' },
  { id: 'mono', chip: 'Graphite', name: 'Graphite (minimal)' },
  { id: 'study', chip: 'Tomoé', name: 'Tomoé (stationery)' },
  { id: 'sketch', chip: 'Sketch', name: 'Sketch (paper)' },
  { id: 'aurora', chip: 'Aurora', name: 'Aurora (fantasy)' },
  { id: 'cyber', chip: 'Cyber', name: 'Cyberpunk (Arc-Flash)' },
  { id: 'terminal', chip: 'Terminal', name: 'Terminal (phosphor)' },
];

const LEGACY: Record<string, ThemeId> = { dark: '', light: 'plain' };

export function normalizeThemeId(raw: string | null): ThemeId {
  if (raw === null) return '';
  if (Object.hasOwn(LEGACY, raw)) return LEGACY[raw];
  return THEMES.some((t) => t.id === raw) ? (raw as ThemeId) : '';
}

export function applyTheme(id: ThemeId): void {
  if (id) document.body.dataset.theme = id;
  else delete document.body.dataset.theme;
}
