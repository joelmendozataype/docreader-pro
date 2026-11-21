import { describe, expect, it } from 'vitest';

import {
  cleanMetadataTitle,
  detectHeadingLevel,
  escapeHtml,
  estimatePages,
  joinLines,
  normalizeText,
  splitParagraphs,
  textToHtml,
  titleFromFileName,
} from '@/lib/utils/text';

describe('normalizeText', () => {
  it('unifica saltos de línea, colapsa espacios y recorta', () => {
    expect(normalizeText('  Hola\r\n\r\n\r\n\r\nmundo   bonito\t ')).toBe('Hola\n\nmundo bonito');
  });

  it('elimina caracteres de control, guion blando y BOM', () => {
    const dirty = '﻿pro­gra​ma\u0007ción';
    expect(normalizeText(dirty)).toBe('programación');
  });

  it('convierte espacios especiales en espacios normales', () => {
    expect(normalizeText('a b c')).toBe('a b c');
  });

  it('une palabras cortadas con guion al final de línea', () => {
    expect(normalizeText('la progra-\nmación y la compa-\nñía')).toBe('la programación y la compañía');
  });

  it('no une guiones legítimos ante mayúscula o número', () => {
    expect(normalizeText('Perú-\nBolivia')).toBe('Perú-\nBolivia');
  });

  it('normaliza a NFC (tildes compuestas)', () => {
    const decomposed = 'canción';
    expect(normalizeText(decomposed)).toBe('canción');
    expect(normalizeText(decomposed).length).toBe(7);
  });
});

describe('splitParagraphs / joinLines', () => {
  it('separa por línea en blanco y une líneas internas', () => {
    expect(splitParagraphs('uno\ndos\n\ntres')).toEqual(['uno dos', 'tres']);
  });

  it('repara guiones al unir líneas', () => {
    expect(joinLines(['el conoci-', 'miento', 'es poder'])).toBe('el conocimiento es poder');
  });
});

describe('detectHeadingLevel', () => {
  it.each([
    ['CAPÍTULO I', 1],
    ['Capítulo 2', 1],
    ['1. Introducción', 1],
    ['2.1 Marco teórico', 2],
    ['3.2.1 Población y muestra', 3],
    ['II. Antecedentes', 1],
    ['CONCLUSIONES', 1],
    ['Referencias bibliográficas', 2],
    ['Resumen', 2],
  ])('"%s" → nivel %i', (line, level) => {
    expect(detectHeadingLevel(line)).toBe(level);
  });

  it.each([
    'Esta es una oración normal que termina en punto.',
    '3 manzanas y 2 peras',
    '12345',
    'Una línea corta cualquiera',
    'a',
  ])('"%s" no es título', (line) => {
    expect(detectHeadingLevel(line)).toBeNull();
  });
});

describe('textToHtml', () => {
  it('genera párrafos y títulos con ids para el índice', () => {
    const { html, sections } = textToHtml(
      'INTRODUCCIÓN\nPrimer párrafo\ncontinúa aquí.\n\n1.1 Alcance\nTexto <b>seguro</b>.',
    );
    expect(sections).toEqual([
      { id: 'sec-1', title: 'INTRODUCCIÓN', level: 1 },
      { id: 'sec-2', title: '1.1 Alcance', level: 2 },
    ]);
    expect(html).toContain('<h1 id="sec-1">INTRODUCCIÓN</h1>');
    expect(html).toContain('<p>Primer párrafo continúa aquí.</p>');
    expect(html).toContain('&lt;b&gt;seguro&lt;/b&gt;');
  });

  it('con lineIsParagraph cada línea es un párrafo y une "CAPÍTULO I" con su título', () => {
    const { html, sections } = textToHtml('CAPÍTULO I\nLa colonia\nPrimera idea.\nSegunda idea.', {
      lineIsParagraph: true,
    });
    expect(sections[0].title).toBe('CAPÍTULO I. La colonia');
    expect(html.match(/<p>/g)).toHaveLength(2);
  });
});

describe('utilidades varias', () => {
  it('escapeHtml', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('estimatePages: ~350 palabras por página, mínimo 1', () => {
    expect(estimatePages('')).toBe(1);
    expect(estimatePages(Array(700).fill('palabra').join(' '))).toBe(2);
    expect(estimatePages(Array(701).fill('palabra').join(' '))).toBe(3);
  });

  it('titleFromFileName', () => {
    expect(titleFromFileName('mi_informe-final.v2.pdf')).toBe('mi informe final.v2');
  });

  it('cleanMetadataTitle descarta títulos inútiles', () => {
    expect(cleanMetadataTitle('Microsoft Word - Tesis final.docx')).toBe('Tesis final');
    expect(cleanMetadataTitle('Untitled')).toBeUndefined();
    expect(cleanMetadataTitle('Un-named')).toBeUndefined();
    expect(cleanMetadataTitle('   ')).toBeUndefined();
  });
});
