/**
 * Persistencia local de documentos en IndexedDB (solo navegador).
 *
 * Dos almacenes:
 *  - "documents": metadatos ligeros (DocumentMeta) → la biblioteca carga rápido
 *  - "contents":  texto, HTML e índice (pueden pesar decenas de MB)
 * Ambos se escriben/borran en la misma transacción para no quedar desincronizados.
 */

import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

import { countWords } from '@/lib/utils/text';
import type { DocumentMeta, ParsedDocument } from '@/types/document';

const DB_NAME = 'docreader-pro';
const DB_VERSION = 1;

type DocumentContentRecord = Pick<ParsedDocument, 'id' | 'text' | 'html' | 'sections'>;

interface DocReaderDB extends DBSchema {
  documents: {
    key: string;
    value: DocumentMeta;
    indexes: { 'by-createdAt': number };
  };
  contents: {
    key: string;
    value: DocumentContentRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<DocReaderDB>> | null = null;

export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function getDb(): Promise<IDBPDatabase<DocReaderDB>> {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(
      new Error('Este navegador no permite guardar documentos (IndexedDB no disponible).'),
    );
  }
  dbPromise ??= openDB<DocReaderDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const docs = db.createObjectStore('documents', { keyPath: 'id' });
      docs.createIndex('by-createdAt', 'createdAt');
      db.createObjectStore('contents', { keyPath: 'id' });
    },
    blocking() {
      // otra pestaña abrió una versión nueva: se cierra esta conexión para no bloquearla
      dbPromise?.then((db) => db.close());
      dbPromise = null;
    },
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

export function toMeta(doc: ParsedDocument): DocumentMeta {
  const { text, sections, ...rest } = doc;
  const meta: DocumentMeta & { html?: string } = {
    ...rest,
    sectionCount: sections.length,
    wordCount: countWords(text),
    updatedAt: Date.now(),
  };
  delete meta.html;
  return meta;
}

/** Guarda (o reemplaza) un documento completo. */
export async function saveDocument(doc: ParsedDocument): Promise<DocumentMeta> {
  const db = await getDb();
  const meta = toMeta(doc);
  const tx = db.transaction(['documents', 'contents'], 'readwrite');
  await Promise.all([
    tx.objectStore('documents').put(meta),
    tx.objectStore('contents').put({ id: doc.id, text: doc.text, html: doc.html, sections: doc.sections }),
    tx.done,
  ]);
  return meta;
}

/** Restaura un documento con sus metadatos originales (p. ej. al deshacer un borrado). */
export async function restoreDocument(meta: DocumentMeta, content: DocumentContentRecord): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['documents', 'contents'], 'readwrite');
  await Promise.all([
    tx.objectStore('documents').put(meta),
    tx.objectStore('contents').put(content),
    tx.done,
  ]);
}

/** Metadatos de todos los documentos, del más reciente al más antiguo. */
export async function listDocuments(): Promise<DocumentMeta[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('documents', 'by-createdAt');
  return all.reverse();
}

export async function getDocumentMeta(id: string): Promise<DocumentMeta | undefined> {
  return (await getDb()).get('documents', id);
}

/** Documento completo (metadatos + contenido) para el lector. */
export async function getDocument(id: string): Promise<(DocumentMeta & DocumentContentRecord) | undefined> {
  const db = await getDb();
  const tx = db.transaction(['documents', 'contents'], 'readonly');
  const [meta, content] = await Promise.all([
    tx.objectStore('documents').get(id),
    tx.objectStore('contents').get(id),
    tx.done,
  ]);
  if (!meta || !content) return undefined;
  return { ...meta, ...content };
}

export async function getDocumentContent(id: string): Promise<DocumentContentRecord | undefined> {
  return (await getDb()).get('contents', id);
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['documents', 'contents'], 'readwrite');
  await Promise.all([tx.objectStore('documents').delete(id), tx.objectStore('contents').delete(id), tx.done]);
}

/** Actualiza campos de metadatos (renombrar, progreso, última apertura…). */
export async function updateDocumentMeta(
  id: string,
  changes: Partial<Pick<DocumentMeta, 'title' | 'progress' | 'lastOpenedAt'>>,
): Promise<DocumentMeta> {
  const db = await getDb();
  const tx = db.transaction('documents', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) throw new Error('El documento ya no existe.');
  const updated: DocumentMeta = { ...current, ...changes, updatedAt: Date.now() };
  await tx.store.put(updated);
  await tx.done;
  return updated;
}

export async function renameDocument(id: string, title: string): Promise<DocumentMeta> {
  const clean = title.replace(/\s+/g, ' ').trim();
  if (!clean) throw new Error('El nombre no puede estar vacío.');
  return updateDocumentMeta(id, { title: clean.slice(0, 200) });
}

/**
 * Pide al navegador que no borre los datos al quedarse sin espacio.
 * Devuelve true si el almacenamiento queda marcado como persistente.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Solo para tests: cierra la conexión para poder borrar la base. */
export async function closeDb(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}
