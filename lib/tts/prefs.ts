/** Preferencias de voz y velocidad (localStorage). */

export const TTS_PREFS_KEY = 'docreader:tts';
export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export interface TTSPrefs {
  voiceURI: string | null;
  rate: number;
}

export const DEFAULT_TTS_PREFS: TTSPrefs = { voiceURI: null, rate: 1 };

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(2, Math.max(0.5, Math.round(rate * 100) / 100));
}

export function loadTTSPrefs(): TTSPrefs {
  try {
    const data = JSON.parse(localStorage.getItem(TTS_PREFS_KEY) ?? 'null') as Partial<TTSPrefs> | null;
    return {
      voiceURI: typeof data?.voiceURI === 'string' ? data.voiceURI : null,
      rate: clampRate(Number(data?.rate ?? 1)),
    };
  } catch {
    return DEFAULT_TTS_PREFS;
  }
}

export function saveTTSPrefs(prefs: TTSPrefs) {
  try {
    localStorage.setItem(TTS_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // sin almacenamiento: se usan solo en esta sesión
  }
}
