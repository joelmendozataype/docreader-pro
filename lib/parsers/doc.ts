/**
 * Parser de Word 97-2003 (.doc) con word-extractor.
 * SOLO SERVIDOR: word-extractor usa fs/stream/Buffer de Node.
 * Extrae texto plano; los títulos se detectan con heurísticas.
 */

import WordExtractor from 'word-extractor';

import { estimatePages, normalizeText, textToHtml, titleFromFileName } from '@/lib/utils/text';

import { ParseError } from './errors';
import {
  assertHasText,
  type DocumentContent,
  type ParseOptions,
  throwIfAborted,
  toUint8Array,
} from './types';

export async function parseDoc(
  data: ArrayBuffer | Uint8Array,
  fileName: string,
  options: ParseOptions = {},
): Promise<DocumentContent> {
  throwIfAborted(options.signal);
  const bytes = toUint8Array(data);

  let body: string;
  try {
    const doc = await new WordExtractor().extract(
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    );
    body = doc.getBody();
  } catch (error) {
    throw new ParseError('CORRUPT_FILE', { cause: error });
  }

  // en .doc cada salto de línea es un párrafo: se separan con línea en blanco como en los demás formatos
  const text = normalizeText(body).replace(/\n+/g, '\n\n');
  const { html, sections } = textToHtml(text, { lineIsParagraph: true });

  const content: DocumentContent = {
    html,
    text,
    sections,
    title: sections[0]?.title ?? firstLine(text) ?? titleFromFileName(fileName),
    pages: estimatePages(text),
  };
  assertHasText(content);
  options.onProgress?.(1);
  return content;
}

function firstLine(text: string): string | undefined {
  const line = text
    .split('\n')
    .find((l) => l.trim().length > 0)
    ?.trim();
  return line && line.length <= 100 ? line : undefined;
}
