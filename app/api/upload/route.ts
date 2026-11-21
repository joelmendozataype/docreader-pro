/**
 * POST /api/upload  (multipart/form-data, campo "file")
 *   → { ok: true, data: ParsedDocument } | { ok: false, error: { code, message } }
 *
 * GET /api/upload
 *   → { ok: true, data: UploadLimits }  (tamaño máximo y formatos aceptados)
 *
 * El navegador procesa PDF/DOCX/HTML por su cuenta (sin límite de tamaño);
 * este endpoint es obligatorio solo para .doc y sirve de alternativa para el resto.
 */

import { getUploadLimits, handleUpload } from '@/lib/server/upload-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function POST(request: Request) {
  return handleUpload(request);
}

export function GET() {
  return Response.json({ ok: true, data: getUploadLimits() }, { headers: { 'Cache-Control': 'no-store' } });
}
