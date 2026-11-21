'use client';

import { UploadCloudIcon } from 'lucide-react';
import { type FileRejection, useDropzone } from 'react-dropzone';
import { toast } from 'sonner';

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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    multiple: true,
    onDropAccepted: onFiles,
    onDropRejected,
  });

  return (
    <div
      {...getRootProps({
        role: 'button',
        'aria-label': 'Subir documentos: arrastra archivos aquí o pulsa Enter para elegirlos',
      })}
      className={cn(
        'group border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/40 focus-visible:ring-ring/50 focus-visible:border-ring flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-colors outline-none focus-visible:ring-3',
        compact ? 'px-4 py-6' : 'px-6 py-12',
        isDragActive && 'border-primary bg-primary/5',
      )}
    >
      <input {...getInputProps()} />
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
        o <span className="text-primary font-medium underline underline-offset-4">elige archivos</span> · PDF,
        Word (.docx, .doc) y HTML
      </p>
      {!compact && (
        <p className="text-muted-foreground text-xs">
          PDF, Word y HTML se procesan en tu navegador, sin límite de tamaño. Nada sale de tu equipo salvo los
          .doc.
        </p>
      )}
    </div>
  );
}
