'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Ajustes de lectura persistidos en localStorage (compartidos entre pestañas).
 * El tema (claro/oscuro/sepia) lo gestiona next-themes para toda la app.
 */

export type ReaderFont = 'serif' | 'sans';
export type ReaderWidth = 'narrow' | 'medium' | 'wide';

export interface ReaderSettings {
  fontSize: number;
  font: ReaderFont;
  width: ReaderWidth;
  lineHeight: number;
  /** índice visible en escritorio */
  tocOpen: boolean;
}

export const FONT_SIZE = { min: 14, max: 30, step: 2 } as const;
export const LINE_HEIGHTS = [1.5, 1.75, 2] as const;

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 19,
  font: 'serif',
  width: 'medium',
  lineHeight: 1.75,
  tocOpen: true,
};

export const WIDTH_CH: Record<ReaderWidth, string> = {
  narrow: '58ch',
  medium: '68ch',
  wide: '84ch',
};

export const STORAGE_KEY = 'docreader:reader-settings';

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedValue: ReaderSettings = DEFAULT_SETTINGS;

/** Valida lo guardado: valores desconocidos vuelven al valor por defecto. */
export function parseSettings(raw: string | null): ReaderSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const data = JSON.parse(raw) as Partial<ReaderSettings>;
    const size = Number(data.fontSize);
    return {
      fontSize: Number.isFinite(size)
        ? Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Math.round(size)))
        : DEFAULT_SETTINGS.fontSize,
      font: data.font === 'sans' || data.font === 'serif' ? data.font : DEFAULT_SETTINGS.font,
      width: data.width && data.width in WIDTH_CH ? data.width : DEFAULT_SETTINGS.width,
      lineHeight: (LINE_HEIGHTS as readonly number[]).includes(Number(data.lineHeight))
        ? Number(data.lineHeight)
        : DEFAULT_SETTINGS.lineHeight,
      tocOpen: typeof data.tocOpen === 'boolean' ? data.tocOpen : DEFAULT_SETTINGS.tocOpen,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function readStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // modo privado o almacenamiento bloqueado
  }
}

function getSnapshot(): ReaderSettings {
  const raw = readStorage();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parseSettings(raw);
  }
  return cachedValue;
}

function getServerSnapshot(): ReaderSettings {
  return DEFAULT_SETTINGS;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function write(settings: ReaderSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // sin almacenamiento: los ajustes duran solo esta sesión
    cachedRaw = JSON.stringify(settings);
    cachedValue = settings;
  }
  listeners.forEach((l) => l());
}

export function useReaderSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((changes: Partial<ReaderSettings>) => {
    write(parseSettings(JSON.stringify({ ...getSnapshot(), ...changes })));
  }, []);

  const increaseFont = useCallback(
    () => update({ fontSize: getSnapshot().fontSize + FONT_SIZE.step }),
    [update],
  );
  const decreaseFont = useCallback(
    () => update({ fontSize: getSnapshot().fontSize - FONT_SIZE.step }),
    [update],
  );
  const reset = useCallback(() => write({ ...DEFAULT_SETTINGS, tocOpen: getSnapshot().tocOpen }), []);

  return {
    settings,
    update,
    increaseFont,
    decreaseFont,
    reset,
    canIncrease: settings.fontSize < FONT_SIZE.max,
    canDecrease: settings.fontSize > FONT_SIZE.min,
  };
}
