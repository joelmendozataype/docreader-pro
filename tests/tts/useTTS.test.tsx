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
    act(() => synth.fail('not-allowed')); // no se reintenta: requiere un nuevo toque del usuario
    expect(result.current.status).toBe('paused');
    expect(result.current.error).toContain('bloqueó el audio');
  });

  it('ante synthesis-failed recorre el plan: voz, su idioma, otras variantes de español y el sistema', () => {
    const { result } = setup();
    act(() => result.current.play(1));
    const text = synth.last.text;
    expect(synth.last.voice?.lang).toBe('es-MX');
    expect(synth.last.lang).toBe('es-MX');

    const expected = ['es-MX', 'es-US', 'es-ES', 'es', ''];
    for (const lang of expected) {
      act(() => synth.fail('synthesis-failed'));
      expect(synth.last.text).toBe(text); // siempre la misma frase
      expect(synth.last.voice).toBeNull(); // ya sin voz fija
      expect(synth.last.lang).toBe(lang);
      expect(result.current.error).toBeNull();
      expect(result.current.status).toBe('playing');
    }

    // la configuración que quedó se mantiene para las frases siguientes
    act(() => synth.finish());
    expect(synth.last.text).toBe('Capítulo dos');
    expect(synth.last.lang).toBe('');

    // una frase imposible de leer se salta y la lectura continúa, con un aviso informativo
    act(() => synth.fail('synthesis-failed'));
    expect(synth.last.text).toBe('Texto final.');
    expect(result.current.status).toBe('playing');
    expect(result.current.error).toBeNull();
    expect(result.current.notice?.text).toContain('Se saltó una frase');
  });

  it('si un idioma alternativo funciona, se sigue usando sin más reintentos', () => {
    const { result } = setup();
    act(() => result.current.play(1));
    act(() => synth.fail('synthesis-failed')); // voz es-MX falla
    act(() => synth.fail('synthesis-failed')); // es-MX sin voz falla
    expect(synth.last.lang).toBe('es-US');
    act(() => synth.finish()); // es-US funciona
    expect(synth.last.text).toBe('Capítulo dos');
    expect(synth.last.lang).toBe('es-US');
    expect(result.current.fallbackLevel).toBe(2);
  });

  it('se detiene y avisa solo si fallan varias frases seguidas', () => {
    const { result } = setup();
    act(() => result.current.play(0));
    for (let i = 0; i < 5; i++) act(() => synth.fail('synthesis-failed')); // agota el plan
    act(() => synth.fail('synthesis-failed')); // se salta «Capítulo uno»
    act(() => synth.fail('synthesis-failed')); // se salta el párrafo
    expect(result.current.status).toBe('playing');
    act(() => synth.fail('synthesis-failed')); // tercera frase seguida: se detiene
    expect(result.current.status).toBe('paused');
    expect(result.current.error).toContain('Elige otra voz');
  });

  it('una voz de Android con idioma «es_US» se pide como «es-US»', () => {
    synth.setVoices([voice('español Estados Unidos', 'es_US', false)]);
    const { result } = setup();
    act(() => result.current.play(1));
    expect(synth.last.lang).toBe('es-US');
  });

  it('el reintento retoma desde la última palabra leída', () => {
    const { result } = setup();
    act(() => result.current.play(1));
    act(() => synth.boundary(27, 7)); // "Segunda"
    act(() => synth.fail('synthesis-failed'));
    expect(synth.last.text).toBe('Segunda frase del párrafo.');
  });

  it('elegir una voz a mano vuelve a usarla aunque antes hubiera fallado', () => {
    const { result } = setup();
    act(() => result.current.play(1));
    act(() => synth.fail('synthesis-failed'));
    expect(synth.last.voice).toBeNull();
    act(() => result.current.setVoice('Helena|es-ES'));
    expect(synth.last.voice?.name).toBe('Helena');
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
