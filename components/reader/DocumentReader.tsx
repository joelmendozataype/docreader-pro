'use client';

import { ArrowLeftIcon, FileQuestionIcon, ListTreeIcon } from 'lucide-react';
import Link from 'next/link';
import { type CSSProperties, memo, type Ref, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ReaderSettings } from '@/components/reader/ReaderSettings';
import { TableOfContents } from '@/components/reader/TableOfContents';
import { TTSControls } from '@/components/reader/TTSControls';
import { Button, buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveSection } from '@/hooks/useActiveSection';
import { useMediaQuery, usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { useReaderSettings, WIDTH_CH } from '@/hooks/useReaderSettings';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import { useTTS } from '@/hooks/useTTS';
import { getDocument, updateDocumentMeta } from '@/lib/db/indexeddb';
import { sanitizeForReader } from '@/lib/reader/sanitize';
import { useDocumentsStore } from '@/lib/store/documents-store';
import { foldForSearch, TYPE_LABELS } from '@/lib/utils/library';

type ReaderDocument = NonNullable<Awaited<ReturnType<typeof getDocument>>>;

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; doc: ReaderDocument };

/** Carga el documento desde IndexedDB y muestra el lector. */
export function DocumentReader({ id }: { id: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    getDocument(id)
      .then((doc) => {
        if (!alive) return;
        setState(doc ? { status: 'ready', doc } : { status: 'missing' });
        if (doc) {
          updateDocumentMeta(id, { lastOpenedAt: Date.now() })
            .then((meta) => useDocumentsStore.getState().upsertMeta(meta))
            .catch(() => undefined);
        }
      })
      .catch((error: unknown) => {
        if (alive)
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (state.status === 'ready') return <ReaderView key={state.doc.id} doc={state.doc} />;

  return (
    <div className="min-h-dvh">
      <ReaderHeaderShell />
      <main id="contenido" className="mx-auto max-w-3xl px-4 py-10">
        {state.status === 'loading' ? (
          <div aria-busy="true" aria-label="Cargando documento" className="space-y-4">
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            <div className="space-y-2 pt-6">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-4" style={{ width: `${90 - (i % 3) * 12}%` }} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
            <FileQuestionIcon className="text-muted-foreground size-9" aria-hidden />
            <h1 className="text-lg font-semibold">
              {state.status === 'missing'
                ? 'Este documento no está en tu biblioteca'
                : 'No se pudo abrir el documento'}
            </h1>
            <p className="text-muted-foreground max-w-sm text-sm">
              {state.status === 'missing'
                ? 'Puede que se haya eliminado o que lo hayas subido en otro navegador.'
                : state.message}
            </p>
            <Link href="/" className={buttonVariants()}>
              Volver a la biblioteca
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

function ReaderHeaderShell({ children }: { children?: React.ReactNode }) {
  return (
    <header className="bg-background/90 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-1 px-2 sm:px-4">
        <Link href="/" className={buttonVariants({ variant: 'ghost' })} aria-label="Volver a la biblioteca">
          <ArrowLeftIcon />
          <span className="hidden sm:inline">Biblioteca</span>
        </Link>
        {children}
      </div>
    </header>
  );
}

/**
 * Contenido del documento. Va aislado y memorizado a propósito: React 19 compara
 * `dangerouslySetInnerHTML` por identidad del objeto, así que sin esto cada
 * re-render (scroll, sección activa…) volvería a escribir todo el HTML,
 * perdiendo el foco y los nodos que usan el índice y el TTS.
 */
const ReaderContent = memo(function ReaderContent({
  html,
  large,
  ref,
}: {
  html: string;
  large: boolean;
  ref?: Ref<HTMLDivElement>;
}) {
  const inner = useMemo(() => ({ __html: html }), [html]);
  return (
    <div
      ref={ref}
      className="reader-content"
      data-large={large || undefined}
      dangerouslySetInnerHTML={inner}
    />
  );
});

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function ReaderView({ doc }: { doc: ReaderDocument }) {
  const { settings, update, increaseFont, decreaseFont } = useReaderSettings();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const reducedMotion = usePrefersReducedMotion();
  const articleRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [tocSheetOpen, setTocSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);

  const html = useMemo(() => sanitizeForReader(doc.html), [doc.html]);
  const sectionIds = useMemo(() => doc.sections.map((s) => s.id), [doc.sections]);
  const large = html.length > 300_000;

  // esperar a las fuentes web para restaurar la posición sobre la maquetación final
  useEffect(() => {
    let alive = true;
    const fonts = document.fonts?.ready ?? Promise.resolve();
    void fonts.then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const layoutKey = `${settings.fontSize}|${settings.font}|${settings.width}|${settings.lineHeight}|${settings.tocOpen}`;
  const progress = useReadingProgress(articleRef, {
    docId: doc.id,
    initialProgress: doc.progress,
    ready: fontsReady,
    layoutKey,
  });
  const activeId = useActiveSection(sectionIds, fontsReady);
  const tts = useTTS({ containerRef: contentRef, reducedMotion, topOffset: 64, bottomOffset: 112 });
  const { pauseAtElement } = tts;

  useEffect(() => {
    const previous = document.title;
    document.title = `${doc.title} · DocReader Pro`;
    return () => {
      document.title = previous;
    };
  }, [doc.title]);

  const navigateTo = useCallback(
    (sectionId: string) => {
      const target = document.getElementById(sectionId);
      if (!target) return;
      setTocSheetOpen(false);
      // la lectura en voz alta se pausa y se retomará desde el título elegido
      pauseAtElement(target);
      target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      // mover el foco al título para lectores de pantalla y teclado
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      history.replaceState(null, '', `#${sectionId}`);
    },
    [reducedMotion, pauseAtElement],
  );

  const toggleToc = useCallback(() => {
    if (isDesktop) update({ tocOpen: !settings.tocOpen });
    else setTocSheetOpen((open) => !open);
  }, [isDesktop, settings.tocOpen, update]);

  // atajos de teclado
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const index = activeId ? sectionIds.indexOf(activeId) : -1;
      switch (event.key) {
        case 't':
        case 'T':
          toggleToc();
          break;
        case 'a':
        case 'A':
          setSettingsOpen(true);
          break;
        case 'n':
        case 'N':
          if (index < sectionIds.length - 1) navigateTo(sectionIds[index + 1]);
          break;
        case 'p':
        case 'P':
          if (index > 0) navigateTo(sectionIds[index - 1]);
          break;
        case '+':
        case '=':
          increaseFont();
          break;
        case '-':
          decreaseFont();
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeId, sectionIds, toggleToc, navigateTo, increaseFont, decreaseFont]);

  // si el primer título del contenido es igual al título, no se repite arriba
  const firstHeading = doc.sections[0];
  const titleInContent = !!firstHeading && foldForSearch(firstHeading.title) === foldForSearch(doc.title);
  const titleId = titleInContent ? firstHeading.id : 'doc-title';
  const minutes = Math.max(1, Math.round(doc.wordCount / 200));
  const percent = Math.round(progress * 100);
  const showAside = isDesktop && settings.tocOpen;

  const articleStyle = {
    '--reader-font-size': `${settings.fontSize}px`,
    '--reader-line-height': settings.lineHeight,
    fontSize: `${settings.fontSize}px`,
    maxWidth: WIDTH_CH[settings.width],
    fontFamily: settings.font === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)',
  } as CSSProperties;

  return (
    <div className="min-h-dvh">
      <a
        href="#contenido"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar al contenido
      </a>

      <ReaderHeaderShell>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleToc}
          aria-label={showAside || tocSheetOpen ? 'Ocultar índice' : 'Mostrar índice'}
          aria-expanded={showAside || tocSheetOpen}
          aria-controls={isDesktop ? 'toc-panel' : undefined}
          title="Índice (T)"
        >
          <ListTreeIcon className="size-5" />
        </Button>
        <p className="min-w-0 flex-1 truncate px-2 text-sm font-medium" title={doc.title}>
          {doc.title}
        </p>
        <span className="text-muted-foreground hidden text-xs tabular-nums sm:inline" aria-hidden>
          {percent}%
        </span>
        <ReaderSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
        <div
          role="progressbar"
          aria-label="Progreso de lectura"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="absolute inset-x-0 bottom-0 h-0.5"
        >
          <div className="bg-primary h-full origin-left" style={{ transform: `scaleX(${progress})` }} />
        </div>
      </ReaderHeaderShell>

      <div className="mx-auto flex max-w-7xl gap-10 px-4 sm:px-6">
        {showAside && (
          <aside
            id="toc-panel"
            className="sticky top-14 h-[calc(100dvh-3.5rem)] w-72 shrink-0 overflow-y-auto py-8 pr-2"
          >
            <p className="text-muted-foreground mb-3 px-3 text-xs font-semibold tracking-wide uppercase">
              Índice
            </p>
            <TableOfContents sections={doc.sections} activeId={activeId} onNavigate={navigateTo} />
          </aside>
        )}

        <main id="contenido" tabIndex={-1} className="min-w-0 flex-1 pt-10 pb-36 outline-none sm:pt-14">
          <article
            ref={articleRef}
            aria-labelledby={titleId}
            lang="es"
            className="mx-auto w-full"
            style={articleStyle}
          >
            <header className="mb-10 border-b pb-6 font-sans">
              {!titleInContent && (
                <h1
                  id="doc-title"
                  className="text-[1.85em] leading-tight font-bold tracking-tight text-balance"
                >
                  {doc.title}
                </h1>
              )}
              <p className="text-muted-foreground mt-2 text-sm">
                {[
                  doc.author,
                  TYPE_LABELS[doc.fileType],
                  `${doc.pages} ${doc.pages === 1 ? 'página' : 'páginas'}`,
                  `${minutes} min de lectura`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </header>

            <ReaderContent ref={contentRef} html={html} large={large} />

            <p className="text-muted-foreground mt-16 border-t pt-6 text-center font-sans text-sm">
              Fin del documento
            </p>
          </article>
        </main>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-3">
        <TTSControls tts={tts} className="pointer-events-auto max-w-full" />
      </div>

      {!isDesktop && (
        <Sheet open={tocSheetOpen} onOpenChange={setTocSheetOpen}>
          <SheetContent side="left" className="w-[85vw] max-w-sm">
            <SheetHeader>
              <SheetTitle>Índice</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto px-2 pb-6">
              <TableOfContents sections={doc.sections} activeId={activeId} onNavigate={navigateTo} />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
