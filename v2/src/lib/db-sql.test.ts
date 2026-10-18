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
