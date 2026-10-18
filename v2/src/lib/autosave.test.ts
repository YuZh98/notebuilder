import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutosave, HYDRATION_FAILED_MESSAGE, withTimeout } from './autosave';

describe('autosave — hydration guard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('persists nothing before hydration succeeded', async () => {
    const a = createAutosave({ wait: 100 });
    const save = vi.fn();
    const ch = a.channel('notebook', save);
    ch.schedule('demo');
    vi.advanceTimersByTime(1000);
    await ch.saveNow('demo-now');
    await ch.flush();
    await a.flushAll();
    expect(save).not.toHaveBeenCalled();
    expect(a.active).toBe(false);
  });

  it('a value scheduled before hydration is not replayed once hydrated', async () => {
    const a = createAutosave({ wait: 100 });
    const save = vi.fn();
    const ch = a.channel('reader', save);
    ch.schedule({ empty: true });
    a.markHydrated();
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
    ch.schedule({ loaded: true });
    vi.advanceTimersByTime(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ loaded: true });
  });

  it('hydrate() turns persistence on only when the load resolves', async () => {
    const a = createAutosave({ wait: 100 });
    const save = vi.fn();
    const ch = a.channel('factory', save);
    const ok = await a.hydrate(async () => {
      ch.schedule('during-hydration');
    });
    expect(ok).toBe(true);
    expect(a.active).toBe(true);
    vi.advanceTimersByTime(200);
    expect(save).not.toHaveBeenCalled();
    ch.schedule('after');
    vi.advanceTimersByTime(100);
    expect(save).toHaveBeenCalledWith('after');
  });

  it('a throwing hydration keeps persistence OFF and reports that changes will not be saved', async () => {
    const onError = vi.fn();
    const a = createAutosave({ wait: 100, onError });
    const save = vi.fn();
    const ch = a.channel('notebook', save);
    const ok = await a.hydrate(async () => {
      throw new Error('disk on fire');
    });
    expect(ok).toBe(false);
    expect(a.active).toBe(false);
    expect(a.failed).toBe(true);
    expect(onError).toHaveBeenCalledWith(HYDRATION_FAILED_MESSAGE, expect.any(Error));
    expect(HYDRATION_FAILED_MESSAGE).toMatch(/won.t be saved/);
    ch.schedule('edit');
    vi.advanceTimersByTime(1000);
    await ch.saveNow('edit');
    expect(save).not.toHaveBeenCalled();
    // A failed hydration is sticky: a stray markHydrated() cannot switch persistence back on.
    a.markHydrated();
    expect(a.active).toBe(false);
  });
});

describe('autosave — channels', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function hydrated(onError = vi.fn()) {
    const a = createAutosave({ wait: 100, onError });
    a.markHydrated();
    return a;
  }

  it('schedule debounces per channel with the latest value', () => {
    const a = hydrated();
    const nb = vi.fn();
    const rs = vi.fn();
    const chNb = a.channel('notebook', nb);
    const chRs = a.channel('reader', rs);
    chNb.schedule(1);
    chNb.schedule(2);
    chRs.schedule('r');
    vi.advanceTimersByTime(100);
    expect(nb).toHaveBeenCalledTimes(1);
    expect(nb).toHaveBeenCalledWith(2);
    expect(rs).toHaveBeenCalledWith('r');
  });

  it('flush runs the pending save now and resolves after it completes', async () => {
    const a = hydrated();
    let done = false;
    const ch = a.channel('notebook', async () => {
      await Promise.resolve();
      done = true;
    });
    ch.schedule('x');
    await ch.flush();
    expect(done).toBe(true);
  });

  it('cancel drops the pending save', () => {
    const a = hydrated();
    const save = vi.fn();
    const ch = a.channel('notebook', save);
    ch.schedule('x');
    ch.cancel();
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
  });

  it('saveNow supersedes a pending scheduled value (no stale write afterwards)', async () => {
    const a = hydrated();
    const save = vi.fn();
    const ch = a.channel('notebook', save);
    ch.schedule('old');
    await ch.saveNow('current');
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('current');
  });

  it('flushAll flushes every channel and waits for in-flight saves', async () => {
    const a = hydrated();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = a.channel('slow', async (v: string) => {
      await gate;
      order.push(v);
    });
    const fast = a.channel('fast', (v: string) => {
      order.push(v);
    });
    slow.schedule('slow');
    vi.advanceTimersByTime(100); // slow save starts and blocks on the gate
    fast.schedule('fast');
    const all = a.flushAll();
    let settled = false;
    void all.then(() => (settled = true));
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await all;
    expect(order.sort()).toEqual(['fast', 'slow']);
  });

  it('skips a save identical to what storage already holds (prime / last saved)', async () => {
    const a = hydrated();
    const save = vi.fn();
    const ch = a.channel('notebook', save);
    ch.prime({ id: 'nb', v: 1 });
    await ch.saveNow({ id: 'nb', v: 1 });
    expect(save).not.toHaveBeenCalled();
    await ch.saveNow({ id: 'nb', v: 2 });
    await ch.saveNow({ id: 'nb', v: 2 });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('a failed save (false or rejection) is retried by the next identical save', async () => {
    const onError = vi.fn();
    const a = hydrated(onError);
    const save = vi
      .fn<(v: string) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(true);
    const ch = a.channel('notebook', save);
    await ch.saveNow('x');
    await ch.saveNow('x');
    expect(onError).toHaveBeenCalledTimes(1); // the rejection is surfaced, never swallowed
    await ch.saveNow('x');
    await ch.saveNow('x');
    expect(save).toHaveBeenCalledTimes(3);
  });

  it('uses a custom fingerprint when given', async () => {
    const a = hydrated();
    const save = vi.fn();
    const ch = a.channel('nb', save, { fingerprint: (v: { id: string; at: number }) => v.id });
    await ch.saveNow({ id: 'a', at: 1 });
    await ch.saveNow({ id: 'a', at: 2 });
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(5), 100)).resolves.toBe(5);
  });

  it('resolves undefined after the timeout when the promise hangs', async () => {
    const p = withTimeout(new Promise(() => {}), 100);
    vi.advanceTimersByTime(100);
    await expect(p).resolves.toBeUndefined();
  });

  it('never rejects, even when the promise does', async () => {
    await expect(withTimeout(Promise.reject(new Error('x')), 100)).resolves.toBeUndefined();
  });
});
