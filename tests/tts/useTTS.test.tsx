import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TTSControls } from '@/components/reader/TTSControls';
import { useTTS } from '@/hooks/useTTS';
import { TTS_PREFS_KEY } from '@/lib/tts/prefs';

import { type FakeSynth, installFakeSpeech, uninstallFakeSpeech, voice } from '../helpers/fake-speech';

let synth: FakeSynth;
let root: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  synth = installFakeSpeech([voice('Zira', 'en-US'), voice('Helena', 'es-ES'), voice('Sabina', 'es-MX')]);
  root = document.createElement('div');
  root.innerHTML = `
    <h2 id="sec-1">Capítulo uno</h2>
    <p>Primera frase del párrafo. Segunda frase del párrafo.</p>
    <h2 id="sec-2">Capítulo dos</h2>
    <p>Texto final.</p>`;
  document.body.replaceChildren(root);
});

afterEach(() => uninstallFakeSpeech());

function setup() {
  return renderHook(() => useTTS({ containerRef: { current: root }, autoScroll: false }));
}

describe('useTTS', () => {
  it('elige una voz en español (Latinoamérica antes que España)', () => {
    const { result } = setup();
    expect(result.current.supported).toBe(true);
    expect(result.current.voice?.lang).toBe('es-MX');
    expect(result.current.voices[0].lang).toBe('es-MX');
  });

  it('lee bloque a bloque y frase a frase, y termina limpiando', () => {
    const { result } = setup();
    act(() => result.current.play());
    expect(result.current.status).toBe('playing');
    expect(synth.last.text).toBe('Capítulo uno');
    expect(synth.last.lang).toBe('es-MX');
    expect(root.querySelector('.tts-active')?.textContent).toBe('Capítulo uno');

    // frases cortas se agrupan en un fragmento (≤ 220 caracteres)
    act(() => synth.finish());
    expect(synth.last.text).toBe('Primera frase del párrafo. Segunda frase del párrafo.');
    expect(result.current.currentBlock).toBe(1);

    act(() => synth.finish());
    act(() => synth.finish());
    expect(synth.last.text).toBe('Texto final.');
    act(() => synth.finish());

    expect(result.current.status).toBe('idle');
    expect(root.querySelectorAll('.tts-active')).toHaveLength(0);
    expect(synth.spoken.map((u) => u.text)).toEqual([
      'Capítulo uno',
      'Primera frase del párrafo. Segunda frase del párrafo.',
      'Capítulo dos',
      'Texto final.',
    ]);
  });

  it('pausa y retoma desde la última palabra anunciada', () => {
    const { result } = setup();
    act(() => result.current.play(1));
    act(() => synth.boundary(27, 7)); // "Segunda"
    act(() => result.current.pause());
    expect(result.current.status).toBe('paused');
    expect(synth.speaking).toBe(false);
    expect(root.querySelector('.tts-active')).not.toBeNull(); // el párrafo sigue marcado

    act(() => result.current.toggle());
    expect(result.current.status).toBe('playing');
    expect(synth.last.text).toBe('Segunda frase del párrafo.');
  });

  it('cambiar la velocidad reinicia la frase actual y se guarda', () => {
    const { result } = setup();
    act(() => result.current.play());
    act(() => result.current.setRate(1.5));
    expect(synth.last.rate).toBe(1.5);
    expect(synth.last.text).toBe('Capítulo uno');
    expect(JSON.parse(localStorage.getItem(TTS_PREFS_KEY)!).rate).toBe(1.5);
  });

  it('cambiar de voz se guarda y se aplica', () => {
    const { result } = setup();
    act(() => result.current.setVoice('Helena|es-ES'));
    expect(result.current.voice?.name).toBe('Helena');
    act(() => result.current.play());
    expect(synth.last.voice?.name).toBe('Helena');
    expect(JSON.parse(localStorage.getItem(TTS_PREFS_KEY)!).voiceURI).toBe('Helena|es-ES');
  });

  it('al navegar con el índice se pausa y luego sigue desde ese título', () => {
    const { result } = setup();
    act(() => result.current.play());
    act(() => result.current.pauseAtElement(document.getElementById('sec-2')!));
    expect(result.current.status).toBe('paused');
    expect(synth.speaking).toBe(false);
    act(() => result.current.play());
    expect(synth.last.text).toBe('Capítulo dos');
  });

  it('navegar sin lectura activa no hace nada', () => {
    const { result } = setup();
    act(() => result.current.pauseAtElement(document.getElementById('sec-2')!));
    expect(result.current.status).toBe('idle');
    expect(synth.spoken).toHaveLength(0);
  });

  it('saltar párrafos', () => {
    const { result } = setup();
    act(() => result.current.play());
    act(() => result.current.skip(2));
    expect(synth.last.text).toBe('Capítulo dos');
    act(() => result.current.skip(-10));
    expect(synth.last.text).toBe('Capítulo uno');
  });

  it('ignora "interrupted" y avisa de errores reales', () => {
    const { result } = setup();
    act(() => result.current.play());
    act(() => synth.cancel()); // cancelación externa: se ignora
    expect(result.current.error).toBeNull();

    act(() => result.current.play(1));
    act(() => synth.fail('synthesis-failed'));
    expect(result.current.status).toBe('paused');
    expect(result.current.error).toContain('Prueba con otra voz');
  });

  it('las voces que llegan tarde (voiceschanged) se cargan', () => {
    synth.voices = [];
    const { result } = setup();
    expect(result.current.voices).toHaveLength(0);
    act(() => synth.setVoices([voice('Helena', 'es-ES')]));
    expect(result.current.voice?.name).toBe('Helena');
  });

  it('al desmontar se detiene la voz y se quita el resaltado', () => {
    const { result, unmount } = setup();
    act(() => result.current.play());
    const before = synth.cancelCount;
    unmount();
    expect(synth.cancelCount).toBeGreaterThan(before);
    expect(root.querySelectorAll('.tts-active')).toHaveLength(0);
  });
});

describe('sin soporte de voz', () => {
  it('useTTS informa y TTSControls muestra la alternativa', () => {
    uninstallFakeSpeech();
    const { result } = setup();
    expect(result.current.supported).toBe(false);
    act(() => result.current.play());
    expect(result.current.status).toBe('idle');

    render(<TTSControls tts={result.current} />);
    expect(screen.getByRole('note')).toHaveTextContent('Tu navegador no permite la lectura en voz alta');
  });
});

describe('TTSControls', () => {
  it('botones con nombres accesibles que cambian con el estado', () => {
    const { result } = setup();
    const { rerender } = render(<TTSControls tts={result.current} />);
    expect(screen.getByRole('region', { name: 'Lectura en voz alta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Detener lectura' })).toBeDisabled();
    act(() => screen.getByRole('button', { name: 'Leer en voz alta' }).click());
    rerender(<TTSControls tts={result.current} />);
    expect(screen.getByRole('button', { name: 'Pausar lectura' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Leyendo en voz alta')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Velocidad de lectura' })).toHaveValue('1');
  });
});
