/**
 * Parser de HTML con cheerio: detecta la codificación, se queda con el
 * contenido principal (article/main/body) y sanitiza con lista blanca.
 */

import { cleanMetadataTitle, estimatePages, normalizeText, titleFromFileName } from '@/lib/utils/text';

import { annotateHeadings, htmlToText, loadHtml, sanitizeHtml } from './html-tools';
import {
  assertHasText,
  type DocumentContent,
  type ParseOptions,
  throwIfAborted,
  toUint8Array,
} from './types';

/**
 * Decodifica bytes de HTML respetando BOM y <meta charset>.
 * Si no es UTF-8 válido, usa windows-1252 (habitual en páginas antiguas en español).
 */
export function decodeHtmlBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return new TextDecoder('utf-8').decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);

  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  const declared = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(head)?.[1]?.toLowerCase();

  if (declared && declared !== 'utf-8' && declared !== 'utf8') {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      // etiqueta desconocida: se sigue con la detección automática
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export async function parseHtml(
  data: ArrayBuffer | Uint8Array | string,
  fileName: string,
  options: ParseOptions = {},
): Promise<DocumentContent> {
  throwIfAborted(options.signal);
  const source = typeof data === 'string' ? data : decodeHtmlBytes(toUint8Array(data));
  const $ = loadHtml(source);

  const metaTitle = cleanMetadataTitle(
    $('meta[property="og:title"]').attr('content') ?? $('title').first().text(),
  );
  const author = cleanMetadataTitle(
    $('meta[name="author"]').attr('content') ?? $('meta[property="article:author"]').attr('content'),
  );

  const main = $('article').first().length
    ? $('article').first()
    : $('main').first().length
      ? $('main').first()
      : $('body');
  // en el cuerpo completo, cabeceras y pies de sitio suelen ser ruido
  if (main.is('body')) main.children('header, footer').remove();

  const { html, sections } = annotateHeadings(sanitizeHtml($, main));
  const text = htmlToText(html);

  const content: DocumentContent = {
    html,
    text,
    sections,
    title: metaTitle ?? sections[0]?.title ?? titleFromFileName(fileName),
    author: author ? normalizeText(author) : undefined,
    pages: estimatePages(text),
  };
  assertHasText(content);
  options.onProgress?.(1);
  return content;
}
