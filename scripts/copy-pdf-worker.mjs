/**
 * Copia el worker de pdfjs-dist a /public para que el navegador lo cargue
 * desde la misma versión instalada (se ejecuta en postinstall, predev y prebuild).
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
const target = join(root, 'public', 'pdf.worker.min.mjs');

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log('pdf.worker.min.mjs copiado a public/');
