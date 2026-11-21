import 'fake-indexeddb/auto';

import { render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentReader } from '@/components/reader/DocumentReader';
import { getDocumentMeta, saveDocument } from '@/lib/db/indexeddb';

import { freshIndexedDB, makeDoc } from '../helpers/documents';

beforeAll(() => {
  // APIs del navegador que jsdom no implementa
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
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(async () => {
  await freshIndexedDB();
  localStorage.clear();
});

const doc = makeDoc({
  id: 'lector-1',
  title: 'Tesis de ejemplo',
  author: 'Ana Pérez',
  html: '<h1 id="sec-1">Capítulo I</h1><p>Texto <script>alert(1)</script>seguro.</p><h2 id="sec-2">Marco teórico</h2><p>Más texto.</p>',
  sections: [
    { id: 'sec-1', title: 'Capítulo I', level: 1 },
    { id: 'sec-2', title: 'Marco teórico', level: 2 },
  ],
});

describe('DocumentReader', () => {
  it('muestra el documento sanitizado con título, metadatos e índice', async () => {
    await saveDocument(doc);
    render(<DocumentReader id="lector-1" />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Tesis de ejemplo' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Tesis de ejemplo' })).toBeInTheDocument();
    expect(screen.getByText(/Ana Pérez · PDF · 3 páginas/)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Índice del documento' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progreso de lectura' })).toBeInTheDocument();
    expect(document.querySelector('.reader-content script')).toBeNull();
    expect(document.querySelector('.reader-content')?.textContent).toContain('Texto seguro.');
  });

  it('registra la última apertura', async () => {
    await saveDocument(doc);
    render(<DocumentReader id="lector-1" />);
    await screen.findByRole('article');
    await waitFor(async () => expect((await getDocumentMeta('lector-1'))?.lastOpenedAt).toBeGreaterThan(0));
  });

  it('las teclas N/P navegan entre secciones y T oculta el índice', async () => {
    await saveDocument(doc);
    render(<DocumentReader id="lector-1" />);
    await screen.findByRole('article');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    const target = document.getElementById('sec-2')!;
    await waitFor(() => expect(document.activeElement).toBe(target));
    expect(location.hash).toBe('#sec-2');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));
    await waitFor(() =>
      expect(screen.queryByRole('navigation', { name: 'Índice del documento' })).not.toBeInTheDocument(),
    );
  });

  it('A+ con la tecla + agranda la letra', async () => {
    await saveDocument(doc);
    render(<DocumentReader id="lector-1" />);
    const article = await screen.findByRole('article');
    const before = parseInt(article.style.fontSize, 10);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }));
    await waitFor(() => expect(parseInt(article.style.fontSize, 10)).toBe(before + 2));
  });

  it('documento inexistente: mensaje y enlace de vuelta', async () => {
    render(<DocumentReader id="no-existe" />);
    expect(await screen.findByText('Este documento no está en tu biblioteca')).toBeInTheDocument();
    // son enlaces de verdad (no role=button), para que los lectores de pantalla anuncien "enlace"
    expect(screen.getAllByRole('link', { name: 'Volver a la biblioteca' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Volver a la biblioteca' })).toBeNull();
  });
});
