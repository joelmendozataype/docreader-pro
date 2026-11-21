'use client';

import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { LibraryBigIcon, RotateCcwIcon, SearchXIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';

import { DeleteDialog, RenameDialog } from '@/components/library/DocumentDialogs';
import { DocumentCard } from '@/components/library/DocumentCard';
import { LibraryToolbar } from '@/components/library/LibraryToolbar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dropzone } from '@/components/upload/Dropzone';
import { UploadQueue } from '@/components/upload/UploadQueue';
import { useDocuments } from '@/hooks/useDocuments';
import type { SortOrder, TypeFilter } from '@/lib/utils/library';
import type { DocumentMeta } from '@/types/document';

export function LibraryView() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [sort, setSort] = useState<SortOrder>('recent');
  const [renaming, setRenaming] = useState<DocumentMeta | null>(null);
  const [deleting, setDeleting] = useState<DocumentMeta | null>(null);

  const lib = useDocuments({ query, type, sort });
  const hasDocs = lib.total > 0;
  const filtering = query.trim() !== '' || type !== 'all';

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-8">
        <section aria-labelledby="upload-title" className="space-y-3">
          <h2 id="upload-title" className="sr-only">
            Añadir documentos
          </h2>
          <Dropzone onFiles={lib.add} compact={hasDocs} />
          <UploadQueue
            uploads={lib.uploads}
            onCancel={lib.cancelUpload}
            onRetry={lib.retryUpload}
            onDismiss={lib.dismissUpload}
          />
        </section>

        <section aria-labelledby="library-title" className="space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="library-title" className="text-xl font-semibold tracking-tight">
              Mi biblioteca
            </h2>
            {hasDocs && (
              <p className="text-muted-foreground text-sm" aria-live="polite">
                {filtering ? `${lib.visible.length} de ${lib.total}` : lib.total}{' '}
                {lib.total === 1 ? 'documento' : 'documentos'}
              </p>
            )}
          </div>

          {lib.isLoading ? (
            <LibrarySkeleton />
          ) : lib.status === 'error' ? (
            <StateMessage
              icon={<TriangleAlertIcon className="text-destructive size-8" />}
              title="No se pudo abrir tu biblioteca"
              description={lib.loadError ?? 'Revisa que el navegador permita guardar datos de este sitio.'}
              action={
                <Button variant="outline" onClick={() => void lib.load()}>
                  <RotateCcwIcon /> Reintentar
                </Button>
              }
            />
          ) : !hasDocs ? (
            <StateMessage
              icon={<LibraryBigIcon className="text-muted-foreground size-8" />}
              title="Tu biblioteca está vacía"
              description="Sube un PDF, un Word o una página HTML y aparecerá aquí, guardado en este navegador."
            />
          ) : (
            <>
              <LibraryToolbar
                query={query}
                onQueryChange={setQuery}
                type={type}
                onTypeChange={setType}
                sort={sort}
                onSortChange={setSort}
              />
              {lib.visible.length === 0 ? (
                <StateMessage
                  icon={<SearchXIcon className="text-muted-foreground size-8" />}
                  title="Sin resultados"
                  description="Ningún documento coincide con la búsqueda o el filtro."
                  action={
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQuery('');
                        setType('all');
                      }}
                    >
                      Limpiar filtros
                    </Button>
                  }
                />
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence initial={false} mode="popLayout">
                    {lib.visible.map((doc) => (
                      <motion.li
                        key={doc.id}
                        layout
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.18 }}
                      >
                        <DocumentCard doc={doc} onRename={setRenaming} onDelete={setDeleting} />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      <RenameDialog doc={renaming} onClose={() => setRenaming(null)} onSubmit={lib.rename} />
      <DeleteDialog
        doc={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={(id) => void lib.remove(id)}
      />
    </MotionConfig>
  );
}

function StateMessage({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <span aria-hidden>{icon}</span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>
      </div>
      {action}
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-label="Cargando biblioteca"
    >
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="space-y-3 rounded-xl border p-4">
          <div className="flex gap-3">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
