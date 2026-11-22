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
import { type Chunk, speakableText, splitIntoChunks, wordEnd } from '@/lib/tts/chunker';
import {
  BLOCK_CLASS,
  clearAllHighlights,
  SENTENCE_HIGHLIGHT,
  setRangeHighlight,
  WORD_HIGHLIGHT,
} from '@/lib/tts/highlight';
import { getSharedNeuralEngine, isNeuralSupported, type NeuralEngine } from '@/lib/tts/neural';
import { NEURAL_ERROR } from '@/lib/tts/neural-protocol';
import { clampRate, loadTTSPrefs, saveTTSPrefs, type TTSEngine } from '@/lib/tts/prefs';
import { langCandidates, pickVoice, sortVoices } from '@/lib/tts/voices';

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
  /** motor de voz integrada (inyectable en tests; por defecto el compartido de la app) */
  neural?: NeuralEngine;
}

/** estado de la voz integrada en este navegador */
export type NeuralStatus = 'unknown' | 'missing' | 'downloading' | 'ready' | 'error';

/** motivo por el que se ofrece descargar la voz integrada */
export type NeuralOfferReason = 'browser' | 'corrupt' | 'missing';

/** frases que se preparan por adelantado con la voz integrada mientras suena la actual */
export const NEURAL_PREFETCH = 1;

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
export interface SpeechAttempt {
  /** fijar la voz elegida en el enunciado */
  voice: boolean;
  /** idioma BCP 47 a fijar ('' = el predeterminado del sistema) */
  lang: string;
}

/**
 * Configuraciones a probar, en orden, cuando el motor de voz falla. En Android,
 * fijar la voz o un idioma que el motor no tiene instalado da "synthesis-failed";
 * pasar a otra variante de español o a la voz del sistema suele funcionar.
 */
export function attemptPlan(voice: { lang: string } | null | undefined): SpeechAttempt[] {
  const langs = langCandidates(voice?.lang);
  return [
    ...(voice ? [{ voice: true, lang: langs[0] }] : []),
    ...langs.map((lang) => ({ voice: false, lang })),
    { voice: false, lang: '' },
  ];
}
/** tras este número de frases seguidas imposibles de leer, se detiene y se avisa */
export const MAX_SKIPPED_IN_A_ROW = 3;
/** pausa entre frases en Android (pedir la siguiente en el mismo evento la hace fallar) */
export const ANDROID_GAP_MS = 150;
/** espera base antes de reintentar en Android (se multiplica por el número de intento) */
export const RETRY_DELAY_MS = 400;

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
  neural,
}: UseTTSOptions) {
  const [browserSupported] = useState(isTTSSupported);
  const [neuralSupported] = useState(isNeuralSupported);
  /** hay al menos un motor: la voz del navegador o la integrada */
  const supported = browserSupported || neuralSupported;
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
  /** frases seguidas que no se pudieron leer */
  const failStreakRef = useRef(0);
  /** aviso informativo (no detiene la lectura) */
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  /** últimos errores del motor de voz, para el diagnóstico del panel de voz */
  const [errorLog, setErrorLog] = useState<string[]>([]);
  const [fallbackLevel, setFallbackLevel] = useState(0);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const synth = browserSupported ? window.speechSynthesis : null;

  // ── voz integrada (Piper) ──────────────────────────────
  const neuralRef = useRef<NeuralEngine | null>(neural ?? null);
  const getNeural = useCallback(() => (neuralRef.current ??= getSharedNeuralEngine()), []);
  const engineRef = useRef<TTSEngine>(
    prefs.engine === 'neural' && neuralSupported ? 'neural' : browserSupported ? 'browser' : 'neural',
  );
  const [engine, setEngineState] = useState<TTSEngine>(engineRef.current);
  const [neuralStatus, setNeuralStatus] = useState<NeuralStatus>('unknown');
  const [neuralProgress, setNeuralProgress] = useState(0);
  /** la voz del navegador falló: se ofrece descargar la integrada */
  const [offerNeural, setOfferNeural] = useState(false);
  /** por qué se ofrece: falló el navegador, la voz guardada estaba dañada o falta descargarla */
  const [offerReason, setOfferReason] = useState<NeuralOfferReason>('browser');
  /** generando el audio de la frase (voz integrada) */
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  /** frase cuyo audio está cargado en el reproductor */
  const audioPosRef = useRef<{ block: number; chunk: number } | null>(null);
  const prefetchRef = useRef(new Map<string, Promise<Blob>>());
  /** dónde empezaron los fallos de la voz del navegador (para retomar ahí con la integrada) */
  const firstFailPosRef = useRef<Position | null>(null);
  const speakNeuralRef = useRef<(pos: Position) => void>(() => {});

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

  // ── reproducción con la voz integrada ──────────────────
  const releaseAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute('src');
    }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    audioPosRef.current = null;
  }, []);

  /** Audio de una frase: se genera una sola vez y se reutiliza (precarga). */
  const neuralAudioFor = useCallback(
    (block: number, chunk: number) => {
      const key = `${block}:${chunk}`;
      let promise = prefetchRef.current.get(key);
      if (!promise) {
        const text = speakableText(getChunks(block)[chunk].text).replace(/\s+/g, ' ').trim();
        promise = getNeural().synthesize(text);
        promise.catch(() => prefetchRef.current.delete(key));
        prefetchRef.current.set(key, promise);
      }
      return promise;
    },
    [getChunks, getNeural],
  );

  const nextPosition = useCallback(
    (block: number, chunk: number) => {
      const blocks = getBlocks();
      let b = block;
      let c = chunk + 1;
      while (b < blocks.length && c >= getChunks(b).length) {
        b++;
        c = 0;
      }
      return b < blocks.length ? { block: b, chunk: c } : null;
    },
    [getBlocks, getChunks],
  );

  /** Reproduce el audio ya cargado y encadena la frase siguiente al terminar. */
  const startAudio = useCallback(
    (gen: number, block: number, chunk: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.playbackRate = prefsRef.current.rate;
      audio.onended = () => {
        if (gen !== genRef.current) return;
        prefetchRef.current.delete(`${block}:${chunk}`);
        speakNeuralRef.current({ block, chunk: chunk + 1, char: 0 });
      };
      audio.onerror = () => {
        if (gen !== genRef.current) return;
        genRef.current++;
        setStatusBoth('paused');
        setError('No se pudo reproducir el audio de la voz integrada.');
      };
      const played = audio.play();
      played?.catch((err: unknown) => {
        if (gen !== genRef.current) return;
        genRef.current++;
        setStatusBoth('paused');
        setError(
          (err as { name?: string })?.name === 'NotAllowedError'
            ? 'El navegador bloqueó el audio. Pulsa reproducir de nuevo.'
            : 'No se pudo reproducir el audio de la voz integrada.',
        );
      });
    },
    [setStatusBoth],
  );

  const speakNeural = useCallback(
    (pos: Position) => {
      const blocks = getBlocks();
      let { block, chunk } = pos;
      while (block < blocks.length && chunk >= getChunks(block).length) {
        block++;
        chunk = 0;
      }
      if (block >= blocks.length) {
        genRef.current++;
        releaseAudio();
        prefetchRef.current.clear();
        clearHighlight();
        setLoading(false);
        posRef.current = { block: 0, chunk: 0, char: 0 };
        setStatusBoth('idle');
        return;
      }

      const gen = ++genRef.current;
      posRef.current = { block, chunk, char: 0 };
      const piece = getChunks(block)[chunk];
      const el = blocks[block];
      if (!el.classList.contains(BLOCK_CLASS)) markBlock(block);
      setRangeHighlight(SENTENCE_HIGHLIGHT, rangeFor(el, piece.start, piece.start + piece.text.length));
      setRangeHighlight(WORD_HIGHLIGHT, null); // la voz integrada no informa palabra por palabra
      setError(null);
      setStatusBoth('playing');

      const audioPromise = neuralAudioFor(block, chunk);
      // mientras suena esta frase se prepara la siguiente, para leer sin pausas
      let next = nextPosition(block, chunk);
      for (let i = 0; i < NEURAL_PREFETCH && next; i++) {
        void neuralAudioFor(next.block, next.chunk).catch(() => undefined);
        next = nextPosition(next.block, next.chunk);
      }

      setLoading(true);
      audioPromise
        .then((blob) => {
          if (gen !== genRef.current) return;
          setLoading(false);
          releaseAudio();
          const audio = (audioRef.current ??= new Audio());
          const url = URL.createObjectURL(blob);
          audioUrlRef.current = url;
          audioPosRef.current = { block, chunk };
          audio.src = url;
          startAudio(gen, block, chunk);
        })
        .catch((err: unknown) => {
          if (gen !== genRef.current) return;
          setLoading(false);
          genRef.current++;
          setStatusBoth('paused');
          const message = err instanceof Error ? err.message : String(err);
          // modelo dañado (ya borrado) o ausente: se vuelve a ofrecer la descarga, sin error rojo
          if (message === NEURAL_ERROR.corrupt || message === NEURAL_ERROR.missing) {
            prefetchRef.current.clear();
            setNeuralStatus('missing');
            setOfferReason(message === NEURAL_ERROR.corrupt ? 'corrupt' : 'missing');
            setOfferNeural(true);
            return;
          }
          setError(`La voz integrada falló: ${message}`);
        });
    },
    [
      getBlocks,
      getChunks,
      releaseAudio,
      clearHighlight,
      setStatusBoth,
      markBlock,
      neuralAudioFor,
      nextPosition,
      startAudio,
    ],
  );
  speakNeuralRef.current = speakNeural;

  const switchEngine = useCallback((next: TTSEngine) => {
    engineRef.current = next;
    setEngineState(next);
    const prefsNext = { ...prefsRef.current, engine: next };
    prefsRef.current = prefsNext;
    setPrefs(prefsNext);
    saveTTSPrefs(prefsNext);
  }, []);

  /**
   * La voz del navegador no funciona en este dispositivo: si la integrada ya está
   * descargada se continúa con ella; si no, se ofrece descargarla.
   */
  const browserGaveUp = useCallback(
    (pos: Position, message: string) => {
      genRef.current++;
      synth?.cancel();
      setStatusBoth('paused');
      if (!neuralSupported) {
        setError(message);
        return;
      }
      posRef.current = pos;
      getNeural()
        .isDownloaded()
        .then((ready) => {
          if (ready) {
            setNeuralStatus('ready');
            switchEngine('neural');
            setNotice({
              id: Date.now(),
              text: 'La voz del navegador no funciona en este dispositivo: se usa la voz integrada.',
            });
            speakNeuralRef.current(pos);
          } else {
            setNeuralStatus('missing');
            setOfferReason('browser');
            setOfferNeural(true);
          }
        })
        .catch(() => setError(message));
    },
    [synth, neuralSupported, getNeural, switchEngine, setStatusBoth],
  );

  // ── reproducción con la voz del navegador ──────────────
  const speak = useCallback(
    (pos: Position, afterEnd = false) => {
      if (engineRef.current === 'neural') return speakNeural(pos);
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
      // misma longitud que el original: las posiciones de los eventos boundary siguen valiendo
      const text = speakableText(piece.text.slice(char));

      if (!el.classList.contains(BLOCK_CLASS)) markBlock(block);
      setRangeHighlight(SENTENCE_HIGHLIGHT, rangeFor(el, piece.start, piece.start + piece.text.length));
      setRangeHighlight(WORD_HIGHLIGHT, null);

      const utterance = new SpeechSynthesisUtterance(text);
      const v = voiceRef.current;
      // plan de intentos: voz elegida → solo su idioma → otras variantes de español → sistema
      const plan = attemptPlan(v);
      const attempt = plan[Math.min(fallbackRef.current, plan.length - 1)];
      if (v && attempt.voice) utterance.voice = v;
      if (attempt.lang) utterance.lang = attempt.lang; // siempre normalizado (es_US → es-US)
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
      /**
       * Programa la siguiente llamada a speak. En Android, pedir otra frase dentro del
       * mismo evento (onend/onerror) hace que el motor la rechace con "synthesis-failed":
       * se deja una pausa breve. Si entretanto se pausa o detiene, `gen` cambia y no se habla.
       */
      const continueWith = (next: Position, delay: number) => {
        if (!IS_ANDROID || delay <= 0) return speak(next, true);
        setTimeout(() => {
          if (gen === genRef.current) speak(next, true);
        }, delay);
      };

      utterance.onend = () => {
        started = true;
        if (gen !== genRef.current) return;
        failStreakRef.current = 0;
        firstFailPosRef.current = null;
        continueWith({ block, chunk: chunk + 1, char: 0 }, ANDROID_GAP_MS);
      };
      utterance.onerror = (event) => {
        if (gen !== genRef.current) return;
        if (event.error === 'interrupted' || event.error === 'canceled') return;
        // se calcula ya: la función de setErrorLog se ejecuta después de cambiar fallbackRef
        const entry = `${event.error} (párrafo ${block + 1}, intento ${fallbackRef.current + 1})`;
        setErrorLog((log) => [...log.slice(-4), entry]);
        firstFailPosRef.current ??= { block, chunk, char: 0 };
        if (RETRYABLE_ERRORS.has(event.error)) {
          // 1) se reintenta la misma frase con una configuración más simple, esperando un poco más cada vez
          if (fallbackRef.current < attemptPlan(voiceRef.current).length - 1) {
            fallbackRef.current++;
            setFallbackLevel(fallbackRef.current);
            const resume = posRef.current; // conserva la última palabra leída
            const from = resume.block === block && resume.chunk === chunk ? resume.char : char;
            continueWith({ block, chunk, char: from }, RETRY_DELAY_MS * fallbackRef.current);
            return;
          }
          // 2) si ni así se puede leer, se salta esa frase y se sigue, salvo que fallen varias seguidas
          failStreakRef.current++;
          if (failStreakRef.current < MAX_SKIPPED_IN_A_ROW) {
            setNotice({ id: Date.now(), text: 'Se saltó una frase que el motor de voz no pudo leer.' });
            continueWith({ block, chunk: chunk + 1, char: 0 }, RETRY_DELAY_MS);
            return;
          }
        }
        failStreakRef.current = 0;
        const resumeAt = firstFailPosRef.current ?? { block, chunk, char: 0 };
        firstFailPosRef.current = null;
        // el motor del navegador no sirve aquí: se pasa a la voz integrada (o se ofrece)
        if (RETRYABLE_ERRORS.has(event.error))
          return browserGaveUp(resumeAt, speechErrorMessage(event.error));
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
          browserGaveUp({ block, chunk, char: 0 }, voiceNotStartedMessage(voicesRef.current.length));
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
    [synth, getBlocks, getChunks, markBlock, clearHighlight, setStatusBoth, speakNeural, browserGaveUp],
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
      if (!supported) return;
      setOfferNeural(false);
      if (fromBlock !== undefined) return speak({ block: fromBlock, chunk: 0, char: 0 });
      if (statusRef.current === 'paused') {
        // voz integrada en pausa a mitad de frase: se continúa el mismo audio (pausa real)
        const audio = audioRef.current;
        const loaded = audioPosRef.current;
        const { block, chunk } = posRef.current;
        if (
          engineRef.current === 'neural' &&
          audio?.src &&
          !audio.ended &&
          loaded?.block === block &&
          loaded.chunk === chunk
        ) {
          const gen = ++genRef.current;
          setStatusBoth('playing');
          return startAudio(gen, block, chunk);
        }
        return speak(posRef.current);
      }
      if (statusRef.current === 'idle') return speak({ block: firstVisibleBlock(), chunk: 0, char: 0 });
    },
    [supported, speak, firstVisibleBlock, startAudio, setStatusBoth],
  );

  const pause = useCallback(() => {
    if (!supported || statusRef.current !== 'playing') return;
    genRef.current++;
    if (engineRef.current === 'neural') {
      audioRef.current?.pause();
      setLoading(false);
    } else {
      synth?.cancel();
    }
    setStatusBoth('paused');
  }, [supported, synth, setStatusBoth]);

  const toggle = useCallback(() => {
    if (statusRef.current === 'playing') pause();
    else play();
  }, [pause, play]);

  const stop = useCallback(() => {
    if (!supported) return;
    genRef.current++;
    synth?.cancel();
    releaseAudio();
    prefetchRef.current.clear();
    setLoading(false);
    setOfferNeural(false);
    clearHighlight();
    posRef.current = { block: 0, chunk: 0, char: 0 };
    setStatusBoth('idle');
  }, [supported, synth, releaseAudio, clearHighlight, setStatusBoth]);

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
        releaseAudio();
        setLoading(false);
      }
      if (index !== -1) {
        posRef.current = { block: index, chunk: 0, char: 0 };
        setRangeHighlight(SENTENCE_HIGHLIGHT, null);
        setRangeHighlight(WORD_HIGHLIGHT, null);
        markBlock(index);
      }
      setStatusBoth('paused');
    },
    [getBlocks, synth, markBlock, setStatusBoth, releaseAudio],
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
      // la voz integrada cambia de velocidad al instante, sin reiniciar la frase
      if (engineRef.current === 'neural') {
        if (audioRef.current) audioRef.current.playbackRate = next.rate;
        return;
      }
      restartIfPlaying();
    },
    [restartIfPlaying],
  );

  /** Descarga la voz integrada; con `resume` sigue leyendo al terminar (cuando la ofreció un fallo). */
  const downloadNeural = useCallback(
    async (resume = true) => {
      if (!neuralSupported) return false;
      setNeuralStatus('downloading');
      setNeuralProgress(0);
      setError(null);
      try {
        await getNeural().download((p) => setNeuralProgress(p));
        setNeuralStatus('ready');
        setOfferNeural(false);
        switchEngine('neural');
        if (resume) speakNeuralRef.current(posRef.current);
        return true;
      } catch (err) {
        setNeuralStatus('error');
        const message = err instanceof Error ? err.message : String(err);
        setError(
          message === NEURAL_ERROR.corrupt
            ? 'La descarga de la voz quedó incompleta (se borró la copia dañada). Inténtalo de nuevo, mejor con wifi.'
            : `No se pudo descargar la voz integrada (${message}). Revisa tu conexión e inténtalo de nuevo, mejor con wifi.`,
        );
        return false;
      }
    },
    [neuralSupported, getNeural, switchEngine],
  );

  /** Elegir motor a mano en el panel de voz. */
  const setEngine = useCallback(
    async (next: TTSEngine) => {
      if (next === engineRef.current) return;
      const wasPlaying = statusRef.current === 'playing';
      if (wasPlaying) {
        genRef.current++;
        synth?.cancel();
        releaseAudio();
        setLoading(false);
        setStatusBoth('paused');
      }
      if (next === 'neural') {
        const ready =
          neuralStatus === 'ready' ||
          (await getNeural()
            .isDownloaded()
            .catch(() => false));
        if (!ready) {
          setNeuralStatus('missing');
          return void (await downloadNeural(wasPlaying));
        }
        setNeuralStatus('ready');
      }
      switchEngine(next);
      if (wasPlaying) speak(posRef.current);
    },
    [synth, releaseAudio, setStatusBoth, neuralStatus, getNeural, downloadNeural, switchEngine, speak],
  );

  const dismissNeuralOffer = useCallback(() => setOfferNeural(false), []);

  // con la voz integrada elegida: se comprueba si está descargada (para el panel) y,
  // si lo está, se precarga el modelo para que la primera frase no tarde al pulsar ▶
  useEffect(() => {
    if (engine !== 'neural' || !neuralSupported) return;
    let alive = true;
    const voice = getNeural();
    voice
      .isDownloaded()
      .then((ready) => {
        if (!alive) return;
        setNeuralStatus(ready ? 'ready' : 'missing');
        if (!ready) return;
        // si al precargar resulta que la copia guardada está dañada, el worker ya la borró
        voice.warmup().catch((err: unknown) => {
          if (alive && err instanceof Error && err.message === NEURAL_ERROR.corrupt)
            setNeuralStatus('missing');
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [engine, neuralSupported, getNeural]);

  const setVoice = useCallback(
    (voiceURI: string) => {
      const next = { ...prefsRef.current, voiceURI };
      prefsRef.current = next;
      setPrefs(next);
      saveTTSPrefs(next);
      voiceRef.current = voicesRef.current.find((v) => v.voiceURI === voiceURI) ?? voiceRef.current;
      fallbackRef.current = 0; // elección explícita: se vuelve a usar la voz elegida
      setFallbackLevel(0);
      restartIfPlaying();
    },
    [restartIfPlaying],
  );

  // ── limpieza al salir del lector ───────────────────────
  useEffect(() => {
    const container = containerHolder.current.current;
    const prefetched = prefetchRef.current; // el mismo Map durante toda la vida del hook
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
      releaseAudio();
      prefetched.clear();
      clearAllHighlights(container);
    };
  }, [synth, releaseAudio]);

  return {
    supported,
    browserSupported,
    engine,
    setEngine,
    neural: { supported: neuralSupported, status: neuralStatus, progress: neuralProgress },
    offerNeural,
    offerReason,
    dismissNeuralOffer,
    downloadNeural,
    loading,
    status,
    error,
    notice,
    errorLog,
    fallbackLevel,
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
