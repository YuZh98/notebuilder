import { tick } from 'svelte';

/** How long `.kflash` stays on — the CSS animation runs 2 × --t-slow (700ms). */
const FLASH_MS = 800;

/**
 * Scroll a card into view and flash the study ring on it. A Place from the store appends to the
 * end of a section, which is routinely below the fold: without this the only feedback for the
 * click is a card the reader never sees arrive.
 */
export async function revealCard(cardId: string, flashMs = FLASH_MS): Promise<void> {
  await tick();
  const el = document.querySelector(`.furn[data-card="${cardId}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'center' });
  el.classList.add('kflash');
  setTimeout(() => el.classList.remove('kflash'), flashMs);
}
