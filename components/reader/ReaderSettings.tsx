'use client';

import { ALargeSmallIcon, MinusIcon, PlusIcon, RotateCcwIcon } from 'lucide-react';
import { useTheme } from 'next-themes';

import { SegmentedControl } from '@/components/reader/SegmentedControl';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type ReaderFont, type ReaderWidth, useReaderSettings } from '@/hooks/useReaderSettings';

const SHORTCUTS: [string, string][] = [
  ['T', 'Mostrar u ocultar el índice'],
  ['A', 'Abrir estos ajustes'],
  ['N / P', 'Sección siguiente / anterior'],
  ['+ / −', 'Agrandar / achicar la letra'],
  ['Espacio', 'Reproducir / pausar la voz'],
  ['↑ ↓ · RePág AvPág', 'Desplazarse por el texto'],
];

/** Panel de ajustes de lectura: tamaño, tema, fuente, ancho e interlineado. */
export function ReaderSettings({
  open,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { settings, update, increaseFont, decreaseFont, reset, canIncrease, canDecrease } =
    useReaderSettings();
  const { theme, setTheme } = useTheme();

  return (
    <Popover open={open} onOpenChange={(next) => onOpenChange?.(next)}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Ajustes de lectura"
            title="Ajustes de lectura (A)"
          />
        }
      >
        <ALargeSmallIcon className="size-5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-4 p-4" aria-label="Ajustes de lectura">
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs font-medium" id="font-size-label">
            Tamaño de letra
          </p>
          <div className="flex items-center gap-2" role="group" aria-labelledby="font-size-label">
            <Button
              variant="outline"
              size="icon"
              onClick={decreaseFont}
              disabled={!canDecrease}
              aria-label="Achicar letra (A−)"
            >
              <MinusIcon />
            </Button>
            <output className="flex-1 text-center text-sm tabular-nums" aria-live="polite">
              {settings.fontSize} px
            </output>
            <Button
              variant="outline"
              size="icon"
              onClick={increaseFont}
              disabled={!canIncrease}
              aria-label="Agrandar letra (A+)"
            >
              <PlusIcon />
            </Button>
          </div>
        </div>

        <SegmentedControl
          label="Tema"
          value={(theme ?? 'system') as 'system' | 'light' | 'dark' | 'sepia'}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'Auto' },
            { value: 'light', label: 'Claro' },
            { value: 'sepia', label: 'Sepia' },
            { value: 'dark', label: 'Oscuro' },
          ]}
        />

        <SegmentedControl<ReaderFont>
          label="Fuente"
          value={settings.font}
          onChange={(font) => update({ font })}
          options={[
            { value: 'serif', label: 'Serif', className: 'font-serif' },
            { value: 'sans', label: 'Sans', className: 'font-sans' },
          ]}
        />

        <SegmentedControl<ReaderWidth>
          label="Ancho de columna"
          value={settings.width}
          onChange={(width) => update({ width })}
          options={[
            { value: 'narrow', label: 'Angosto' },
            { value: 'medium', label: 'Medio' },
            { value: 'wide', label: 'Amplio' },
          ]}
        />

        <SegmentedControl
          label="Interlineado"
          value={String(settings.lineHeight)}
          onChange={(v) => update({ lineHeight: Number(v) })}
          options={[
            { value: '1.5', label: 'Compacto' },
            { value: '1.75', label: 'Normal' },
            { value: '2', label: 'Amplio' },
          ]}
        />

        <Button variant="ghost" size="sm" onClick={reset} className="self-start">
          <RotateCcwIcon /> Restablecer ajustes
        </Button>

        <details className="text-muted-foreground border-t pt-3 text-xs">
          <summary className="cursor-pointer font-medium">Atajos de teclado</summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {SHORTCUTS.map(([keys, action]) => (
              <div key={keys} className="contents">
                <dt>
                  <kbd className="bg-muted rounded px-1 py-0.5 font-mono">{keys}</kbd>
                </dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </details>
      </PopoverContent>
    </Popover>
  );
}
