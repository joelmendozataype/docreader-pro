/**
 * Progreso de lectura (0..1) a partir de la posición del artículo en la página.
 * 0 = el inicio del artículo está arriba; 1 = se ve el final del artículo.
 */
export function computeReadingProgress({
  articleTop,
  articleHeight,
  scrollY,
  viewportHeight,
}: {
  /** posición absoluta del artículo en el documento */
  articleTop: number;
  articleHeight: number;
  scrollY: number;
  viewportHeight: number;
}): number {
  const scrollable = articleHeight - viewportHeight;
  if (scrollable <= 0) return 1;
  return clamp01((scrollY - articleTop) / scrollable);
}

/** scrollY necesario para volver a un progreso guardado. */
export function scrollYForProgress({
  progress,
  articleTop,
  articleHeight,
  viewportHeight,
}: {
  progress: number;
  articleTop: number;
  articleHeight: number;
  viewportHeight: number;
}): number {
  const scrollable = Math.max(0, articleHeight - viewportHeight);
  return Math.max(0, articleTop + clamp01(progress) * scrollable);
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
