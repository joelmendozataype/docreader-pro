/// <reference lib="webworker" />
/**
 * Web Worker de la voz integrada (Piper, con ONNX Runtime en WebAssembly).
 * Genera el audio fuera del hilo principal para que la lectura no congele la página.
 * El modelo se descarga una vez y queda guardado en OPFS (almacenamiento privado del sitio).
 */

import { download, remove, stored, TtsSession } from '@mintplex-labs/piper-tts-web';

import type { NeuralRequest, NeuralResponse } from './neural-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let session: TtsSession | null = null;
let sessionVoice = '';

function reply(message: NeuralResponse) {
  scope.postMessage(message);
}

async function getSession(voiceId: string) {
  if (!session || sessionVoice !== voiceId) {
    session = await TtsSession.create({ voiceId });
    sessionVoice = voiceId;
  }
  return session;
}

scope.onmessage = async (event: MessageEvent<NeuralRequest>) => {
  const req = event.data;
  try {
    switch (req.type) {
      case 'warmup': {
        // carga el motor y el modelo en memoria antes de que el usuario pulse ▶
        const list = await stored();
        if (list.includes(req.voiceId)) await getSession(req.voiceId);
        reply({ type: 'done', id: req.id });
        break;
      }
      case 'status': {
        const list = await stored();
        reply({ type: 'status', id: req.id, downloaded: list.includes(req.voiceId) });
        break;
      }
      case 'download': {
        await download(req.voiceId, (p) => {
          // solo interesa el modelo .onnx, que es el archivo grande
          if (p.total > 1_000_000) reply({ type: 'progress', id: req.id, loaded: p.loaded, total: p.total });
        });
        reply({ type: 'done', id: req.id });
        break;
      }
      case 'speak': {
        const tts = await getSession(req.voiceId);
        const wav = await tts.predict(req.text);
        reply({ type: 'audio', id: req.id, audio: wav });
        break;
      }
      case 'remove': {
        await remove(req.voiceId);
        session = null;
        reply({ type: 'done', id: req.id });
        break;
      }
    }
  } catch (error) {
    reply({ type: 'error', id: req.id, message: error instanceof Error ? error.message : String(error) });
  }
};
