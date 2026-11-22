import type { NextConfig } from 'next';

import { ISOLATED_ROUTES } from './lib/isolation';

/**
 * La voz integrada (Piper, compilada con Emscripten) contiene ramas para Node.js
 * con require('fs' | 'path' | 'crypto'). En el navegador nunca se ejecutan, pero
 * el empaquetador intenta resolverlas: se redirigen a un módulo vacío solo en el
 * navegador (en el servidor siguen siendo los módulos reales de Node).
 */
const BROWSER_EMPTY = './lib/stubs/empty-module.js';

const nextConfig: NextConfig = {
  // Se cargan tal cual desde node_modules en el servidor (sin empaquetar):
  // pdfjs carga su worker dinámicamente y word-extractor usa fs/stream de Node.
  serverExternalPackages: ['pdfjs-dist', 'word-extractor', 'mammoth'],
  /**
   * Aislamiento de origen cruzado (ver lib/isolation.ts): solo en el lector y en
   * /prueba-voz, donde ONNX Runtime necesita SharedArrayBuffer para usar varios hilos.
   * "credentialless" deja cargar recursos de CDN (cdnjs, jsdelivr, Hugging Face).
   * En el resto, "same-origin-allow-popups" deja funcionar el inicio de sesión de
   * Google y el selector de Drive. Si varias reglas coinciden, gana la última.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' }],
      },
      ...ISOLATED_ROUTES.flatMap((route) =>
        [route, `${route}/:path*`].map((source) => ({
          source,
          headers: [
            { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
            { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
          ],
        })),
      ),
    ];
  },
  turbopack: {
    resolveAlias: {
      fs: { browser: BROWSER_EMPTY },
      path: { browser: BROWSER_EMPTY },
      crypto: { browser: BROWSER_EMPTY },
      // ONNX Runtime sin empaquetar (ver lib/tts/ort-cdn.ts)
      'onnxruntime-web/wasm': { browser: './lib/tts/ort-cdn.ts' },
    },
  },
};

export default nextConfig;
