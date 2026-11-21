/**
 * Parser de PDF con pdfjs-dist (build "legacy": funciona en navegador y en Node).
 *
 * - Procesa página a página y libera memoria al terminar cada una, por eso no
 *   tiene límite práctico de páginas.
 * - Agrupa los fragmentos de texto en líneas y párrafos.
 * - Detecta títulos por tamaño de fuente respecto al cuerpo del texto.
 * - Elimina encabezados/pies repetidos y números de página.
 */

import type { TextItem } from 'pdfjs-dist/types/src/display/api';

import {
  cleanMetadataTitle,
  escapeHtml,
  joinLines,
  normalizeText,
  titleFromFileName,
} from '@/lib/utils/text';
import type { DocumentSection } from '@/types/document';

import { ParseError } from './errors';
import {
  assertHasText,
  type DocumentContent,
  type ParseOptions,
  throwIfAborted,
  toUint8Array,
} from './types';

/** Ruta pública del worker en el navegador (copiado por scripts/copy-pdf-worker.mjs). */
export const PDF_WORKER_URL = '/pdf.worker.min.mjs';

interface Line {
  text: string;
  size: number;
  y: number;
  xStart: number;
  xEnd: number;
  page: number;
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjsPromise: Promise<PdfJs> | null = null;

async function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
    if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
    }
    return pdfjs;
  });
  return pdfjsPromise;
}

const PAGE_NUMBER =
  /^(p[áa]g(ina)?\.?\s*)?[-\u2013\u2014]?\s*\d{1,4}\s*[-\u2013\u2014]?(\s*(de|of|\/)\s*\d{1,4})?$/i;

export async function parsePdf(data: ArrayBuffer | Uint8Array, fileName: string, options: ParseOptions = {}) {
  const pdfjs = await loadPdfJs();
  throwIfAborted(options.signal);

  // pdfjs transfiere/neutraliza el buffer: se le pasa una copia
  const bytes = new Uint8Array(toUint8Array(data));
  const task = pdfjs.getDocument({
    data: bytes,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
    useSystemFonts: false,
    disableFontFace: true,
  });

  let pdf: Awaited<typeof task.promise>;
  try {
    pdf = await task.promise;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === 'PasswordException') throw new ParseError('PDF_ENCRYPTED', { cause: error });
    throw new ParseError('CORRUPT_FILE', { cause: error });
  }

  try {
    const pageLines: Line[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      throwIfAborted(options.signal);
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      pageLines.push(groupIntoLines(content.items.filter(isTextItem), n));
      page.cleanup();
      options.onProgress?.(n / pdf.numPages);
    }

    const meta = await pdf.getMetadata().catch(() => null);
    const info = (meta?.info ?? {}) as { Title?: string; Author?: string };

    const content = buildContent(removeRunningHeaders(pageLines), pdf.numPages);
    const scannedLike = content.text.replace(/\s/g, '').length < 20 * pdf.numPages;
    if (!content.text.trim() || (scannedLike && content.text.length < 50))
      throw new ParseError('PDF_NO_TEXT');

    const result: DocumentContent = {
      ...content,
      title: cleanMetadataTitle(info.Title) ?? content.sections[0]?.title ?? titleFromFileName(fileName),
      author: cleanMetadataTitle(info.Author),
    };
    assertHasText(result);
    return result;
  } finally {
    await task.destroy();
  }
}

function isTextItem(item: unknown): item is TextItem {
  return typeof (item as TextItem).str === 'string' && Array.isArray((item as TextItem).transform);
}

/** Une fragmentos de texto en líneas visuales. */
function groupIntoLines(items: TextItem[], page: number): Line[] {
  const lines: Line[] = [];
  let current: Line | null = null;

  for (const item of items) {
    const [a, b, , , x, y] = item.transform;
    const size = Math.round(Math.hypot(a, b) * 2) / 2 || item.height || 10;
    const str = item.str;

    if (!str.trim() && !item.hasEOL) {
      if (current && str) current.text += ' ';
      continue;
    }

    const sameLine = current && Math.abs(current.y - y) < Math.max(current.size, size) * 0.5;
    if (current && sameLine) {
      const gap = x - current.xEnd;
      const needsSpace = gap > size * 0.15 && !current.text.endsWith(' ') && !str.startsWith(' ');
      current.text += (needsSpace ? ' ' : '') + str;
      current.xEnd = Math.max(current.xEnd, x + item.width);
      current.size = Math.max(current.size, size);
    } else if (str.trim()) {
      if (current) lines.push(current);
      current = { text: str, size, y, xStart: x, xEnd: x + item.width, page };
    }
  }
  if (current) lines.push(current);

  return lines
    .map((line) => ({ ...line, text: line.text.replace(/\s+/g, ' ').trim() }))
    .filter((line) => line.text.length > 0);
}

/** Quita encabezados/pies que se repiten en muchas páginas y números de página sueltos. */
function removeRunningHeaders(pages: Line[][]): Line[][] {
  const key = (text: string) => text.toLowerCase().replace(/\d+/g, '#');
  const counts = new Map<string, number>();
  const edges = (lines: Line[]) => [...lines.slice(0, 2), ...lines.slice(-2)];

  for (const lines of pages) {
    for (const k of new Set(edges(lines).map((l) => key(l.text)))) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.5));

  return pages.map((lines) => {
    const edgeSet = new Set(edges(lines));
    return lines.filter((line) => {
      if (!edgeSet.has(line)) return true;
      if (PAGE_NUMBER.test(line.text)) return false;
      return (counts.get(key(line.text)) ?? 0) < threshold || pages.length < 3;
    });
  });
}

/** Tamaño de fuente más frecuente (ponderado por caracteres) = cuerpo del texto. */
function bodyFontSize(lines: Line[]): number {
  const weight = new Map<number, number>();
  for (const l of lines) weight.set(l.size, (weight.get(l.size) ?? 0) + l.text.length);
  let best = 10;
  let max = -1;
  for (const [size, w] of weight) {
    if (w > max) {
      max = w;
      best = size;
    }
  }
  return best;
}

function buildContent(pages: Line[][], numPages: number): Omit<DocumentContent, 'title' | 'author'> {
  const all = pages.flat();
  const body = bodyFontSize(all);
  const isHeadingLine = (l: Line) =>
    l.size >= body * 1.18 && l.text.length <= 140 && /\p{L}/u.test(l.text) && !PAGE_NUMBER.test(l.text);

  // niveles: el tamaño de título más grande es h1, el siguiente h2, el resto h3
  const headingSizes = [...new Set(all.filter(isHeadingLine).map((l) => l.size))].sort((x, y) => y - x);
  const levelOf = (size: number) => Math.min(headingSizes.indexOf(size) + 1, 3);

  // ancho típico de línea para detectar finales de párrafo (líneas cortas)
  const widths = all.filter((l) => !isHeadingLine(l)).map((l) => l.xEnd - l.xStart);
  const fullWidth = percentile(widths, 0.9) || 1;

  const blocks: string[] = [];
  const texts: string[] = [];
  const sections: DocumentSection[] = [];
  let paragraph: string[] = [];
  let heading: { lines: string[]; size: number; last: Line } | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = normalizeText(joinLines(paragraph));
    if (text) {
      blocks.push(`<p>${escapeHtml(text)}</p>`);
      texts.push(text);
    }
    paragraph = [];
  };
  const flushHeading = () => {
    if (!heading) return;
    const title = normalizeText(heading.lines.join(' '));
    const level = levelOf(heading.size);
    const id = `sec-${sections.length + 1}`;
    sections.push({ id, title, level });
    blocks.push(`<h${level} id="${id}">${escapeHtml(title)}</h${level}>`);
    texts.push(title);
    heading = null;
  };

  let prev: Line | null = null;
  for (const line of all) {
    if (isHeadingLine(line)) {
      flushParagraph();
      const continues =
        heading &&
        heading.size === line.size &&
        heading.last.page === line.page &&
        heading.last.y - line.y < line.size * 1.8;
      if (continues && heading) {
        heading.lines.push(line.text);
        heading.last = line;
      } else {
        flushHeading();
        heading = { lines: [line.text], size: line.size, last: line };
      }
      prev = line;
      continue;
    }
    flushHeading();

    if (prev && paragraph.length) {
      const prevText = paragraph[paragraph.length - 1];
      const endsSentence = /[.!?:;»\u201D"]$/.test(prevText);
      const samePage = prev.page === line.page;
      const gap = prev.y - line.y;
      const bigGap = samePage && gap > Math.max(prev.size, line.size) * 1.75;
      const shortPrev = samePage && prev.xEnd - prev.xStart < fullWidth * 0.8;
      const indented = samePage && line.xStart - prev.xStart > line.size * 0.8;
      const bullet = /^([\u2022▪◦·\-\u2013\u2014*]|\d{1,2}[.)]|[a-z][.)])\s/.test(line.text);
      // en salto de página se continúa el párrafo salvo que la frase haya terminado
      const newParagraph = samePage
        ? bigGap || (endsSentence && (shortPrev || indented)) || bullet
        : endsSentence;
      if (newParagraph) flushParagraph();
    }
    paragraph.push(line.text);
    prev = line;
  }
  flushParagraph();
  flushHeading();

  return {
    html: blocks.join('\n'),
    text: texts.join('\n\n'),
    sections,
    pages: numPages,
  };
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}
