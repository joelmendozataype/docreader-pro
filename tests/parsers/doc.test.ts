// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { parseDoc } from '@/lib/parsers/doc';

import { fixture } from './helpers';

describe('parseDoc (Word 97-2003)', () => {
  it('extrae el texto completo con caracteres en español', async () => {
    const doc = await parseDoc(fixture('historia.doc'), 'historia.doc');
    expect(doc.text).toContain('Huancavelica fue conocida en la época colonial');
    expect(doc.text).toContain('¿Cuál fue su legado? La niñez y la economía local');
    expect(doc.text.endsWith('identidad actual de la ciudad.')).toBe(true);
  });

  it('detecta títulos con heurística y une "CAPÍTULO I" con su nombre', async () => {
    const doc = await parseDoc(fixture('historia.doc'), 'historia.doc');
    expect(doc.sections).toEqual([
      { id: 'sec-1', title: 'CAPÍTULO I. Historia de Huancavelica', level: 1 },
      { id: 'sec-2', title: '1. La mina de Santa Bárbara', level: 1 },
      { id: 'sec-3', title: 'CONCLUSIONES', level: 1 },
    ]);
    expect(doc.title).toBe('CAPÍTULO I. Historia de Huancavelica');
  });

  it('cada línea de Word es un párrafo', async () => {
    const { html } = await parseDoc(fixture('historia.doc'), 'historia.doc');
    expect(html.match(/<p>/g)).toHaveLength(3);
  });

  it('rechaza archivos OLE dañados', async () => {
    const broken = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 1, 2, 3]);
    await expect(parseDoc(broken, 'roto.doc')).rejects.toMatchObject({ code: 'CORRUPT_FILE' });
  });
});
