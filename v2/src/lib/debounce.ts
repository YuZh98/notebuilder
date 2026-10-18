/** A trailing-debounced function plus controls over its one pending call. */
export type Debounced<A extends unknown[], R> = ((...args: A) => void) & {
  /** Run the pending call now (latest args) and return its result; undefined when nothing is pending. */
  flush(): R | undefined;
  /** Drop the pending call without running it. */
  cancel(): void;
  /** True while a call is scheduled and has not yet run. */
  pending(): boolean;
};

/** Trailing debounce: calls `fn` once `wait` ms after the last invocation, with the latest args. */
export function debounce<A extends unknown[], R = void>(fn: (...args: A) => R, wait: number): Debounced<A, R> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: A | undefined;

  // Consume the pending call before invoking fn, so a flush() from inside fn is a no-op.
  const run = (): R => {
    timer = undefined;
    const args = lastArgs as A;
    lastArgs = undefined;
    return fn(...args);
  };

  const debounced = ((...args: A) => {
    lastArgs = args;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(run, wait);
  }) as Debounced<A, R>;

  debounced.flush = () => {
    if (timer === undefined) return undefined;
    clearTimeout(timer);
    return run();
  };

  debounced.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    lastArgs = undefined;
  };

  debounced.pending = () => timer !== undefined;

  return debounced;
}
