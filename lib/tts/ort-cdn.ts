/**
 * Sustituto de "onnxruntime-web/wasm" para la voz integrada (solo navegador).
 *
 * Si Turbopack empaqueta ONNX Runtime, sus hilos (que crea copiando su propio
 * código en un blob) fallan porque esa copia contiene referencias del empaquetador.
 * Se carga la build ESM oficial desde el CDN, sin empaquetar: así puede usar
 * varios hilos del procesador cuando la página está aislada (COOP/COEP).
 * La versión coincide con los WASM que usa @mintplex-labs/piper-tts-web (1.18.0).
 */

const ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/esm/ort.wasm.min.js';

type Ort = typeof import('onnxruntime-web');

const ort: Ort = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ ORT_URL);

export const env = ort.env;
export const InferenceSession = ort.InferenceSession;
export const Tensor = ort.Tensor;
export default ort;
