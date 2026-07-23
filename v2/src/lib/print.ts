import { isTauri } from './db';

/**
 * Trigger the platform print dialog.
 * Desktop (Tauri): invokes the native print_page command (WKWebView print sheet).
 * Browser: falls back to window.print().
 */
export async function printPage(): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('print_page');
  } else {
    window.print();
  }
}
