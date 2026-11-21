/**
 * Segunda capa de sanitizado (la primera la aplican los parsers con cheerio).
 * DOMPurify trabaja sobre el DOM real del navegador justo antes de renderizar:
 * protege incluso si un documento guardado en IndexedDB fue manipulado.
 */

import DOMPurify, { type Config } from 'dompurify';

const CONFIG: Config = {
  ALLOWED_TAGS:
    'p h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code em strong b i u s sub sup mark small a br hr table thead tbody tfoot tr th td caption img figure figcaption dl dt dd section article div span'.split(
      ' ',
    ),
  ALLOWED_ATTR: 'href title src alt width height colspan rowspan scope start id'.split(' '),
  // Ojo: no se usa ALLOWED_URI_REGEXP porque DOMPurify también lo aplica al valor
  // de atributos normales (colspan="2", title…). href/src se filtran en el hook.
  ALLOW_DATA_ATTR: false,
};

const SAFE_HREF = /^(?:https?:|mailto:|#)/i;
const SAFE_SRC = /^(?:https?:|data:image\/(?:png|jpe?g|gif|webp);base64,)/i;

let hooked = false;

function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const href = node.getAttribute('href');
    if (href !== null && !SAFE_HREF.test(href.trim())) node.removeAttribute('href');
    const src = node.getAttribute('src');
    if (src !== null && !SAFE_SRC.test(src.trim())) node.removeAttribute('src');
    // los enlaces externos se abren en otra pestaña y sin acceso a window.opener
    if (node.tagName === 'A' && /^https?:/i.test(node.getAttribute('href') ?? '')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

export function sanitizeForReader(html: string): string {
  if (!DOMPurify.isSupported) return '';
  ensureHooks();
  return DOMPurify.sanitize(html, CONFIG) as string;
}
