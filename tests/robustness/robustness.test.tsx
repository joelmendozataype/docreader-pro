import 'fake-indexeddb/auto';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryView } from '@/components/library/LibraryView';
import { DocumentReader } from '@/components/reader/DocumentReader';
import { ParseError } from '@/lib/parsers/errors';
import { parseInWorker, WorkerUnavailableError } from '@/lib/parsers/worker-client';
import { resetDocumentsStore } from '@/lib/store/documents-store';
import { processFile } from '@/lib/upload/process-file';
import { withRetry } from '@/lib/utils/retry';
import { saveDocument } from '@/lib/db/indexeddb';

import { freshIndexedDB, makeDoc } from '../helpers/documents';
import { type FakeSynth, installFakeSpeech, uninstallFakeSpeech } from '../helpers/fake-speech';
import { fixture } from '../parsers/helpers';

beforeAll(() => {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes('min-width'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

beforeEach(async () => {
  await freshIndexedDB();
  resetDocumentsStore();
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('withRetry', () => {
  it('reintenta con espera creciente y devuelve el primer éxito', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('transitorio');
        return 'ok';
      },
      { retries: 3, delay: 1 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('se rinde tras agotar los reintentos o si shouldRetry dice que no', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('siempre'));
    await expect(withRetry(fn, { retries: 2, delay: 1 })).rejects.toThrow('siempre');
    expect(fn).toHaveBeenCalledTimes(3);

    const once = vi.fn().mockRejectedValue(new Error('fatal'));
    await expect(withRetry(once, { retries: 5, delay: 1, shouldRetry: () => false })).rejects.toThrow(
      'fatal',
    );
    expect(once).toHaveBeenCalledTimes(1);
  });
});

interface FakeWorkerLike {
  onerror: ((e: ErrorEvent) => void) | null;
  terminated: boolean;
  transferred: Transferable[];
  emit: (data: unknown) => void;
}

/** Worker simulado que responde con la secuencia indicada. */
function fakeWorkerFactory(script: (w: FakeWorkerLike) => void) {
  const created: FakeWorker[] = [];
  class FakeWorker {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    terminated = false;
    transferred: Transferable[] = [];
    postMessage(_data: unknown, transfer: Transferable[]) {
      this.transferred = transfer;
      queueMicrotask(() => script(this));
    }
    terminate() {
      this.terminated = true;
    }
    emit(data: unknown) {
      this.onmessage?.({ data } as MessageEvent);
    }
  }
  return {
    created,
    factory: () => {
      const w = new FakeWorker();
      created.push(w);
      return w as unknown as Worker;
    },
  };
}

describe('parseInWorker', () => {
  const request = () => ({ name: 'a.docx', data: new ArrayBuffer(8) });

  it('reenvía el progreso, resuelve el documento y termina el worker', async () => {
    const doc = makeDoc();
    const { factory, created } = fakeWorkerFactory((w) => {
      w.emit({ type: 'progress', fraction: 0.5 });
      w.emit({ type: 'done', doc });
    });
    const onProgress = vi.fn();
    const req = request();
    await expect(parseInWorker(req, { onProgress }, factory)).resolves.toEqual(doc);
    expect(onProgress).toHaveBeenCalledWith(0.5);
    expect(created[0].terminated).toBe(true);
    expect(created[0].transferred).toEqual([req.data]); // sin copia
  });

  it('convierte los errores del worker en ParseError con su código', async () => {
    const { factory } = fakeWorkerFactory((w) =>
      w.emit({ type: 'error', code: 'CORRUPT_FILE', message: 'dañado' }),
    );
    const error = await parseInWorker(request(), {}, factory).catch((e) => e);
    expect(error).toBeInstanceOf(ParseError);
    expect(error).toMatchObject({ code: 'CORRUPT_FILE', message: 'dañado' });
  });

  it('WorkerUnavailableError si el worker no puede crearse o falla al cargar', async () => {
    await expect(
      parseInWorker(request(), {}, () => {
        throw new Error('CSP');
      }),
    ).rejects.toBeInstanceOf(WorkerUnavailableError);
    const { factory } = fakeWorkerFactory((w) => w.onerror?.({ message: 'no carga' } as ErrorEvent));
    await expect(parseInWorker(request(), {}, factory)).rejects.toBeInstanceOf(WorkerUnavailableError);
  });

  it('cancelar termina el worker', async () => {
    const controller = new AbortController();
    const { factory, created } = fakeWorkerFactory(() => controller.abort());
    await expect(parseInWorker(request(), { signal: controller.signal }, factory)).rejects.toMatchObject({
      code: 'ABORTED',
    });
    expect(created[0].terminated).toBe(true);
  });
});

describe('processFile sin workers disponibles', () => {
  it('procesa en el hilo principal si el Worker no arranca', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('Workers bloqueados');
        }
      },
    );
    const file = new File([fixture('informe.docx') as BlobPart], 'informe.docx');
    const doc = await processFile(file);
    expect(doc.fileType).toBe('docx');
    expect(doc.title).toBe('Informe de lectura');
  });
});

describe('atajos de teclado', () => {
  let synth: FakeSynth;
  beforeEach(() => {
    synth = installFakeSpeech();
  });
  afterEach(() => uninstallFakeSpeech());

  it('Espacio reproduce y pausa la voz, pero no si el foco está en un botón', async () => {
    await saveDocument(makeDoc({ id: 'k1', html: '<p>Hola mundo.</p><p>Adiós.</p>', sections: [] }));
    render(<DocumentReader id="k1" />);
    await screen.findByRole('article');

    const space = (target: Element | Document = document.body) =>
      fireEvent.keyDown(target, { key: ' ', code: 'Space', bubbles: true });

    space();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pausar lectura' })).toBeInTheDocument());
    expect(synth.speaking).toBe(true);

    space();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continuar lectura' })).toBeInTheDocument(),
    );
    expect(synth.speaking).toBe(false);

    const stopButton = screen.getByRole('button', { name: 'Detener lectura' });
    stopButton.focus();
    space(stopButton);
    expect(screen.getByRole('button', { name: 'Continuar lectura' })).toBeInTheDocument();
  });

  it('«/» enfoca la búsqueda de la biblioteca', async () => {
    await saveDocument(makeDoc({ title: 'Uno' }));
    render(<LibraryView />);
    const search = await screen.findByRole('searchbox', { name: 'Buscar documentos' });
    expect(search).toHaveAttribute('aria-keyshortcuts', '/');
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).toBe(search);
  });
});

describe('errores con reintento', () => {
  it('el lector muestra «Reintentar» si IndexedDB falla y se recupera al pulsarlo', async () => {
    const db = await import('@/lib/db/indexeddb');
    await db.saveDocument(makeDoc({ id: 'r1', title: 'Recuperado' }));
    const spy = vi.spyOn(db, 'getDocument').mockRejectedValue(new Error('Base de datos ocupada'));

    render(<DocumentReader id="r1" />);
    expect(
      await screen.findByText('No se pudo abrir el documento', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(3); // 1 intento + 2 reintentos automáticos

    spy.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Recuperado' })).toBeInTheDocument();
  });
});
