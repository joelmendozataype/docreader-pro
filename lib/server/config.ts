/**
 * Configuración del servidor leída de variables de entorno en cada uso
 * (así los tests y los despliegues pueden cambiarla sin reconstruir).
 */

function positiveNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getUploadConfig() {
  return {
    /** tamaño máximo por archivo subido al servidor (por defecto 20 MB) */
    maxBytes: Math.round(positiveNumber(process.env.MAX_UPLOAD_MB, 20) * 1024 * 1024),
    /** peticiones permitidas por IP en cada ventana */
    rateLimitMax: Math.floor(positiveNumber(process.env.RATE_LIMIT_MAX, 20)),
    /** duración de la ventana del rate limit (por defecto 1 minuto) */
    rateLimitWindowMs: positiveNumber(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  };
}
