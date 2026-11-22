/**
 * Voz integrada: alternativa a speechSynthesis para dispositivos donde la voz
 * del navegador no funciona (p. ej. algunos Android, donde el navegador no logra
 * hablar con el motor de voz del sistema).
 *
 * Usa Piper (voz neuronal de código abierto) en un Web Worker. La voz se descarga
 * una sola vez (~60 MB) desde Hugging Face y queda guardada en el navegador.
 */

import type { NeuralRequest, NeuralResponse } from './neural-protocol';

/** Voz en español latinoamericano, calidad media (~60 MB): mucho más rápida que «high». */
export const NEURAL_VOICE_ID = 'es_MX-ald-medium';
export const NEURAL_VOICE_SIZE_MB = 60;
export const NEURAL_VOICE_LABEL = 'Voz integrada (español latinoamericano)';

type Request = NeuralRequest extends infer R
  ? R extends { id: number }
    ? Omit<R, 'id' | 'voiceId'>
    : never
  : never;

export interface NeuralEngine {
  isDownloaded(): Promise<boolean>;
  /** precarga el modelo en memoria (si está descargado) para que la primera frase salga antes */
  warmup(): Promise<void>;
  download(onProgress?: (fraction: number) => void): Promise<void>;
  synthesize(text: string): Promise<Blob>;
  remove(): Promise<void>;
  dispose(): void;
}

/** ¿Puede este navegador usar la voz integrada? (Web Workers + almacenamiento OPFS) */
export function isNeuralSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function'
  );
}

export function createNeuralWorker(): Worker {
  return new Worker(new URL('./neural.worker.ts', import.meta.url), {
    type: 'module',
    name: 'docreader-voz',
  });
}

let shared: NeuralEngine | null = null;

/** Motor compartido por toda la app: el modelo se carga una vez y sobrevive al cambiar de documento. */
export function getSharedNeuralEngine(): NeuralEngine {
  shared ??= createNeuralEngine();
  return shared;
}

/** Cliente del worker de voz: cada petición tiene un id y se resuelve con su respuesta. */
export function createNeuralEngine(factory: () => Worker = createNeuralWorker): NeuralEngine {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (r: NeuralResponse) => void; reject: (e: Error) => void; onProgress?: (f: number) => void }
  >();

  function getWorker() {
    if (worker) return worker;
    worker = factory();
    worker.onmessage = (event: MessageEvent<NeuralResponse>) => {
      const msg = event.data;
      const entry = pending.get(msg.id);
      if (!entry) return;
      if (msg.type === 'progress') {
        entry.onProgress?.(msg.total ? msg.loaded / msg.total : 0);
        return;
      }
      pending.delete(msg.id);
      if (msg.type === 'error') entry.reject(new Error(msg.message));
      else entry.resolve(msg);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || 'No se pudo iniciar la voz integrada.');
      pending.forEach((p) => p.reject(error));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  }

  function send(request: Request, onProgress?: (f: number) => void): Promise<NeuralResponse> {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject, onProgress });
      getWorker().postMessage({ ...request, id, voiceId: NEURAL_VOICE_ID } as NeuralRequest);
    });
  }

  return {
    async warmup() {
      await send({ type: 'warmup' });
    },
    async isDownloaded() {
      const res = await send({ type: 'status' });
      return res.type === 'status' && res.downloaded;
    },
    async download(onProgress) {
      await send({ type: 'download' }, onProgress);
    },
    async synthesize(text) {
      const res = await send({ type: 'speak', text });
      if (res.type !== 'audio') throw new Error('La voz integrada no devolvió audio.');
      return res.audio;
    },
    async remove() {
      await send({ type: 'remove' });
    },
    dispose() {
      pending.forEach((p) => p.reject(new Error('Voz integrada cerrada.')));
      pending.clear();
      worker?.terminate();
      worker = null;
    },
  };
}
