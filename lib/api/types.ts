/**
 * Contrato de respuestas JSON de la API (compartido por servidor y cliente).
 * Éxito:  { ok: true,  data }
 * Error:  { ok: false, error: { code, message } }
 */

import type { ParseErrorCode } from '@/lib/parsers/errors';

export type ApiErrorCode =
  ParseErrorCode | 'MISSING_FILE' | 'INVALID_REQUEST' | 'FILE_TOO_LARGE' | 'RATE_LIMITED' | 'INTERNAL_ERROR';

export interface ApiError {
  code: ApiErrorCode;
  /** mensaje en español listo para mostrar al usuario */
  message: string;
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface UploadLimits {
  maxBytes: number;
  acceptedExtensions: readonly string[];
  /** formatos que el navegador puede procesar sin subir el archivo */
  clientSideTypes: readonly string[];
}
