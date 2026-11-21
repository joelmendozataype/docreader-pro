/**
 * Selección y orden de voces del sistema, priorizando español
 * (Perú primero, luego Latinoamérica y después España).
 */

export interface VoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}

const LANG_PRIORITY = ['es-pe', 'es-419', 'es-us', 'es-mx', 'es-co', 'es-cl', 'es-ar', 'es-es'];

export function isSpanish(voice: VoiceLike): boolean {
  return voice.lang.toLowerCase().replace('_', '-').startsWith('es');
}

/** Menor = mejor. */
function score(voice: VoiceLike): number {
  const lang = voice.lang.toLowerCase().replace('_', '-');
  if (!lang.startsWith('es')) return 1000;
  const idx = LANG_PRIORITY.indexOf(lang);
  let value = idx === -1 ? LANG_PRIORITY.length : idx;
  // voces neuronales/naturales suenan mucho mejor
  if (/natural|neural|online|google/i.test(voice.name)) value -= 0.5;
  return value;
}

/** Españolas primero (por preferencia), luego el resto por idioma y nombre. */
export function sortVoices<T extends VoiceLike>(voices: T[]): T[] {
  return [...voices].sort(
    (a, b) => score(a) - score(b) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name),
  );
}

/** Voz guardada si sigue disponible; si no, la mejor en español; si no hay, la predeterminada. */
export function pickVoice<T extends VoiceLike>(voices: T[], preferredURI?: string | null): T | null {
  if (!voices.length) return null;
  const saved = preferredURI ? voices.find((v) => v.voiceURI === preferredURI) : undefined;
  if (saved) return saved;
  const best = sortVoices(voices)[0];
  if (isSpanish(best)) return best;
  return voices.find((v) => v.default) ?? voices[0];
}

export function voiceLabel(voice: VoiceLike): string {
  const name = voice.name.replace(/^(Microsoft|Google)\s+/i, '').replace(/\s+-\s+.*$/, '');
  return `${name} (${voice.lang})`;
}
