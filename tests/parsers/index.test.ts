// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { detectFileType, parseDocument } from '@/lib/parsers';
import { parseDocumentOnServer } from '@/lib/parsers/server';

import { fixture } from './helpers';

describe('detectFileType (magic bytes)', () => {
  it.each([
    ['programacion.pdf', 'pdf'],
    ['informe.docx', 'docx'],
    ['historia.doc', 'doc'],
    ['celula.html', 'html'],
    ['educacion-latin1.htm', 'html'],
  ])('%s → %s', (name, type) => {
    expect(detectFileType(fixture(name), name)).toBe(type);
  });

  it('ignora la extensión si el contenido dice otra cosa', () => {
    expect(detectFileType(fixture('programacion.pdf'), 'disfrazado.docx')).toBe('pdf');
    expect(detectFileType(fixture('informe.docx'), 'disfrazado.pdf')).toBe('docx');
  });

  it('rechaza binarios desconocidos aunque tengan extensión válida', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
    expect(detectFileType(png, 'foto.pdf')).toBeNull();
    expect(detectFileType(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]), 'archivo.zip')).toBeNull();
  });

  it('acepta HTML por contenido aunque no tenga extensión', () => {
    expect(detectFileType(new TextEncoder().encode('<!DOCTYPE html><p>hola</p>'), 'pagina')).toBe('html');
  });
});

describe('parseDocument (factory)', () => {
  it('devuelve un ParsedDocument completo', async () => {
    const data = fixture('informe.docx');
    const doc = await parseDocument({ name: 'informe.docx', data });
    expect(doc).toMatchObject({
      fileName: 'informe.docx',
      fileType: 'docx',
      size: data.byteLength,
      title: 'Informe de lectura',
    });
    expect(doc.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(doc.createdAt).toBeLessThanOrEqual(Date.now());
    expect(doc.sections.length).toBe(5);
  });

  it('acepta ArrayBuffer además de Uint8Array', async () => {
    const bytes = fixture('celula.html');
    const doc = await parseDocument({ name: 'celula.html', data: bytes.buffer as ArrayBuffer });
    expect(doc.fileType).toBe('html');
  });

  it('pide el servidor para .doc en el cliente', async () => {
    await expect(
      parseDocument({ name: 'historia.doc', data: fixture('historia.doc') }),
    ).rejects.toMatchObject({
      code: 'NEEDS_SERVER',
    });
  });

  it('el servidor sí procesa .doc', async () => {
    const doc = await parseDocumentOnServer({ name: 'historia.doc', data: fixture('historia.doc') });
    expect(doc.fileType).toBe('doc');
    expect(doc.sections.length).toBe(3);
  });

  it('errores claros para vacío y formato no soportado', async () => {
    await expect(parseDocument({ name: 'a.pdf', data: new Uint8Array() })).rejects.toMatchObject({
      code: 'EMPTY_FILE',
      message: expect.stringContaining('vacío'),
    });
    await expect(parseDocument({ name: 'a.xyz', data: new Uint8Array([1, 0, 2, 0]) })).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
    });
  });
});
