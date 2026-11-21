/**
 * Lanza el parseo en un Web Worker y devuelve una promesa.
 * Si el worker no puede arrancar, la promesa se rechaza con WorkerUnavailableError
 * para que quien llama procese el archivo en el hilo principal.
 */

import type { ParsedDocument } from '@/types/document';

import { ParseError, type ParseErrorCode } from './errors';
import type { ParseOptions } from './types';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

export class WorkerUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('No se pudo iniciar el procesamiento en segundo plano.', { cause });
    this.name = 'WorkerUnavailableError';
  }
}

export function canUseWorker(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

const KNOWN_CODES = new Set<ParseErrorCode>([
  'UNSUPPORTED_FORMAT',
  'EMPTY_FILE',
  'CORRUPT_FILE',
  'PDF_ENCRYPTED',
  'PDF_NO_TEXT',
  'NEEDS_SERVER',
  'ABORTED',
]);

/** Crea el worker (separado para poder sustituirlo en tests). */
export function createParseWorker(): Worker {
  return new Worker(new URL('./parse.worker.ts', import.meta.url), {
    type: 'module',
    name: 'docreader-parser',
  });
}

export function parseInWorker(
  request: WorkerRequest,
  { onProgress, signal }: ParseOptions = {},
  factory: () => Worker = createParseWorker,
): Promise<ParsedDocument> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ParseError('ABORTED'));

    let worker: Worker;
    try {
      worker = factory();
    } catch (error) {
      return reject(new WorkerUnavailableError(error));
    }

    let started = false;
    const finish = () => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate(); // libera la memoria del worker en cuanto termina
    };
    const onAbort = () => {
      finish();
      reject(new ParseError('ABORTED'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      started = true;
      const message = event.data;
      if (message.type === 'progress') {
        onProgress?.(message.fraction);
      } else if (message.type === 'done') {
        finish();
        resolve(message.doc);
      } else {
        finish();
        const code = KNOWN_CODES.has(message.code as ParseErrorCode)
          ? (message.code as ParseErrorCode)
          : null;
        reject(code ? new ParseError(code, { message: message.message }) : new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      finish();
      // un error antes de cualquier mensaje = el worker no pudo cargarse
      reject(
        started ? new Error(event.message || 'Error en el procesamiento') : new WorkerUnavailableError(event),
      );
    };

    // se transfiere el ArrayBuffer (sin copiarlo): el hilo principal ya no lo necesita
    worker.postMessage(request, [request.data]);
  });
}
