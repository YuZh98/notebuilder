/** Shared DOM scaffolding for jsdom tests. Not a test file — no tests live here. */

/** jsdom has no PointerEvent; listeners key off the type string, so a MouseEvent stand-in works. */
export function pev(type: string, x = 0, y = 0, init: MouseEventInit = {}): PointerEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, ...init }) as PointerEvent;
}

/** jsdom has no layout: rect-dependent gesture math reads getBoundingClientRect, stubbed here. */
export function stubRect(el: Element, r: { left?: number; top?: number; width?: number; height?: number }) {
  const left = r.left ?? 0;
  const top = r.top ?? 0;
  const width = r.width ?? 0;
  const height = r.height ?? 0;
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
}
