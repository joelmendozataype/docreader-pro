import { describe, expect, it } from 'vitest';

import { toMeta } from '@/lib/db/indexeddb';
import { filterDocuments, foldForSearch, formatBytes } from '@/lib/utils/library';

import { makeDoc } from '../helpers/documents';

const docs = [
  toMeta(makeDoc({ title: 'Introducción a la Programación', fileType: 'pdf', createdAt: 3, size: 500 })),
  toMeta(
    makeDoc({ title: 'Informe de lectura', fileType: 'docx', author: 'Ana Pérez', createdAt: 1, size: 900 }),
  ),
  toMeta(makeDoc({ title: 'Historia colonial', fileType: 'doc', createdAt: 2, size: 100 })),
  toMeta(
    makeDoc({ title: 'La célula', fileType: 'html', fileName: 'biologia.html', createdAt: 4, size: 50 }),
  ),
];

const titles = (list: typeof docs) => list.map((d) => d.title);

describe('filterDocuments', () => {
  it('busca sin importar tildes ni mayúsculas, en título, archivo y autor', () => {
    expect(titles(filterDocuments(docs, { query: 'PROGRAMACION' }))).toEqual([
      'Introducción a la Programación',
    ]);
    expect(titles(filterDocuments(docs, { query: 'perez' }))).toEqual(['Informe de lectura']);
    expect(titles(filterDocuments(docs, { query: 'biologia' }))).toEqual(['La célula']);
  });

  it('todas las palabras deben coincidir', () => {
    expect(filterDocuments(docs, { query: 'informe lectura' })).toHaveLength(1);
    expect(filterDocuments(docs, { query: 'informe célula' })).toHaveLength(0);
  });

  it('filtra por tipo (Word incluye .docx y .doc)', () => {
    expect(titles(filterDocuments(docs, { type: 'word', sort: 'title' }))).toEqual([
      'Historia colonial',
      'Informe de lectura',
    ]);
    expect(filterDocuments(docs, { type: 'pdf' })).toHaveLength(1);
  });

  it('ordena por fecha, título y tamaño', () => {
    expect(titles(filterDocuments(docs, {}))[0]).toBe('La célula');
    expect(titles(filterDocuments(docs, { sort: 'title' }))).toEqual([
      'Historia colonial',
      'Informe de lectura',
      'Introducción a la Programación',
      'La célula',
    ]);
    expect(filterDocuments(docs, { sort: 'size' })[0].title).toBe('Informe de lectura');
  });

  it('no modifica la lista original', () => {
    const before = titles(docs);
    filterDocuments(docs, { sort: 'title' });
    expect(titles(docs)).toEqual(before);
  });
});

describe('formato', () => {
  it('foldForSearch', () => {
    expect(foldForSearch('Ñandú Ácido')).toBe('nandu acido');
  });

  it('formatBytes con formato de Perú', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1536)).toBe('1.5 KB'); // es-PE usa punto decimal
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB');
  });
});
