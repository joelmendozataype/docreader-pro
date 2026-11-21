/**
 * speechSynthesis simulado para tests: guarda lo que se "dice" y permite
 * disparar a mano los eventos boundary / end / error.
 */

type Handler<E> = ((event: E) => void) | null;

export class FakeUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  lang = '';
  rate = 1;
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
  current: FakeUtterance | null = null;
  cancelCount = 0;
  voices: SpeechSynthesisVoice[];
  private listeners = new Set<() => void>();

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
    this.current = u;
    this.spoken.push(u);
  }
  cancel() {
    this.cancelCount++;
    const u = this.current;
    this.current = null;
    u?.onerror?.({ error: 'interrupted' });
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
