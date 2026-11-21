'use client';

import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { updateDocumentMeta } from '@/lib/db/indexeddb';
import { clamp01, computeReadingProgress, scrollYForProgress } from '@/lib/reader/progress';
import { useDocumentsStore } from '@/lib/store/documents-store';

const SAVE_DELAY_MS = 1200;

interface Options {
  docId: string;
  /** progreso guardado la última vez (0..1) */
  initialProgress?: number;
  /** true cuando el contenido ya está en el DOM */
  ready: boolean;
  /** cambia cuando cambia la maquetación (tamaño de letra, ancho…) */
  layoutKey: string;
}

function measure(article: HTMLElement) {
  const rect = article.getBoundingClientRect();
  return {
    articleTop: rect.top + window.scrollY,
    articleHeight: rect.height,
    viewportHeight: window.innerHeight,
  };
}

/**
 * Barra de progreso, restauración de la posición al abrir, conservación de la
 * posición al cambiar ajustes y guardado (con retardo) en IndexedDB.
 */
export function useReadingProgress(articleRef: RefObject<HTMLElement | null>, options: Options) {
  const { docId, initialProgress = 0, ready, layoutKey } = options;
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const savedRef = useRef(initialProgress);
  const restoredRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const value = Math.round(progressRef.current * 1000) / 1000;
    if (Math.abs(value - savedRef.current) < 0.001) return;
    savedRef.current = value;
    try {
      const meta = await updateDocumentMeta(docId, { progress: value });
      useDocumentsStore.getState().upsertMeta(meta);
    } catch {
      // el documento pudo borrarse en otra pestaña: no es un error para el lector
    }
  }, [docId]);

  const update = useCallback(() => {
    const article = articleRef.current;
    if (!article || !restoredRef.current) return;
    const value = computeReadingProgress({ ...measure(article), scrollY: window.scrollY });
    progressRef.current = value;
    setProgress(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
  }, [articleRef, save]);

  // 1. Restaurar la posición al abrir (o ir al ancla #sec-N si viene en la URL)
  useLayoutEffect(() => {
    const article = articleRef.current;
    if (!ready || !article || restoredRef.current) return;
    const hashTarget = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
    if (hashTarget) {
      hashTarget.scrollIntoView({ block: 'start' });
    } else if (initialProgress > 0.005) {
      window.scrollTo({ top: scrollYForProgress({ ...measure(article), progress: initialProgress }) });
    }
    restoredRef.current = true;
    progressRef.current = hashTarget ? progressRef.current : clamp01(initialProgress);
    update();
  }, [ready, articleRef, initialProgress, update]);

  // 2. Al cambiar la maquetación, mantener el mismo punto de lectura
  const lastLayout = useRef(layoutKey);
  useLayoutEffect(() => {
    const article = articleRef.current;
    if (!article || !restoredRef.current || lastLayout.current === layoutKey) return;
    lastLayout.current = layoutKey;
    window.scrollTo({ top: scrollYForProgress({ ...measure(article), progress: progressRef.current }) });
  }, [layoutKey, articleRef]);

  // 3. Escuchar scroll y cambios de tamaño
  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    const observer = articleRef.current ? new ResizeObserver(onScroll) : null;
    if (articleRef.current) observer?.observe(articleRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      observer?.disconnect();
    };
  }, [ready, update, articleRef]);

  // 4. Guardar al ocultar la pestaña, al cerrar y al salir del lector
  useEffect(() => {
    const flush = () => void save();
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [save]);

  return progress;
}
