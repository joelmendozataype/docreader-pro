import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  FONT_SIZE,
  parseSettings,
  STORAGE_KEY,
  useReaderSettings,
} from '@/hooks/useReaderSettings';

beforeEach(() => localStorage.clear());

describe('useReaderSettings', () => {
  it('usa valores por defecto y persiste los cambios en localStorage', () => {
    const { result } = renderHook(() => useReaderSettings());
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);

    act(() => result.current.update({ font: 'sans', width: 'wide' }));
    expect(result.current.settings).toMatchObject({ font: 'sans', width: 'wide' });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ font: 'sans', width: 'wide' });
  });

  it('A+ / A− respetan los límites', () => {
    const { result } = renderHook(() => useReaderSettings());
    for (let i = 0; i < 20; i++) act(() => result.current.increaseFont());
    expect(result.current.settings.fontSize).toBe(FONT_SIZE.max);
    expect(result.current.canIncrease).toBe(false);
    for (let i = 0; i < 20; i++) act(() => result.current.decreaseFont());
    expect(result.current.settings.fontSize).toBe(FONT_SIZE.min);
    expect(result.current.canDecrease).toBe(false);
  });

  it('restablecer conserva si el índice está abierto o cerrado', () => {
    const { result } = renderHook(() => useReaderSettings());
    act(() => result.current.update({ fontSize: 26, tocOpen: false }));
    act(() => result.current.reset());
    expect(result.current.settings).toEqual({ ...DEFAULT_SETTINGS, tocOpen: false });
  });

  it('se sincroniza entre componentes', () => {
    const a = renderHook(() => useReaderSettings());
    const b = renderHook(() => useReaderSettings());
    act(() => a.result.current.update({ lineHeight: 2 }));
    expect(b.result.current.settings.lineHeight).toBe(2);
  });
});

describe('parseSettings', () => {
  it('ignora JSON roto o valores inválidos', () => {
    expect(parseSettings('{roto')).toEqual(DEFAULT_SETTINGS);
    expect(
      parseSettings(JSON.stringify({ fontSize: 999, font: 'comic', width: 'xl', lineHeight: 9 })),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      fontSize: FONT_SIZE.max,
    });
  });
});
