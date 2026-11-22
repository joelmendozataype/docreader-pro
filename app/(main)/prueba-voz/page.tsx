'use client';

/**
 * Página de diagnóstico de la voz del navegador (sin la lógica del lector).
 * Cada botón llama a speechSynthesis de la forma más simple posible y muestra
 * todos los eventos, para saber si un fallo es del navegador/teléfono o de la app.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { buttonVariants } from '@/components/ui/button-variants';

const SAMPLE = 'Hola. Esta es una prueba de lectura en voz alta en español.';

interface LogLine {
  t: string;
  text: string;
  bad?: boolean;
}

export default function VoiceTestPage() {
  const [log, setLog] = useState<LogLine[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const add = (text: string, bad = false) =>
    setLog((l) => [...l, { t: new Date().toLocaleTimeString('es-PE'), text, bad }]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const load = () => setVoices(speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const spanish = voices.filter((v) => /^es([-_]|$)/i.test(v.lang));

  function run(label: string, setup: (u: SpeechSynthesisUtterance) => void) {
    if (!supported) return add('Este navegador no tiene speechSynthesis.', true);
    const u = new SpeechSynthesisUtterance(SAMPLE);
    setup(u);
    add(
      `▶ ${label} · lang="${u.lang || '(vacío)'}" · voz=${u.voice ? `${u.voice.name} [${u.voice.lang}]` : '(ninguna)'}`,
    );
    u.onstart = () => add('start ✓');
    u.onend = () => add('end ✓ (terminó de hablar)');
    u.onerror = (e) => add(`error ✗ ${e.error}`, true);
    (window as unknown as { __u?: SpeechSynthesisUtterance }).__u = u; // evita que se libere
    speechSynthesis.speak(u);
    setTimeout(
      () => add(`estado: speaking=${speechSynthesis.speaking} pending=${speechSynthesis.pending}`),
      1500,
    );
  }

  const tests: { label: string; setup: (u: SpeechSynthesisUtterance) => void }[] = [
    { label: '1. Simple (sin idioma ni voz)', setup: () => {} },
    { label: '2. Idioma es-ES', setup: (u) => (u.lang = 'es-ES') },
    { label: '3. Idioma es-US', setup: (u) => (u.lang = 'es-US') },
    ...spanish.map((v, i) => ({
      label: `${4 + i}. Voz «${v.name}»`,
      setup: (u: SpeechSynthesisUtterance) => {
        u.voice = v;
        u.lang = v.lang.replace('_', '-');
      },
    })),
  ];

  return (
    <main id="main" className="mx-auto max-w-xl space-y-5 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Prueba de voz</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Toca cada botón y escucha. Debajo aparece lo que responde el navegador. Haz una captura del
          registro.
        </p>
      </div>

      <dl className="bg-muted grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg p-3 text-sm">
        <dt className="font-medium">Navegador</dt>
        <dd className="break-words">{typeof navigator !== 'undefined' ? navigator.userAgent : ''}</dd>
        <dt className="font-medium">Voces</dt>
        <dd>
          {voices.length} en total · {spanish.length} en español
          {spanish.length > 0 &&
            `: ${spanish.map((v) => `${v.name} [${v.lang}${v.localService ? ', local' : ', en línea'}]`).join(' · ')}`}
        </dd>
      </dl>

      <div className="grid gap-2">
        {tests.map((t) => (
          <button
            key={t.label}
            type="button"
            className={buttonVariants({ variant: 'outline' })}
            onClick={() => run(t.label, t.setup)}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          className={buttonVariants({ variant: 'ghost' })}
          onClick={() => {
            speechSynthesis.cancel();
            add('cancel() llamado');
          }}
        >
          Detener
        </button>
      </div>

      <section aria-label="Registro" className="rounded-lg border p-3 font-mono text-xs">
        {log.length === 0 ? (
          <p className="text-muted-foreground">Sin eventos todavía.</p>
        ) : (
          <ol className="space-y-1">
            {log.map((l, i) => (
              <li key={i} className={l.bad ? 'text-destructive' : undefined}>
                {l.t} · {l.text}
              </li>
            ))}
          </ol>
        )}
      </section>

      <Link href="/" className={buttonVariants({ variant: 'ghost' })}>
        ← Volver a la biblioteca
      </Link>
    </main>
  );
}
