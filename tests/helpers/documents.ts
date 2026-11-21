import { IDBFactory } from 'fake-indexeddb';

import { closeDb } from '@/lib/db/indexeddb';
import type { ParsedDocument } from '@/types/document';

let counter = 0;

export function makeDoc(overrides: Partial<ParsedDocument> = {}): ParsedDocument {
  counter++;
  return {
    id: `doc-${counter}`,
    fileName: `archivo-${counter}.pdf`,
    fileType: 'pdf',
    title: `Documento ${counter}`,
    pages: 3,
    size: 1000 * counter,
    text: 'Uno dos tres cuatro.',
    html: '<p>Uno dos tres cuatro.</p>',
    sections: [{ id: 'sec-1', title: 'Intro', level: 1 }],
    createdAt: 1_700_000_000_000 + counter,
    ...overrides,
  };
}

/** IndexedDB nueva y vacía para cada test. */
export async function freshIndexedDB() {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
}
