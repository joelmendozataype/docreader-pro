// Casos límite que completan la cobertura de store, resaltado, .doc y procesado.
import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDocument, listDocuments, saveDocument, toMeta } from '@/lib/db/indexeddb';
import { parseDoc } from '@/lib/parsers/doc';
import { resetDocumentsStore, useDocumentsStore } from '@/lib/store/documents-store';
import {
  BLOCK_CLASS,
  clearAllHighlights,
  setRangeHighlight,
  supportsRangeHighlight,
  WORD_HIGHLIGHT,
} from '@/lib/tts/highlight';
import { processFile, ProcessError } from '@/lib/upload/process-file';

import { freshIndexedDB, makeDoc } from '../helpers/documents';

type ToastAction = { label: string; onClick: () => unknown };
const toastCalls = vi.hoisted(() => ({ success: [] as unknown[][], error: [] as unknown[][] }));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn((...args: unknown[]) => toastCalls.success.push(args)),
    error: vi.fn((...args: unknown[]) => toastCalls.error.push(args)),
    info: vi.fn(),
  }),
}));

const store = () => useDocumentsStore.getState();

beforeEach(async () => {
  await freshIndexedDB();
  resetDocumentsStore();
  toastCalls.success.length = 0;
  toastCalls.error.length = 0;
});

describe('store: eliminar con «Deshacer»', () => {
  it('el botón Deshacer del aviso restaura documento y contenido', async () => {
    const doc = makeDoc({ id: 'undo-1', title: 'Para deshacer' });
    await saveDocument(doc);
    await store().load();

    expect(await store().removeDocument('undo-1')).toBe(true);
    expect(await getDocument('undo-1')).toBeUndefined();

    const [, options] = toastCalls.success.at(-1) as [string, { action: ToastAction; duration: number }];
    expect(options.action.label).toBe('Deshacer');
    expect(options.duration).toBe(10_000);
    await options.action.onClick();

    expect((await getDocument('undo-1'))?.html).toBe(doc.html);
    expect(store().documents.map((d) => d.id)).toEqual(['undo-1']);
  });

  it('upsertMeta mantiene el orden por fecha de creación', () => {
    store().upsertMeta(toMeta(makeDoc({ id: 'a', createdAt: 1 })));
    store().upsertMeta(toMeta(makeDoc({ id: 'b', createdAt: 5 })));
    expect(store().documents.map((d) => d.id)).toEqual(['b', 'a']);
  });
});

describe('store: errores y cola', () => {
  it('si IndexedDB falla al cargar, queda en estado de error con mensaje', async () => {
    const db = await import('@/lib/db/indexeddb');
    const spy = vi.spyOn(db, 'listDocuments').mockRejectedValue(new Error('Almacenamiento bloqueado'));
    vi.useFakeTimers();
    const loading = store().load();
    await vi.runAllTimersAsync(); // salta las esperas de los reintentos
    await loading;
    vi.useRealTimers();
    expect(store().status).toBe('error');
    expect(store().loadError).toBe('Almacenamiento bloqueado');
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
  });

  it('cancelar un archivo en espera lo quita sin procesarlo; quitar uno con error lo descarta', () => {
    useDocumentsStore.setState({
      uploads: [
        { id: 'q', fileName: 'q.pdf', size: 1, progress: 0, status: 'queued' },
        { id: 'e', fileName: 'e.pdf', size: 1, progress: 0, status: 'error', error: 'x' },
      ],
    });
    store().cancelUpload('q');
    store().dismissUpload('e');
    expect(store().uploads).toEqual([]);
  });

  it('reintentar algo cuyo archivo ya no existe no hace nada', () => {
    useDocumentsStore.setState({
      uploads: [{ id: 'z', fileName: 'z.pdf', size: 1, progress: 0, status: 'error' }],
    });
    store().retryUpload('z');
    expect(store().uploads[0].status).toBe('error');
  });

  it('renombrar un documento inexistente avisa del error', async () => {
    expect(await store().renameDocument('nada', 'Nuevo')).toBe(false);
    expect(toastCalls.error.at(-1)?.[0]).toBe('No se pudo renombrar');
  });
});

describe('resaltado con CSS Custom Highlight API', () => {
  const registry = new Map<string, unknown>();

  beforeEach(() => {
    registry.clear();
    vi.stubGlobal(
      'Highlight',
      class {
        ranges: Range[];
        constructor(...ranges: Range[]) {
          this.ranges = ranges;
        }
      },
    );
    vi.stubGlobal('CSS', { highlights: registry, escape: (s: string) => s });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('registra y borra resaltados e inyecta los estilos una sola vez', () => {
    expect(supportsRangeHighlight()).toBe(true);
    const range = document.createRange();
    setRangeHighlight(WORD_HIGHLIGHT, range);
    setRangeHighlight(WORD_HIGHLIGHT, range);
    expect(registry.has(WORD_HIGHLIGHT)).toBe(true);
    expect(document.querySelectorAll('#tts-highlight-styles')).toHaveLength(1);
    expect(document.getElementById('tts-highlight-styles')?.textContent).toContain('::highlight(tts-word)');

    setRangeHighlight(WORD_HIGHLIGHT, null);
    expect(registry.has(WORD_HIGHLIGHT)).toBe(false);
  });

  it('clearAllHighlights quita también la clase del párrafo', () => {
    const root = document.createElement('div');
    root.innerHTML = `<p class="${BLOCK_CLASS}">a</p><p>b</p>`;
    setRangeHighlight(WORD_HIGHLIGHT, document.createRange());
    clearAllHighlights(root);
    expect(root.querySelectorAll(`.${BLOCK_CLASS}`)).toHaveLength(0);
    expect(registry.size).toBe(0);
  });

  it('sin la API no hace nada (navegadores antiguos)', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('CSS', undefined);
    expect(supportsRangeHighlight()).toBe(false);
    expect(() => setRangeHighlight(WORD_HIGHLIGHT, document.createRange())).not.toThrow();
  });
});

describe('parseDoc: título de reserva', () => {
  it('usa la primera línea si no hay títulos, o el nombre de archivo si es muy larga', async () => {
    const { default: WordExtractor } = await import('word-extractor');
    const spy = vi.spyOn(WordExtractor.prototype, 'extract');

    spy.mockResolvedValueOnce({ getBody: () => 'Apuntes de clase\nTexto corriente sin títulos.' } as never);
    expect((await parseDoc(new Uint8Array([1]), 'apuntes.doc')).title).toBe('Apuntes de clase');

    spy.mockResolvedValueOnce({ getBody: () => 'x'.repeat(150) } as never);
    expect((await parseDoc(new Uint8Array([1]), 'mis_notas.doc')).title).toBe('mis notas');

    spy.mockResolvedValueOnce({ getBody: () => '   ' } as never);
    await expect(parseDoc(new Uint8Array([1]), 'vacio.doc')).rejects.toMatchObject({ code: 'EMPTY_FILE' });
    spy.mockRestore();
  });
});

describe('processFile: errores', () => {
  it('cancelado antes de empezar', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(processFile(new File(['x'], 'a.html'), { signal: controller.signal })).rejects.toMatchObject(
      {
        code: 'ABORTED',
      },
    );
  });

  it('archivo ilegible desde el disco', async () => {
    const file = new File(['x'], 'a.pdf');
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('permiso denegado'));
    const error = await processFile(file).catch((e) => e);
    expect(error).toBeInstanceOf(ProcessError);
    expect(error).toMatchObject({ code: 'CORRUPT_FILE', retryable: false });
  });

  it('error inesperado del parser → INTERNAL_ERROR reintentable', async () => {
    const parsers = await import('@/lib/parsers');
    const spy = vi.spyOn(parsers, 'parseDocument').mockRejectedValue(new TypeError('boom'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = await processFile(new File(['%PDF-1.4'], 'a.pdf')).catch((e) => e);
    expect(error).toMatchObject({ code: 'INTERNAL_ERROR', retryable: true });
    spy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('la biblioteca vacía lista cero documentos', async () => {
    expect(await listDocuments()).toEqual([]);
  });
});
