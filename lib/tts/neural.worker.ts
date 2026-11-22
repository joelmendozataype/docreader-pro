/// <reference lib="webworker" />
/**
 * Web Worker de la voz integrada (Piper, con ONNX Runtime en WebAssembly).
 * Genera el audio fuera del hilo principal para que la lectura no congele la página.
 * El modelo se descarga una vez y queda guardado en OPFS (almacenamiento privado del sitio).
 */

import { HF_BASE, PATH_MAP, TtsSession } from '@mintplex-labs/piper-tts-web';

import {
  looksLikeCorruptModel,
  NEURAL_ERROR,
  type NeuralRequest,
  type NeuralResponse,
} from './neural-protocol';
import { downloadVoice, isVoiceStored, removeVoice, voiceFiles } from './neural-store';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let session: TtsSession | null = null;
let sessionVoice = '';

function reply(message: NeuralResponse) {
  scope.postMessage(message);
}

function filesFor(voiceId: string) {
  const path = (PATH_MAP as Record<string, string>)[voiceId];
  if (!path) throw new Error(`Voz desconocida: ${voiceId}`);
  return voiceFiles(HF_BASE, path);
}

const root = () => navigator.storage.getDirectory();

async function isStored(voiceId: string) {
  return isVoiceStored(await root(), voiceId, filesFor(voiceId));
}

async function removeStored(voiceId: string) {
  await removeVoice(await root(), voiceId, filesFor(voiceId));
}

/**
 * La librería guarda la sesión en `TtsSession._instance` y la reutiliza aunque haya
 * fallado al iniciar; hay que soltarla para que el siguiente intento empiece de cero.
 */
function resetSession() {
  session = null;
  sessionVoice = '';
  (TtsSession as unknown as { _instance: unknown })._instance = null;
}

async function getSession(voiceId: string) {
  if (!session || sessionVoice !== voiceId) {
    try {
      session = await TtsSession.create({ voiceId });
      sessionVoice = voiceId;
    } catch (error) {
      resetSession();
      if (looksLikeCorruptModel(error)) {
        // se borra para que se pueda volver a descargar limpia
        await removeStored(voiceId).catch(() => undefined);
        throw new Error(NEURAL_ERROR.corrupt);
      }
      throw error;
    }
  }
  return session;
}

scope.onmessage = async (event: MessageEvent<NeuralRequest>) => {
  const req = event.data;
  try {
    switch (req.type) {
      case 'warmup': {
        // carga el motor y el modelo en memoria antes de que el usuario pulse ▶
        if (await isStored(req.voiceId)) await getSession(req.voiceId);
        reply({ type: 'done', id: req.id });
        break;
      }
      case 'status': {
        reply({ type: 'status', id: req.id, downloaded: await isStored(req.voiceId) });
        break;
      }
      case 'download': {
        resetSession();
        // se escribe completo y verificado antes de seguir (ver neural-store.ts)
        await downloadVoice(await root(), req.voiceId, filesFor(req.voiceId), (p) =>
          reply({ type: 'progress', id: req.id, loaded: p.loaded, total: p.total }),
        );
        // se comprueba que el modelo descargado se puede abrir; si no, se borra y se avisa
        await getSession(req.voiceId);
        reply({ type: 'done', id: req.id });
        break;
      }
      case 'speak': {
        // sin modelo guardado no se genera: Piper lo descargaría en silencio (60 MB sin avisar)
        if (sessionVoice !== req.voiceId && !(await isStored(req.voiceId)))
          throw new Error(NEURAL_ERROR.missing);
        const tts = await getSession(req.voiceId);
        const wav = await tts.predict(req.text);
        reply({ type: 'audio', id: req.id, audio: wav });
        break;
      }
      case 'remove': {
        resetSession();
        await removeStored(req.voiceId);
        reply({ type: 'done', id: req.id });
        break;
      }
    }
  } catch (error) {
    reply({ type: 'error', id: req.id, message: error instanceof Error ? error.message : String(error) });
  }
};
