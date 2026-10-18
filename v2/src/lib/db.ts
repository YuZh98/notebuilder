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

// All SQL below is parameterized ($N placeholders); no user value is ever string-interpolated.
//
// Durability (D0):
// - Every read and write runs through ONE promise queue, so operations never interleave across
//   the plugin's pooled connections (sqlx keeps up to 10).
// - Multi-row saves are ONE execute() call: plugin-sql runs a multi-statement string on a single
//   connection and `$N` refers to one argument list shared by every statement, so
//   BEGIN … COMMIT inside that one string is a real transaction. (BEGIN/COMMIT across separate
//   execute() calls is NOT safe: each call may land on a different pooled connection.)
// - When a batch fails mid-way its connection is left inside the open transaction; closing the
//   pool drops that connection and SQLite rolls the transaction back. We then reopen, retry
//   once, and surface the error if it still fails.

const DB_URL = 'sqlite:notebuilder.db';

/**
 * Upsert the notebook row (ON CONFLICT DO UPDATE — never INSERT OR REPLACE, which deletes the
 * parent row first and cascades through every child table) and rewrite its whole tree from two
 * JSON arrays. Args: $1 id, $2 name, $3 created_at, $4 updated_at, $5 data,
 * $6 JSON [{id,name,position,data}], $7 JSON [{id,section_id,type_id,position,data}].
 * COALESCE mirrors the column DEFAULTs, so one stray missing value cannot fail the whole save.
 */
export const SAVE_NOTEBOOK_SQL = `BEGIN IMMEDIATE;
INSERT INTO notebooks (id, name, created_at, updated_at, data)
  VALUES ($1, $2, COALESCE($3, datetime('now')), COALESCE($4, datetime('now')), $5)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    data = excluded.data;
DELETE FROM sections WHERE notebook_id = $1;
INSERT INTO sections (id, notebook_id, name, position, data)
  SELECT json_extract(value, '$.id'), $1, json_extract(value, '$.name'),
         COALESCE(json_extract(value, '$.position'), 0), COALESCE(json_extract(value, '$.data'), '{}')
  FROM json_each($6);
INSERT INTO cards (id, section_id, type_id, position, data)
  SELECT json_extract(value, '$.id'), json_extract(value, '$.section_id'), json_extract(value, '$.type_id'),
         COALESCE(json_extract(value, '$.position'), 0), COALESCE(json_extract(value, '$.data'), '{}')
  FROM json_each($7);
COMMIT;`;

/** Full replace of the local reader layer. Arg: $1 JSON [{card_id,slot_id,data}]. */
export const SAVE_READER_STATE_SQL = `BEGIN IMMEDIATE;
DELETE FROM reader_state;
INSERT INTO reader_state (card_id, slot_id, data)
  SELECT json_extract(value, '$.card_id'), json_extract(value, '$.slot_id'), json_extract(value, '$.data')
  FROM json_each($1);
COMMIT;`;

/** reader_state/annotations have no FK: clear this notebook's rows before the cascade removes its cards. Arg: $1 id. */
export const DELETE_NOTEBOOK_SQL = `BEGIN IMMEDIATE;
DELETE FROM reader_state WHERE card_id IN (
  SELECT c.id FROM cards c JOIN sections s ON c.section_id = s.id WHERE s.notebook_id = $1
);
DELETE FROM annotations WHERE card_id IN (
  SELECT c.id FROM cards c JOIN sections s ON c.section_id = s.id WHERE s.notebook_id = $1
);
DELETE FROM notebooks WHERE id = $1;
COMMIT;`;

/** Upsert keeps created_at (the gallery order) — INSERT OR REPLACE would reset it on every save. */
export const SAVE_CARD_TYPE_SQL = `INSERT INTO card_types (id, name, data) VALUES ($1, $2, $3)
  ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data`;

// ---------------------------------------------------------------------------------------------
// Handle, queue, error hook
// ---------------------------------------------------------------------------------------------

// Single lazily-opened handle to the migration-managed SQLite file (see src-tauri/src/lib.rs).
let _db: Database | null = null;
async function db(): Promise<Database> {
  if (!_db) _db = await Database.load(DB_URL);
  return _db;
}

/** Drop the cached handle and close its pool — closing rolls back a transaction a failed batch left open. */
async function resetDb(): Promise<void> {
  const d = _db;
  _db = null;
  if (!d) return;
  try {
    await d.close(DB_URL);
  } catch {
    // The pool is unusable either way; the next db() loads a fresh one.
  }
}

export type DbErrorHandler = (message: string, err: unknown) => void;
const defaultErrorHandler: DbErrorHandler = (message, err) => console.error(message, err);
let reportError: DbErrorHandler = defaultErrorHandler;

/** Where failed writes are reported (App wires a toast). Writes never reject; they resolve `false`. */
export function onDbError(handler: DbErrorHandler | null): void {
  reportError = handler ?? defaultErrorHandler;
}

let tail: Promise<unknown> = Promise.resolve();

/** Run `task` after every previously queued db operation has settled. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task);
  tail = run.catch(() => undefined);
  return run;
}

/** Resolves once every db operation queued so far has settled — close/quit flushes await it. */
export function dbIdle(): Promise<void> {
  return tail.then(() => undefined);
}

/** Reads reject on failure (the caller decides what that means); the handle is reset first. */
function read<T>(query: (d: Database) => Promise<T>): Promise<T> {
  return serial(async () => {
    try {
      return await query(await db());
    } catch (err) {
      await resetDb();
      throw err;
    }
  });
}

type QueuedWrite = {
  key: string;
  what: string;
  job: (d: Database) => Promise<unknown>;
  promise: Promise<boolean>;
  /** Set when an earlier failing write already ran this one as its retry. */
  result?: boolean;
};

// Writes waiting their turn, by key. A newer write for the same key replaces the job (latest wins).
const queued = new Map<string, QueuedWrite>();

function write(key: string, what: string, job: (d: Database) => Promise<unknown>): Promise<boolean> {
  const pending = queued.get(key);
  if (pending) {
    pending.job = job;
    pending.what = what;
    return pending.promise;
  }
  const w: QueuedWrite = { key, what, job, promise: Promise.resolve(true) };
  queued.set(key, w);
  w.promise = serial(() => {
    if (queued.get(key) === w) queued.delete(key);
    return w.result !== undefined ? Promise.resolve(w.result) : attempt(w);
  });
  return w.promise;
}

async function attempt(w: QueuedWrite): Promise<boolean> {
  try {
    await w.job(await db());
    return true;
  } catch {
    await resetDb();
  }
  // Retry once — with the LATEST state for this key when a newer write is already queued.
  const newer = queued.get(w.key);
  if (newer) queued.delete(w.key);
  const retry = newer ?? w;
  let ok = false;
  try {
    await retry.job(await db());
    ok = true;
  } catch (err) {
    await resetDb();
    reportError(`Couldn’t save ${retry.what} — ${errorText(err)}`, err);
  }
  if (newer) newer.result = ok;
  return ok;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------------------------
// Notebooks
// ---------------------------------------------------------------------------------------------

// Ids deleted this session: a late autosave must never resurrect them.
const deletedNotebooks = new Set<string>();

/** Atomic save of one notebook tree. Resolves false (after reporting) when it could not be saved. */
export function saveNotebook(nb: Notebook): Promise<boolean> {
  if (deletedNotebooks.has(nb.id)) return Promise.resolve(true);
  // Rows are built now, so later mutation of `nb` cannot leak into the queued save.
  const { notebook, sections, cards } = notebookToRows(nb);
  const args = [
    notebook.id,
    notebook.name,
    notebook.created_at,
    notebook.updated_at,
    notebook.data,
    JSON.stringify(sections.map((s) => ({ id: s.id, name: s.name, position: s.position, data: s.data }))),
    JSON.stringify(cards),
  ];
  return write(`notebook:${nb.id}`, `notebook “${nb.name}”`, async (d) => {
    if (deletedNotebooks.has(nb.id)) return;
    await d.execute(SAVE_NOTEBOOK_SQL, args);
  });
}

export function loadNotebook(id: string): Promise<Notebook | null> {
  return read(async (d) => {
    const nbs = await d.select<NotebookRow[]>(
      'SELECT id, name, created_at, updated_at, data FROM notebooks WHERE id = $1',
      [id],
    );
    if (!nbs.length) return null;
    const sections = await d.select<SectionRow[]>(
      'SELECT id, notebook_id, name, position, data FROM sections WHERE notebook_id = $1 ORDER BY position',
      [id],
    );
    const cards = await d.select<CardRow[]>(
      `SELECT c.id, c.section_id, c.type_id, c.position, c.data
         FROM cards c JOIN sections s ON c.section_id = s.id
        WHERE s.notebook_id = $1 ORDER BY c.position`,
      [id],
    );
    return rowsToNotebook(nbs[0], sections, cards);
  });
}

/** Delete a notebook (and its local reader rows). Takes over any queued save of it and tombstones the id. */
export function deleteNotebook(id: string): Promise<boolean> {
  deletedNotebooks.add(id);
  // Same key as saveNotebook: a queued save of this notebook is replaced (cancelled) by the delete.
  return write(`notebook:${id}`, 'the notebook deletion', (d) => d.execute(DELETE_NOTEBOOK_SQL, [id]));
}

export function listNotebooks(): Promise<NotebookRow[]> {
  return read((d) =>
    d.select<NotebookRow[]>('SELECT id, name, created_at, updated_at, data FROM notebooks ORDER BY updated_at DESC'),
  );
}

// ---------------------------------------------------------------------------------------------
// Reader state: cardId -> slotId -> arbitrary JSON. Local-only, never exported.
// ---------------------------------------------------------------------------------------------

export type ReaderStateMap = Record<string, Record<string, Record<string, unknown>>>;

/** Full replace: a slot or card absent from `map` (e.g. after a section reset) is deleted. */
export function saveReaderState(map: ReaderStateMap): Promise<boolean> {
  // Volatile flip state never persists (v1 stripVol); progress state (seenBack) survives.
  const stripped = stripPresentation(map);
  const rows: { card_id: string; slot_id: string; data: string }[] = [];
  for (const cardId of Object.keys(stripped)) {
    const slots = stripped[cardId] ?? {};
    for (const slotId of Object.keys(slots)) {
      const value = slots[slotId];
      if (value === undefined) continue;
      rows.push({ card_id: cardId, slot_id: slotId, data: JSON.stringify(value) });
    }
  }
  const json = JSON.stringify(rows);
  return write('reader_state', 'your study progress', (d) => d.execute(SAVE_READER_STATE_SQL, [json]));
}

export function loadReaderState(): Promise<ReaderStateMap> {
  return read(async (d) => {
    const rows = await d.select<{ card_id: string; slot_id: string; data: string }[]>(
      'SELECT card_id, slot_id, data FROM reader_state',
    );
    const map: ReaderStateMap = {};
    for (const r of rows) {
      (map[r.card_id] ??= {})[r.slot_id] = JSON.parse(r.data);
    }
    return map;
  });
}

// ---------------------------------------------------------------------------------------------
// App preferences: simple key/value (theme, etc.).
// ---------------------------------------------------------------------------------------------

export function getPreference(key: string): Promise<string | null> {
  return read(async (d) => {
    const rows = await d.select<{ value: string }[]>('SELECT value FROM preferences WHERE key = $1', [key]);
    return rows.length ? rows[0].value : null;
  });
}

export function setPreference(key: string, value: string): Promise<boolean> {
  return write(`pref:${key}`, `the ${key.replace(/_/g, ' ')} setting`, (d) =>
    d.execute('INSERT OR REPLACE INTO preferences (key, value) VALUES ($1, $2)', [key, value]),
  );
}

// ---------------------------------------------------------------------------------------------
// Card types: the Factory/gallery layer. Stored app-wide, not per notebook.
// ---------------------------------------------------------------------------------------------

export function saveCardType(ct: CardType): Promise<boolean> {
  const { id, name, ...data } = ct;
  const json = JSON.stringify(data);
  // Same key as deleteCardType, so save/delete of one type coalesce to the latest intent.
  return write(`card_type:${id}`, `card type “${name}”`, (d) => d.execute(SAVE_CARD_TYPE_SQL, [id, name, json]));
}

export function listCardTypes(): Promise<CardType[]> {
  return read(async (d) => {
    const rows = await d.select<{ id: string; name: string; data: string }[]>(
      'SELECT id, name, data FROM card_types ORDER BY created_at',
    );
    return rows.map((r) => ({ id: r.id, name: r.name, ...JSON.parse(r.data) }));
  });
}

export function deleteCardType(id: string): Promise<boolean> {
  return write(`card_type:${id}`, 'the card type deletion', (d) =>
    d.execute('DELETE FROM card_types WHERE id = $1', [id]),
  );
}

// ---------------------------------------------------------------------------------------------
// Reader annotations: local-only, never exported.
// ---------------------------------------------------------------------------------------------

export function saveAnnotation(a: Annotation): Promise<boolean> {
  const args = [a.id, a.cardId, a.kind, a.body, a.createdAt];
  return write(`annotation:${a.id}`, 'your note', (d) =>
    d.execute(
      'INSERT OR REPLACE INTO annotations (id, card_id, kind, body, created_at) VALUES ($1, $2, $3, $4, $5)',
      args,
    ),
  );
}

export function deleteAnnotation(id: string): Promise<boolean> {
  return write(`annotation:${id}`, 'the note deletion', (d) =>
    d.execute('DELETE FROM annotations WHERE id = $1', [id]),
  );
}

export function loadAnnotations(): Promise<Annotation[]> {
  return read(async (d) => {
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
  });
}
