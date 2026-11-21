// @vitest-environment node
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';

import { ParseError } from '@/lib/parsers/errors';
import { parsePdf } from '@/lib/parsers/pdf';

import { fixture } from './helpers';

describe('parsePdf', () => {
  it('extrae metadatos, páginas y el índice por tamaño de fuente', async () => {
    const doc = await parsePdf(fixture('programacion.pdf'), 'programacion.pdf');
    expect(doc.title).toBe('Introducción a la Programación');
    expect(doc.author).toBe('María Quispe');
    expect(doc.pages).toBe(3);
    expect(doc.sections).toEqual([
      { id: 'sec-1', title: 'Introducción a la Programación', level: 1 },
      { id: 'sec-2', title: '1. Conceptos básicos', level: 2 },
      { id: 'sec-3', title: '2. Estructuras de control', level: 2 },
      { id: 'sec-4', title: '2.1 Condicionales', level: 3 },
      { id: 'sec-5', title: '3. Conclusiones', level: 2 },
    ]);
    expect(doc.html).toContain('<h3 id="sec-4">2.1 Condicionales</h3>');
  });

  it('elimina encabezados repetidos y números de página', async () => {
    const { text } = await parsePdf(fixture('programacion.pdf'), 'programacion.pdf');
    expect(text).not.toContain('Universidad Nacional de Huancavelica');
    expect(text).not.toMatch(/Página \d de 3/);
  });

  it('une palabras cortadas y párrafos que cruzan de página', async () => {
    const { text, html } = await parsePdf(fixture('programacion.pdf'), 'programacion.pdf');
    expect(text).toContain('la base de la programación estructurada');
    expect(html).toContain(
      '<p>Los bucles repiten un bloque de instrucciones mientras se cumpla una condición, lo que resulta útil',
    );
  });

  it('conserva tildes, eñes y signos de apertura', async () => {
    const { text } = await parsePdf(fixture('programacion.pdf'), 'programacion.pdf');
    expect(text).toContain('¿Por qué aprender a programar? ¡Porque desarrolla el pensamiento lógico!');
    expect(text).toContain('Perú');
  });

  it('reporta el progreso por página', async () => {
    const onProgress = vi.fn();
    await parsePdf(fixture('programacion.pdf'), 'programacion.pdf', { onProgress });
    expect(onProgress.mock.calls.map(([p]) => p)).toEqual([1 / 3, 2 / 3, 1]);
  });

  it('usa el nombre de archivo si no hay metadatos ni títulos', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage().drawText('Solo un párrafo de texto corriente sin título alguno en todo el documento.', {
      x: 50,
      y: 700,
      size: 11,
      font,
    });
    const doc = await parsePdf(await pdf.save(), 'apuntes_clase-3.pdf');
    expect(doc.title).toBe('apuntes clase 3');
    expect(doc.sections).toEqual([]);
  });

  it('rechaza PDF escaneados (sin texto)', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    await expect(parsePdf(await pdf.save(), 'escaneado.pdf')).rejects.toMatchObject({ code: 'PDF_NO_TEXT' });
  });

  it('rechaza archivos dañados', async () => {
    const broken = new TextEncoder().encode('%PDF-1.7\nesto no es un pdf válido');
    await expect(parsePdf(broken, 'roto.pdf')).rejects.toBeInstanceOf(ParseError);
    await expect(parsePdf(broken, 'roto.pdf')).rejects.toMatchObject({ code: 'CORRUPT_FILE' });
  });

  it('se puede cancelar con AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      parsePdf(fixture('programacion.pdf'), 'programacion.pdf', { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });
});
