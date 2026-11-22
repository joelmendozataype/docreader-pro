'use client';

import { UploadCloudIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type FileRejection, useDropzone } from 'react-dropzone';
import { toast } from 'sonner';

import { DriveButton } from '@/components/upload/DriveButton';
import { cn } from '@/lib/utils';

/**
 * Se acepta por extensión además de MIME: en Windows los .doc/.docx a veces
 * llegan sin tipo. El formato real se verifica después por magic bytes.
 */
const ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'text/html': ['.html', '.htm'],
};

/**
 * Android abre «Cámara / Cámara de video / Fotos y videos» cuando el `accept` está
 * vacío o trae extensiones que no sabe convertir (.docx, .htm…): lo trata como
 * «cualquier archivo» y ofrece la cámara. Con solo tipos MIME de documentos (ninguno
 * de imagen o video) abre directo el gestor de archivos.
 * `application/octet-stream` cubre los .doc/.docx que algunos gestores guardan sin tipo;
 * los archivos que no son documentos se siguen rechazando (ACCEPT y magic bytes).
 */
export const ANDROID_ACCEPT = [
  ...Object.keys(ACCEPT),
  'application/octet-stream',
].join(',');

function useIsAndroid() {
  const [android, setAndroid] = useState(false);
  useEffect(() => {
    setAndroid(/android/i.test(navigator.userAgent));
  }, []);
  return android;
}

export function Dropzone({
  onFiles,
  compact = false,
}: {
  onFiles: (files: File[]) => void;
  compact?: boolean;
}) {
  const onDropRejected = (rejections: FileRejection[]) => {
    for (const { file } of rejections) {
      toast.error(`Formato no compatible: ${file.name}`, {
        description: 'Usa archivos .pdf, .docx, .doc, .html o .htm.',
      });
    }
  };

  const android = useIsAndroid();
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: ACCEPT,
    multiple: true,
    // el teclado usa el botón real «elige archivos»; la zona no es un control anidado
    noKeyboard: true,
    onDropAccepted: onFiles,
    onDropRejected,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        'group border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/40 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors',
        compact ? 'px-4 py-6' : 'px-6 py-12',
        isDragActive && 'border-primary bg-primary/5',
      )}
    >
      <input
        {...getInputProps({
          'aria-label': 'Elegir documentos para subir',
          ...(android && { accept: ANDROID_ACCEPT }),
        })}
      />
      <UploadCloudIcon
        className={cn(
          'text-muted-foreground size-10 transition-transform',
          isDragActive && 'text-primary scale-110',
        )}
        aria-hidden
      />
      <p className="font-medium">
        {isDragActive ? 'Suelta los archivos para añadirlos' : 'Arrastra tus documentos aquí'}
      </p>
      <p className="text-muted-foreground text-sm">
        o{' '}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation(); // la zona también abre el selector al hacer clic
            open();
          }}
          className="text-primary focus-visible:ring-ring/50 rounded-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-3"
        >
          elige archivos
        </button>{' '}
        · PDF, Word (.docx, .doc) y HTML
      </p>
      <DriveButton onFiles={onFiles} />
      {!compact && (
        <p className="text-muted-foreground text-xs">
          PDF, Word y HTML se procesan en tu navegador, sin límite de tamaño. Nada sale de tu equipo salvo los
          .doc.
        </p>
      )}
    </div>
  );
}
