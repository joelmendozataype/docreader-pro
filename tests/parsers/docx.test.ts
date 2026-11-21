// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { parseDocx } from '@/lib/parsers/docx';

import { fixture } from './helpers';

describe('parseDocx', () => {
  it('convierte estilos de título de Word en índice h1-h3', async () => {
    const doc = await parseDocx(fixture('informe.docx'), 'informe.docx');
    expect(doc.sections).toEqual([
      { id: 'sec-1', title: 'Informe de lectura: El agua en los Andes', level: 1 },
      { id: 'sec-2', title: 'Resumen', level: 2 },
      { id: 'sec-3', title: 'Análisis', level: 2 },
      { id: 'sec-4', title: 'Prácticas tradicionales', level: 3 },
      { id: 'sec-5', title: 'Conclusiones', level: 2 },
    ]);
  });

  it('lee título y autor de las propiedades del documento', async () => {
    const doc = await parseDocx(fixture('informe.docx'), 'informe.docx');
    expect(doc.title).toBe('Informe de lectura');
    expect(doc.author).toBe('Ana Pérez');
    expect(doc.pages).toBeGreaterThanOrEqual(1);
  });

  it('conserva negritas y listas en HTML limpio', async () => {
    const { html } = await parseDocx(fixture('informe.docx'), 'informe.docx');
    expect(html).toContain('<strong>Huancavelica</strong>');
    expect(html).toContain('<ul><li>Riego por turnos</li>');
    expect(html).not.toMatch(/style=|class=/);
  });

  it('produce texto plano con un párrafo por bloque', async () => {
    const { text } = await parseDocx(fixture('informe.docx'), 'informe.docx');
    expect(text).toContain('Resumen\n\nEl texto analiza cómo las comunidades');
    expect(text).toContain('¿Qué haría falta para extender estas prácticas?');
  });

  it('promueve párrafos en negrita a títulos cuando no hay estilos', async () => {
    const doc = await parseDocx(fixture('monografia-sin-estilos.docx'), 'monografia.docx');
    expect(doc.sections.map((s) => s.title)).toEqual([
      'Monografía sobre la papa nativa',
      'Variedades principales',
    ]);
    expect(doc.title).toBe('Monografía sobre la papa nativa');
    expect(doc.author).toBeUndefined();
  });

  it('rechaza un ZIP que no es Word', async () => {
    const notZip = new TextEncoder().encode('PK\u0003\u0004 basura');
    await expect(parseDocx(notZip, 'falso.docx')).rejects.toMatchObject({ code: 'CORRUPT_FILE' });
  });
});
