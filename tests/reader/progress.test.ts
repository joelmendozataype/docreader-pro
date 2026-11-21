import { describe, expect, it } from 'vitest';

import { clamp01, computeReadingProgress, scrollYForProgress } from '@/lib/reader/progress';

const layout = { articleTop: 200, articleHeight: 5200, viewportHeight: 1000 };

describe('progreso de lectura', () => {
  it('0 al inicio del artículo, 1 al ver el final, proporcional en medio', () => {
    expect(computeReadingProgress({ ...layout, scrollY: 0 })).toBe(0);
    expect(computeReadingProgress({ ...layout, scrollY: 200 })).toBe(0);
    expect(computeReadingProgress({ ...layout, scrollY: 2300 })).toBe(0.5);
    expect(computeReadingProgress({ ...layout, scrollY: 4400 })).toBe(1);
    expect(computeReadingProgress({ ...layout, scrollY: 9999 })).toBe(1);
  });

  it('un artículo más corto que la pantalla está leído al 100 %', () => {
    expect(
      computeReadingProgress({ articleTop: 0, articleHeight: 500, viewportHeight: 900, scrollY: 0 }),
    ).toBe(1);
  });

  it('scrollYForProgress es la inversa de computeReadingProgress', () => {
    for (const p of [0, 0.25, 0.5, 0.9, 1]) {
      const y = scrollYForProgress({ ...layout, progress: p });
      expect(computeReadingProgress({ ...layout, scrollY: y })).toBeCloseTo(p);
    }
  });

  it('clamp01 tolera valores fuera de rango y NaN', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
  });
});
