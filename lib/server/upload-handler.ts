import 'server-only';

import type { ApiError, ApiErrorCode, ApiResponse, UploadLimits } from '@/lib/api/types';
import { isParseError, type ParseErrorCode } from '@/lib/parsers/errors';
import { parseDocumentOnServer } from '@/lib/parsers/server';
import { ACCEPTED_EXTENSIONS, type ParsedDocument } from '@/types/document';

import { getUploadConfig } from './config';
import { createRateLimiter, getClientIp } from './rate-limit';

const STATUS: Record<ApiErrorCode, number> = {
  MISSING_FILE: 400,
  INVALID_REQUEST: 400,
  ABORTED: 400,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FORMAT: 415,
  EMPTY_FILE: 422,
  CORRUPT_FILE: 422,
  PDF_ENCRYPTED: 422,
  PDF_NO_TEXT: 422,
  RATE_LIMITED: 429,
  NEEDS_SERVER: 500,
  INTERNAL_ERROR: 500,
};

const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  MISSING_FILE: 'No se recibió ningún archivo. Envía el documento en el campo "file".',
  INVALID_REQUEST: 'La petición debe enviarse como multipart/form-data.',
  RATE_LIMITED: 'Demasiadas subidas seguidas. Espera un momento e inténtalo de nuevo.',
  INTERNAL_ERROR: 'Ocurrió un error inesperado al procesar el documento.',
};

/** Mensaje específico por formato para errores de contenido. */
const FORMAT_HINTS: Partial<Record<ParseErrorCode, Partial<Record<string, string>>>> = {
  CORRUPT_FILE: {
    pdf: 'No se pudo abrir el PDF: el archivo está dañado o incompleto.',
    docx: 'No se pudo abrir el documento de Word (.docx): está dañado o no es un .docx válido.',
    doc: 'No se pudo leer el Word 97-2003 (.doc). Si tiene contraseña, quítala o guárdalo como .docx.',
    html: 'No se pudo interpretar el archivo HTML.',
  },
  EMPTY_FILE: {
    pdf: 'El PDF no contiene texto legible.',
    docx: 'El documento de Word no contiene texto.',
    doc: 'El documento de Word no contiene texto.',
    html: 'La página HTML no contiene texto legible.',
  },
};

let limiter: ReturnType<typeof createRateLimiter> | null = null;
let limiterKey = '';

function getLimiter() {
  const { rateLimitMax, rateLimitWindowMs } = getUploadConfig();
  const key = `${rateLimitMax}:${rateLimitWindowMs}`;
  if (!limiter || key !== limiterKey) {
    limiter = createRateLimiter({ max: rateLimitMax, windowMs: rateLimitWindowMs });
    limiterKey = key;
  }
  return { limiter, max: rateLimitMax };
}

/** Solo para tests. */
export function resetUploadRateLimit() {
  limiter?.reset();
}

function json<T>(body: ApiResponse<T>, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function fail(code: ApiErrorCode, message?: string, headers?: Record<string, string>) {
  const error: ApiError = { code, message: message ?? MESSAGES[code] ?? 'Error desconocido.' };
  return json<never>({ ok: false, error }, STATUS[code], headers);
}

function formatMB(bytes: number) {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}

/** Tipo detectado a partir de la extensión, solo para personalizar mensajes. */
function hintType(fileName: string) {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return ext === 'htm' ? 'html' : ext;
}

export function getUploadLimits(): UploadLimits {
  return {
    maxBytes: getUploadConfig().maxBytes,
    acceptedExtensions: ACCEPTED_EXTENSIONS,
    clientSideTypes: ['pdf', 'docx', 'html'],
  };
}

export async function handleUpload(request: Request): Promise<Response> {
  // 1. Rate limit por IP
  const { limiter: rl, max } = getLimiter();
  const rate = rl.check(getClientIp(request.headers));
  const rateHeaders = { 'X-RateLimit-Limit': String(max), 'X-RateLimit-Remaining': String(rate.remaining) };
  if (!rate.allowed) {
    return fail('RATE_LIMITED', undefined, {
      ...rateHeaders,
      'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)),
    });
  }

  // 2. Tipo de petición y tamaño declarado (antes de leer el cuerpo)
  const { maxBytes } = getUploadConfig();
  const tooLarge = () =>
    fail(
      'FILE_TOO_LARGE',
      `El archivo supera el máximo de ${formatMB(maxBytes)} para subidas al servidor.`,
      rateHeaders,
    );

  if (!request.headers.get('content-type')?.toLowerCase().includes('multipart/form-data')) {
    return fail('INVALID_REQUEST', undefined, rateHeaders);
  }
  const declaredLength = Number(request.headers.get('content-length'));
  // margen de 64 KB para las cabeceras del multipart
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes + 64 * 1024) return tooLarge();

  // 3. Archivo
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('INVALID_REQUEST', 'No se pudo leer el formulario enviado.', rateHeaders);
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return fail('MISSING_FILE', undefined, rateHeaders);
  if (file.size > maxBytes) return tooLarge();
  if (file.size === 0) return fail('EMPTY_FILE', 'El archivo está vacío.', rateHeaders);

  // 4. Detección por magic bytes + parseo
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const document = await parseDocumentOnServer(
      { name: file.name || 'documento', mimeType: file.type, data },
      { signal: request.signal },
    );
    return json<ParsedDocument>({ ok: true, data: document }, 200, rateHeaders);
  } catch (error) {
    if (isParseError(error)) {
      const hint = FORMAT_HINTS[error.code]?.[hintType(file.name)];
      return fail(error.code, hint ?? error.message, rateHeaders);
    }
    console.error('[api/upload] error inesperado:', error instanceof Error ? error.message : error);
    return fail('INTERNAL_ERROR', undefined, rateHeaders);
  }
}
