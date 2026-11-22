'use client';

import {
  DownloadIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  Settings2Icon,
  SkipBackIcon,
  SkipForwardIcon,
  SquareIcon,
  TriangleAlertIcon,
  VolumeXIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';

import { SegmentedControl } from '@/components/reader/SegmentedControl';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { attemptPlan, type TTSController } from '@/hooks/useTTS';
import { NEURAL_VOICE_LABEL, NEURAL_VOICE_SIZE_MB } from '@/lib/tts/neural';
import { RATES, type TTSEngine } from '@/lib/tts/prefs';
import { isSpanish, voiceLabel } from '@/lib/tts/voices';
import { cn } from '@/lib/utils';

/** commit publicado (Vercel lo expone en el build); sirve para saber si el celular tiene la última versión */
const APP_VERSION = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local';

/** Texto del diagnóstico: qué voz e idioma se están usando (incluidos los reintentos). */
function describeAttempt(tts: TTSController): string {
  if (tts.engine === 'neural') return NEURAL_VOICE_LABEL;
  const plan = attemptPlan(tts.voice);
  const attempt = plan[Math.min(tts.fallbackLevel, plan.length - 1)];
  if (attempt.voice && tts.voice) return `${tts.voice.name} · ${attempt.lang}`;
  return attempt.lang ? `voz del sistema · ${attempt.lang}` : 'voz e idioma del sistema';
}

const STATUS_TEXT = {
  idle: 'Lectura en voz alta detenida',
  playing: 'Leyendo en voz alta',
  paused: 'Lectura en pausa',
} as const;

const NEURAL_STATUS_TEXT = {
  unknown: '',
  missing: `No descargada (~${NEURAL_VOICE_SIZE_MB} MB, una sola vez).`,
  downloading: 'Descargando…',
  ready: 'Descargada en este navegador: funciona sin conexión.',
  error: 'La descarga falló. Inténtalo de nuevo.',
} as const;

function formatRate(rate: number) {
  return `${rate.toLocaleString('es-PE')}×`;
}

function DownloadProgress({ progress }: { progress: number }) {
  const percent = Math.round(progress * 100);
  return (
    <div className="space-y-1" role="status">
      <div
        role="progressbar"
        aria-label="Descarga de la voz integrada"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="bg-muted h-1.5 overflow-hidden rounded-full"
      >
        <div className="bg-primary h-full transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-muted-foreground text-xs tabular-nums">Descargando la voz… {percent} %</p>
    </div>
  );
}

/** Barra flotante de lectura en voz alta. */
export function TTSControls({ tts, className }: { tts: TTSController; className?: string }) {
  const rateId = useId();
  const voiceId = useId();
  const [showAllVoices, setShowAllVoices] = useState(false);

  // en el celular el aviso del panel de voz pasa desapercibido: se muestra también como notificación
  useEffect(() => {
    if (tts.error) toast.error('Lectura en voz alta', { description: tts.error, duration: 12_000 });
  }, [tts.error]);

  // avisos que no detienen la lectura (p. ej. una frase saltada); `id` permite repetir el mismo texto
  useEffect(() => {
    if (tts.notice) toast.info(tts.notice.text, { id: 'tts-notice', duration: 5_000 });
  }, [tts.notice]);

  if (!tts.supported) {
    return (
      <div
        role="note"
        className={cn(
          'bg-popover text-muted-foreground flex items-center gap-2 rounded-full border px-4 py-2 text-sm shadow-lg',
          className,
        )}
      >
        <VolumeXIcon className="size-4 shrink-0" aria-hidden />
        Tu navegador no permite la lectura en voz alta. Prueba con Chrome, Edge o Safari.
      </div>
    );
  }

  const playing = tts.status === 'playing';
  const neural = tts.engine === 'neural';
  const downloading = tts.neural.status === 'downloading';
  const spanishVoices = tts.voices.filter(isSpanish);
  const listedVoices = showAllVoices || spanishVoices.length === 0 ? tts.voices : spanishVoices;
  const noSpanish = !neural && tts.voices.length > 0 && spanishVoices.length === 0;
  const showOffer = tts.offerNeural || (downloading && tts.status !== 'idle');

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      {showOffer && (
        <section
          aria-labelledby="neural-offer-title"
          className="bg-popover text-popover-foreground w-full max-w-sm space-y-2 rounded-2xl border p-4 shadow-lg"
        >
          <div className="flex items-start gap-2">
            <h2 id="neural-offer-title" className="flex-1 text-sm font-semibold">
              La voz del navegador no funciona en este dispositivo
            </h2>
            {!downloading && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={tts.dismissNeuralOffer}
                aria-label="Cerrar aviso de voz integrada"
              >
                <XIcon />
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            Puedes usar la <strong>voz integrada</strong> de DocReader: se descarga una sola vez (~
            {NEURAL_VOICE_SIZE_MB} MB, mejor con wifi) y luego funciona en este navegador sin depender de él.
          </p>
          {downloading ? (
            <DownloadProgress progress={tts.neural.progress} />
          ) : (
            <Button className="w-full" onClick={() => void tts.downloadNeural(true)}>
              <DownloadIcon /> Descargar voz integrada y continuar
            </Button>
          )}
        </section>
      )}

      <div
        role="region"
        aria-label="Lectura en voz alta"
        className="bg-popover text-popover-foreground flex max-w-full items-center gap-1 rounded-full border p-1.5 shadow-lg"
      >
        <p className="sr-only" aria-live="polite">
          {tts.loading ? 'Preparando la voz…' : STATUS_TEXT[tts.status]}
        </p>

        <Button variant="ghost" size="icon" onClick={() => tts.skip(-1)} aria-label="Párrafo anterior">
          <SkipBackIcon />
        </Button>
        <Button
          size="icon-lg"
          className="rounded-full"
          onClick={tts.toggle}
          aria-label={
            playing ? 'Pausar lectura' : tts.status === 'paused' ? 'Continuar lectura' : 'Leer en voz alta'
          }
          aria-pressed={playing}
          aria-busy={tts.loading || undefined}
        >
          {tts.loading ? (
            <Loader2Icon className="size-5 animate-spin motion-reduce:animate-none" />
          ) : playing ? (
            <PauseIcon className="size-5" />
          ) : (
            <PlayIcon className="size-5" />
          )}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => tts.skip(1)} aria-label="Párrafo siguiente">
          <SkipForwardIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={tts.stop}
          disabled={tts.status === 'idle'}
          aria-label="Detener lectura"
        >
          <SquareIcon className="size-3.5" />
        </Button>

        <label htmlFor={rateId} className="sr-only">
          Velocidad de lectura
        </label>
        <select
          id={rateId}
          value={tts.rate}
          onChange={(e) => tts.setRate(Number(e.target.value))}
          className="hover:bg-muted focus-visible:ring-ring/50 h-8 rounded-full bg-transparent px-2 text-sm tabular-nums outline-none focus-visible:ring-3"
        >
          {RATES.map((r) => (
            <option key={r} value={r}>
              {formatRate(r)}
            </option>
          ))}
        </select>

        <Popover>
          <PopoverTrigger
            render={<Button variant="ghost" size="icon" aria-label="Elegir voz" className="rounded-full" />}
          >
            {tts.error || noSpanish ? <TriangleAlertIcon className="text-amber-600" /> : <Settings2Icon />}
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-80 gap-3 p-4" aria-label="Opciones de voz">
            {tts.neural.supported && (
              <div className="space-y-1.5">
                <SegmentedControl<TTSEngine>
                  label="Motor de voz"
                  value={tts.engine}
                  onChange={(e) => void tts.setEngine(e)}
                  options={[
                    { value: 'browser', label: 'Navegador', ariaLabel: 'Voz del navegador' },
                    { value: 'neural', label: 'Integrada', ariaLabel: 'Voz integrada de DocReader' },
                  ]}
                />
                {neural && tts.neural.status !== 'unknown' && !downloading && (
                  <p className="text-muted-foreground text-xs">{NEURAL_STATUS_TEXT[tts.neural.status]}</p>
                )}
                {downloading && <DownloadProgress progress={tts.neural.progress} />}
              </div>
            )}

            {neural ? (
              <p className="text-sm">
                {NEURAL_VOICE_LABEL}. Genera la voz dentro de la página: funciona aunque el navegador no tenga
                voces. Resalta frase por frase.
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label htmlFor={voiceId} className="text-muted-foreground text-xs font-medium">
                    Voz
                  </label>
                  {tts.voices.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      El navegador no muestra su lista de voces; se usará la voz predeterminada del sistema.
                      En Brave, los escudos pueden ocultarlas.
                    </p>
                  ) : (
                    <select
                      id={voiceId}
                      value={tts.voice?.voiceURI ?? ''}
                      onChange={(e) => tts.setVoice(e.target.value)}
                      className="border-input bg-background focus-visible:ring-ring/50 dark:bg-input/30 h-9 w-full rounded-lg border px-2 text-sm outline-none focus-visible:ring-3"
                    >
                      {listedVoices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {voiceLabel(v)}
                          {v.localService ? '' : ' · en línea'}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {spanishVoices.length > 0 && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={showAllVoices}
                      onChange={(e) => setShowAllVoices(e.target.checked)}
                      className="accent-primary size-4"
                    />
                    Mostrar voces de otros idiomas
                  </label>
                )}

                {noSpanish && (
                  <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                    No hay voces en español instaladas. En Windows: Configuración → Hora e idioma → Voz →
                    Agregar voces → Español.
                  </p>
                )}
              </>
            )}

            {tts.error && (
              <p role="alert" className="text-destructive text-xs">
                {tts.error}
              </p>
            )}
            <details className="text-muted-foreground border-t pt-2 text-xs">
              <summary className="cursor-pointer font-medium">Diagnóstico</summary>
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                <dt>Versión</dt>
                <dd className="font-mono">{APP_VERSION}</dd>
                <dt>Motor</dt>
                <dd>
                  {neural ? 'voz integrada' : 'navegador'}
                  {tts.neural.supported ? '' : ' (la integrada no es compatible aquí)'}
                </dd>
                <dt>Voces</dt>
                <dd>
                  {tts.voices.length} ({tts.voices.filter(isSpanish).length} en español)
                </dd>
                <dt>En uso</dt>
                <dd>{describeAttempt(tts)}</dd>
                <dt>Errores</dt>
                <dd>{tts.errorLog.length ? tts.errorLog.join(' · ') : 'ninguno'}</dd>
              </dl>
            </details>
            {!neural && (
              <p className="text-muted-foreground text-xs">
                Las voces «en línea» suenan más naturales pero no resaltan palabra por palabra; las locales
                sí.
              </p>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
