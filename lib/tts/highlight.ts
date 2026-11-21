/**
 * Resaltado sin tocar el DOM del documento:
 *  - bloque actual → clase CSS `tts-active`
 *  - frase y palabra actuales → CSS Custom Highlight API (si el navegador la tiene)
 */

export const BLOCK_CLASS = 'tts-active';
export const SENTENCE_HIGHLIGHT = 'tts-sentence';
export const WORD_HIGHLIGHT = 'tts-word';

type HighlightRegistry = Map<string, unknown>;

function registry(): HighlightRegistry | null {
  if (typeof CSS === 'undefined' || typeof Highlight === 'undefined') return null;
  return (CSS as unknown as { highlights?: HighlightRegistry }).highlights ?? null;
}

export function supportsRangeHighlight(): boolean {
  return registry() !== null;
}

/**
 * Estilos de ::highlight() inyectados en tiempo de ejecución: el parser de CSS
 * de Turbopack (Lightning CSS) rechaza ese pseudo-elemento en globals.css.
 */
const HIGHLIGHT_CSS = `
::highlight(${SENTENCE_HIGHLIGHT}) { background-color: color-mix(in oklch, var(--primary) 12%, transparent); }
::highlight(${WORD_HIGHLIGHT}) { background-color: color-mix(in oklch, var(--primary) 32%, transparent); color: var(--foreground); }
`;

function ensureHighlightStyles() {
  if (typeof document === 'undefined' || document.getElementById('tts-highlight-styles')) return;
  const style = document.createElement('style');
  style.id = 'tts-highlight-styles';
  style.textContent = HIGHLIGHT_CSS;
  document.head.appendChild(style);
}

export function setRangeHighlight(name: string, range: Range | null) {
  const reg = registry();
  if (!reg) return;
  ensureHighlightStyles();
  if (range) reg.set(name, new Highlight(range));
  else reg.delete(name);
}

export function clearAllHighlights(root?: ParentNode | null) {
  setRangeHighlight(SENTENCE_HIGHLIGHT, null);
  setRangeHighlight(WORD_HIGHLIGHT, null);
  root?.querySelectorAll(`.${BLOCK_CLASS}`).forEach((el) => el.classList.remove(BLOCK_CLASS));
}
