/**
 * Parser de Word moderno (.docx) con mammoth → HTML semántico.
 * Los metadatos (título, autor, páginas) se leen de docProps con JSZip.
 */

import JSZip from 'jszip';
import mammoth from 'mammoth';

import { cleanMetadataTitle, estimatePages, normalizeText, titleFromFileName } from '@/lib/utils/text';

import { ParseError } from './errors';
import { annotateHeadings, htmlToText, loadHtml, sanitizeHtml } from './html-tools';
import {
  assertHasText,
  type DocumentContent,
  type ParseOptions,
  throwIfAborted,
  toArrayBuffer,
} from './types';

/** Estilos de Word en español e inglés → títulos HTML. */
const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Título'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Subtítulo'] => h2:fresh",
  "p[style-name='Título 1'] => h1:fresh",
  "p[style-name='Título 2'] => h2:fresh",
  "p[style-name='Título 3'] => h3:fresh",
  "p[style-name='Título 4'] => h4:fresh",
  "p[style-name='Titulo 1'] => h1:fresh",
  "p[style-name='Titulo 2'] => h2:fresh",
  "p[style-name='Titulo 3'] => h3:fresh",
  "p[style-name='Quote'] => blockquote:fresh",
  "p[style-name='Cita'] => blockquote:fresh",
];

export async function parseDocx(
  data: ArrayBuffer | Uint8Array,
  fileName: string,
  options: ParseOptions = {},
): Promise<DocumentContent> {
  throwIfAborted(options.signal);
  const arrayBuffer = toArrayBuffer(data);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch (error) {
    throw new ParseError('CORRUPT_FILE', { cause: error });
  }
  if (!zip.file('word/document.xml')) throw new ParseError('CORRUPT_FILE');
  options.onProgress?.(0.2);

  let rawHtml: string;
  try {
    // la build de Node de mammoth lee `buffer` y la del navegador `arrayBuffer`; ambas aceptan un ArrayBuffer
    const input = { arrayBuffer, buffer: arrayBuffer } as { arrayBuffer: ArrayBuffer };
    const result = await mammoth.convertToHtml(input, { styleMap: STYLE_MAP, includeDefaultStyleMap: true });
    rawHtml = result.value;
  } catch (error) {
    throw new ParseError('CORRUPT_FILE', { cause: error });
  }
  throwIfAborted(options.signal);
  options.onProgress?.(0.8);

  const $ = loadHtml(`<body>${rawHtml}</body>`);
  const { html, sections } = annotateHeadings(sanitizeHtml($, $('body')));
  const text = htmlToText(html);
  const meta = await readDocxMetadata(zip);

  const content: DocumentContent = {
    html,
    text,
    sections,
    title: meta.title ?? sections[0]?.title ?? titleFromFileName(fileName),
    author: meta.author,
    pages: meta.pages ?? estimatePages(text),
  };
  assertHasText(content);
  options.onProgress?.(1);
  return content;
}

async function readDocxMetadata(zip: JSZip): Promise<{ title?: string; author?: string; pages?: number }> {
  const core = (await zip.file('docProps/core.xml')?.async('string')) ?? '';
  const app = (await zip.file('docProps/app.xml')?.async('string')) ?? '';
  const tag = (xml: string, name: string) => {
    const match = new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(xml);
    return match ? decodeXml(normalizeText(match[1])) : undefined;
  };
  const pages = Number(tag(app, 'Pages'));
  return {
    title: cleanMetadataTitle(tag(core, 'title')),
    author: cleanMetadataTitle(tag(core, 'creator')),
    pages: Number.isFinite(pages) && pages > 0 ? pages : undefined,
  };
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
