// Fallos de la voz en celulares (Android con Chrome/Brave) y su diagnóstico.
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type FakeSynth, installFakeSpeech, uninstallFakeSpeech, voice } from '../helpers/fake-speech';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }) }));

let synth: FakeSynth;
let root: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  toastError.mockClear();
  synth = installFakeSpeech([voice('Google español', 'es-US', false)]);
  root = document.createElement('div');
  root.innerHTML = '<p>Primera frase. Segunda frase.</p><p>Otro párrafo.</p><p>Fin.</p>';
  document.body.replaceChildren(root);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
  uninstallFakeSpeech();
});

/** Carga el hook con el userAgent indicado (IS_ANDROID se calcula al importar el módulo). */
async function loadHook(userAgent?: string) {
  if (userAgent) vi.stubGlobal('navigator', { ...navigator, userAgent });
  vi.resetModules();
  return import('@/hooks/useTTS');
}

describe('voz en Android', () => {
  it('entre frases no llama a cancel() (en Android anulaba la frase siguiente)', async () => {
    const { useTTS } = await loadHook();
    const { result } = renderHook(() => useTTS({ containerRef: { current: root }, autoScroll: false }));
    act(() => result.current.play());
    const cancels = synth.cancelCount;
    act(() => synth.finish());
    act(() => synth.finish());
    expect(synth.cancelCount).toBe(cancels);
    expect(synth.spoken.map((u) => u.text)).toEqual([
      'Primera frase. Segunda frase.',
      'Otro párrafo.',
      'Fin.',
    ]);
  });

  it('al cambiar la velocidad en plena lectura espera a que cancel() termine antes de hablar', async () => {
    vi.useFakeTimers();
    synth.androidCancel = true;
    const mod = await loadHook(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36',
    );
    const { result } = renderHook(() => mod.useTTS({ containerRef: { current: root }, autoScroll: false }));
    // al montar se limpia el audio previo con cancel(); el usuario pulsa ▶ segundos después
    act(() => vi.advanceTimersByTime(1000));

    act(() => result.current.play());
    expect(synth.last.text).toBe('Primera frase. Segunda frase.');

    act(() => result.current.setRate(1.5));
    // aún no habló: con el fallo de Android, hablar ya habría perdido la frase
    expect(synth.dropped).toHaveLength(0);
    act(() => vi.advanceTimersByTime(mod.ANDROID_CANCEL_DELAY_MS));
    expect(synth.dropped).toHaveLength(0);
    expect(synth.last.rate).toBe(1.5);
    expect(synth.speaking).toBe(true);
  });

  it('sin la espera (escritorio) sí se perdería: el simulador reproduce el fallo', () => {
    synth.androidCancel = true;
    synth.speak(new (window.SpeechSynthesisUtterance as never as new (t: string) => never)('a'));
    synth.cancel();
    synth.speak(new (window.SpeechSynthesisUtterance as never as new (t: string) => never)('b'));
    expect(synth.dropped).toHaveLength(1);
  });

  it('llama a resume() antes de hablar (Android puede quedar en pausa interna)', async () => {
    const { useTTS } = await loadHook();
    const { result } = renderHook(() => useTTS({ containerRef: { current: root }, autoScroll: false }));
    act(() => result.current.play());
    expect(synth.resumeCount).toBeGreaterThan(0);
  });
});

describe('si la voz no arranca', () => {
  it('se detiene y explica qué revisar (motor de voz y volumen)', async () => {
    vi.useFakeTimers();
    synth.autoStart = false;
    synth.speak = function speak(this: FakeSynth, u) {
      this.spoken.push(u); // el navegador acepta el texto pero no suena nada
    };
    const mod = await loadHook();
    const { result } = renderHook(() => mod.useTTS({ containerRef: { current: root }, autoScroll: false }));
    act(() => result.current.play());
    expect(result.current.status).toBe('playing');

    act(() => vi.advanceTimersByTime(mod.START_TIMEOUT_MS + 10));
    expect(result.current.status).toBe('paused');
    expect(result.current.error).toContain('Servicios de voz de Google');
  });

  it('sin voces (Brave con escudos) sugiere desactivar los escudos o usar Chrome', async () => {
    const { voiceNotStartedMessage } = await loadHook();
    const message = voiceNotStartedMessage(0);
    for (const word of ['Brave', 'escudos', 'Chrome']) expect(message).toContain(word);
    expect(voiceNotStartedMessage(3)).toContain('volumen multimedia');
  });

  it('si arranca, no hay aviso', async () => {
    vi.useFakeTimers();
    const mod = await loadHook();
    const { result } = renderHook(() => mod.useTTS({ containerRef: { current: root }, autoScroll: false }));
    act(() => result.current.play());
    await act(async () => {
      await Promise.resolve(); // onstart llega en un microtask
      vi.advanceTimersByTime(mod.START_TIMEOUT_MS + 10);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe('playing');
  });

  it('el error se muestra como notificación visible (en el celular el panel pasa desapercibido)', async () => {
    const { TTSControls } = await import('@/components/reader/TTSControls');
    const tts = {
      supported: true,
      status: 'paused',
      error: 'La voz no comenzó.',
      voices: [],
      voice: null,
      rate: 1,
      currentBlock: null,
      play: vi.fn(),
      pause: vi.fn(),
      toggle: vi.fn(),
      stop: vi.fn(),
      skip: vi.fn(),
      pauseAtElement: vi.fn(),
      setRate: vi.fn(),
      setVoice: vi.fn(),
    } as never;
    render(<TTSControls tts={tts} />);
    expect(toastError).toHaveBeenCalledWith(
      'Lectura en voz alta',
      expect.objectContaining({ description: 'La voz no comenzó.' }),
    );
  });
});

describe('ritmo de la voz en Android', () => {
  const ANDROID_UA =
    'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36';

  it('deja una pausa breve entre frases y la cancela si el usuario pausa', async () => {
    vi.useFakeTimers();
    const mod = await loadHook(ANDROID_UA);
    const { result } = renderHook(() => mod.useTTS({ containerRef: { current: root }, autoScroll: false }));
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.play());
    expect(synth.spoken).toHaveLength(1);

    act(() => synth.finish());
    expect(synth.spoken).toHaveLength(1); // no se pide la siguiente dentro del mismo evento
    act(() => vi.advanceTimersByTime(mod.ANDROID_GAP_MS));
    expect(synth.last.text).toBe('Otro párrafo.');

    act(() => synth.finish());
    act(() => result.current.pause()); // pausa durante la espera
    act(() => vi.advanceTimersByTime(mod.ANDROID_GAP_MS * 2));
    expect(synth.last.text).toBe('Otro párrafo.'); // no arrancó la siguiente
  });

  it('reintenta tras synthesis-failed con esperas crecientes', async () => {
    vi.useFakeTimers();
    const mod = await loadHook(ANDROID_UA);
    const { result } = renderHook(() => mod.useTTS({ containerRef: { current: root }, autoScroll: false }));
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.play());

    act(() => synth.fail('synthesis-failed'));
    expect(synth.spoken).toHaveLength(1);
    act(() => vi.advanceTimersByTime(mod.RETRY_DELAY_MS));
    expect(synth.spoken).toHaveLength(2);

    act(() => synth.fail('synthesis-failed'));
    act(() => vi.advanceTimersByTime(mod.RETRY_DELAY_MS));
    expect(synth.spoken).toHaveLength(2); // la segunda espera es el doble
    act(() => vi.advanceTimersByTime(mod.RETRY_DELAY_MS));
    expect(synth.spoken).toHaveLength(3);
    expect(synth.last.text).toBe('Primera frase. Segunda frase.');
    expect(result.current.error).toBeNull();
  });
});

describe('speakableText', () => {
  it('quita emojis y símbolos sin mover las posiciones del texto', async () => {
    const { speakableText } = await import('@/lib/tts/chunker');
    const input = 'Hola 👋 mundo ✔️ fin';
    const out = speakableText(input);
    expect(out).toHaveLength(input.length);
    expect(out.replace(/\s+/g, ' ')).toBe('Hola mundo fin');
    expect(speakableText('Costos del 50% — «e-commerce»')).toBe('Costos del 50% — «e-commerce»');
  });
});
