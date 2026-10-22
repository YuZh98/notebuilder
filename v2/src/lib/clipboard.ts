/**
 * Copy text to the clipboard: the async Clipboard API when the webview offers it, else the
 * hidden-textarea + execCommand('copy') fallback. Resolves false when neither works, so the
 * caller can show the text for a manual copy instead.
 *
 * Imports nothing: the app and the exported Reader both copy with it (reader-boundary.test.ts).
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // permission denied / not focused — try the legacy path
  }
  let ta: HTMLTextAreaElement | null = null;
  try {
    ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    return typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta?.remove();
  }
}
