'use client';

/**
 * Lectura en voz alta con Web Speech API.
 *
 * - Cola por bloques (párrafos, títulos, ítems) y, dentro de cada bloque, por
 *   frases cortas: evita los cortes de Chrome con enunciados largos.
 * - Eventos `boundary` → resaltado de la palabra; siempre se resalta el párrafo
 *   y la frase (hay voces, como las de Google en línea, sin eventos por palabra).
 * - Pausa "suave": se cancela y se retoma desde la última palabra, porque
 *   speechSynthesis.pause()/resume() fallan en Chrome con voces en línea y en Android.
 * - Un contador de generación descarta eventos de enunciados ya cancelados.
 */

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { blockText, getReadableBlocks, rangeFor } from '@/lib/tts/blocks';
import { type Chunk, splitIntoChunks, wordEnd } from '@/lib/tts/chunker';
import {
  BLOCK_CLASS,
  clearAllHighlights,
  SENTENCE_HIGHLIGHT,
  setRangeHighlight,
  WORD_HIGHLIGHT,
} from '@/lib/tts/highlight';
import { clampRate, loadTTSPrefs, saveTTSPrefs } from '@/lib/tts/prefs';
import { pickVoice, sortVoices } from '@/lib/tts/voices';

export type TTSStatus = 'idle' | 'playing' | 'paused';

interface Position {
  block: number;
  chunk: number;
  /** carácter dentro del fragmento desde el que retomar */
  char: number;
}

export interface UseTTSOptions {
  /** contenedor del documento (.reader-content) */
  containerRef: RefObject<HTMLElement | null>;
  /** desplazar la vista al párrafo que se lee */
  autoScroll?: boolean;
  /** true si el usuario prefiere menos movimiento */
  reducedMotion?: boolean;
  /** margen superior ocupado por la cabecera fija (px) */
  topOffset?: number;
  /** margen inferior ocupado por los controles (px) */
  bottomOffset?: number;
}

const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
/** espera tras cancel() en Android antes de volver a hablar */
export const ANDROID_CANCEL_DELAY_MS = 250;
/** si la voz no empieza en este tiempo, se considera que el navegador no la inició */
export const START_TIMEOUT_MS = 4000;

/** Errores del motor de voz que suelen resolverse sin fijar la voz o el idioma. */
const RETRYABLE_ERRORS = new Set([
  'synthesis-failed',
  'synthesis-unavailable',
  'voice-unavailable',
  'language-unavailable',
  'audio-busy',
]);
const MAX_FALLBACK = 2;

/** Mensaje en español para cada error de la Web Speech API. */
export function speechErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
      return 'El navegador bloqueó el audio. Pulsa reproducir de nuevo.';
    case 'audio-busy':
    case 'audio-hardware':
      return 'Otra app está usando el audio del dispositivo. Ciérrala y pulsa reproducir.';
    case 'network':
      return 'La voz elegida necesita internet y no hay conexión. Elige una voz local en ⚙.';
    case 'text-too-long':
      return 'El fragmento es demasiado largo para la voz. Prueba con otra voz.';
    default:
      return 'El motor de voz del dispositivo no pudo leer este texto. Elige otra voz en ⚙ o revisa Ajustes → Accesibilidad → Texto a voz.';
  }
}

/** Mensaje accionable cuando el navegador acepta el texto pero no suena nada. */
export function voiceNotStartedMessage(voiceCount: number): string {
  if (voiceCount === 0) {
    return 'Tu navegador no ofrece voces para leer en voz alta. En Brave, toca el ícono del león y desactiva los escudos (o «Bloquear huellas digitales») para este sitio, o abre la página en Chrome.';
  }
  return 'La voz no comenzó. Sube el volumen multimedia y revisa que el teléfono tenga un motor de voz: Ajustes → Accesibilidad → Texto a voz → «Servicios de voz de Google».';
}

export function isTTSSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function useTTS({
  containerRef,
  autoScroll = true,
  reducedMotion = false,
  topOffset = 64,
  bottomOffset = 120,
}: UseTTSOptions) {
  const [supported] = useState(isTTSSupported);
  const [status, setStatus] = useState<TTSStatus>('idle');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [prefs, setPrefs] = useState(loadTTSPrefs);
  const [currentBlock, setCurrentBlock] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const blocksRef = useRef<HTMLElement[] | null>(null);
  const chunksRef = useRef(new Map<number, Chunk[]>());
  const posRef = useRef<Position>({ block: 0, chunk: 0, char: 0 });
  const genRef = useRef(0);
  const statusRef = useRef<TTSStatus>('idle');
  const prefsRef = useRef(prefs);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const optsRef = useRef({ autoScroll, reducedMotion, topOffset, bottomOffset });
  optsRef.current = { autoScroll, reducedMotion, topOffset, bottomOffset };
  // se guarda en un ref para que un objeto nuevo en cada render no reinicie efectos
  const containerHolder = useRef(containerRef);
  containerHolder.current = containerRef;

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  /** reintentos ante fallos del motor de voz (se mantiene durante la sesión) */
  const fallbackRef = useRef(0);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const synth = supported ? window.speechSynthesis : null;

  const setStatusBoth = useCallback((next: TTSStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  // ── voces ──────────────────────────────────────────────
  useEffect(() => {
    if (!synth) return;
    const load = () => {
      const list = sortVoices(synth.getVoices());
      voicesRef.current = list;
      setVoices(list);
    };
    load();
    synth.addEventListener('voiceschanged', load);
    // por si quedó algo sonando de una página anterior
    synth.cancel();
    return () => synth.removeEventListener('voiceschanged', load);
  }, [synth]);

  const voice = useMemo(() => pickVoice(voices, prefs.voiceURI), [voices, prefs.voiceURI]);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  // ── bloques y fragmentos ───────────────────────────────
  const getBlocks = useCallback(() => {
    const container = containerHolder.current.current;
    if (!blocksRef.current && container) blocksRef.current = getReadableBlocks(container);
    return blocksRef.current ?? [];
  }, []);

  const getChunks = useCallback(
    (index: number) => {
      let chunks = chunksRef.current.get(index);
      if (!chunks) {
        const block = getBlocks()[index];
        chunks = block ? splitIntoChunks(blockText(block).text) : [];
        chunksRef.current.set(index, chunks);
      }
      return chunks;
    },
    [getBlocks],
  );

  // ── resaltado ──────────────────────────────────────────
  const markBlock = useCallback(
    (index: number | null) => {
      const blocks = getBlocks();
      blocks.forEach((b, i) => b.classList.toggle(BLOCK_CLASS, i === index));
      setCurrentBlock(index);
      if (index === null) return;
      const block = blocks[index];
      const {
        autoScroll: follow,
        reducedMotion: reduced,
        topOffset: top,
        bottomOffset: bottom,
      } = optsRef.current;
      if (!follow || !block) return;
      const rect = block.getBoundingClientRect();
      const visible = rect.top >= top && rect.bottom <= window.innerHeight - bottom;
      if (!visible) block.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    },
    [getBlocks],
  );

  const clearHighlight = useCallback(() => {
    clearAllHighlights(containerHolder.current.current);
    setCurrentBlock(null);
  }, []);

  // ── reproducción ───────────────────────────────────────
  const speak = useCallback(
    (pos: Position, afterEnd = false) => {
      if (!synth) return;
      const blocks = getBlocks();

      // saltar bloques/fragmentos vacíos y detectar el final
      let { block, chunk, char } = pos;
      while (block < blocks.length && chunk >= getChunks(block).length) {
        block++;
        chunk = 0;
        char = 0;
      }
      if (block >= blocks.length) {
        genRef.current++;
        synth.cancel();
        clearHighlight();
        posRef.current = { block: 0, chunk: 0, char: 0 };
        setStatusBoth('idle');
        return;
      }

      const gen = ++genRef.current;
      posRef.current = { block, chunk, char };
      const piece = getChunks(block)[chunk];
      const el = blocks[block];
      const text = piece.text.slice(char);

      if (!el.classList.contains(BLOCK_CLASS)) markBlock(block);
      setRangeHighlight(SENTENCE_HIGHLIGHT, rangeFor(el, piece.start, piece.start + piece.text.length));
      setRangeHighlight(WORD_HIGHLIGHT, null);

      const utterance = new SpeechSynthesisUtterance(text);
      const v = voiceRef.current;
      // nivel 0: voz elegida · 1: solo idioma · 2: voz predeterminada del sistema
      // (en Android, fijar `voice` a veces provoca "synthesis-failed" aunque el idioma funcione)
      const level = fallbackRef.current;
      if (v && level === 0) utterance.voice = v;
      if (level < 2) utterance.lang = v?.lang ?? 'es-ES';
      utterance.rate = prefsRef.current.rate;

      let started = false;
      utterance.onboundary = (event) => {
        started = true;
        if (gen !== genRef.current || event.name === 'sentence') return;
        const local = char + event.charIndex;
        posRef.current = { block, chunk, char: local };
        const length = event.charLength || wordEnd(piece.text, local) - local;
        const start = piece.start + local;
        setRangeHighlight(WORD_HIGHLIGHT, rangeFor(el, start, start + length));
      };
      utterance.onend = () => {
        started = true;
        if (gen !== genRef.current) return;
        speak({ block, chunk: chunk + 1, char: 0 }, true);
      };
      utterance.onerror = (event) => {
        if (gen !== genRef.current) return;
        if (event.error === 'interrupted' || event.error === 'canceled') return;
        // fallo del motor de voz: se reintenta la misma frase con una configuración más simple
        if (RETRYABLE_ERRORS.has(event.error) && fallbackRef.current < MAX_FALLBACK) {
          fallbackRef.current++;
          const resume = posRef.current; // conserva la última palabra leída
          speak(
            { block, chunk, char: resume.block === block && resume.chunk === chunk ? resume.char : char },
            true,
          );
          return;
        }
        setError(speechErrorMessage(event.error));
        genRef.current++;
        setStatusBoth('paused');
      };

      utterance.onstart = () => {
        if (gen === genRef.current) started = true;
      };

      setError(null);
      // se guarda una referencia: Chrome en Android puede liberar el enunciado
      // (recolector de basura) antes de terminar y entonces nunca llega `onend`
      utteranceRef.current = utterance;

      const go = () => {
        if (gen !== genRef.current) return;
        synth.resume(); // Android a veces deja el sintetizador en pausa interna
        synth.speak(utterance);
        // vigilancia: si la voz no arranca, se avisa en vez de quedarse "leyendo" en silencio
        if (watchdogRef.current) clearTimeout(watchdogRef.current);
        watchdogRef.current = setTimeout(() => {
          if (gen !== genRef.current || started || synth.speaking) return;
          genRef.current++;
          synth.cancel();
          setStatusBoth('paused');
          setError(voiceNotStartedMessage(voicesRef.current.length));
        }, START_TIMEOUT_MS);
      };

      // Tras `onend` la cola ya está vacía: cancelar ahí (como antes) anulaba en Android
      // la frase siguiente. Solo se cancela si de verdad hay algo sonando.
      const busy = !afterEnd && (synth.speaking || synth.pending);
      if (busy) synth.cancel();
      // En Android cancel() es asíncrono: si se habla en el mismo instante, también
      // cancela lo nuevo. Se espera un momento antes de hablar.
      if (busy && IS_ANDROID) setTimeout(go, ANDROID_CANCEL_DELAY_MS);
      else go();
      setStatusBoth('playing');
    },
    [synth, getBlocks, getChunks, markBlock, clearHighlight, setStatusBoth],
  );

  /** Primer bloque visible en pantalla (para empezar donde está leyendo el usuario). */
  const firstVisibleBlock = useCallback(() => {
    const blocks = getBlocks();
    const top = optsRef.current.topOffset;
    let lo = 0;
    let hi = blocks.length - 1;
    let found = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (blocks[mid].getBoundingClientRect().bottom <= top) {
        lo = mid + 1;
      } else {
        found = mid;
        hi = mid - 1;
      }
    }
    return found;
  }, [getBlocks]);

  const play = useCallback(
    (fromBlock?: number) => {
      if (!synth) return;
      if (fromBlock !== undefined) return speak({ block: fromBlock, chunk: 0, char: 0 });
      if (statusRef.current === 'paused') return speak(posRef.current);
      if (statusRef.current === 'idle') return speak({ block: firstVisibleBlock(), chunk: 0, char: 0 });
    },
    [synth, speak, firstVisibleBlock],
  );

  const pause = useCallback(() => {
    if (!synth || statusRef.current !== 'playing') return;
    genRef.current++;
    synth.cancel();
    setStatusBoth('paused');
  }, [synth, setStatusBoth]);

  const toggle = useCallback(() => {
    if (statusRef.current === 'playing') pause();
    else play();
  }, [pause, play]);

  const stop = useCallback(() => {
    if (!synth) return;
    genRef.current++;
    synth.cancel();
    clearHighlight();
    posRef.current = { block: 0, chunk: 0, char: 0 };
    setStatusBoth('idle');
  }, [synth, clearHighlight, setStatusBoth]);

  /** Salta al párrafo anterior/siguiente (sigue leyendo si estaba leyendo). */
  const skip = useCallback(
    (delta: number) => {
      const blocks = getBlocks();
      if (!blocks.length) return;
      const base = statusRef.current === 'idle' ? firstVisibleBlock() : posRef.current.block;
      const target = Math.min(blocks.length - 1, Math.max(0, base + delta));
      if (statusRef.current === 'playing') {
        speak({ block: target, chunk: 0, char: 0 });
      } else {
        posRef.current = { block: target, chunk: 0, char: 0 };
        setRangeHighlight(SENTENCE_HIGHLIGHT, null);
        setRangeHighlight(WORD_HIGHLIGHT, null);
        markBlock(target);
        if (statusRef.current === 'idle') setStatusBoth('paused');
      }
    },
    [getBlocks, firstVisibleBlock, speak, markBlock, setStatusBoth],
  );

  /**
   * Llamar al navegar con el índice: pausa la lectura y deja preparado el
   * siguiente "reproducir" para empezar en el título elegido.
   */
  const pauseAtElement = useCallback(
    (element: HTMLElement) => {
      if (statusRef.current === 'idle') return;
      const blocks = getBlocks();
      const index = blocks.findIndex((b) => b === element || element.contains(b) || b.contains(element));
      if (statusRef.current === 'playing') {
        genRef.current++;
        synth?.cancel();
      }
      if (index !== -1) {
        posRef.current = { block: index, chunk: 0, char: 0 };
        setRangeHighlight(SENTENCE_HIGHLIGHT, null);
        setRangeHighlight(WORD_HIGHLIGHT, null);
        markBlock(index);
      }
      setStatusBoth('paused');
    },
    [getBlocks, synth, markBlock, setStatusBoth],
  );

  // ── preferencias ───────────────────────────────────────
  const restartIfPlaying = useCallback(() => {
    if (statusRef.current === 'playing') speak(posRef.current);
  }, [speak]);

  const setRate = useCallback(
    (rate: number) => {
      const next = { ...prefsRef.current, rate: clampRate(rate) };
      prefsRef.current = next;
      setPrefs(next);
      saveTTSPrefs(next);
      restartIfPlaying();
    },
    [restartIfPlaying],
  );

  const setVoice = useCallback(
    (voiceURI: string) => {
      const next = { ...prefsRef.current, voiceURI };
      prefsRef.current = next;
      setPrefs(next);
      saveTTSPrefs(next);
      voiceRef.current = voicesRef.current.find((v) => v.voiceURI === voiceURI) ?? voiceRef.current;
      fallbackRef.current = 0; // elección explícita: se vuelve a usar la voz elegida
      restartIfPlaying();
    },
    [restartIfPlaying],
  );

  // ── limpieza al salir del lector ───────────────────────
  useEffect(() => {
    const container = containerHolder.current.current;
    const onPageHide = () => synth?.cancel();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      // genRef es un contador (no un nodo): incrementarlo invalida los eventos pendientes
      // eslint-disable-next-line react-hooks/exhaustive-deps
      genRef.current++;
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      utteranceRef.current = null;
      synth?.cancel();
      clearAllHighlights(container);
    };
  }, [synth]);

  return {
    supported,
    status,
    error,
    voices,
    voice,
    rate: prefs.rate,
    currentBlock,
    play,
    pause,
    toggle,
    stop,
    skip,
    pauseAtElement,
    setRate,
    setVoice,
  };
}

export type TTSController = ReturnType<typeof useTTS>;
