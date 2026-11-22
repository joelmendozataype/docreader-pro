'use client';

import { Loader2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { driveConfig, pickFromDrive, prepareDrive } from '@/lib/drive/google-drive';

/** Logotipo de Drive simplificado (triángulo de tres colores). */
function DriveIcon() {
  return (
    <svg viewBox="0 0 87.3 78" className="size-4" aria-hidden>
      <path d="M6.6 66.85 10.45 73.5c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5A9 9 0 0 0 0 53h27.5z" fill="#00ac47" />
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z" fill="#ea4335" />
      <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="M73.4 26.5 60.7 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

const config = driveConfig();

/** Botón «Google Drive»: solo aparece si la app tiene configuradas las credenciales de Google. */
export function DriveButton({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // se precarga para que la ventana de Google se abra dentro del clic (si no, se bloquea)
    if (config) prepareDrive().catch(() => undefined);
  }, []);

  if (!config) return null;

  const pick = async () => {
    setBusy(true);
    let toastId: string | number | undefined;
    try {
      const files = await pickFromDrive(config, (docs) => {
        toastId = toast.loading(
          docs.length === 1 ? `Descargando «${docs[0].name}» de Drive…` : `Descargando ${docs.length} archivos de Drive…`,
        );
      });
      if (toastId !== undefined) toast.dismiss(toastId);
      if (files.length) onFiles(files);
    } catch (error) {
      if (toastId !== undefined) toast.dismiss(toastId);
      toast.error('No se pudo abrir Google Drive', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mt-1"
      disabled={busy}
      onClick={(event) => {
        event.stopPropagation(); // la zona también abre el selector de archivos al hacer clic
        void pick();
      }}
    >
      {busy ? <Loader2Icon className="animate-spin" aria-hidden /> : <DriveIcon />}
      Elegir de Google Drive
    </Button>
  );
}
