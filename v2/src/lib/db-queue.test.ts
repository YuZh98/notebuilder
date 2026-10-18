import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Notebook } from './types';

// A fake plugin-sql: records every call, measures overlap, and fails on demand.
const h = vi.hoisted(() => ({
  calls: [] as { op: string; sql: string; args: unknown[] }[],
  active: 0,
  maxActive: 0,
  loads: 0,
  closes: 0,
  fail: null as null | ((sql: string, attempt: number) => boolean),
  attempts: 0,
}));

vi.mock('@tauri-apps/plugin-sql', () => {
  class FakeDatabase {
    path: string;
    constructor(path: string) {
      this.path = path;
    }
    static async load(path: string) {
      h.loads++;
      return new FakeDatabase(path);
    }
    private async run(op: string, sql: string, args: unknown[] = []) {
      h.active++;
      h.maxActive = Math.max(h.maxActive, h.active);
      await new Promise((r) => setTimeout(r, 1));
      h.active--;
      h.calls.push({ op, sql, args });
      if (op === 'execute' && h.fail?.(sql, h.attempts++)) throw new Error('constraint failed');
    }
    async execute(sql: string, args?: unknown[]) {
      await this.run('execute', sql, args);
      return { rowsAffected: 1 };
    }
    async select(sql: string, args?: unknown[]) {
      await this.run('select', sql, args);
      return [];
    }
    async close() {
      h.closes++;
      return true;
    }
  }
  return { default: FakeDatabase };
});

type Db = typeof import('./db');
let db: Db;

beforeEach(async () => {
  h.calls = [];
  h.active = 0;
  h.maxActive = 0;
  h.loads = 0;
  h.closes = 0;
  h.fail = null;
  h.attempts = 0;
  vi.resetModules();
  db = await import('./db');
});

const nb = (id: string, name = id): Notebook => ({
  id,
  name,
  createdAt: 'c',
  updatedAt: 'u',
  sections: [],
});

const executes = () => h.calls.filter((c) => c.op === 'execute');

describe('db write queue', () => {
  it('serializes every read and write — never two plugin calls in flight', async () => {
    await Promise.all([
      db.saveNotebook(nb('a')),
      db.saveNotebook(nb('b')),
      db.setPreference('theme', 'dark'),
      db.listNotebooks(),
      db.saveCardType({ id: 'ct', name: 'T', slots: [] } as never),
      db.deleteCardType('ct2'),
      db.saveAnnotation({ id: 'an', cardId: 'c', kind: 'note', body: 'b', createdAt: 'x' }),
      db.deleteAnnotation('an2'),
      db.loadReaderState(),
      db.saveReaderState({ c1: { s1: { v: 1 } } }),
      db.getPreference('theme'),
      db.listCardTypes(),
      db.loadAnnotations(),
      db.loadNotebook('a'),
      db.deleteNotebook('zz'),
    ]);
    expect(h.calls.length).toBeGreaterThanOrEqual(15);
    expect(h.maxActive).toBe(1);
    expect(h.loads).toBe(1); // one cached handle
  });

  it('runs operations in call order', async () => {
    await Promise.all([db.setPreference('a', '1'), db.listNotebooks(), db.setPreference('b', '2')]);
    expect(h.calls.map((c) => c.args[0] ?? c.op)).toEqual(['a', 'select', 'b']);
  });

  it('coalesces queued saves per key — latest wins', async () => {
    const blocker = db.setPreference('x', 'block'); // occupies the queue
    const p1 = db.saveNotebook(nb('n', 'first'));
    const p2 = db.saveNotebook(nb('n', 'second'));
    const p3 = db.saveNotebook(nb('n', 'third'));
    const other = db.saveNotebook(nb('m', 'other'));
    expect(p1).toBe(p2);
    expect(p2).toBe(p3);
    await Promise.all([blocker, p1, other]);
    const saves = executes().filter((c) => c.sql === db.SAVE_NOTEBOOK_SQL);
    expect(saves.map((c) => c.args[1])).toEqual(['third', 'other']);
  });

  it('a save queued after a running one for the same key still runs (no lost update)', async () => {
    const p1 = db.saveNotebook(nb('n', 'first'));
    await Promise.resolve(); // let the first one start
    await new Promise((r) => setTimeout(r, 0));
    const p2 = db.saveNotebook(nb('n', 'second'));
    expect(p2).not.toBe(p1);
    await Promise.all([p1, p2]);
    const names = executes().map((c) => c.args[1]);
    expect(names).toEqual(['first', 'second']);
  });

  it('saveNotebook and saveReaderState are each ONE execute()', async () => {
    const big: Notebook = {
      ...nb('n'),
      sections: Array.from({ length: 3 }, (_, i) => ({
        id: `s${i}`,
        notebookId: 'n',
        name: `S${i}`,
        position: i,
        cards: Array.from({ length: 4 }, (_, j) => ({
          id: `c${i}${j}`,
          sectionId: `s${i}`,
          position: j,
          slots: [],
        })),
      })),
    };
    await db.saveNotebook(big);
    expect(executes()).toHaveLength(1);
    expect(executes()[0].sql).toBe(db.SAVE_NOTEBOOK_SQL);
    await db.saveReaderState({ a: { s: { x: 1 } }, b: { s: { y: 2 } } });
    expect(executes()).toHaveLength(2);
    expect(executes()[1].sql).toBe(db.SAVE_READER_STATE_SQL);
  });

  it('deleteNotebook cancels a pending save and tombstones the id against late saves', async () => {
    const blocker = db.setPreference('x', 'block');
    const pending = db.saveNotebook(nb('gone'));
    const del = db.deleteNotebook('gone');
    await Promise.all([blocker, pending, del]);
    const late = await db.saveNotebook(nb('gone', 'resurrected'));
    expect(late).toBe(true);
    const sqls = executes().map((c) => c.sql);
    expect(sqls).not.toContain(db.SAVE_NOTEBOOK_SQL);
    expect(sqls).toContain(db.DELETE_NOTEBOOK_SQL);
  });

  it('dbIdle resolves only after everything queued so far has settled', async () => {
    void db.setPreference('a', '1');
    void db.saveNotebook(nb('n'));
    void db.deleteCardType('x');
    await db.dbIdle();
    expect(executes()).toHaveLength(3);
    expect(h.active).toBe(0);
  });

  it('a delete queued behind a running save runs after it', async () => {
    const save = db.saveNotebook(nb('n'));
    await new Promise((r) => setTimeout(r, 0));
    const del = db.deleteNotebook('n');
    await Promise.all([save, del]);
    expect(executes().map((c) => c.sql)).toEqual([db.SAVE_NOTEBOOK_SQL, db.DELETE_NOTEBOOK_SQL]);
  });
});

describe('db failure handling', () => {
  it('on a failed batch: closes the handle, reopens, retries once, then succeeds silently', async () => {
    const onError = vi.fn();
    db.onDbError(onError);
    h.fail = (_sql, attempt) => attempt === 0;
    expect(await db.saveNotebook(nb('n'))).toBe(true);
    expect(h.closes).toBe(1);
    expect(h.loads).toBe(2);
    expect(executes()).toHaveLength(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it('on a second failure: surfaces the error through the hook and resolves false', async () => {
    const onError = vi.fn();
    db.onDbError(onError);
    h.fail = () => true;
    expect(await db.saveNotebook(nb('n', 'Physics'))).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/Physics/);
    expect(onError.mock.calls[0][0]).toMatch(/constraint failed/);
    expect(h.closes).toBe(2);
    // The queue keeps working after a failure.
    h.fail = null;
    expect(await db.setPreference('k', 'v')).toBe(true);
  });

  it('retries with the LATEST state when a newer save for the same key is queued', async () => {
    db.onDbError(vi.fn());
    h.fail = (_sql, attempt) => attempt === 0;
    const p1 = db.saveNotebook(nb('n', 'v1'));
    await new Promise((r) => setTimeout(r, 0)); // v1 is running
    const p2 = db.saveNotebook(nb('n', 'v2')); // queued behind it
    await Promise.all([p1, p2]);
    expect(executes().map((c) => c.args[1])).toEqual(['v1', 'v2']); // v1 failed, retry used v2
    expect(await p2).toBe(true);
  });

  it('a failing read rejects (callers decide) and resets the handle', async () => {
    const mod = await import('@tauri-apps/plugin-sql');
    const spy = vi.spyOn(mod.default.prototype, 'select').mockRejectedValueOnce(new Error('io'));
    await expect(db.listNotebooks()).rejects.toThrow('io');
    expect(h.closes).toBe(1);
    spy.mockRestore();
    await expect(db.listNotebooks()).resolves.toEqual([]);
  });
});
