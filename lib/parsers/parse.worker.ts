/// <reference lib="webworker" />
/**
 * Web Worker de parseo: procesa DOCX y HTML fuera del hilo principal para
 * que la interfaz no se congele con documentos grandes.
 */

import { parseDocument } from './index';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;

function reply(message: WorkerResponse) {
  scope.postMessage(message);
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { name, mimeType, data } = event.data;
  try {
    const doc = await parseDocument(
      { name, mimeType, data },
      { onProgress: (fraction) => reply({ type: 'progress', fraction }) },
    );
    reply({ type: 'done', doc });
  } catch (error) {
    const err = error as { code?: string; message?: string };
    reply({ type: 'error', code: err.code ?? 'INTERNAL', message: err.message ?? String(error) });
  }
};
