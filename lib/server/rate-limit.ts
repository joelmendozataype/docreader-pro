/**
 * Rate limiting básico en memoria (ventana deslizante por clave/IP).
 *
 * Limitación conocida: cada instancia del servidor tiene su propio contador.
 * En Vercel (serverless) es una protección "mejor esfuerzo"; para un límite
 * global habría que usar un almacén compartido (Redis/Upstash).
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** milisegundos hasta que se libere un hueco (0 si está permitido) */
  retryAfterMs: number;
}

export interface RateLimiterOptions {
  max: number;
  windowMs: number;
  now?: () => number;
  /** máximo de claves guardadas para no crecer sin límite */
  maxKeys?: number;
}

export function createRateLimiter({ max, windowMs, now = Date.now, maxKeys = 10_000 }: RateLimiterOptions) {
  const hits = new Map<string, number[]>();

  function prune(timestamp: number) {
    for (const [key, times] of hits) {
      const fresh = times.filter((t) => timestamp - t < windowMs);
      if (fresh.length) hits.set(key, fresh);
      else hits.delete(key);
    }
  }

  return {
    check(key: string): RateLimitResult {
      const timestamp = now();
      if (hits.size >= maxKeys) prune(timestamp);

      const times = (hits.get(key) ?? []).filter((t) => timestamp - t < windowMs);
      if (times.length >= max) {
        hits.set(key, times);
        return { allowed: false, remaining: 0, retryAfterMs: windowMs - (timestamp - times[0]) };
      }
      times.push(timestamp);
      hits.set(key, times);
      return { allowed: true, remaining: max - times.length, retryAfterMs: 0 };
    },
    reset() {
      hits.clear();
    },
    get size() {
      return hits.size;
    },
  };
}

/**
 * IP del cliente. En Vercel `x-forwarded-for` lo fija la plataforma; en otros
 * entornos sin proxy de confianza esta cabecera puede falsificarse.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
}
