'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2Icon,
  FileIcon,
  Loader2Icon,
  RotateCcwIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { UploadItem } from '@/lib/store/documents-store';
import { formatBytes } from '@/lib/utils/library';

const STAGE_LABEL: Record<string, string> = {
  reading: 'Leyendo archivo…',
  parsing: 'Extrayendo texto…',
  uploading: 'Subiendo al servidor…',
  server: 'Procesando en el servidor…',
};

function statusLabel(item: UploadItem): string {
  switch (item.status) {
    case 'queued':
      return 'En espera';
    case 'saving':
      return 'Guardando en tu biblioteca…';
    case 'done':
      return 'Listo';
    case 'error':
      return item.error ?? 'Error';
    default:
      return (item.stage && STAGE_LABEL[item.stage]) || 'Procesando…';
  }
}

interface UploadQueueProps {
  uploads: UploadItem[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}

export function UploadQueue({ uploads, onCancel, onRetry, onDismiss }: UploadQueueProps) {
  return (
    <section aria-label="Archivos en proceso" aria-live="polite" className="empty:hidden">
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {uploads.map((item) => {
            const percent = Math.round(item.progress * 100);
            const active = item.status === 'processing' || item.status === 'saving';
            return (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-card flex items-center gap-3 rounded-lg border p-3"
              >
                <span className="shrink-0" aria-hidden>
                  {item.status === 'done' ? (
                    <CheckCircle2Icon className="size-5 text-emerald-600 dark:text-emerald-400" />
                  ) : item.status === 'error' ? (
                    <TriangleAlertIcon className="text-destructive size-5" />
                  ) : active ? (
                    <Loader2Icon className="text-muted-foreground size-5 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <FileIcon className="text-muted-foreground size-5" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium" title={item.fileName}>
                      {item.fileName}
                    </p>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {active ? `${percent}%` : formatBytes(item.size)}
                    </span>
                  </div>
                  {item.status !== 'error' && item.status !== 'done' && (
                    <Progress
                      value={percent}
                      aria-label={`Progreso de ${item.fileName}`}
                      className="mt-1.5"
                    />
                  )}
                  <p
                    className={
                      item.status === 'error'
                        ? 'text-destructive mt-1 text-xs'
                        : 'text-muted-foreground mt-1 text-xs'
                    }
                  >
                    {statusLabel(item)}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1">
                  {item.status === 'error' && item.retryable && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onRetry(item.id)}
                      aria-label={`Reintentar ${item.fileName}`}
                    >
                      <RotateCcwIcon />
                    </Button>
                  )}
                  {item.status === 'queued' || active ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onCancel(item.id)}
                      aria-label={`Cancelar ${item.fileName}`}
                    >
                      <XIcon />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onDismiss(item.id)}
                      aria-label={`Quitar ${item.fileName} de la lista`}
                    >
                      <XIcon />
                    </Button>
                  )}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
}
