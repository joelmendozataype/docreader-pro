/**
 * speechSynthesis simulado para tests: guarda lo que se "dice" y permite
 * disparar a mano los eventos start / boundary / end / error.
 *
 * Modos para reproducir fallos reales:
 *  - autoStart = false → la voz nunca arranca (Brave sin voces, motor de voz ausente)
 *  - androidCancel = true → cancel() es asíncrono y también anula lo que se pida
 *    hablar en el mismo instante (comportamiento de Chrome/Brave en Android)
 */

type Handler<E> = ((event: E) => void) | null;

export class FakeUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  lang = '';
  rate = 1;
  onstart: Handler<object> = null;
  onboundary: Handler<{ name: string; charIndex: number; charLength: number }> = null;
  onend: Handler<object> = null;
  onerror: Handler<{ error: string }> = null;

  constructor(text: string) {
    this.text = text;
  }
}

export function voice(name: string, lang: string, localService = true): SpeechSynthesisVoice {
  return { name, lang, voiceURI: `${name}|${lang}`, localService, default: false } as SpeechSynthesisVoice;
}

export class FakeSynth {
  spoken: FakeUtterance[] = [];
  /** enunciados que el "motor" descartó por el fallo de cancel() en Android */
  dropped: FakeUtterance[] = [];
  current: FakeUtterance | null = null;
  cancelCount = 0;
  resumeCount = 0;
  pending = false;
  autoStart = true;
  androidCancel = false;
  voices: SpeechSynthesisVoice[];
  private listeners = new Set<() => void>();
  private cancelling = false;

  constructor(voices: SpeechSynthesisVoice[]) {
    this.voices = voices;
  }

  get speaking() {
    return this.current !== null;
  }
  getVoices() {
    return this.voices;
  }
  speak(u: FakeUtterance) {
    if (this.androidCancel && this.cancelling) {
      // el cancel() pendiente se lleva también este enunciado: no suena nada
      this.dropped.push(u);
      return;
    }
    this.current = u;
    this.spoken.push(u);
    if (this.autoStart) queueMicrotask(() => this.current === u && u.onstart?.({}));
  }
  cancel() {
    this.cancelCount++;
    const u = this.current;
    this.current = null;
    u?.onerror?.({ error: 'interrupted' });
    if (this.androidCancel) {
      this.cancelling = true;
      setTimeout(() => {
        this.cancelling = false;
      }, 100);
    }
  }
  resume() {
    this.resumeCount++;
  }
  addEventListener(_: string, fn: () => void) {
    this.listeners.add(fn);
  }
  removeEventListener(_: string, fn: () => void) {
    this.listeners.delete(fn);
  }
  /** cambia las voces y avisa como lo haría el navegador */
  setVoices(voices: SpeechSynthesisVoice[]) {
    this.voices = voices;
    this.listeners.forEach((fn) => fn());
  }

  // helpers de test
  boundary(charIndex: number, charLength = 0) {
    this.current?.onboundary?.({ name: 'word', charIndex, charLength });
  }
  finish() {
    const u = this.current;
    this.current = null;
    u?.onend?.({});
  }
  fail(error: string) {
    const u = this.current;
    this.current = null;
    u?.onerror?.({ error });
  }
  get last() {
    return this.spoken[this.spoken.length - 1];
  }
}

export function installFakeSpeech(voices = [voice('Helena', 'es-ES'), voice('Zira', 'en-US')]) {
  const synth = new FakeSynth(voices);
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: FakeUtterance,
    configurable: true,
    writable: true,
  });
  return synth;
}

export function uninstallFakeSpeech() {
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
  delete (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance;
}
