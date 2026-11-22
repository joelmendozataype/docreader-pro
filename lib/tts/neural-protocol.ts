/** Errores conocidos de la voz integrada (viajan como mensaje del Error). */
export const NEURAL_ERROR = {
  /** el modelo guardado está incompleto o dañado (ya se borró) */
  corrupt: 'VOICE_CORRUPT',
  /** el modelo no está descargado */
  missing: 'VOICE_MISSING',
} as const;

/**
 * ONNX no puede leer el modelo: el archivo guardado está incompleto o dañado
 * (típico cuando la descarga de ~60 MB se corta con datos móviles).
 * Ej.: "Can't create a session. ERROR_CODE: 2, ERROR_MESSAGE: No graph was found in the protobuf."
 */
export function looksLikeCorruptModel(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /protobuf|no graph|can't create a session|failed to load model|invalid model|unexpected end|parse/i.test(
    message,
  );
}

export type NeuralRequest =
  | { type: 'status'; id: number; voiceId: string }
  | { type: 'warmup'; id: number; voiceId: string }
  | { type: 'download'; id: number; voiceId: string }
  | { type: 'speak'; id: number; voiceId: string; text: string }
  | { type: 'remove'; id: number; voiceId: string };

export type NeuralResponse =
  | { type: 'status'; id: number; downloaded: boolean }
  | { type: 'progress'; id: number; loaded: number; total: number }
  | { type: 'audio'; id: number; audio: Blob }
  | { type: 'done'; id: number }
  | { type: 'error'; id: number; message: string };
