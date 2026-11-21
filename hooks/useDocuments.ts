'use client';

import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { getDocument } from '@/lib/db/indexeddb';
import { useDocumentsStore } from '@/lib/store/documents-store';
import { filterDocuments, type SortOrder, type TypeFilter } from '@/lib/utils/library';

export interface DocumentQuery {
  query?: string;
  type?: TypeFilter;
  sort?: SortOrder;
}

/**
 * Acceso a la biblioteca: carga inicial desde IndexedDB, lista filtrada
 * y acciones (añadir, obtener, renombrar, eliminar, buscar).
 */
export function useDocuments(filters: DocumentQuery = {}) {
  const state = useDocumentsStore(
    useShallow((s) => ({
      documents: s.documents,
      status: s.status,
      loadError: s.loadError,
      uploads: s.uploads,
      load: s.load,
      addFiles: s.addFiles,
      retryUpload: s.retryUpload,
      cancelUpload: s.cancelUpload,
      dismissUpload: s.dismissUpload,
      renameDocument: s.renameDocument,
      removeDocument: s.removeDocument,
    })),
  );

  const { status, load } = state;
  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  const { query, type, sort } = filters;
  const visible = useMemo(
    () => filterDocuments(state.documents, { query, type, sort }),
    [state.documents, query, type, sort],
  );

  return {
    ...state,
    /** documentos tras aplicar búsqueda, filtro y orden */
    visible,
    total: state.documents.length,
    isLoading: status === 'idle' || status === 'loading',
    add: state.addFiles,
    get: getDocument,
    rename: state.renameDocument,
    remove: state.removeDocument,
    search: (q: string) => filterDocuments(state.documents, { query: q }),
  };
}
