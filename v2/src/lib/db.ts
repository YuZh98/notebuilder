import Database from '@tauri-apps/plugin-sql';
import type { Notebook, Annotation } from './types';
import type { CardType } from './card-types';
import { notebookToRows, rowsToNotebook } from './db-map';
import type { NotebookRow, SectionRow, CardRow } from './db-map';
import { stripPresentation } from './presentation';

/** True only inside the Tauri webview; false in a plain browser, tests, or SSR — so callers can skip DB I/O. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// Single lazily-opened handle to the migration-managed SQLite file (see src-tauri/src/lib.rs).
let _db: Database | null = null;
async function db(): Promise<Database> {
  if (!_db) _db = await Database.load('sqlite:notebuilder.db');
  return _db;
}

// All SQL below is parameterized ($N placeholders); no user value is ever string-interpolated.

export async function saveNotebook(nb: Notebook): Promise<void> {
  const { notebook, sections, cards } = notebookToRows(nb);
  const d = await db();
  await d.execute(
    'INSERT OR REPLACE INTO notebooks (id, name, created_at, updated_at, data) VALUES ($1, $2, $3, $4, $5)',
    [notebook.id, notebook.name, notebook.created_at, notebook.updated_at, notebook.data],
  );
  // Sections cascade-delete their cards; we rewrite the whole tree for this notebook.
  await d.execute('DELETE FROM sections WHERE notebook_id = $1', [notebook.id]);
  for (const s of sections) {
    await d.execute('INSERT INTO sections (id, notebook_id, name, position, data) VALUES ($1, $2, $3, $4, $5)', [
      s.id,
      s.notebook_id,
      s.name,
      s.position,
      s.data,
    ]);
  }
  for (const c of cards) {
    await d.execute('INSERT INTO cards (id, section_id, type_id, position, data) VALUES ($1, $2, $3, $4, $5)', [
      c.id,
      c.section_id,
      c.type_id,
      c.position,
      c.data,
    ]);
  }
}

export async function loadNotebook(id: string): Promise<Notebook | null> {
  const d = await db();
  const nbs = await d.select<NotebookRow[]>('SELECT * FROM notebooks WHERE id = $1', [id]);
  if (!nbs.length) return null;
  const sections = await d.select<SectionRow[]>(
    'SELECT * FROM sections WHERE notebook_id = $1 ORDER BY position',
    [id],
  );
  const secIds = sections.map((s) => s.id);
  const cards = secIds.length
    ? await d.select<CardRow[]>(
        `SELECT * FROM cards WHERE section_id IN (${secIds.map((_, i) => `$${i + 1}`).join(', ')}) ORDER BY position`,
        secIds,
      )
    : [];
  return rowsToNotebook(nbs[0], sections, cards);
}

export async function deleteNotebook(id: string): Promise<void> {
  const d = await db();
  // reader_state has no FK; clear this notebook's rows before the cascade removes its cards.
  await d.execute(
    `DELETE FROM reader_state WHERE card_id IN (
       SELECT c.id FROM cards c JOIN sections s ON c.section_id = s.id WHERE s.notebook_id = $1
     )`,
    [id],
  );
  await d.execute('DELETE FROM notebooks WHERE id = $1', [id]);
}

export async function listNotebooks(): Promise<NotebookRow[]> {
  const d = await db();
  return d.select<NotebookRow[]>('SELECT * FROM notebooks ORDER BY updated_at DESC');
}

// Reader state: cardId -> slotId -> arbitrary JSON. Local-only, never exported.
export type ReaderStateMap = Record<string, Record<string, Record<string, unknown>>>;

export async function saveReaderState(map: ReaderStateMap): Promise<void> {
  const d = await db();
  // Volatile flip state never persists (v1 stripVol); progress state (seenBack) survives.
  const stripped = stripPresentation(map);
  for (const cardId of Object.keys(stripped)) {
    for (const slotId of Object.keys(stripped[cardId])) {
      await d.execute(
        'INSERT OR REPLACE INTO reader_state (card_id, slot_id, data) VALUES ($1, $2, $3)',
        [cardId, slotId, JSON.stringify(stripped[cardId][slotId])],
      );
    }
  }
}

export async function loadReaderState(): Promise<ReaderStateMap> {
  const d = await db();
  const rows = await d.select<{ card_id: string; slot_id: string; data: string }[]>(
    'SELECT card_id, slot_id, data FROM reader_state',
  );
  const map: ReaderStateMap = {};
  for (const r of rows) {
    (map[r.card_id] ??= {})[r.slot_id] = JSON.parse(r.data);
  }
  return map;
}

// App preferences: simple key/value (theme, etc.).
export async function getPreference(key: string): Promise<string | null> {
  const d = await db();
  const rows = await d.select<{ value: string }[]>('SELECT value FROM preferences WHERE key = $1', [key]);
  return rows.length ? rows[0].value : null;
}

export async function setPreference(key: string, value: string): Promise<void> {
  const d = await db();
  await d.execute('INSERT OR REPLACE INTO preferences (key, value) VALUES ($1, $2)', [key, value]);
}

// Card types: the Factory/gallery layer. Stored app-wide, not per notebook.
export async function saveCardType(ct: CardType): Promise<void> {
  const d = await db();
  const { id, name, ...data } = ct;
  await d.execute('INSERT OR REPLACE INTO card_types (id, name, data) VALUES ($1, $2, $3)', [
    id,
    name,
    JSON.stringify(data),
  ]);
}

export async function listCardTypes(): Promise<CardType[]> {
  const d = await db();
  const rows = await d.select<{ id: string; name: string; data: string }[]>(
    'SELECT id, name, data FROM card_types ORDER BY created_at',
  );
  return rows.map((r) => ({ id: r.id, name: r.name, ...JSON.parse(r.data) }));
}

export async function deleteCardType(id: string): Promise<void> {
  const d = await db();
  await d.execute('DELETE FROM card_types WHERE id = $1', [id]);
}

// Reader annotations: local-only, never exported.
export async function saveAnnotation(a: Annotation): Promise<void> {
  const d = await db();
  await d.execute(
    'INSERT OR REPLACE INTO annotations (id, card_id, kind, body, created_at) VALUES ($1, $2, $3, $4, $5)',
    [a.id, a.cardId, a.kind, a.body, a.createdAt],
  );
}

export async function deleteAnnotation(id: string): Promise<void> {
  const d = await db();
  await d.execute('DELETE FROM annotations WHERE id = $1', [id]);
}

export async function loadAnnotations(): Promise<Annotation[]> {
  const d = await db();
  const rows = await d.select<
    { id: string; card_id: string; kind: string; body: string; created_at: string }[]
  >('SELECT id, card_id, kind, body, created_at FROM annotations ORDER BY created_at');
  return rows.map((r) => ({
    id: r.id,
    cardId: r.card_id,
    kind: r.kind as Annotation['kind'],
    body: r.body,
    createdAt: r.created_at,
  }));
}
