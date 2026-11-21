/**
 * Reintenta una operación asíncrona con espera creciente (backoff exponencial).
 * Útil para IndexedDB, que puede fallar de forma transitoria (otra pestaña
 * actualizando la base, almacenamiento ocupado…).
 */
export interface RetryOptions {
  /** reintentos además del primer intento */
  retries?: number;
  /** espera inicial en ms */
  delay?: number;
  factor?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  signal?: AbortSignal;
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { retries = 2, delay = 300, factor = 2, shouldRetry = () => true, signal } = options;
  let wait = delay;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= retries || signal?.aborted || !shouldRetry(error, attempt)) throw error;
      await new Promise((resolve) => setTimeout(resolve, wait));
      wait *= factor;
    }
  }
}
