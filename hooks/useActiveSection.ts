'use client';

import { useEffect, useState } from 'react';

/** Distancia desde arriba (px) a partir de la cual un título cuenta como "actual". */
const OFFSET = 120;

/**
 * Devuelve el id del último título que ya pasó por la parte superior de la
 * pantalla. Búsqueda binaria: funciona igual de rápido con miles de títulos.
 */
export function useActiveSection(ids: string[], ready: boolean): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    if (!ready || ids.length === 0) return;
    const resolve = () =>
      ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    let elements = resolve();
    if (!elements.length) return;

    let frame = 0;
    const compute = () => {
      // un nodo desconectado mide 0 y falsearía el resultado: se vuelven a buscar
      if (!elements[0].isConnected) elements = resolve();
      if (!elements.length) return;
      let lo = 0;
      let hi = elements.length - 1;
      let found = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (elements[mid].getBoundingClientRect().top <= OFFSET) {
          found = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      setActive(elements[found].id);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ids, ready]);

  return active;
}
