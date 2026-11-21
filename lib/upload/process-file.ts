/**
 * Convierte un File en ParsedDocument eligiendo dónde procesarlo:
 *  - PDF, DOCX y HTML → en el navegador (sin límite de tamaño de servidor)
 *  - DOC (Word 97-2003) → se sube a /api/upload
 */

import type { ApiErrorCode, ApiResponse } from '@/lib/api/types';
import { extensionOf, isParseError, parseDocument } from '@/lib/parsers';
import { ACCEPTED_EXTENSIONS, type ParsedDocument } from '@/types/document';

export type ProcessStage = 'reading' | 'parsing' | 'uploading' | 'server';

export interface ProcessOptions {
  /** progreso global 0..1 y etapa actual */
  onProgress?: (fraction: number, stage: ProcessStage) => void;
  signal?: AbortSignal;
}

const RETRYABLE: ApiErrorCode[] = ['INTERNAL_ERROR', 'RATE_LIMITED', 'ABORTED'];

/** Error para mostrar al usuario, con indicación de si tiene sentido reintentar. */
export class ProcessError extends Error {
  readonly code: ApiErrorCode | 'NETWORK_ERROR';
  readonly retryable: boolean;

  constructor(code: ApiErrorCode | 'NETWORK_ERROR', message: string) {
    super(message);
    this.name = 'ProcessError';
    this.code = code;
    this.retryable = code === 'NETWORK_ERROR' || RETRYABLE.includes(code as ApiErrorCode);
  }
}

export function isAcceptedFileName(name: string): boolean {
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(`.${extensionOf(name)}`);
}

export async function processFile(file: File, options: ProcessOptions = {}): Promise<ParsedDocument> {
  const { onProgress, signal } = options;
  if (signal?.aborted) throw new ProcessError('ABORTED', 'Se canceló el procesamiento.');

  onProgress?.(0.02, 'reading');
  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    throw new ProcessError('CORRUPT_FILE', 'No se pudo leer el archivo desde el disco.');
  }
  onProgress?.(0.1, 'parsing');

  try {
    return await parseDocument(
      { name: file.name, mimeType: file.type, data },
      { signal, onProgress: (p) => onProgress?.(0.1 + p * 0.85, 'parsing') },
    );
  } catch (error) {
    if (isParseError(error) && error.code === 'NEEDS_SERVER') {
      return uploadToServer(file, options);
    }
    if (isParseError(error)) throw new ProcessError(error.code, error.message);
    if (signal?.aborted) throw new ProcessError('ABORTED', 'Se canceló el procesamiento.');
    console.error('[processFile]', error);
    throw new ProcessError('INTERNAL_ERROR', 'Ocurrió un error inesperado al procesar el documento.');
  }
}

/** Sube el archivo con XMLHttpRequest para poder mostrar el progreso de subida. */
export function uploadToServer(
  file: File,
  { onProgress, signal }: ProcessOptions = {},
): Promise<ParsedDocument> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file, file.name);

    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const cleanup = () => signal?.removeEventListener('abort', onAbort);

    xhr.open('POST', '/api/upload');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(0.1 + (event.loaded / event.total) * 0.6, 'uploading');
    };
    xhr.upload.onload = () => onProgress?.(0.75, 'server');
    xhr.onload = () => {
      cleanup();
      const body = xhr.response as ApiResponse<ParsedDocument> | null;
      if (body?.ok) {
        onProgress?.(0.98, 'server');
        resolve(body.data);
      } else if (body && !body.ok) {
        reject(new ProcessError(body.error.code, body.error.message));
      } else {
        reject(new ProcessError('INTERNAL_ERROR', `El servidor respondió con un error (${xhr.status}).`));
      }
    };
    xhr.onerror = () => {
      cleanup();
      reject(
        new ProcessError(
          'NETWORK_ERROR',
          'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.',
        ),
      );
    };
    xhr.onabort = () => {
      cleanup();
      reject(new ProcessError('ABORTED', 'Se canceló la subida.'));
    };
    xhr.send(form);
  });
}
