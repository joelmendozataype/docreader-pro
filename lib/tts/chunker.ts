/**
 * Divide el texto de un bloque en fragmentos cortos (frases) para la síntesis.
 * Los navegadores cortan o se cuelgan con enunciados muy largos (Chrome deja
 * de hablar tras ~15 s con algunas voces), así que ningún fragmento supera MAX.
 */

export const MAX_CHUNK = 220;

export interface Chunk {
  text: string;
  /** posición del fragmento dentro del texto del bloque */
  start: number;
}

/** Final de frase: . ! ? … ; seguido de espacio y algo que no sea minúscula (evita "Dr. pérez", "etc. y"). */
const SENTENCE_END = /[.!?…;:]["»”')\]]*\s+(?=[^a-záéíóúñü])/g;

export function splitIntoChunks(text: string, max = MAX_CHUNK): Chunk[] {
  if (!text.trim()) return [];

  // 1. frases
  const sentences: Chunk[] = [];
  let last = 0;
  for (const match of text.matchAll(SENTENCE_END)) {
    const end = match.index + match[0].length;
    sentences.push({ text: text.slice(last, end), start: last });
    last = end;
  }
  if (last < text.length) sentences.push({ text: text.slice(last), start: last });

  // 2. agrupar frases cortas y partir las largas
  const chunks: Chunk[] = [];
  let current: Chunk | null = null;
  for (const sentence of sentences.flatMap((s) => splitLong(s, max))) {
    if (current && current.text.length + sentence.text.length <= max) {
      current = { text: current.text + sentence.text, start: current.start };
    } else {
      if (current) chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);

  return chunks
    .map((c) => {
      const leading = c.text.length - c.text.trimStart().length;
      return { text: c.text.trim(), start: c.start + leading };
    })
    .filter((c) => c.text.length > 0);
}

/** Parte una frase larga por comas o, si no hay, por espacios. */
function splitLong(chunk: Chunk, max: number): Chunk[] {
  if (chunk.text.length <= max) return [chunk];
  const parts: Chunk[] = [];
  let rest = chunk;
  while (rest.text.length > max) {
    const window = rest.text.slice(0, max);
    let cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(' — '));
    cut = cut > max * 0.4 ? cut + 1 : window.lastIndexOf(' ');
    if (cut <= 0) cut = max;
    parts.push({ text: rest.text.slice(0, cut), start: rest.start });
    rest = { text: rest.text.slice(cut), start: rest.start + cut };
  }
  if (rest.text) parts.push(rest);
  return parts;
}

/** Fin de la palabra que empieza en `index` (para eventos boundary sin charLength). */
export function wordEnd(text: string, index: number): number {
  const match = /\S+/y;
  match.lastIndex = index;
  return match.test(text) ? match.lastIndex : index + 1;
}

/**
 * Prepara el texto para el motor de voz: quita caracteres que algunos motores
 * (sobre todo en Android) no saben leer y con los que fallan con "synthesis-failed":
 * emojis, símbolos de uso privado, selectores de variación y unidores invisibles.
 * Cada carácter se cambia por espacios de la MISMA longitud para que las posiciones
 * de los eventos boundary sigan coincidiendo con el texto original.
 */
export function speakableText(text: string): string {
  return text.replace(/[\p{Extended_Pictographic}\p{Co}\uFE0E\uFE0F\u200D\u20E3]/gu, (m) =>
    ' '.repeat(m.length),
  );
}
