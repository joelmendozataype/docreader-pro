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

/**
 * Convierte un idioma a etiqueta BCP 47 válida: Chrome y Brave en Android dan las
 * voces como "es_US" (guion bajo) y su propio motor rechaza ese valor en
 * `utterance.lang` con "synthesis-failed". "es_us" → "es-US", "ES" → "es".
 */
export function normalizeLang(lang: string | null | undefined): string {
  const [language = '', region, ...rest] = (lang ?? '').trim().split(/[-_]/).filter(Boolean);
  if (!language) return '';
  const parts = [language.toLowerCase()];
  if (region) parts.push(/^\d+$/.test(region) ? region : region.length === 2 ? region.toUpperCase() : region);
  return [...parts, ...rest].join('-');
}

export function isSpanish(voice: VoiceLike): boolean {
  return normalizeLang(voice.lang).startsWith('es');
}

/** Menor = mejor. */
function score(voice: VoiceLike): number {
  const lang = normalizeLang(voice.lang).toLowerCase();
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
  return `${name} (${normalizeLang(voice.lang)})`;
}

/**
 * Idiomas a probar, en orden, si el motor de voz falla:
 * el de la voz elegida y luego las variantes de español más comunes.
 */
export function langCandidates(voiceLang: string | null | undefined): string[] {
  const list = [normalizeLang(voiceLang), 'es-US', 'es-ES', 'es'].filter(Boolean);
  return [...new Set(list)];
}
