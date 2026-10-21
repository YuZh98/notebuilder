// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// The schema comes straight from the Rust migrations, so every future migration is exercised here.
import libRs from '../../src-tauri/src/lib.rs?raw';
import type { Notebook, Section, Card } from './types';
import { CARD_STATE_KEY } from './card-done';

/*
 * Real-SQLite tests for db.ts: node:sqlite (Node ≥ 22) stands in for @tauri-apps/plugin-sql.
 * The adapter mimics the plugin where it matters for durability:
 * - one execute() string runs all its statements in order on ONE connection, `$N` indexing a
 *   single argument list shared by every statement;
 * - a failing statement stops the batch and leaves that connection inside the open transaction
 *   (exactly the sqlx pool pitfall) — only close() rolls it back;
 * - foreign_keys=ON per connection (the sqlx default).
 * node:sqlite binds `$N` only through named objects and throws on unknown names, so each
 * statement is bound with just the `$N` names it contains.
 */

type Row = Record<string, unknown>;
type StatementSync = {
  run(params?: Row): { changes: number | bigint; lastInsertRowid: number | bigint };
  all(params?: Row): Row[];
};
type DatabaseSync = {
  exec(sql: string): void;
  prepare(sql: string): StatementSync;
  close(): void;
  readonly isTransaction: boolean;
};
type NodeSqlite = { DatabaseSync: new (path: string) => DatabaseSync };

// Non-literal specifiers: these node builtins are untyped in the browser-only tsconfig.
const nodeImport = (spec: string): Promise<unknown> => import(/* @vite-ignore */ spec);

const env = vi.hoisted(() => ({
  sqlite: null as unknown,
  file: '',
  loads: 0,
  closes: 0,
  open: [] as { conn: { isTransaction: boolean } | null }[],
}));

let sqlite: NodeSqlite | null = null;
try {
  sqlite = (await nodeImport('node:sqlite')) as NodeSqlite;
} catch {
  sqlite = null;
}
const hasNodeSqlite = sqlite !== null;
env.sqlite = sqlite;

/** Split a batch on `;` outside string literals. */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inStr = false;
  for (const ch of sql) {
    if (ch === "'") inStr = !inStr;
    if (ch === ';' && !inStr) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Bind only the `$N` names a statement contains, from the batch's one shared argument list. */
function paramsFor(stmt: string, values: unknown[]): Row {
  const params: Row = {};
  const code = stmt.replace(/'(?:[^']|'')*'/g, "''");
  for (const m of code.matchAll(/\$(\d+)/g)) params[`$${m[1]}`] = values[Number(m[1]) - 1] ?? null;
  return params;
}

vi.mock('@tauri-apps/plugin-sql', () => {
  class NodeSqliteDatabase {
    path: string;
    conn: DatabaseSync | null;
    constructor(path: string) {
      const { DatabaseSync } = env.sqlite as NodeSqlite;
      this.path = path;
      this.conn = new DatabaseSync(env.file);
      this.conn.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
      env.open.push(this);
    }
    static async load(path: string) {
      env.loads++;
      return new NodeSqliteDatabase(path);
    }
    private live(): DatabaseSync {
      if (!this.conn) throw new Error('attempted to acquire a connection on a closed pool');
      return this.conn;
    }
    async execute(sql: string, values: unknown[] = []) {
      const conn = this.live();
      let rowsAffected = 0;
      for (const stmt of splitStatements(sql)) {
        // A throw here leaves the connection inside BEGIN — like the real pooled connection.
        rowsAffected += Number(conn.prepare(stmt).run(paramsFor(stmt, values)).changes);
      }
      return { rowsAffected };
    }
    async select(sql: string, values: unknown[] = []) {
      return this.live().prepare(sql).all(paramsFor(sql, values)).map((r) => ({ ...r }));
    }
    async close() {
      env.closes++;
      this.conn?.close(); // SQLite rolls back an open transaction on close
      this.conn = null;
      return true;
    }
  }
  return { default: NodeSqliteDatabase };
});

/** Migration SQL strings from src-tauri/src/lib.rs, in version order. */
function migrations(): { version: number; sql: string }[] {
  const found: { version: number; sql: string }[] = [];
  const re = /version:\s*(\d+)[\s\S]*?sql:\s*"((?:[^"\\]|\\.)*)"/g;
  for (const m of libRs.matchAll(re)) {
    found.push({ version: Number(m[1]), sql: m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\') });
  }
  return found.sort((a, b) => a.version - b.version);
}

type Db = typeof import('./db');
let db: Db;
let tmpDir = '';
let fs: { mkdtempSync(p: string): string; rmSync(p: string, o: object): void };

/** A separate connection to the same file — sees only committed data. */
function inspect(): DatabaseSync {
  const { DatabaseSync } = sqlite!;
  const conn = new DatabaseSync(env.file);
  conn.exec('PRAGMA foreign_keys = ON;');
  return conn;
}

function count(conn: DatabaseSync, sql: string, params: Row = {}): number {
  return Number(conn.prepare(sql).all(params)[0].n);
}

describe.skipIf(!hasNodeSqlite)('db.ts against real SQLite (node:sqlite)', () => {
  beforeEach(async () => {
    fs = (await nodeImport('node:fs')) as typeof fs;
    const os = (await nodeImport('node:os')) as { tmpdir(): string };
    tmpDir = fs.mkdtempSync(`${os.tmpdir()}/nb-db-sql-`);
    env.file = `${tmpDir}/notebuilder.db`;
    env.loads = 0;
    env.closes = 0;
    env.open = [];
    const setup = inspect();
    for (const m of migrations()) setup.exec(m.sql);
    setup.close();
    vi.resetModules();
    db = await import('./db');
    db.onDbError(() => {});
  });

  afterEach(() => {
    for (const d of env.open) (d.conn as DatabaseSync | null)?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const card = (id: string, sectionId: string, position: number, over: Partial<Card> = {}): Card => ({
    id,
    sectionId,
    position,
    slots: [{ id: `${id}_s`, type: 'text', props: { text: `body ${id}` } }],
    ...over,
  });
  const section = (id: string, notebookId: string, position: number, cards: Card[], over: Partial<Section> = {}): Section => ({
    id,
    notebookId,
    name: `Section ${id}`,
    position,
    cards,
    ...over,
  });
  const notebook = (id: string, name: string, sections: Section[]): Notebook => ({
    id,
    name,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    sections,
    cats: [],
  });

  const V1 = notebook('nb1', 'Physics', [
    section('s1', 'nb1', 0, [
      card('c1', 's1', 0, { w: 6, tags: ['a'], accent: '#f00', typeId: 'ct_note' }),
      card('c2', 's1', 1, { verbs: { flip: true }, back: [{ id: 'b1', type: 'text', props: {} }] }),
    ], { services: { search: true }, folded: true }),
    section('s2', 'nb1', 1, [card('c3', 's2', 0, { archived: true, draft: true })]),
  ]);

  it('extracts every migration from lib.rs', () => {
    const ms = migrations();
    expect(ms.length).toBeGreaterThanOrEqual(5);
    expect(ms.map((m) => m.version)).toEqual(ms.map((_, i) => i + 1));
  });

  it('saves and loads a notebook tree through the real SQL', async () => {
    expect(await db.saveNotebook(V1)).toBe(true);
    const back = await db.loadNotebook('nb1');
    expect(back).toEqual(V1);
    expect(typeof back!.sections[0].position).toBe('number');
    expect(back!.sections[0].cards[0].w).toBe(6);
  });

  it('missing positions/timestamps fall back to the column defaults instead of failing the batch', async () => {
    const loose = notebook('nbL', 'Loose', [
      section('sL', 'nbL', 0, [{ ...card('cL', 'sL', 0), position: undefined as unknown as number }]),
    ]);
    const { createdAt: _c, updatedAt: _u, ...rest } = loose;
    expect(await db.saveNotebook(rest as Notebook)).toBe(true);
    const back = await db.loadNotebook('nbL');
    expect(back!.sections[0].cards[0].position).toBe(0);
    expect(back!.createdAt).toMatch(/^\d{4}-/);
  });

  it('a later save replaces the tree (removed sections/cards are gone)', async () => {
    await db.saveNotebook(V1);
    const v2 = notebook('nb1', 'Physics II', [section('s2', 'nb1', 0, [card('c3', 's2', 0)])]);
    await db.saveNotebook(v2);
    expect(await db.loadNotebook('nb1')).toEqual(v2);
    const conn = inspect();
    expect(count(conn, 'SELECT COUNT(*) n FROM sections')).toBe(1);
    expect(count(conn, 'SELECT COUNT(*) n FROM cards')).toBe(1);
    conn.close();
  });

  it('the plugin pitfall is real: a failing batch leaves its connection inside the transaction', async () => {
    const Database = (await import('@tauri-apps/plugin-sql')).default;
    const raw = await Database.load('sqlite:notebuilder.db');
    await expect(
      raw.execute("BEGIN; INSERT INTO preferences (key, value) VALUES ('k', 'v'); INSERT INTO nope VALUES (1); COMMIT;"),
    ).rejects.toThrow();
    const conn = (raw as unknown as { conn: DatabaseSync }).conn;
    expect(conn.isTransaction).toBe(true);
    await expect(raw.execute('BEGIN; COMMIT;')).rejects.toThrow(/within a transaction/);
    await raw.close(); // closing rolls it back
    const check = inspect();
    expect(count(check, 'SELECT COUNT(*) n FROM preferences')).toBe(0);
    check.close();
  });

  it('save is atomic: a failing statement mid-batch leaves NO partial rows (ROLLBACK)', async () => {
    let reported = '';
    db.onDbError((m) => (reported = m));
    await db.saveNotebook(V1);
    // Duplicate card id ⇒ PRIMARY KEY violation in the LAST insert, after the notebook upsert and
    // the section rewrite already ran inside the transaction.
    const broken = notebook('nb1', 'Renamed', [
      section('s9', 'nb1', 0, [card('dup', 's9', 0), card('dup', 's9', 1)]),
    ]);
    expect(await db.saveNotebook(broken)).toBe(false);
    expect(reported).toMatch(/Renamed/);
    expect(env.closes).toBe(2); // first failure and failed retry each dropped the pool

    const conn = inspect();
    expect(conn.prepare('SELECT name FROM notebooks').all().map((r) => r.name)).toEqual(['Physics']);
    expect(conn.prepare('SELECT id FROM sections ORDER BY position').all().map((r) => r.id)).toEqual(['s1', 's2']);
    expect(count(conn, 'SELECT COUNT(*) n FROM cards')).toBe(3);
    expect(count(conn, "SELECT COUNT(*) n FROM sections WHERE id = 's9'")).toBe(0);
    conn.close();

    // No connection is left stuck in a transaction: the next save just works.
    expect(await db.saveNotebook({ ...V1, name: 'Physics III' })).toBe(true);
    expect((await db.loadNotebook('nb1'))!.name).toBe('Physics III');
  });

  // JSON.stringify writes a lone UTF-16 surrogate as the escape "\ud83e", and json_extract
  // decodes that escape to bytes that are not valid UTF-8 (ED A0 BE). sqlx then reads the column
  // back as null, and every later save of the tree failed NOT NULL. Names reach SQL well-formed.
  it('a section name with a lone surrogate is stored as valid UTF-8, and saving twice works', async () => {
    const odd = notebook('nbU', 'Book \uD83E', [
      section('sU', 'nbU', 0, [card('cU', 'sU', 0)], { name: 'A\uD83EB' }),
    ]);
    expect(await db.saveNotebook(odd)).toBe(true);
    const conn = inspect();
    const hex = (sql: string) => conn.prepare(sql).all()[0].h;
    expect(hex("SELECT hex(name) h FROM sections WHERE id = 'sU'")).toBe('41EFBFBD42'); // A U+FFFD B
    expect(hex("SELECT hex(name) h FROM notebooks WHERE id = 'nbU'")).toBe('426F6F6B20EFBFBD'); // "Book " U+FFFD
    expect(count(conn, "SELECT COUNT(*) n FROM sections WHERE name IS NULL OR instr(hex(name), 'EDA0') > 0")).toBe(0);
    conn.close();

    const back = await db.loadNotebook('nbU');
    expect(back!.name).toBe('Book �');
    expect(back!.sections[0].name).toBe('A�B');
    // The next saves — of what was loaded, and of the in-memory original — both succeed.
    expect(await db.saveNotebook({ ...back!, updatedAt: '2024-01-03T00:00:00Z' })).toBe(true);
    expect(await db.saveNotebook({ ...odd, updatedAt: '2024-01-04T00:00:00Z' })).toBe(true);
    expect((await db.loadNotebook('nbU'))!.updatedAt).toBe('2024-01-04T00:00:00Z');
  });

  it('a section row without a name is stored as "" instead of failing every later save (NOT NULL)', async () => {
    const nameless = notebook('nbN', 'Nameless', [
      section('sN', 'nbN', 0, [card('cN', 'sN', 0)], { name: null as unknown as string }),
    ]);
    expect(await db.saveNotebook(nameless)).toBe(true);
    expect(await db.saveNotebook(nameless)).toBe(true);
    expect((await db.loadNotebook('nbN'))!.sections[0].name).toBe('');
  });

  it('upsert keeps rows of another table that references notebooks(id) ON DELETE CASCADE', async () => {
    const conn = inspect();
    conn.exec(`CREATE TABLE nb_children (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE
    )`);
    conn.close();
    await db.saveNotebook(V1);
    const c1 = inspect();
    c1.exec("INSERT INTO nb_children (id, notebook_id) VALUES ('v1', 'nb1')");
    c1.close();

    await db.saveNotebook({ ...V1, name: 'Physics (edited)' });
    const c2 = inspect();
    expect(count(c2, 'SELECT COUNT(*) n FROM nb_children')).toBe(1);
    // Control: the old INSERT OR REPLACE really would have wiped it through the cascade.
    c2.exec("INSERT OR REPLACE INTO notebooks (id, name, created_at, updated_at, data) VALUES ('nb1', 'x', 'c', 'u', '{}')");
    expect(count(c2, 'SELECT COUNT(*) n FROM nb_children')).toBe(0);
    c2.close();
  });

  it('reader-state save is a full replace: reset slots/cards are deleted, not left to reappear', async () => {
    await db.saveReaderState({ c1: { s1: { v: 1 }, s2: { v: 2 } }, c2: { s1: { v: 3 } } });
    expect(await db.loadReaderState()).toEqual({ c1: { s1: { v: 1 }, s2: { v: 2 } }, c2: { s1: { v: 3 } } });
    await db.saveReaderState({ c1: { s1: { v: 9 } }, c2: {} });
    expect(await db.loadReaderState()).toEqual({ c1: { s1: { v: 9 } } });
    await db.saveReaderState({});
    expect(await db.loadReaderState()).toEqual({});
  });

  it('an unreadable reader-state row is skipped on load (it must not block hydration)', async () => {
    await db.saveReaderState({ c1: { s1: { v: 1 } } });
    const conn = inspect();
    conn.exec("INSERT INTO reader_state (card_id, slot_id, data) VALUES ('c2', 's1', '{not json')");
    conn.close();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await db.loadReaderState()).toEqual({ c1: { s1: { v: 1 } } });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('reader-state save strips volatile flip state but keeps progress', async () => {
    await db.saveReaderState({ c1: { [CARD_STATE_KEY]: { flipped: true, seenBack: true } } });
    expect(await db.loadReaderState()).toEqual({ c1: { [CARD_STATE_KEY]: { seenBack: true } } });
  });

  it('json_each handles more than 1000 rows in one batch', async () => {
    const sections = Array.from({ length: 12 }, (_, i) =>
      section(`s${i}`, 'big', i, Array.from({ length: 110 }, (_, j) => card(`c${i}_${j}`, `s${i}`, j))),
    );
    const big = notebook('big', 'Big', sections);
    expect(await db.saveNotebook(big)).toBe(true);
    const back = await db.loadNotebook('big');
    expect(back!.sections).toHaveLength(12);
    expect(back!.sections.reduce((n, s) => n + s.cards.length, 0)).toBe(1320);
    expect(back).toEqual(big);

    const map: Record<string, Record<string, Record<string, unknown>>> = {};
    for (let i = 0; i < 1500; i++) map[`card${i}`] = { slot: { n: i } };
    expect(await db.saveReaderState(map)).toBe(true);
    const loaded = await db.loadReaderState();
    expect(Object.keys(loaded)).toHaveLength(1500);
    expect(loaded.card1499).toEqual({ slot: { n: 1499 } });
  });

  it('deleteNotebook removes the tree plus its reader state and notes, and nothing else', async () => {
    await db.saveNotebook(V1);
    await db.saveNotebook(notebook('nb2', 'Other', [section('t1', 'nb2', 0, [card('k1', 't1', 0)])]));
    await db.saveReaderState({ c1: { x: { v: 1 } }, k1: { x: { v: 2 } } });
    await db.saveAnnotation({ id: 'a1', cardId: 'c1', kind: 'note', body: 'gone', createdAt: '1' });
    await db.saveAnnotation({ id: 'a2', cardId: 'k1', kind: 'note', body: 'kept', createdAt: '2' });

    expect(await db.deleteNotebook('nb1')).toBe(true);
    expect(await db.loadNotebook('nb1')).toBeNull();
    expect((await db.listNotebooks()).map((r) => r.id)).toEqual(['nb2']);
    expect(await db.loadReaderState()).toEqual({ k1: { x: { v: 2 } } });
    expect((await db.loadAnnotations()).map((a) => a.id)).toEqual(['a2']);
    const conn = inspect();
    expect(count(conn, 'SELECT COUNT(*) n FROM cards')).toBe(1);
    conn.close();

    // Tombstone: a late autosave of the deleted notebook cannot resurrect it.
    expect(await db.saveNotebook(V1)).toBe(true);
    expect(await db.loadNotebook('nb1')).toBeNull();
  });

  it('a failed deleteNotebook changes nothing and the notebook keeps saving', async () => {
    await db.saveNotebook(V1);
    await db.saveReaderState({ c1: { x: { v: 1 } } });
    await db.saveAnnotation({ id: 'a1', cardId: 'c1', kind: 'note', body: 'kept', createdAt: '1' });
    const conn = inspect();
    // The last statement fails, after the reader-state and note deletes already ran.
    conn.exec("CREATE TRIGGER no_delete BEFORE DELETE ON notebooks BEGIN SELECT RAISE(ABORT, 'refused'); END");
    expect(await db.deleteNotebook('nb1')).toBe(false);
    conn.exec('DROP TRIGGER no_delete');
    conn.close();
    expect(await db.loadNotebook('nb1')).toEqual(V1);
    expect(await db.loadReaderState()).toEqual({ c1: { x: { v: 1 } } });
    expect((await db.loadAnnotations()).map((a) => a.id)).toEqual(['a1']);
    // No tombstone: the next save is written.
    expect(await db.saveNotebook({ ...V1, name: 'Physics (kept)' })).toBe(true);
    expect((await db.loadNotebook('nb1'))!.name).toBe('Physics (kept)');
  });

  it('saveCardType upserts — created_at (the gallery order) survives a re-save', async () => {
    await db.saveCardType({ id: 'A', name: 'Alpha', slots: [] } as never);
    await db.saveCardType({ id: 'B', name: 'Beta', slots: [] } as never);
    const conn = inspect();
    conn.exec("UPDATE card_types SET created_at = '2000-01-01 00:00:00' WHERE id = 'A'");
    await db.saveCardType({ id: 'A', name: 'Alpha v2', slots: [] } as never);
    expect(conn.prepare("SELECT created_at FROM card_types WHERE id = 'A'").all()[0].created_at).toBe(
      '2000-01-01 00:00:00',
    );
    conn.close();
    expect((await db.listCardTypes()).map((t) => t.name)).toEqual(['Alpha v2', 'Beta']);
    await db.deleteCardType('A');
    expect((await db.listCardTypes()).map((t) => t.id)).toEqual(['B']);
  });

  it('an unreadable card type row is skipped on load (it must not block hydration)', async () => {
    await db.saveCardType({ id: 'A', name: 'Alpha', slots: [] } as never);
    const conn = inspect();
    conn.exec("INSERT INTO card_types (id, name, data) VALUES ('bad', 'Broken', '{not json')");
    conn.exec("INSERT INTO card_types (id, name, data) VALUES ('str', 'Stringy', '\"abc\"')");
    conn.close();
    await db.saveCardType({ id: 'B', name: 'Beta', slots: [] } as never);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await db.listCardTypes()).toEqual([
      { id: 'A', name: 'Alpha', slots: [] },
      { id: 'B', name: 'Beta', slots: [] },
    ]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  // Ported from the statement-matching db.test.ts (retired: it faked the per-row SQL that the
  // atomic batches replaced); these run the same behaviours against real SQLite instead.
  it('loadNotebook returns null for an unknown id', async () => {
    expect(await db.loadNotebook('missing')).toBeNull();
  });

  it('lists notebooks newest-updated first', async () => {
    await db.saveNotebook(notebook('nb1', 'Older', []));
    await db.saveNotebook({ ...notebook('nb2', 'Newer', []), updatedAt: '2026-03-01T00:00:00.000Z' });
    expect((await db.listNotebooks()).map((r) => r.id)).toEqual(['nb2', 'nb1']);
  });

  it('annotations round-trip through the snake_case columns, oldest first, and delete by id', async () => {
    const note = { id: 'an1', cardId: 'c1', kind: 'note' as const, body: 'first', createdAt: '2026-01-01T00:00:00.000Z' };
    const hl = { id: 'an2', cardId: 'c1', kind: 'highlight' as const, body: 'second', createdAt: '2026-01-02T00:00:00.000Z' };
    await db.saveAnnotation(hl);
    await db.saveAnnotation(note);
    expect(await db.loadAnnotations()).toEqual([note, hl]);
    await db.deleteAnnotation('an1');
    expect((await db.loadAnnotations()).map((a) => a.id)).toEqual(['an2']);
  });

  it('opens the database once and reuses the handle across reads and writes', async () => {
    await db.setPreference('theme', 'dark');
    await db.getPreference('theme');
    await db.listNotebooks();
    expect(env.loads).toBe(1);
  });

  it('preferences round-trip and overwrite', async () => {
    expect(await db.getPreference('theme')).toBeNull();
    await db.setPreference('theme', 'dark');
    await db.setPreference('theme', 'light');
    expect(await db.getPreference('theme')).toBe('light');
  });

  it('concurrent fire-and-forget saves land in order and only the latest per key is written', async () => {
    const saves = [1, 2, 3, 4, 5].map((i) => db.saveNotebook({ ...V1, name: `v${i}` }));
    void db.setPreference('k', 'a');
    void db.setPreference('k', 'b');
    await Promise.all(saves);
    expect((await db.loadNotebook('nb1'))!.name).toBe('v5');
    expect(await db.getPreference('k')).toBe('b');
  });

  // ---- W7 version history: the snapshots table (migration v6) ----

  // Local noon, so the calendar-day retention rule cannot straddle a midnight in any TZ.
  const T0 = new Date(2026, 9, 18, 12, 0).getTime();
  const MIN = 60_000;
  const DAY = 24 * 60 * MIN;
  const snapshotIds = (conn: DatabaseSync, nbId: string) =>
    conn
      .prepare('SELECT id FROM snapshots WHERE notebook_id = $1 ORDER BY created_at')
      .all({ $1: nbId })
      .map((r) => r.id as string);
  /** A stored snapshot row written straight to the file (for ages the queue would never produce). */
  function plantSnapshot(conn: DatabaseSync, id: string, nbId: string, at: number, reason = 'auto') {
    conn
      .prepare('INSERT INTO snapshots (id, notebook_id, created_at, reason, hash, data) VALUES ($1, $2, $3, $4, $5, $6)')
      .run({ $1: id, $2: nbId, $3: new Date(at).toISOString(), $4: reason, $5: 'h', $6: JSON.stringify(V1) });
  }

  it('migration v6 creates the snapshots table (no FK to notebooks) and its index', () => {
    const conn = inspect();
    const cols = conn.prepare("SELECT name FROM pragma_table_info('snapshots')").all().map((r) => r.name);
    expect(cols).toEqual(['id', 'notebook_id', 'created_at', 'reason', 'hash', 'data']);
    expect(conn.prepare("SELECT COUNT(*) n FROM pragma_foreign_key_list('snapshots')").all()[0].n).toBe(0);
    const idx = conn.prepare("SELECT name FROM pragma_index_list('snapshots')").all().map((r) => r.name);
    expect(idx).toContain('idx_snapshots_nb');
    expect(conn.prepare("SELECT name FROM pragma_index_info('idx_snapshots_nb')").all().map((r) => r.name)).toEqual([
      'notebook_id',
      'created_at',
    ]);
    conn.close();
  });

  it('saveSnapshot stores the lossless notebook; the list is newest first, with card counts but no data', async () => {
    expect(await db.saveSnapshot(V1, 'manual', T0)).toBe(true);
    const edited = { ...V1, sections: [V1.sections[0]] };
    expect(await db.saveSnapshot(edited, 'auto', T0 + 15 * MIN)).toBe(true);

    const list = await db.listSnapshots('nb1');
    expect(list.map((s) => [s.reason, s.cardCount, s.createdAt])).toEqual([
      ['auto', 2, new Date(T0 + 15 * MIN).toISOString()],
      ['manual', 3, new Date(T0).toISOString()],
    ]);
    const { contentHash } = await import('./snapshots');
    expect(list[1].hash).toBe(contentHash(V1));
    expect(Object.keys(list[0]).sort()).toEqual(['cardCount', 'createdAt', 'hash', 'id', 'reason']);
    expect(list[0].id).not.toBe(list[1].id);

    expect(await db.loadSnapshot(list[1].id)).toEqual(V1);
    expect(await db.loadSnapshot(list[0].id)).toEqual(edited);
    expect(await db.loadSnapshot('nope')).toBeNull();
    expect(await db.listSnapshots('nb2')).toEqual([]);
  });

  it('the snapshot is taken when queued: a later mutation of the notebook cannot leak into it', async () => {
    const live = structuredClone(V1);
    const p = db.saveSnapshot(live, 'auto', T0);
    live.name = 'mutated after queueing';
    live.sections[0].cards[0].slots[0].props.text = 'changed';
    expect(await p).toBe(true);
    const [only] = await db.listSnapshots('nb1');
    expect(await db.loadSnapshot(only.id)).toEqual(V1);
  });

  it('save + prune run as one batch: retention drops this notebook’s expired snapshots only', async () => {
    const conn = inspect();
    plantSnapshot(conn, 'old_auto', 'nb1', T0 - 40 * DAY);
    // The newest one past the 30 days (what the notebook was when they began): manual, so it
    // alone covers that, and the older automatic one expires.
    plantSnapshot(conn, 'old_manual', 'nb1', T0 - 35 * DAY, 'manual');
    plantSnapshot(conn, 'same_day_a', 'nb1', new Date(2026, 9, 15, 12, 0).getTime());
    plantSnapshot(conn, 'same_day_b', 'nb1', new Date(2026, 9, 15, 11, 0).getTime());
    plantSnapshot(conn, 'other_old', 'nb2', T0 - 40 * DAY);
    expect(await db.saveSnapshot(V1, 'auto', T0)).toBe(true);
    const ids = snapshotIds(conn, 'nb1');
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(expect.arrayContaining(['old_manual', 'same_day_a']));
    expect(ids).not.toContain('old_auto');
    expect(ids).not.toContain('same_day_b');
    expect(snapshotIds(conn, 'nb2')).toEqual(['other_old']); // pruning is per notebook
    conn.close();
  });

  it('a failing snapshot batch inserts nothing and prunes nothing (ROLLBACK)', async () => {
    let reported = '';
    db.onDbError((m) => (reported = m));
    const conn = inspect();
    plantSnapshot(conn, 'older_auto', 'nb1', T0 - 50 * DAY); // expired: the batch must delete it
    plantSnapshot(conn, 'old_auto', 'nb1', T0 - 40 * DAY); // kept: still current 30 days ago
    // The prune DELETE fails AFTER the INSERT already ran inside the transaction.
    conn.exec("CREATE TRIGGER no_delete BEFORE DELETE ON snapshots BEGIN SELECT RAISE(ABORT, 'refused'); END");
    expect(await db.saveSnapshot(V1, 'manual', T0)).toBe(false);
    expect(reported).toMatch(/version/);
    expect(snapshotIds(conn, 'nb1')).toEqual(['older_auto', 'old_auto']);
    conn.exec('DROP TRIGGER no_delete');
    conn.close();
    // No connection is left inside the transaction: the next snapshot just works.
    expect(await db.saveSnapshot(V1, 'manual', T0 + MIN)).toBe(true);
    expect((await db.listSnapshots('nb1')).map((s) => s.id).slice(1)).toEqual(['old_auto']);
  });

  it('the first version after a long pause keeps the one it replaced (last term’s notebook)', async () => {
    const conn = inspect();
    plantSnapshot(conn, 'term_end', 'nb1', T0 - 60 * DAY);
    plantSnapshot(conn, 'term_mid', 'nb1', T0 - 75 * DAY);
    // Opened again today: the first autosaved edit takes a version, then the next ones do.
    expect(await db.saveSnapshot(V1, 'auto', T0)).toBe(true);
    expect(await db.saveSnapshot({ ...V1, name: 'Physics (edited)' }, 'auto', T0 + 15 * MIN)).toBe(true);
    const ids = snapshotIds(conn, 'nb1');
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe('term_end'); // what the notebook was until today — still there to restore
    expect(ids).not.toContain('term_mid');
    conn.close();
  });

  it('notebook saves never touch its snapshots (no FK, so the upsert cannot cascade)', async () => {
    await db.saveNotebook(V1);
    await db.saveSnapshot(V1, 'auto', T0);
    await db.saveNotebook({ ...V1, name: 'Physics (edited)' });
    const conn = inspect();
    // Even the old INSERT OR REPLACE path would not reach it now.
    conn.exec("INSERT OR REPLACE INTO notebooks (id, name, created_at, updated_at, data) VALUES ('nb1', 'x', 'c', 'u', '{}')");
    expect(snapshotIds(conn, 'nb1')).toHaveLength(1);
    conn.close();
  });

  it('deleteNotebook deletes that notebook’s snapshots by hand, and no other’s', async () => {
    await db.saveNotebook(V1);
    await db.saveNotebook(notebook('nb2', 'Other', [section('t1', 'nb2', 0, [card('k1', 't1', 0)])]));
    await db.saveSnapshot(V1, 'auto', T0);
    await db.saveSnapshot(V1, 'manual', T0 + MIN);
    await db.saveSnapshot(notebook('nb2', 'Other', []), 'auto', T0);
    expect(await db.deleteNotebook('nb1')).toBe(true);
    expect(await db.listSnapshots('nb1')).toEqual([]);
    expect((await db.listSnapshots('nb2')).map((s) => s.reason)).toEqual(['auto']);
    // Tombstone: a late snapshot of the deleted notebook is never written.
    expect(await db.saveSnapshot(V1, 'auto', T0 + 2 * MIN)).toBe(true);
    expect(await db.listSnapshots('nb1')).toEqual([]);
  });

  it('a snapshot queued before the delete is removed with the notebook, not orphaned', async () => {
    await db.saveNotebook(V1);
    const snap = db.saveSnapshot(V1, 'auto', T0);
    const del = db.deleteNotebook('nb1');
    expect(await snap).toBe(true);
    expect(await del).toBe(true);
    const conn = inspect();
    expect(count(conn, 'SELECT COUNT(*) n FROM snapshots')).toBe(0);
    conn.close();
  });

  it('an unreadable snapshot lists with 0 cards and rejects on load', async () => {
    const conn = inspect();
    conn
      .prepare("INSERT INTO snapshots (id, notebook_id, created_at, reason, hash, data) VALUES ('bad', 'nb1', $1, 'auto', 'h', '{oops')")
      .run({ $1: new Date(T0).toISOString() });
    conn.close();
    expect((await db.listSnapshots('nb1')).map((s) => [s.id, s.cardCount])).toEqual([['bad', 0]]);
    await expect(db.loadSnapshot('bad')).rejects.toThrow();
  });
});

describe('adapter helpers', () => {
  it('splits only on semicolons outside string literals', () => {
    expect(splitStatements("SELECT ';'; SELECT 2;\n")).toEqual(["SELECT ';'", 'SELECT 2']);
  });

  it('binds just the $N names a statement uses, ignoring $ inside strings', () => {
    expect(paramsFor("SELECT json_extract(value, '$.id'), $1 FROM json_each($3)", ['a', 'b', 'c'])).toEqual({
      $1: 'a',
      $3: 'c',
    });
  });
});
