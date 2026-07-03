function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Simple markdown rendering — bold, italic, code, interpolation. Escapes template and every scope value. */
export function renderMarkdown(text: string, scope: Record<string, unknown>): string {
  return escapeHtml(text)
    .replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = scope[key];
      return val !== undefined ? escapeHtml(String(val)) : `{{${key}}}`;
    })
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}
