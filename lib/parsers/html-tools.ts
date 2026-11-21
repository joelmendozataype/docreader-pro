/**
 * Herramientas compartidas sobre HTML (cheerio): sanitizado con lista blanca,
 * anotación de títulos para el índice y extracción de texto plano.
 * Las usan los parsers de DOCX y HTML.
 */

import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

import { normalizeText } from '@/lib/utils/text';
import type { DocumentSection } from '@/types/document';

type CheerioAPI = cheerio.CheerioAPI;

const ALLOWED_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'em',
  'strong',
  'b',
  'i',
  'u',
  's',
  'sub',
  'sup',
  'mark',
  'small',
  'a',
  'br',
  'hr',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'img',
  'figure',
  'figcaption',
  'dl',
  'dt',
  'dd',
  'section',
  'article',
  'div',
]);

/** Etiquetas que se eliminan con todo su contenido. */
const DROP_WITH_CONTENT =
  'script, style, noscript, template, iframe, frame, frameset, object, embed, applet, form, input, button, select, textarea, nav, aside, svg, canvas, video, audio, link, meta, head, title, base';

const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ['href', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan', 'scope'],
  ol: ['start'],
};

/** http(s), mailto, anclas y rutas relativas; cualquier otro esquema (javascript:, data:, vbscript:…) se descarta. */
function isSafeHref(href: string): boolean {
  // los navegadores ignoran espacios y caracteres de control dentro del esquema ("java\tscript:")
  const compact = href.replace(/[\u0000- ]/g, '');
  if (/^(https?:|mailto:)/i.test(compact)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(compact)) return false;
  return !compact.startsWith('//');
}
const SAFE_IMG = /^(https?:|data:image\/(png|jpe?g|gif|webp);base64,)/i;

export function loadHtml(html: string): CheerioAPI {
  return cheerio.load(html);
}

/**
 * Devuelve HTML limpio solo con etiquetas y atributos de la lista blanca.
 * Se aplica otra capa de DOMPurify al renderizar (Fase 5).
 */
export function sanitizeHtml($: CheerioAPI, root: cheerio.Cheerio<AnyNode>): string {
  root.find(DROP_WITH_CONTENT).remove();
  root
    .find('*')
    .addBack()
    .contents()
    .each((_, node) => {
      if (node.type === 'comment') $(node).remove();
    });

  // de los nodos más profundos hacia arriba, para poder "desenvolver" sin perder hijos
  const elements = root.find('*').toArray().reverse() as Element[];
  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    const $el = $(el);
    if (!ALLOWED_TAGS.has(tag)) {
      $el.replaceWith($el.contents());
      continue;
    }
    const allowed = ALLOWED_ATTRS[tag] ?? [];
    for (const attr of Object.keys(el.attribs ?? {})) {
      if (!allowed.includes(attr)) $el.removeAttr(attr);
    }
    if (tag === 'a') {
      const href = ($el.attr('href') ?? '').trim();
      if (!href || !isSafeHref(href)) $el.removeAttr('href');
      else if (/^https?:/i.test(href)) $el.attr({ target: '_blank', rel: 'noopener noreferrer' });
    }
    if (tag === 'img') {
      const src = ($el.attr('src') ?? '').trim();
      if (!SAFE_IMG.test(src)) $el.remove();
    }
  }

  // quita párrafos vacíos que deja Word
  root.find('p, div, span').each((_, el) => {
    const $el = $(el);
    if (!$el.text().trim() && !$el.find('img, br, hr, table').length) $el.remove();
  });

  return (root.html() ?? '').trim();
}

/**
 * Asigna ids `sec-N` a h1-h3 y devuelve el índice.
 * Si no hay títulos, promueve a h2 los párrafos cortos totalmente en negrita
 * (muy común en trabajos que no usan los estilos "Título" de Word).
 */
export function annotateHeadings(html: string): { html: string; sections: DocumentSection[] } {
  const $ = cheerio.load(html, null, false);

  if ($('h1, h2, h3').length === 0) {
    $('p').each((_, el) => {
      const $p = $(el);
      const text = $p.text().trim();
      const bold = $p.children('strong, b');
      const onlyBold = bold.length > 0 && bold.text().trim() === text;
      if (onlyBold && text.length > 1 && text.length <= 100 && !/[.,;]$/.test(text)) {
        $p.replaceWith(`<h2>${bold.html() ?? text}</h2>`);
      }
    });
  }

  const sections: DocumentSection[] = [];
  $('h1, h2, h3').each((_, el) => {
    const $h = $(el);
    const title = normalizeText($h.text()).replace(/\n/g, ' ');
    if (!title) {
      $h.remove();
      return;
    }
    const id = `sec-${sections.length + 1}`;
    $h.attr('id', id);
    sections.push({ id, title, level: Number(el.tagName.slice(1)) });
  });

  return { html: $.html().trim(), sections };
}

const BLOCK_SELECTOR =
  'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, tr, dt, dd, figcaption, caption, div, section, article, table, ul, ol';

/** Texto plano con un párrafo por bloque (para TTS y búsqueda). */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html, null, false);
  $('br').replaceWith('\n');
  $('td, th').append(' ');
  $(BLOCK_SELECTOR).each((_, el) => {
    $(el).prepend('\n\n').append('\n\n');
  });
  return normalizeText($.root().text());
}
