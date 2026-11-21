import { afterEach, describe, expect, it, vi } from 'vitest';

import { isAcceptedFileName, processFile, ProcessError } from '@/lib/upload/process-file';

import { fixture } from '../parsers/helpers';

function fileFrom(name: string, bytes = fixture(name)) {
  return new File([bytes as BlobPart], name);
}

afterEach(() => vi.unstubAllGlobals());

describe('isAcceptedFileName', () => {
  it.each([
    ['tesis.PDF', true],
    ['a.docx', true],
    ['a.doc', true],
    ['a.htm', true],
    ['a.txt', false],
    ['sin-extension', false],
  ])('%s → %s', (name, ok) => expect(isAcceptedFileName(name)).toBe(ok));
});

describe('processFile', () => {
  it('procesa HTML en el navegador y reporta progreso creciente', async () => {
    const progress: number[] = [];
    const doc = await processFile(fileFrom('celula.html'), { onProgress: (p) => progress.push(p) });
    expect(doc.fileType).toBe('html');
    expect(doc.title).toBe('Guía de estudio: la célula');
    expect(progress[0]).toBeLessThan(progress.at(-1)!);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
  });

  it('convierte errores de parseo en ProcessError no reintentable', async () => {
    const err = await processFile(new File([new Uint8Array([1, 0, 2])], 'x.pdf')).catch((e) => e);
    expect(err).toBeInstanceOf(ProcessError);
    expect(err).toMatchObject({ code: 'UNSUPPORTED_FORMAT', retryable: false });
  });

  it('envía los .doc al servidor', async () => {
    const sent: FormData[] = [];
    class FakeXHR {
      upload = {
        onprogress: null as ((e: ProgressEvent) => void) | null,
        onload: null as (() => void) | null,
      };
      status = 200;
      response: unknown = null;
      responseType = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open() {}
      abort() {}
      send(body: FormData) {
        sent.push(body);
        this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
        this.upload.onload?.();
        this.response = { ok: true, data: { id: 'srv', fileType: 'doc', title: 'Desde el servidor' } };
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXHR);

    const stages: string[] = [];
    const doc = await processFile(fileFrom('historia.doc'), { onProgress: (_, s) => stages.push(s) });
    expect(doc).toMatchObject({ id: 'srv', title: 'Desde el servidor' });
    expect((sent[0].get('file') as File).name).toBe('historia.doc');
    expect(stages).toContain('uploading');
    expect(stages).toContain('server');
  });

  it('propaga el error del servidor con su código', async () => {
    class FailXHR {
      upload = {};
      status = 422;
      response = { ok: false, error: { code: 'CORRUPT_FILE', message: 'Word dañado' } };
      responseType = '';
      onload: (() => void) | null = null;
      open() {}
      send() {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('XMLHttpRequest', FailXHR);
    await expect(processFile(fileFrom('historia.doc'))).rejects.toMatchObject({
      code: 'CORRUPT_FILE',
      message: 'Word dañado',
      retryable: false,
    });
  });

  it('error de red reintentable', async () => {
    class NetXHR {
      upload = {};
      responseType = '';
      onerror: (() => void) | null = null;
      open() {}
      send() {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('XMLHttpRequest', NetXHR);
    await expect(processFile(fileFrom('historia.doc'))).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true,
    });
  });
});
