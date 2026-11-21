/**
 * Bloques legibles del lector y mapeo texto hablado → nodos del DOM.
 * Permite resaltar la palabra exacta que se está leyendo sin modificar el HTML.
 */

export const BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, figcaption, caption, th, td, dt, dd';

/** Bloques en orden de lectura. Un bloque que contiene otros (li > p) solo aporta su texto propio. */
export function getReadableBlocks(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).filter(
    (el) => blockText(el).text.trim().length > 0,
  );
}

export interface BlockText {
  /** texto con espacios colapsados, tal como se envía a la voz */
  text: string;
  /** para cada carácter de `text`: nodo de texto y posición dentro de él */
  map: { node: Text; offset: number }[];
}

const cache = new WeakMap<HTMLElement, BlockText>();

/** Texto del bloque sin incluir bloques anidados, con el mapa de posiciones. */
export function blockText(block: HTMLElement): BlockText {
  const cached = cache.get(block);
  if (cached) return cached;

  let text = '';
  const map: BlockText['map'] = [];
  let pendingSpace = false;

  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (
        node !== block &&
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).matches(BLOCK_SELECTOR)
      ) {
        return NodeFilter.FILTER_REJECT; // lo lee su propio bloque
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as Element).tagName === 'BR') pendingSpace = text.length > 0;
      continue;
    }
    const textNode = node as Text;
    const data = textNode.data;
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      if (/\s/.test(ch)) {
        pendingSpace = text.length > 0;
        continue;
      }
      if (pendingSpace) {
        text += ' ';
        map.push({ node: textNode, offset: i });
        pendingSpace = false;
      }
      text += ch;
      map.push({ node: textNode, offset: i });
    }
  }

  const result = { text, map };
  cache.set(block, result);
  return result;
}

/** Rango del DOM que cubre [start, end) del texto hablado del bloque. */
export function rangeFor(block: HTMLElement, start: number, end: number): Range | null {
  const { map } = blockText(block);
  if (!map.length || start >= map.length) return null;
  const from = map[Math.max(0, start)];
  const to = map[Math.min(map.length - 1, Math.max(start, end - 1))];
  const range = block.ownerDocument.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset + 1);
  return range;
}
