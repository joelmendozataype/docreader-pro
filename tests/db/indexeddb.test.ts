import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  deleteDocument,
  getDocument,
  getDocumentContent,
  getDocumentMeta,
  listDocuments,
  renameDocument,
  restoreDocument,
  saveDocument,
  updateDocumentMeta,
} from '@/lib/db/indexeddb';

import { freshIndexedDB, makeDoc } from '../helpers/documents';

beforeEach(freshIndexedDB);

describe('IndexedDB', () => {
  it('guarda metadatos ligeros y contenido por separado', async () => {
    const doc = makeDoc({ text: 'hola mundo bonito' });
    const meta = await saveDocument(doc);
    expect(meta).toMatchObject({ id: doc.id, title: doc.title, sectionCount: 1, wordCount: 3 });
    expect(meta).not.toHaveProperty('text');
    expect(meta).not.toHaveProperty('html');
    expect(meta).not.toHaveProperty('sections');
    expect(await getDocumentContent(doc.id)).toEqual({
      id: doc.id,
      text: doc.text,
      html: doc.html,
      sections: doc.sections,
    });
  });

  it('lista del más reciente al más antiguo', async () => {
    const a = makeDoc({ createdAt: 1 });
    const b = makeDoc({ createdAt: 3 });
    const c = makeDoc({ createdAt: 2 });
    for (const d of [a, b, c]) await saveDocument(d);
    expect((await listDocuments()).map((d) => d.id)).toEqual([b.id, c.id, a.id]);
  });

  it('getDocument une metadatos y contenido', async () => {
    const doc = makeDoc();
    await saveDocument(doc);
    const full = await getDocument(doc.id);
    expect(full).toMatchObject({ id: doc.id, title: doc.title, html: doc.html, sections: doc.sections });
    expect(await getDocument('no-existe')).toBeUndefined();
  });

  it('elimina ambos registros', async () => {
    const doc = makeDoc();
    await saveDocument(doc);
    await deleteDocument(doc.id);
    expect(await getDocumentMeta(doc.id)).toBeUndefined();
    expect(await getDocumentContent(doc.id)).toBeUndefined();
  });

  it('renombra limpiando espacios y rechaza nombres vacíos', async () => {
    const doc = makeDoc();
    await saveDocument(doc);
    const renamed = await renameDocument(doc.id, '   Mi   tesis  final ');
    expect(renamed.title).toBe('Mi tesis final');
    expect((await getDocumentMeta(doc.id))?.title).toBe('Mi tesis final');
    await expect(renameDocument(doc.id, '   ')).rejects.toThrow('vacío');
    await expect(renameDocument('no-existe', 'x')).rejects.toThrow('ya no existe');
  });

  it('actualiza progreso y restaura tras borrar (deshacer)', async () => {
    const doc = makeDoc();
    await saveDocument(doc);
    const meta = await updateDocumentMeta(doc.id, { progress: 0.4 });
    const content = (await getDocumentContent(doc.id))!;
    await deleteDocument(doc.id);
    await restoreDocument(meta, content);
    expect((await getDocument(doc.id))?.progress).toBe(0.4);
  });

  it('persiste entre conexiones (como al recargar la página)', async () => {
    const doc = makeDoc();
    await saveDocument(doc);
    const { closeDb } = await import('@/lib/db/indexeddb');
    await closeDb();
    expect((await listDocuments()).map((d) => d.id)).toEqual([doc.id]);
  });
});
