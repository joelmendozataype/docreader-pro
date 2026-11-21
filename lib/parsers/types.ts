import type { DocumentFileType, ParsedDocument } from '@/types/document';

import { ParseError } from './errors';

/** Archivo de entrada, independiente de File (navegador) o Buffer (Node). */
export interface ParserInput {
  name: string;
  data: ArrayBuffer | Uint8Array;
  mimeType?: string;
}

export interface ParseOptions {
  /** progreso 0..1 (los PDF lo reportan por página) */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export type DocumentContent = Pick<
  ParsedDocument,
  'title' | 'author' | 'pages' | 'text' | 'html' | 'sections'
>;

export function toUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/** ArrayBuffer exacto (sin bytes de más si el Uint8Array es una vista parcial). */
export function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (!(data instanceof Uint8Array)) return data;
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new ParseError('ABORTED');
}

export function assertHasText(content: DocumentContent) {
  if (!content.text.trim()) throw new ParseError('EMPTY_FILE');
}

export type { DocumentFileType, ParsedDocument };
