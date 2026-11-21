import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listDocuments } from '@/lib/db/indexeddb';
import { resetDocumentsStore, useDocumentsStore } from '@/lib/store/documents-store';
import { ProcessError, processFile } from '@/lib/upload/process-file';

import { freshIndexedDB, makeDoc } from '../helpers/documents';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock('@/lib/upload/process-file', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/upload/process-file')>();
  return { ...actual, processFile: vi.fn() };
});

const processMock = vi.mocked(processFile);
const store = () => useDocumentsStore.getState();
const file = (name: string) => new File(['contenido'], name);

/** Espera a que la cola termine. */
async function settle() {
  await vi.waitFor(() => {
    expect(
      store().uploads.some(
        (u) => u.status === 'queued' || u.status === 'processing' || u.status === 'saving',
      ),
    ).toBe(false);
  });
}

beforeEach(async () => {
  await freshIndexedDB();
  resetDocumentsStore();
  processMock.mockReset();
});

describe('documents store', () => {
  it('carga la biblioteca desde IndexedDB', async () => {
    await store().load();
    expect(store().status).toBe('ready');
    expect(store().documents).toEqual([]);
  });

  it('procesa, guarda y añade documentos a la biblioteca', async () => {
    processMock.mockImplementation(async (f, opts) => {
      opts?.onProgress?.(0.5, 'parsing');
      return makeDoc({ fileName: f.name, title: f.name.toUpperCase() });
    });
    store().addFiles([file('a.pdf'), file('b.docx')]);
    await settle();

    expect(
      store()
        .documents.map((d) => d.title)
        .sort(),
    ).toEqual(['A.PDF', 'B.DOCX']);
    expect(store().uploads.every((u) => u.status === 'done' && u.progress === 1)).toBe(true);
    expect((await listDocuments()).length).toBe(2);
  });

  it('procesa los archivos de uno en uno', async () => {
    let running = 0;
    let maxRunning = 0;
    processMock.mockImplementation(async (f) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return makeDoc({ fileName: f.name });
    });
    store().addFiles([file('1.pdf'), file('2.pdf'), file('3.pdf')]);
    await settle();
    expect(maxRunning).toBe(1);
    expect(store().documents).toHaveLength(3);
  });

  it('ignora extensiones no soportadas', () => {
    store().addFiles([file('foto.png'), file('notas.txt')]);
    expect(store().uploads).toEqual([]);
    expect(processMock).not.toHaveBeenCalled();
  });

  it('marca errores y permite reintentar los recuperables', async () => {
    processMock.mockRejectedValueOnce(new ProcessError('NETWORK_ERROR', 'Sin conexión'));
    store().addFiles([file('x.doc')]);
    await settle();
    const failed = store().uploads[0];
    expect(failed).toMatchObject({ status: 'error', error: 'Sin conexión', retryable: true });

    processMock.mockResolvedValueOnce(makeDoc({ fileName: 'x.doc' }));
    store().retryUpload(failed.id);
    await settle();
    expect(store().uploads[0].status).toBe('done');
    expect(store().documents).toHaveLength(1);
  });

  it('los errores de contenido no son reintentables', async () => {
    processMock.mockRejectedValueOnce(new ProcessError('PDF_NO_TEXT', 'PDF escaneado'));
    store().addFiles([file('scan.pdf')]);
    await settle();
    expect(store().uploads[0]).toMatchObject({ status: 'error', retryable: false });
  });

  it('cancelar aborta el procesamiento en curso y lo quita de la cola', async () => {
    processMock.mockImplementation(
      (_f, opts) =>
        new Promise((_, reject) =>
          opts?.signal?.addEventListener('abort', () => reject(new ProcessError('ABORTED', 'cancelado'))),
        ),
    );
    store().addFiles([file('grande.pdf')]);
    await vi.waitFor(() => expect(store().uploads[0]?.status).toBe('processing'));
    store().cancelUpload(store().uploads[0].id);
    await vi.waitFor(() => expect(store().uploads).toEqual([]));
    expect(store().documents).toEqual([]);
  });

  it('renombra y elimina', async () => {
    processMock.mockResolvedValueOnce(makeDoc({ title: 'Original' }));
    store().addFiles([file('a.pdf')]);
    await settle();
    const id = store().documents[0].id;

    expect(await store().renameDocument(id, 'Nuevo nombre')).toBe(true);
    expect(store().documents[0].title).toBe('Nuevo nombre');

    expect(await store().renameDocument(id, '  ')).toBe(false);
    expect(store().documents[0].title).toBe('Nuevo nombre');

    expect(await store().removeDocument(id)).toBe(true);
    expect(store().documents).toEqual([]);
    expect(await listDocuments()).toEqual([]);
  });
});
