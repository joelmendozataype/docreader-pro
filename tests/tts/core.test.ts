import { beforeEach, describe, expect, it } from 'vitest';

import { blockText, getReadableBlocks, rangeFor } from '@/lib/tts/blocks';
import { MAX_CHUNK, splitIntoChunks, wordEnd } from '@/lib/tts/chunker';
import { clampRate, loadTTSPrefs, saveTTSPrefs, TTS_PREFS_KEY } from '@/lib/tts/prefs';
import { pickVoice, sortVoices, voiceLabel } from '@/lib/tts/voices';

import { voice } from '../helpers/fake-speech';

describe('splitIntoChunks', () => {
  it('separa por frases y agrupa las cortas sin superar el máximo', () => {
    const text = 'Hola. ¿Qué tal? ¡Muy bien! Esta es una frase final.';
    const chunks = splitIntoChunks(text, 25);
    expect(chunks.map((c) => c.text)).toEqual(['Hola. ¿Qué tal?', '¡Muy bien!', 'Esta es una frase final.']);
  });

  it('las posiciones apuntan al texto original', () => {
    const text = 'Primera frase aquí.  Segunda frase, con coma; y algo más. Tercera.';
    for (const c of splitIntoChunks(text, 25)) {
      expect(text.slice(c.start, c.start + c.text.length)).toBe(c.text);
    }
  });

  it('no corta en abreviaturas seguidas de minúscula', () => {
    const chunks = splitIntoChunks('Lo dijo el Dr. pérez ayer. Luego se fue.', 30);
    expect(chunks.map((c) => c.text)).toEqual(['Lo dijo el Dr. pérez ayer.', 'Luego se fue.']);
  });

  it('parte frases larguísimas sin puntuación por espacios', () => {
    const long = Array(120).fill('palabra').join(' ');
    const chunks = splitIntoChunks(long);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.text.length <= MAX_CHUNK)).toBe(true);
    expect(chunks.map((c) => c.text).join(' ')).toBe(long);
  });

  it('texto vacío', () => {
    expect(splitIntoChunks('   ')).toEqual([]);
  });

  it('wordEnd', () => {
    expect(wordEnd('hola mundo', 5)).toBe(10);
    expect(wordEnd('hola mundo', 0)).toBe(4);
  });
});

describe('bloques legibles', () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = document.createElement('div');
    root.innerHTML = `
      <h2 id="sec-1">Título  uno</h2>
      <p>Hola <strong>mundo</strong>,\n   ¿cómo   estás?</p>
      <p>   </p>
      <ul><li><p>Ítem con párrafo</p></li><li>Ítem simple</li></ul>
      <p>Línea uno<br>línea dos</p>`;
    document.body.replaceChildren(root);
  });

  it('en orden, sin vacíos ni duplicados por anidamiento', () => {
    const texts = getReadableBlocks(root).map((b) => blockText(b).text);
    expect(texts).toEqual([
      'Título uno',
      'Hola mundo, ¿cómo estás?',
      'Ítem con párrafo',
      'Ítem simple',
      'Línea uno línea dos',
    ]);
  });

  it('rangeFor cubre exactamente la palabra pedida aunque cruce etiquetas', () => {
    const p = getReadableBlocks(root)[1];
    const { text } = blockText(p);
    const start = text.indexOf('mundo');
    expect(rangeFor(p, start, start + 5)?.toString()).toBe('mundo');
    const q = text.indexOf('¿cómo');
    expect(rangeFor(p, q, q + 5)?.toString()).toBe('¿cómo');
    expect(rangeFor(p, 0, text.length)?.toString().replace(/\s+/g, ' ')).toBe(text);
  });
});

describe('voces', () => {
  const list = [
    voice('Zira', 'en-US'),
    voice('Helena', 'es-ES'),
    voice('Sabina', 'es-MX'),
    voice('Camila Online (Natural)', 'es-PE', false),
  ];

  it('ordena con español de Perú primero, luego Latinoamérica, España y otros idiomas', () => {
    expect(sortVoices(list).map((v) => v.lang)).toEqual(['es-PE', 'es-MX', 'es-ES', 'en-US']);
  });

  it('respeta la voz guardada si existe', () => {
    expect(pickVoice(list, 'Helena|es-ES')?.name).toBe('Helena');
    expect(pickVoice(list, 'no-existe')?.lang).toBe('es-PE');
  });

  it('sin voces en español usa la predeterminada', () => {
    const en = [voice('A', 'en-GB'), { ...voice('B', 'en-US'), default: true } as SpeechSynthesisVoice];
    expect(pickVoice(en)?.name).toBe('B');
    expect(pickVoice([])).toBeNull();
  });

  it('etiqueta legible', () => {
    expect(voiceLabel(voice('Microsoft Helena - Spanish (Spain)', 'es-ES'))).toBe('Helena (es-ES)');
  });
});

describe('preferencias', () => {
  it('limita la velocidad a 0.5–2 y tolera datos rotos', () => {
    expect(clampRate(5)).toBe(2);
    expect(clampRate(0.1)).toBe(0.5);
    expect(clampRate(Number.NaN)).toBe(1);
    localStorage.setItem(TTS_PREFS_KEY, '{roto');
    expect(loadTTSPrefs()).toEqual({ voiceURI: null, rate: 1 });
    saveTTSPrefs({ voiceURI: 'x', rate: 1.25 });
    expect(loadTTSPrefs()).toEqual({ voiceURI: 'x', rate: 1.25 });
  });
});
