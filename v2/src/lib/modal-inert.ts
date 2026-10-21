/**
 * Take the surface behind a modal overlay out of the focus order. The shortcut overlay already
 * swallows keys and pointer events, but neither stops Tab: with it open you could still tab to the
 * Factory button behind it and press Enter, and the place switched under the overlay.
 *
 * The shell's regions are the siblings of `#main` — top bar, its collapse bump, the stage, the
 * sidebar bump, the drag chrome — so that is the list, minus anything that is itself a modal.
 */
export function setAppInert(on: boolean, doc: Document = document): void {
  const root = doc.querySelector('#main')?.parentElement;
  if (!root) return;
  for (const el of root.children) {
    if (!el.classList.contains('modal')) el.toggleAttribute('inert', on);
  }
}
