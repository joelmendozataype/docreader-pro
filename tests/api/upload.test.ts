// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from '@/app/api/upload/route';
import { resetUploadRateLimit } from '@/lib/server/upload-handler';

import { fixture } from '../parsers/helpers';

let ipCounter = 0;

/** Petición multipart como la enviaría el navegador; cada test usa una IP distinta. */
function uploadRequest(file: Blob | string | null, fileName = 'archivo', ip = `10.0.0.${++ipCounter}`) {
  const form = new FormData();
  if (file instanceof Blob) form.append('file', file, fileName);
  else if (typeof file === 'string') form.append('file', file);
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    body: form,
    headers: { 'x-forwarded-for': ip },
  });
}

function blobOf(name: string, type = '') {
  return new Blob([fixture(name) as BlobPart], { type });
}

beforeEach(() => resetUploadRateLimit());
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/upload — éxito', () => {
  it.each([
    ['programacion.pdf', 'pdf', 'Introducción a la Programación', 5],
    ['informe.docx', 'docx', 'Informe de lectura', 5],
    ['historia.doc', 'doc', 'CAPÍTULO I. Historia de Huancavelica', 3],
    ['celula.html', 'html', 'Guía de estudio: la célula', 4],
  ])('%s → ParsedDocument (%s)', async (name, fileType, title, sections) => {
    const res = await POST(uploadRequest(blobOf(name), name));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({ fileName: name, fileType, title });
    expect(body.data.sections).toHaveLength(sections);
    expect(typeof body.data.id).toBe('string');
    expect(body.data.size).toBe(fixture(name).byteLength);
  });

  it('detecta el formato real aunque la extensión mienta', async () => {
    const res = await POST(uploadRequest(blobOf('informe.docx'), 'trabajo.pdf'));
    const body = await res.json();
    expect(body.data.fileType).toBe('docx');
  });
});

describe('POST /api/upload — errores', () => {
  it('415 si el contenido no es un formato soportado (PNG renombrado a .pdf)', async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])]);
    const res = await POST(uploadRequest(png, 'foto.pdf'));
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: 'UNSUPPORTED_FORMAT', message: expect.stringContaining('.pdf, .docx, .doc') },
    });
  });

  it('413 si supera el tamaño máximo', async () => {
    vi.stubEnv('MAX_UPLOAD_MB', '0.001'); // ~1 KB
    const res = await POST(uploadRequest(blobOf('programacion.pdf'), 'programacion.pdf'));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error.code).toBe('FILE_TOO_LARGE');
    expect(body.error.message).toContain('MB');
  });

  it('413 por Content-Length antes de leer el cuerpo', async () => {
    vi.stubEnv('MAX_UPLOAD_MB', '1');
    const req = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: 'x',
      headers: {
        'content-type': 'multipart/form-data; boundary=x',
        'content-length': String(50 * 1024 * 1024),
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it('400 si no hay archivo o el campo es texto', async () => {
    for (const req of [uploadRequest(null), uploadRequest('no soy un archivo')]) {
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('MISSING_FILE');
    }
  });

  it('400 si no es multipart/form-data', async () => {
    const req = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: JSON.stringify({ file: 'x' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_REQUEST');
  });

  it('422 para archivo vacío', async () => {
    const res = await POST(uploadRequest(new Blob([]), 'vacio.pdf'));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe('EMPTY_FILE');
  });

  it('422 con mensaje específico por formato para archivos dañados', async () => {
    const brokenPdf = new Blob([new TextEncoder().encode('%PDF-1.7\nbasura')]);
    const pdfRes = await POST(uploadRequest(brokenPdf, 'roto.pdf'));
    expect(pdfRes.status).toBe(422);
    expect((await pdfRes.json()).error).toEqual({
      code: 'CORRUPT_FILE',
      message: expect.stringContaining('PDF'),
    });

    const brokenDoc = new Blob([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 1, 2])]);
    const docRes = await POST(uploadRequest(brokenDoc, 'roto.doc'));
    expect((await docRes.json()).error.message).toContain('Word 97-2003');
  });

  it('429 al superar el rate limit, con Retry-After', async () => {
    vi.stubEnv('RATE_LIMIT_MAX', '2');
    const ip = '203.0.113.7';
    const send = () => POST(uploadRequest(blobOf('celula.html'), 'celula.html', ip));
    expect((await send()).status).toBe(200);
    const second = await send();
    expect(second.headers.get('x-ratelimit-remaining')).toBe('0');
    const third = await send();
    expect(third.status).toBe(429);
    expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await third.json()).error.code).toBe('RATE_LIMITED');
    // otra IP no se ve afectada
    expect((await POST(uploadRequest(blobOf('celula.html'), 'celula.html', '203.0.113.8'))).status).toBe(200);
  });
});

describe('GET /api/upload', () => {
  it('informa límites y formatos', async () => {
    vi.stubEnv('MAX_UPLOAD_MB', '5');
    const body = await GET().json();
    expect(body).toEqual({
      ok: true,
      data: {
        maxBytes: 5 * 1024 * 1024,
        acceptedExtensions: ['.pdf', '.docx', '.doc', '.html', '.htm'],
        clientSideTypes: ['pdf', 'docx', 'html'],
      },
    });
  });
});
