import 'fake-indexeddb/auto';

import { render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentCard } from '@/components/library/DocumentCard';
import { LibraryToolbar } from '@/components/library/LibraryToolbar';
import { DocumentReader } from '@/components/reader/DocumentReader';
import { TableOfContents } from '@/components/reader/TableOfContents';
import { Dropzone } from '@/components/upload/Dropzone';
import { UploadQueue } from '@/components/upload/UploadQueue';
import { saveDocument, toMeta } from '@/lib/db/indexeddb';

import { freshIndexedDB, makeDoc } from '../helpers/documents';
import { installFakeSpeech, uninstallFakeSpeech } from '../helpers/fake-speech';

/** axe sobre el DOM de jsdom (sin contraste: jsdom no calcula colores; se audita en el navegador real). */
async function expectNoViolations(container: Element) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  const summary = result.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(summary).toEqual([]);
}

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
  localStorage.clear();
});

describe('accesibilidad (axe)', () => {
  it('Dropzone: botón real para elegir archivos, sin controles anidados', async () => {
    const { container } = render(<Dropzone onFiles={() => {}} />);
    expect(screen.getByRole('button', { name: 'elige archivos' })).toBeInTheDocument();
    expect(container.querySelector('[role="button"]')).toBeNull();
    await expectNoViolations(container);
  });

  it('Biblioteca: barra de herramientas, tarjeta y cola de subida', async () => {
    const meta = toMeta(makeDoc({ title: 'Tesis', progress: 0.4 } as never));
    const { container } = render(
      <main>
        <LibraryToolbar
          query=""
          onQueryChange={() => {}}
          type="all"
          onTypeChange={() => {}}
          sort="recent"
          onSortChange={() => {}}
        />
        <ul>
          <li>
            <DocumentCard doc={{ ...meta, progress: 0.4 }} onRename={() => {}} onDelete={() => {}} />
          </li>
        </ul>
        <UploadQueue
          uploads={[
            { id: '1', fileName: 'a.pdf', size: 10, progress: 0.5, status: 'processing', stage: 'parsing' },
            {
              id: '2',
              fileName: 'b.doc',
              size: 10,
              progress: 0,
              status: 'error',
              error: 'Falló',
              retryable: true,
            },
          ]}
          onCancel={() => {}}
          onRetry={() => {}}
          onDismiss={() => {}}
        />
      </main>,
    );
    await expectNoViolations(container);
  });

  it('Índice', async () => {
    const { container } = render(
      <TableOfContents
        sections={[
          { id: 's1', title: 'Uno', level: 1 },
          { id: 's2', title: 'Dos', level: 2 },
        ]}
        activeId="s2"
        onNavigate={() => {}}
      />,
    );
    await expectNoViolations(container);
  });

  it('Lector completo con controles de voz', async () => {
    installFakeSpeech();
    await saveDocument(
      makeDoc({
        id: 'a11y',
        html: '<h1 id="sec-1">Capítulo</h1><p>Texto.</p><table><tr><th scope="col">A</th></tr><tr><td>1</td></tr></table>',
        sections: [{ id: 'sec-1', title: 'Capítulo', level: 1 }],
      }),
    );
    const { container } = render(<DocumentReader id="a11y" />);
    await screen.findByRole('article');
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Lectura en voz alta' })).toBeInTheDocument(),
    );
    await expectNoViolations(container);
    uninstallFakeSpeech();
  });
});
