// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { decodeHtmlBytes, parseHtml } from '@/lib/parsers/html';

import { fixture } from './helpers';

describe('parseHtml', () => {
  it('toma título y autor de los metadatos y arma el índice', async () => {
    const doc = await parseHtml(fixture('celula.html'), 'celula.html');
    expect(doc.title).toBe('Guía de estudio: la célula');
    expect(doc.author).toBe('Luis Huamán');
    expect(doc.sections).toEqual([
      { id: 'sec-1', title: 'La célula', level: 1 },
      { id: 'sec-2', title: 'Partes de la célula', level: 2 },
      { id: 'sec-3', title: 'Núcleo', level: 3 },
      { id: 'sec-4', title: 'Membrana', level: 3 },
    ]);
  });

  it('se queda solo con el <article> (sin menú, cabecera ni pie)', async () => {
    const { text } = await parseHtml(fixture('celula.html'), 'celula.html');
    expect(text).not.toContain('Inicio');
    expect(text).not.toContain('Cabecera del sitio');
    expect(text).not.toContain('Sitio de ejemplo');
    expect(text).toContain('Mitocondria');
  });

  it('elimina scripts, estilos, iframes, eventos y enlaces peligrosos', async () => {
    const { html } = await parseHtml(fixture('celula.html'), 'celula.html');
    expect(html).not.toMatch(/<script|<style|<iframe|onclick|onerror|javascript:|style=|class=|<!--/i);
    expect(html).not.toContain('<img');
    expect(html).toContain('<a>enlace peligroso</a>');
    expect(html).toContain(
      'href="https://es.wikipedia.org/wiki/C%C3%A9lula" target="_blank" rel="noopener noreferrer"',
    );
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<b>x</b>',
    'vbscript:x',
    '//evil.com',
  ])('descarta href "%s"', async (href) => {
    const { html } = await parseHtml(`<p><a href="${href}">x</a></p>`, 'x.html');
    expect(html).toBe('<p><a>x</a></p>');
  });

  it('decodifica HTML antiguo en ISO-8859-1', async () => {
    const doc = await parseHtml(fixture('educacion-latin1.htm'), 'educacion.htm');
    expect(doc.title).toBe('Educación en la región andina');
    expect(doc.text).toContain('La niñez de las comunidades');
    expect(doc.sections[1].title).toBe('Señales de cambio');
  });

  it('usa el <body> completo si no hay article ni main', async () => {
    const doc = await parseHtml(
      '<html><body><header>menú</header><h2>Hola</h2><p>Texto.</p></body></html>',
      'a.html',
    );
    expect(doc.text).toBe('Hola\n\nTexto.');
    expect(doc.title).toBe('Hola');
  });

  it('rechaza HTML sin texto', async () => {
    await expect(parseHtml('<html><body><script>x()</script></body></html>', 'v.html')).rejects.toMatchObject(
      {
        code: 'EMPTY_FILE',
      },
    );
  });
});

describe('decodeHtmlBytes', () => {
  it('respeta el BOM UTF-8', () => {
    expect(decodeHtmlBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0xc3, 0xb1]))).toBe('ñ');
  });

  it('usa windows-1252 si el UTF-8 es inválido y no hay charset', () => {
    expect(decodeHtmlBytes(new Uint8Array([0x6e, 0x69, 0xf1, 0x6f]))).toBe('niño');
  });
});
