/**
 * Detección del formato real por "magic bytes", con la extensión y el MIME
 * solo como desempate (un .pdf renombrado a .docx se detecta como PDF).
 */

import type { DocumentFileType } from '@/types/document';

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((b, i) => bytes[offset + i] === b);
}

function latin1(bytes: Uint8Array) {
  return new TextDecoder('latin1').decode(bytes);
}

export function extensionOf(fileName: string): string {
  const match = /\.([^./\\]+)$/.exec(fileName.toLowerCase());
  return match ? match[1] : '';
}

export function detectFileType(bytes: Uint8Array, fileName = '', mimeType = ''): DocumentFileType | null {
  if (bytes.length === 0) return null;
  const ext = extensionOf(fileName);

  // PDF: "%PDF-" en el primer KB (algunos generadores anteponen basura)
  if (latin1(bytes.subarray(0, 1024)).includes('%PDF-')) return 'pdf';

  // ZIP (PK\x03\x04): .docx si contiene la parte word/document.xml
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // los nombres están en las cabeceras locales y en el directorio central (al final)
    const head = latin1(bytes.subarray(0, 64 * 1024));
    const tail = latin1(bytes.subarray(Math.max(0, bytes.length - 256 * 1024)));
    if (head.includes('word/') || tail.includes('word/document')) return 'docx';
    return null;
  }

  // Compound File Binary (OLE2): Word 97-2003
  if (startsWith(bytes, OLE_SIGNATURE)) return 'doc';

  // HTML: texto sin bytes nulos con marcas HTML, o extensión/MIME de HTML
  const sample = bytes.subarray(0, 4096);
  const isUtf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
  const isBinary = !isUtf16 && sample.includes(0);
  if (!isBinary) {
    const text = isUtf16
      ? new TextDecoder(bytes[0] === 0xff ? 'utf-16le' : 'utf-16be').decode(sample)
      : latin1(sample);
    const looksHtml = /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|<(p|div|h1|article)[\s>]/i.test(
      text,
    );
    if (looksHtml || ext === 'html' || ext === 'htm' || mimeType === 'text/html') return 'html';
  }
  return null;
}
