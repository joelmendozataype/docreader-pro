/**
 * Genera los documentos de ejemplo de tests/fixtures (contenido original en español).
 * Uso: node scripts/generate-fixtures.mjs
 * El .doc se crea aparte con scripts/make-doc-fixture.ps1 (requiere Microsoft Word).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures');
await mkdir(out, { recursive: true });

// ───────────────────────────── PDF ─────────────────────────────
async function makePdf() {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Introducción a la Programación');
  pdf.setAuthor('María Quispe');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const left = 60;
  const width = 470;
  const total = 3;

  const pages = [];
  let page;
  let y;
  const newPage = () => {
    page = pdf.addPage([595, 842]);
    pages.push(page);
    y = 760;
    const n = pages.length;
    page.drawText('Universidad Nacional de Huancavelica', { x: left, y: 805, size: 9, font: regular });
    page.drawText(`Página ${n} de ${total}`, { x: 480, y: 40, size: 9, font: regular });
  };
  const heading = (text, size) => {
    y -= size * 0.6;
    page.drawText(text, { x: left, y, size, font: bold });
    y -= size * 1.6;
  };
  const wrap = (text, size) => {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (regular.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const lines = (list, size = 11) => {
    for (const l of list) {
      page.drawText(l, { x: left, y, size, font: regular });
      y -= size * 1.35;
    }
  };
  const paragraph = (text, size = 11) => {
    lines(wrap(text, size), size);
    y -= size * 0.9;
  };

  newPage();
  heading('Introducción a la Programación', 22);
  heading('1. Conceptos básicos', 15);
  paragraph(
    'Un algoritmo es una secuencia finita de pasos que resuelve un problema. En la universidad aprendemos a describirlos con pseudocódigo antes de escribir el programa definitivo.',
  );
  // palabra cortada con guion entre líneas: "progra-" + "mación"
  lines([
    'La lógica es la base de la progra-',
    'mación estructurada y permite razonar sobre el comportamiento del código.',
  ]);
  y -= 10;
  paragraph(
    'Las variables almacenan datos como números, cadenas o valores lógicos. Elegir buenos nombres hace que el código sea fácil de leer para cualquier compañero del curso.',
  );

  newPage();
  heading('2. Estructuras de control', 15);
  paragraph(
    'Las estructuras de control deciden el orden en que se ejecutan las instrucciones de un programa y son comunes a casi todos los lenguajes.',
  );
  heading('2.1 Condicionales', 13);
  paragraph(
    'Una condicional evalúa una expresión lógica y elige entre dos caminos. Por ejemplo, si la nota es mayor o igual a once, el estudiante aprueba el curso.',
  );
  // párrafo que continúa en la página siguiente (sin punto final)
  lines(['Los bucles repiten un bloque de instrucciones mientras se cumpla una condición, lo que']);

  newPage();
  lines(['resulta útil para recorrer listas de alumnos o sumar las notas de un registro.']);
  y -= 10;
  heading('3. Conclusiones', 15);
  paragraph(
    '¿Por qué aprender a programar? ¡Porque desarrolla el pensamiento lógico! La enseñanza en Huancavelica, en la sierra del Perú, también se beneficia del acceso a la tecnología.',
  );

  await writeFile(join(out, 'programacion.pdf'), await pdf.save());
}

// ───────────────────────────── DOCX ─────────────────────────────
async function makeDocx() {
  const doc = new Document({
    creator: 'Ana Pérez',
    title: 'Informe de lectura',
    description: 'Fixture de pruebas',
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            text: 'Informe de lectura: El agua en los Andes',
          }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Resumen' }),
          new Paragraph({
            children: [
              new TextRun(
                'El texto analiza cómo las comunidades campesinas gestionan el agua en las alturas de ',
              ),
              new TextRun({ text: 'Huancavelica', bold: true }),
              new TextRun(', donde las lluvias se concentran en pocos meses del año.'),
            ],
          }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Análisis' }),
          new Paragraph({ heading: HeadingLevel.HEADING_3, text: 'Prácticas tradicionales' }),
          new Paragraph({
            text: 'Las qochas son pequeñas lagunas artificiales que almacenan el agua de lluvia para la temporada seca.',
          }),
          new Paragraph({ text: 'Riego por turnos', bullet: { level: 0 } }),
          new Paragraph({ text: 'Faenas comunales de limpieza de canales', bullet: { level: 0 } }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Conclusiones' }),
          new Paragraph({
            text: 'La combinación de saberes ancestrales y técnicas modernas mejora la seguridad hídrica de la región. ¿Qué haría falta para extender estas prácticas?',
          }),
        ],
      },
    ],
  });
  await writeFile(join(out, 'informe.docx'), await Packer.toBuffer(doc));

  // Trabajo típico de estudiante: títulos hechos solo con negrita, sin estilos de Word
  const plain = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: 'Monografía sobre la papa nativa', bold: true })] }),
          new Paragraph({ text: 'La papa nativa es parte de la identidad agrícola de la sierra peruana.' }),
          new Paragraph({ children: [new TextRun({ text: 'Variedades principales', bold: true })] }),
          new Paragraph({ text: 'Existen cientos de variedades con colores y sabores muy distintos.' }),
        ],
      },
    ],
  });
  await writeFile(join(out, 'monografia-sin-estilos.docx'), await Packer.toBuffer(plain));
}

// ───────────────────────────── HTML ─────────────────────────────
async function makeHtml() {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Guía de estudio: la célula</title>
  <meta name="author" content="Luis Huamán">
  <style>body { color: red }</style>
  <script>alert('no debe ejecutarse')</script>
</head>
<body>
  <nav><a href="/">Inicio</a> · <a href="/blog">Blog</a></nav>
  <header><p>Cabecera del sitio</p></header>
  <article>
    <h1 class="titulo" style="color:blue">La célula</h1>
    <p onclick="robar()">La célula es la unidad básica de la vida. <a href="javascript:alert(1)">enlace peligroso</a></p>
    <h2>Partes de la célula</h2>
    <h3>Núcleo</h3>
    <p>El núcleo guarda la información genética (ADN).<br>También controla la actividad celular.</p>
    <h3>Membrana</h3>
    <p>La membrana regula lo que entra y sale. <a href="https://es.wikipedia.org/wiki/C%C3%A9lula">Más información</a></p>
    <!-- comentario oculto -->
    <iframe src="https://ejemplo.com/anuncio"></iframe>
    <ul><li>Mitocondria</li><li>Ribosomas</li></ul>
    <img src="x" onerror="robar()">
  </article>
  <footer>© Sitio de ejemplo</footer>
</body>
</html>`;
  await writeFile(join(out, 'celula.html'), html, 'utf8');

  const latin1 = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">
<title>Educación en la región andina</title></head>
<body><h1>Educación en la región andina</h1>
<p>La niñez de las comunidades rurales camina horas para llegar a la escuela.</p>
<h2>Señales de cambio</h2><p>La conectividad avanzó en los últimos años, pero aún falta mucho.</p></body></html>`;
  await writeFile(join(out, 'educacion-latin1.htm'), Buffer.from(latin1, 'latin1'));
}

await makePdf();
await makeDocx();
await makeHtml();
console.log('Fixtures generados en', out);
