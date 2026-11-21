/**
 * Estado global de la biblioteca (Zustand).
 * La fuente de verdad es IndexedDB; aquí vive la copia en memoria de los
 * metadatos y la cola de archivos que se están procesando.
 */

import { toast } from 'sonner';
import { create } from 'zustand';

import {
  deleteDocument,
  getDocumentContent,
  listDocuments,
  renameDocument as renameInDb,
  requestPersistentStorage,
  restoreDocument,
  saveDocument,
} from '@/lib/db/indexeddb';
import {
  isAcceptedFileName,
  type ProcessError,
  processFile,
  type ProcessStage,
} from '@/lib/upload/process-file';
import { createId } from '@/lib/utils/text';
import type { DocumentMeta } from '@/types/document';

export type UploadStatus = 'queued' | 'processing' | 'saving' | 'done' | 'error';

export interface UploadItem {
  id: string;
  fileName: string;
  size: number;
  progress: number;
  stage?: ProcessStage;
  status: UploadStatus;
  error?: string;
  retryable?: boolean;
  /** id del documento guardado (cuando status = done) */
  documentId?: string;
}

interface DocumentsState {
  documents: DocumentMeta[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  loadError?: string;
  uploads: UploadItem[];

  load: () => Promise<void>;
  addFiles: (files: File[]) => void;
  retryUpload: (uploadId: string) => void;
  cancelUpload: (uploadId: string) => void;
  dismissUpload: (uploadId: string) => void;
  renameDocument: (id: string, title: string) => Promise<boolean>;
  removeDocument: (id: string) => Promise<boolean>;
  /** reemplaza los metadatos de un documento en memoria (lo usa el lector) */
  upsertMeta: (meta: DocumentMeta) => void;
}

/** Archivos y controladores fuera del estado (no serializables). */
const pendingFiles = new Map<string, File>();
const controllers = new Map<string, AbortController>();
let queueRunning = false;
let persistRequested = false;

const DONE_VISIBLE_MS = 2500;

function sortByCreated(docs: DocumentMeta[]) {
  return [...docs].sort((a, b) => b.createdAt - a.createdAt);
}

export const useDocumentsStore = create<DocumentsState>()((set, get) => {
  const patchUpload = (id: string, changes: Partial<UploadItem>) =>
    set((state) => ({ uploads: state.uploads.map((u) => (u.id === id ? { ...u, ...changes } : u)) }));

  async function runQueue() {
    if (queueRunning) return;
    queueRunning = true;
    try {
      // un archivo a la vez: los documentos grandes consumen mucha memoria
      for (;;) {
        const next = get().uploads.find((u) => u.status === 'queued');
        if (!next) break;
        await processUpload(next.id);
      }
    } finally {
      queueRunning = false;
    }
  }

  async function processUpload(uploadId: string) {
    const file = pendingFiles.get(uploadId);
    if (!file) {
      patchUpload(uploadId, {
        status: 'error',
        error: 'El archivo ya no está disponible.',
        retryable: false,
      });
      return;
    }
    const controller = new AbortController();
    controllers.set(uploadId, controller);
    patchUpload(uploadId, { status: 'processing', progress: 0, error: undefined });

    try {
      const doc = await processFile(file, {
        signal: controller.signal,
        onProgress: (progress, stage) => patchUpload(uploadId, { progress, stage }),
      });
      patchUpload(uploadId, { status: 'saving', progress: 0.99 });
      const meta = await saveDocument(doc);
      set((state) => ({
        documents: sortByCreated([meta, ...state.documents.filter((d) => d.id !== meta.id)]),
      }));
      patchUpload(uploadId, { status: 'done', progress: 1, documentId: meta.id });
      pendingFiles.delete(uploadId);
      toast.success('Documento añadido', { description: meta.title });
      setTimeout(() => get().dismissUpload(uploadId), DONE_VISIBLE_MS);

      if (!persistRequested) {
        persistRequested = true;
        void requestPersistentStorage();
      }
    } catch (error) {
      const err = error as ProcessError;
      const cancelled = err.code === 'ABORTED' && controller.signal.aborted;
      if (cancelled) {
        pendingFiles.delete(uploadId);
        set((state) => ({ uploads: state.uploads.filter((u) => u.id !== uploadId) }));
        toast.info('Procesamiento cancelado', { description: file.name });
        return;
      }
      const message = err.message || 'No se pudo procesar el archivo.';
      const retryable = err.retryable ?? true;
      patchUpload(uploadId, { status: 'error', error: message, retryable });
      toast.error(`No se pudo añadir «${file.name}»`, {
        description: message,
        action: retryable ? { label: 'Reintentar', onClick: () => get().retryUpload(uploadId) } : undefined,
      });
    } finally {
      controllers.delete(uploadId);
    }
  }

  return {
    documents: [],
    status: 'idle',
    uploads: [],

    async load() {
      if (get().status === 'loading') return;
      set({ status: 'loading', loadError: undefined });
      try {
        set({ documents: await listDocuments(), status: 'ready' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo abrir la biblioteca.';
        set({ status: 'error', loadError: message });
        toast.error('No se pudo cargar tu biblioteca', { description: message });
      }
    },

    addFiles(files) {
      const accepted: UploadItem[] = [];
      for (const file of files) {
        if (!isAcceptedFileName(file.name)) {
          toast.error(`Formato no compatible: ${file.name}`, {
            description: 'Usa archivos .pdf, .docx, .doc, .html o .htm.',
          });
          continue;
        }
        const id = createId();
        pendingFiles.set(id, file);
        accepted.push({ id, fileName: file.name, size: file.size, progress: 0, status: 'queued' });
      }
      if (!accepted.length) return;
      set((state) => ({ uploads: [...state.uploads, ...accepted] }));
      void runQueue();
    },

    retryUpload(uploadId) {
      if (!pendingFiles.has(uploadId)) return;
      patchUpload(uploadId, { status: 'queued', progress: 0, error: undefined });
      void runQueue();
    },

    cancelUpload(uploadId) {
      const controller = controllers.get(uploadId);
      if (controller) {
        controller.abort();
        return;
      }
      pendingFiles.delete(uploadId);
      set((state) => ({ uploads: state.uploads.filter((u) => u.id !== uploadId) }));
    },

    dismissUpload(uploadId) {
      if (controllers.has(uploadId)) return;
      pendingFiles.delete(uploadId);
      set((state) => ({ uploads: state.uploads.filter((u) => u.id !== uploadId) }));
    },

    async renameDocument(id, title) {
      try {
        const meta = await renameInDb(id, title);
        get().upsertMeta(meta);
        toast.success('Documento renombrado', { description: meta.title });
        return true;
      } catch (error) {
        toast.error('No se pudo renombrar', { description: (error as Error).message });
        return false;
      }
    },

    async removeDocument(id) {
      const meta = get().documents.find((d) => d.id === id);
      try {
        const content = await getDocumentContent(id);
        await deleteDocument(id);
        set((state) => ({ documents: state.documents.filter((d) => d.id !== id) }));
        toast.success('Documento eliminado', {
          description: meta?.title,
          duration: 10_000,
          action:
            meta && content
              ? {
                  label: 'Deshacer',
                  onClick: async () => {
                    try {
                      await restoreDocument(meta, content);
                      get().upsertMeta(meta);
                      toast.success('Documento restaurado', { description: meta.title });
                    } catch {
                      toast.error('No se pudo restaurar el documento');
                    }
                  },
                }
              : undefined,
        });
        return true;
      } catch (error) {
        toast.error('No se pudo eliminar', { description: (error as Error).message });
        return false;
      }
    },

    upsertMeta(meta) {
      set((state) => ({
        documents: sortByCreated([meta, ...state.documents.filter((d) => d.id !== meta.id)]),
      }));
    },
  };
});

/** Solo para tests. */
export function resetDocumentsStore() {
  pendingFiles.clear();
  controllers.forEach((c) => c.abort());
  controllers.clear();
  queueRunning = false;
  persistRequested = false;
  useDocumentsStore.setState({ documents: [], status: 'idle', loadError: undefined, uploads: [] });
}
