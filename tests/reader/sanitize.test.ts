import { describe, expect, it } from 'vitest';

import { sanitizeForReader } from '@/lib/reader/sanitize';

describe('sanitizeForReader (DOMPurify)', () => {
  it('conserva títulos con id, párrafos, listas y tablas', () => {
    const html =
      '<h2 id="sec-1">Título</h2><p>Hola <strong>mundo</strong></p><ul><li>a</li></ul><table><tr><td colspan="2">x</td></tr></table>';
    const clean = sanitizeForReader(html);
    expect(clean).toContain('<h2 id="sec-1">Título</h2>');
    expect(clean).toContain('<strong>mundo</strong>');
    expect(clean).toContain('<td colspan="2">x</td>');
  });

  it('elimina scripts, manejadores de eventos, estilos y URLs peligrosas', () => {
    const html = `<p style="color:red" onclick="x()">t</p><script>alert(1)</script>
      <img src="x" onerror="alert(1)"><a href="javascript:alert(1)">a</a>
      <iframe src="https://e.com"></iframe><svg><script>alert(1)</script></svg><form><input></form>`;
    const clean = sanitizeForReader(html);
    expect(clean).not.toMatch(/script|onclick|onerror|style=|javascript:|iframe|svg|form|input/i);
    expect(clean).toContain('<p>t</p>');
    expect(clean).toContain('<a>a</a>');
  });

  it('los enlaces externos se abren en otra pestaña sin window.opener', () => {
    const clean = sanitizeForReader('<a href="https://unh.edu.pe">UNH</a><a href="#sec-2">interno</a>');
    expect(clean).toContain('<a href="https://unh.edu.pe" target="_blank" rel="noopener noreferrer">UNH</a>');
    expect(clean).toContain('<a href="#sec-2">interno</a>');
  });

  it('permite imágenes data: de tipos seguros pero no data:text/html', () => {
    const ok = sanitizeForReader('<img src="data:image/png;base64,AAAA" alt="g">');
    expect(ok).toContain('src="data:image/png;base64,AAAA"');
    const bad = sanitizeForReader('<a href="data:text/html,<b>x</b>">x</a>');
    expect(bad).toBe('<a>x</a>');
  });
});

describe('sanitizeForReader: atributos y URLs', () => {
  it('mantiene colspan, title, alt y medidas', () => {
    const clean = sanitizeForReader(
      '<table><tr><th scope="col" title="t">a</th><td rowspan="3">b</td></tr></table><img src="https://e.com/a.png" alt="Mapa" width="20">',
    );
    expect(clean).toContain('scope="col"');
    expect(clean).toContain('title="t"');
    expect(clean).toContain('rowspan="3"');
    expect(clean).toContain('alt="Mapa"');
    expect(clean).toContain('width="20"');
  });

  it.each(['javascript:alert(1)', ' JAVASCRIPT:alert(1)', 'vbscript:x', 'ftp://e.com', '//evil.com'])(
    'quita href "%s"',
    (href) => {
      expect(sanitizeForReader(`<a href="${href}">x</a>`)).toBe('<a>x</a>');
    },
  );

  it('quita src de imágenes con esquemas no permitidos', () => {
    expect(sanitizeForReader('<img src="data:image/svg+xml;base64,AAAA" alt="x">')).toBe('<img alt="x">');
  });
});
