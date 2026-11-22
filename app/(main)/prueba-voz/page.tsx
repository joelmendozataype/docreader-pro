'use client';

/**
 * Página de diagnóstico de la voz del navegador (sin la lógica del lector).
 * Cada botón llama a speechSynthesis de la forma más simple posible y muestra
 * todos los eventos, para saber si un fallo es del navegador/teléfono o de la app.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { buttonVariants } from '@/components/ui/button-variants';
import {
  createNeuralEngine,
  isNeuralSupported,
  type NeuralEngine,
  NEURAL_VOICE_ID,
  NEURAL_VOICE_SIZE_MB,
} from '@/lib/tts/neural';

const SAMPLE = 'Hola. Esta es una prueba de lectura en voz alta en español.';

interface LogLine {
  t: string;
  text: string;
  bad?: boolean;
}

export default function VoiceTestPage() {
  const [log, setLog] = useState<LogLine[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  // se leen tras montar: en el servidor no existen (evita errores de hidratación)
  const [env, setEnv] = useState({ ua: '', isolated: false });
  useEffect(() => setEnv({ ua: navigator.userAgent, isolated: self.crossOriginIsolated }), []);
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

  // ── voz integrada (Piper) ──
  const engineRef = useRef<NeuralEngine | null>(null);
  const [neuralBusy, setNeuralBusy] = useState<string | null>(null);
  const getEngine = () => (engineRef.current ??= createNeuralEngine());
  useEffect(() => () => engineRef.current?.dispose(), []);

  async function neuralDownload() {
    setNeuralBusy('Descargando… 0 %');
    const t0 = performance.now();
    try {
      add(`▶ Voz integrada: descargar ${NEURAL_VOICE_ID} (~${NEURAL_VOICE_SIZE_MB} MB)`);
      await getEngine().download((f) => setNeuralBusy(`Descargando… ${Math.round(f * 100)} %`));
      add(`descarga ✓ en ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    } catch (e) {
      add(`error ✗ ${(e as Error).message}`, true);
    } finally {
      setNeuralBusy(null);
    }
  }

  async function neuralSpeak() {
    setNeuralBusy('Generando audio…');
    const t0 = performance.now();
    try {
      add('▶ Voz integrada: generar y reproducir');
      if (!(await getEngine().isDownloaded())) add('(la voz no está descargada: se descargará ahora)');
      const wav = await getEngine().synthesize(SAMPLE);
      add(
        `audio ✓ ${(wav.size / 1024).toFixed(0)} KB generado en ${((performance.now() - t0) / 1000).toFixed(1)} s`,
      );
      const audio = new Audio(URL.createObjectURL(wav));
      audio.onended = () => add('reproducción terminada ✓');
      await audio.play();
      add('reproduciendo ✓');
    } catch (e) {
      add(`error ✗ ${(e as Error).message}`, true);
    } finally {
      setNeuralBusy(null);
    }
  }

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
        <dd className="break-words">{env.ua}</dd>
        <dt className="font-medium">Hilos</dt>
        <dd>{env.isolated ? 'varios (página aislada)' : 'uno solo'}</dd>
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

      <section aria-labelledby="neural-title" className="space-y-2 rounded-lg border p-3">
        <h2 id="neural-title" className="font-semibold">
          Voz integrada (no depende del navegador)
        </h2>
        <p className="text-muted-foreground text-sm">
          {isNeuralSupported()
            ? `Se descarga una sola vez (~${NEURAL_VOICE_SIZE_MB} MB, mejor con wifi) y queda guardada en este navegador.`
            : 'Este navegador no permite la voz integrada (falta almacenamiento OPFS o Web Workers).'}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className={buttonVariants({ variant: 'outline' })}
            disabled={!!neuralBusy || !isNeuralSupported()}
            onClick={() => void neuralDownload()}
          >
            Descargar voz integrada
          </button>
          <button
            type="button"
            className={buttonVariants()}
            disabled={!!neuralBusy || !isNeuralSupported()}
            onClick={() => void neuralSpeak()}
          >
            Probar voz integrada
          </button>
        </div>
        {neuralBusy && (
          <p role="status" className="text-sm">
            {neuralBusy}
          </p>
        )}
      </section>

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
