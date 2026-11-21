/**
 * Utilidades de limpieza y estructuración de texto.
 * Puras e isomórficas: funcionan igual en navegador, servidor y tests.
 */

import type { DocumentSection } from '@/types/document';

const LOWER = 'a-záéíóúüñàèìòùç';
const UPPER = 'A-ZÁÉÍÓÚÜÑÀÈÌÒÙÇ';

/**
 * Normaliza texto extraído de un documento:
 * Unicode NFC, saltos de línea uniformes, sin caracteres de control,
 * sin guiones de corte de palabra y con espacios colapsados.
 */
export function normalizeText(input: string): string {
  return (
    input
      .normalize('NFC')
      .replace(/\r\n?/g, '\n')
      // separadores de línea/párrafo Unicode y saltos de página
      .replace(/[\u2028\u2029\f\v]/g, '\n')
      // espacios "raros" → espacio normal
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      // guion blando y caracteres invisibles de ancho cero
      .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '')
      // caracteres de control (se conservan \n y \t)
      .replace(/[\u0000-\u0008\u000E-\u001F\u007F-\u009F]/g, '')
      .replace(/\t/g, ' ')
      // palabra cortada con guion al final de línea: "progra-\nmación" → "programación"
      .replace(new RegExp(`([${LOWER}])-\\n[ ]*([${LOWER}])`, 'g'), '$1$2')
      .replace(/[ ]{2,}/g, ' ')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/** Divide en párrafos (separados por línea en blanco) y une las líneas internas. */
export function splitParagraphs(text: string): string[] {
  return normalizeText(text)
    .split(/\n{2,}/)
    .map((p) =>
      p
        .replace(/\n/g, ' ')
        .replace(/[ ]{2,}/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const HEADING_KEYWORDS = new RegExp(
  `^(cap[ií]tulo|t[ií]tulo|secci[oó]n|parte|anexo|ap[eé]ndice|introducci[oó]n|conclusi[oó]n(es)?|resumen|abstract|bibliograf[ií]a|referencias( bibliogr[aá]ficas)?|recomendaciones|objetivos?|metodolog[ií]a|resultados|discusi[oó]n|agradecimientos|dedicatoria|[ií]ndice)\\b`,
  'i',
);
const NUMBERED = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+\S/;
const ROMAN = /^([IVXLC]{1,6})[.)-]\s+\S/;

/**
 * Heurística para decidir si una línea suelta de texto plano es un título.
 * Devuelve el nivel (1-3) o null. Pensada para .doc y PDF sin estilos.
 */
export function detectHeadingLevel(line: string): number | null {
  const text = line.trim();
  if (text.length < 2 || text.length > 100) return null;
  if (/[.,;]$/.test(text)) return null;
  if (!new RegExp(`[${UPPER}${LOWER}]`).test(text)) return null;
  const words = text.split(/\s+/).length;
  if (words > 14) return null;

  const numbered = NUMBERED.exec(text);
  if (numbered) {
    // "1 Introducción" → 1, "1.2 Alcance" → 2, "1.2.3 ..." → 3
    const depth = numbered[1].split('.').length;
    // descarta listas de cantidades del tipo "3 manzanas y 2 peras"
    const rest = text.slice(numbered[0].length - 1);
    if (!new RegExp(`^[${UPPER}]`).test(rest)) return null;
    return Math.min(depth, 3);
  }
  if (ROMAN.test(text)) return 1;

  // en MAYÚSCULAS = título principal ("CONCLUSIONES", "MARCO TEÓRICO")
  const letters = text.replace(new RegExp(`[^${UPPER}${LOWER}]`, 'g'), '');
  const isAllCaps = letters.length >= 3 && letters === letters.toUpperCase();
  if (isAllCaps && words <= 10) return 1;

  if (HEADING_KEYWORDS.test(text) && words <= 8)
    return /^(cap[ií]tulo|parte|t[ií]tulo)\b/i.test(text) ? 1 : 2;
  return null;
}

/**
 * Convierte texto plano en HTML de párrafos con títulos detectados por heurística.
 * Los títulos llevan id `sec-N` para el índice.
 */
export function textToHtml(
  text: string,
  {
    detectHeadings = true,
    lineIsParagraph = false,
  }: {
    detectHeadings?: boolean;
    /** true en formatos donde cada salto de línea es un párrafo (Word .doc) */
    lineIsParagraph?: boolean;
  } = {},
): { html: string; sections: DocumentSection[] } {
  const sections: DocumentSection[] = [];
  const blocks: string[] = [];
  const normalized = normalizeText(text);
  const source = lineIsParagraph ? normalized.replace(/\n+/g, '\n\n') : normalized;
  const chunks = source.split(/\n{2,}/).map((block) => block.split('\n').filter(Boolean));

  for (let b = 0; b < chunks.length; b++) {
    const lines = chunks[b];
    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length) blocks.push(`<p>${escapeHtml(joinLines(paragraph))}</p>`);
      paragraph = [];
    };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const level = detectHeadings ? detectHeadingLevel(line) : null;
      if (!level) {
        paragraph.push(line);
        continue;
      }
      flush();
      // "CAPÍTULO I" + "Historia de la ciudad" en la línea siguiente → un solo título
      if (isBareChapterLabel(line)) {
        const nextInBlock = i + 1 < lines.length;
        const next = nextInBlock ? lines[i + 1] : chunks[b + 1]?.length === 1 ? chunks[b + 1][0] : undefined;
        if (next && isShortTitleLine(next)) {
          line = `${line}. ${next}`;
          if (nextInBlock) i++;
          else b++;
        }
      }
      const id = `sec-${sections.length + 1}`;
      sections.push({ id, title: line, level });
      blocks.push(`<h${level} id="${id}">${escapeHtml(line)}</h${level}>`);
    }
    flush();
  }

  return { html: blocks.join('\n'), sections };
}

function isBareChapterLabel(line: string): boolean {
  return /^(cap[ií]tulo|parte|t[ií]tulo|secci[oó]n|unidad)\s+([IVXLC]+|\d+|[a-z]+)$/i.test(line.trim());
}

function isShortTitleLine(line: string): boolean {
  const text = line.trim();
  return text.length > 1 && text.length <= 90 && !/[.,;:]$/.test(text) && text.split(/\s+/).length <= 12;
}

/** Une líneas de un mismo párrafo, reparando palabras cortadas con guion. */
export function joinLines(lines: string[]): string {
  let out = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!out) out = line;
    else if (new RegExp(`[${LOWER}]-$`).test(out) && new RegExp(`^[${LOWER}]`).test(line))
      out = out.slice(0, -1) + line;
    else out += ' ' + line;
  }
  return out;
}

export function countWords(text: string): number {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

/** Páginas estimadas para formatos sin paginación real (≈350 palabras por página). */
export function estimatePages(text: string): number {
  return Math.max(1, Math.ceil(countWords(text) / 350));
}

export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '');
}

/** Título legible a partir del nombre de archivo: "mi_informe-final.pdf" → "mi informe final". */
export function titleFromFileName(fileName: string): string {
  return stripExtension(fileName).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || fileName;
}

/** Limpia títulos de metadatos que no aportan ("Microsoft Word - x.docx", "untitled"). */
export function cleanMetadataTitle(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const title = normalizeText(raw)
    .replace(/^microsoft (word|powerpoint) - /i, '')
    .replace(/\.(docx?|pdf|pptx?)$/i, '')
    .trim();
  if (!title || /^(untitled|un-named|unknown|sin t[ií]tulo|documento\d*|document\d*)$/i.test(title))
    return undefined;
  return title;
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
