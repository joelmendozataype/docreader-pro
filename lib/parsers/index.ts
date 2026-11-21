/**
 * Factory de parsers ISOMÓRFICA (navegador y servidor): PDF, DOCX y HTML.
 * Cada parser se carga con import dinámico para no inflar el bundle inicial.
 *
 * Los .doc lanzan ParseError('NEEDS_SERVER'): usa `parseDocumentOnServer`
 * de `@/lib/parsers/server` (lo hará /api/upload en la Fase 3).
 */

import { createId } from '@/lib/utils/text';
import type { DocumentFileType, ParsedDocument } from '@/types/document';

import { detectFileType } from './detect';
import { ParseError } from './errors';
import type { DocumentContent, ParseOptions, ParserInput } from './types';
import { toUint8Array } from './types';

export { detectFileType, extensionOf } from './detect';
export { isParseError, ParseError, type ParseErrorCode } from './errors';
export type { ParseOptions, ParserInput } from './types';

export type ContentParser = (
  data: Uint8Array,
  fileName: string,
  options: ParseOptions,
) => Promise<DocumentContent>;

export const clientParsers: Partial<Record<DocumentFileType, () => Promise<ContentParser>>> = {
  pdf: () => import('./pdf').then((m) => m.parsePdf),
  docx: () => import('./docx').then((m) => m.parseDocx),
  html: () => import('./html').then((m) => m.parseHtml),
};

/** Detecta el formato o lanza UNSUPPORTED_FORMAT / EMPTY_FILE. */
export function resolveFileType(input: ParserInput): { bytes: Uint8Array; fileType: DocumentFileType } {
  const bytes = toUint8Array(input.data);
  if (bytes.byteLength === 0) throw new ParseError('EMPTY_FILE');
  const fileType = detectFileType(bytes, input.name, input.mimeType);
  if (!fileType) throw new ParseError('UNSUPPORTED_FORMAT');
  return { bytes, fileType };
}

export async function runParser(
  input: ParserInput,
  parsers: Partial<Record<DocumentFileType, () => Promise<ContentParser>>>,
  options: ParseOptions = {},
): Promise<ParsedDocument> {
  const { bytes, fileType } = resolveFileType(input);
  const load = parsers[fileType];
  if (!load) throw new ParseError(fileType === 'doc' ? 'NEEDS_SERVER' : 'UNSUPPORTED_FORMAT');

  const parse = await load();
  const content = await parse(bytes, input.name, options);

  return {
    id: createId(),
    fileName: input.name,
    fileType,
    size: bytes.byteLength,
    createdAt: Date.now(),
    ...content,
  };
}

/** Parsea un documento en el navegador (o en Node) a ParsedDocument. */
export function parseDocument(input: ParserInput, options?: ParseOptions): Promise<ParsedDocument> {
  return runParser(input, clientParsers, options);
}

/** Atajo para File del navegador. */
export async function parseFile(file: File, options?: ParseOptions): Promise<ParsedDocument> {
  return parseDocument({ name: file.name, mimeType: file.type, data: await file.arrayBuffer() }, options);
}
