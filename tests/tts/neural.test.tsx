// Voz integrada (Piper): reproducción, pausa, velocidad y cambio automático cuando
// la voz del navegador no funciona (caso real: Brave en un ZTE con Android).
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TTSControls } from '@/components/reader/TTSControls';
import { useTTS } from '@/hooks/useTTS';
import type { NeuralEngine } from '@/lib/tts/neural';
import { TTS_PREFS_KEY } from '@/lib/tts/prefs';

import { type FakeSynth, installFakeSpeech, uninstallFakeSpeech, voice } from '../helpers/fake-speech';

class FakeAudio {
  static instances: FakeAudio[] = [];
  src = '';
  playbackRate = 1;
  paused = true;
  ended = false;
  playCount = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeAudio.instances.push(this);
  }
  play() {
    this.paused = false;
    this.playCount++;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  /** helper de test: el audio terminó */
  finish() {
    this.ended = true;
    this.paused = true;
    this.onended?.();
    this.ended = false;
  }
}

function fakeNeural(downloaded = true) {
  const state = { downloaded };
  const engine = {
    isDownloaded: vi.fn(async () => state.downloaded),
    download: vi.fn(async (cb?: (f: number) => void) => {
      cb?.(0.5);
      cb?.(1);
      state.downloaded = true;
    }),
    synthesize: vi.fn(async (text: string) => new Blob([text], { type: 'audio/wav' })),
    remove: vi.fn(async () => undefined),
    warmup: vi.fn(async () => undefined),
    dispose: vi.fn(),
  } satisfies NeuralEngine;
  return { engine, state };
}

let root: HTMLDivElement;
let synth: FakeSynth;

beforeEach(() => {
  localStorage.clear();
  FakeAudio.instances = [];
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('Worker', class {});
  Object.defineProperty(navigator, 'storage', {
    value: { getDirectory: vi.fn() },
    configurable: true,
  });
  URL.createObjectURL = vi.fn(() => `blob:${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
  synth = installFakeSpeech([voice('Helena', 'es-ES')]);
  root = document.createElement('div');
  root.innerHTML = '<h2>Capítulo uno</h2><p>Primera frase.</p><p>Final.</p>';
  document.body.replaceChildren(root);
});

afterEach(() => {
  vi.unstubAllGlobals();
  uninstallFakeSpeech();
  Reflect.deleteProperty(navigator, 'storage');
});

/** espera a que se resuelvan las promesas pendientes (síntesis simulada) */
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

function setup(engine: NeuralEngine) {
  return renderHook(() => useTTS({ containerRef: { current: root }, autoScroll: false, neural: engine }));
}

describe('voz integrada', () => {
  it('lee con audio generado, prepara la frase siguiente y encadena hasta el final', async () => {
    localStorage.setItem(TTS_PREFS_KEY, JSON.stringify({ engine: 'neural' }));
    const { engine } = fakeNeural();
    const { result } = setup(engine);
    expect(result.current.engine).toBe('neural');

    act(() => result.current.play(0));
    expect(result.current.loading).toBe(true);
    await flush();
    expect(result.current.loading).toBe(false);
    expect(engine.synthesize.mock.calls.map(([t]) => t)).toEqual(['Capítulo uno', 'Primera frase.']); // + precarga
    expect(synth.spoken).toHaveLength(0); // no usa la voz del navegador
    const audio = FakeAudio.instances[0];
    expect(audio.playCount).toBe(1);
    expect(root.querySelector('.tts-active')?.textContent).toBe('Capítulo uno');

    act(() => audio.finish());
    await flush();
    expect(root.querySelector('.tts-active')?.textContent).toBe('Primera frase.');
    act(() => audio.finish());
    await flush();
    act(() => audio.finish());
    await flush();
    expect(result.current.status).toBe('idle');
    // cada frase se generó una sola vez gracias a la precarga
    expect(engine.synthesize).toHaveBeenCalledTimes(3);
  });

  it('la pausa es real: al continuar sigue el mismo audio sin volver a generarlo', async () => {
    localStorage.setItem(TTS_PREFS_KEY, JSON.stringify({ engine: 'neural' }));
    const { engine } = fakeNeural();
    const { result } = setup(engine);
    act(() => result.current.play(0));
    await flush();
    const audio = FakeAudio.instances[0];
    const calls = engine.synthesize.mock.calls.length;

    act(() => result.current.pause());
    expect(audio.paused).toBe(true);
    expect(result.current.status).toBe('paused');

    act(() => result.current.play());
    expect(audio.paused).toBe(false);
    expect(audio.playCount).toBe(2);
    expect(engine.synthesize.mock.calls.length).toBe(calls);
  });

  it('la velocidad cambia al instante, sin reiniciar la frase', async () => {
    localStorage.setItem(TTS_PREFS_KEY, JSON.stringify({ engine: 'neural' }));
    const { engine } = fakeNeural();
    const { result } = setup(engine);
    act(() => result.current.play(0));
    await flush();
    act(() => result.current.setRate(1.5));
    expect(FakeAudio.instances[0].playbackRate).toBe(1.5);
    expect(FakeAudio.instances[0].playCount).toBe(1);
  });
});

describe('cuando la voz del navegador no funciona', () => {
  /** el navegador rechaza todo: agota el plan de reintentos y 3 frases seguidas */
  function failEverything() {
    for (let i = 0; i < 30 && synth.current; i++) act(() => synth.fail('synthesis-failed'));
  }

  it('si la voz integrada no está descargada, ofrece descargarla y luego sigue leyendo', async () => {
    const { engine } = fakeNeural(false);
    const { result } = setup(engine);
    act(() => result.current.play(0));
    failEverything();
    await flush();

    expect(result.current.status).toBe('paused');
    expect(result.current.offerNeural).toBe(true);
    expect(result.current.error).toBeNull();

    await act(async () => {
      await result.current.downloadNeural(true);
    });
    await flush();
    expect(engine.download).toHaveBeenCalled();
    expect(result.current.engine).toBe('neural');
    expect(result.current.offerNeural).toBe(false);
    expect(result.current.status).toBe('playing');
    // retoma desde donde empezaron los fallos (el primer párrafo)
    expect(engine.synthesize.mock.calls[0][0]).toBe('Capítulo uno');
    expect(JSON.parse(localStorage.getItem(TTS_PREFS_KEY)!).engine).toBe('neural');
  });

  it('si ya está descargada, cambia sola y avisa', async () => {
    const { engine } = fakeNeural(true);
    const { result } = setup(engine);
    act(() => result.current.play(0));
    failEverything();
    await flush();
    await flush();
    expect(result.current.engine).toBe('neural');
    expect(result.current.notice?.text).toContain('se usa la voz integrada');
    expect(result.current.status).toBe('playing');
    expect(engine.synthesize).toHaveBeenCalled();
  });

  it('la barra muestra la oferta con un botón para descargar', async () => {
    const { engine } = fakeNeural(false);
    const { result } = setup(engine);
    act(() => result.current.play(0));
    failEverything();
    await flush();

    const { rerender } = render(<TTSControls tts={result.current} />);
    expect(screen.getByText('La voz del navegador no funciona en este dispositivo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Descargar voz integrada y continuar/ }));
    await flush();
    rerender(<TTSControls tts={result.current} />);
    expect(engine.download).toHaveBeenCalled();
    expect(screen.queryByText('La voz del navegador no funciona en este dispositivo')).toBeNull();
  });

  it('en el panel se puede elegir el motor a mano', async () => {
    const { engine } = fakeNeural(true);
    const { result } = setup(engine);
    await act(async () => {
      await result.current.setEngine('neural');
    });
    expect(result.current.engine).toBe('neural');
    await act(async () => {
      await result.current.setEngine('browser');
    });
    expect(result.current.engine).toBe('browser');
  });
});

describe('voz integrada dañada (descarga cortada con datos móviles)', () => {
  it('reconoce el error real de ONNX como modelo dañado', async () => {
    const { looksLikeCorruptModel } = await import('@/lib/tts/neural-protocol');
    expect(
      looksLikeCorruptModel(
        new Error(
          "Can't create a session. ERROR_CODE: 2, ERROR_MESSAGE: No graph was found in the protobuf.",
        ),
      ),
    ).toBe(true);
    expect(looksLikeCorruptModel(new Error('Failed to fetch'))).toBe(false);
  });

  it('al leer con una copia dañada se ofrece descargarla de nuevo, sin error rojo, y luego sigue', async () => {
    localStorage.setItem(TTS_PREFS_KEY, JSON.stringify({ engine: 'neural' }));
    const { engine } = fakeNeural(true);
    engine.synthesize.mockRejectedValueOnce(new Error('VOICE_CORRUPT'));
    const { result } = setup(engine);

    act(() => result.current.play(0));
    await flush();
    expect(result.current.status).toBe('paused');
    expect(result.current.error).toBeNull();
    expect(result.current.offerNeural).toBe(true);
    expect(result.current.offerReason).toBe('corrupt');
    expect(result.current.neural.status).toBe('missing');

    render(<TTSControls tts={result.current} />);
    expect(screen.getByText('La voz integrada se descargó incompleta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Descargar de nuevo y continuar/ })).toBeInTheDocument();

    await act(async () => {
      await result.current.downloadNeural(true);
    });
    await flush();
    expect(result.current.status).toBe('playing');
    expect(result.current.offerNeural).toBe(false);
  });

  it('si la descarga queda incompleta, lo explica y sugiere wifi', async () => {
    const { engine } = fakeNeural(false);
    engine.download.mockRejectedValueOnce(new Error('VOICE_CORRUPT'));
    const { result } = setup(engine);
    await act(async () => {
      await result.current.downloadNeural(false);
    });
    expect(result.current.neural.status).toBe('error');
    expect(result.current.error).toContain('incompleta');
    expect(result.current.error).toContain('wifi');
  });
});
