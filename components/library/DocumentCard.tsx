'use client';

import {
  BookOpenIcon,
  FileCode2Icon,
  FileTextIcon,
  MoreVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatBytes, formatDate, TYPE_LABELS } from '@/lib/utils/library';
import { cn } from '@/lib/utils';
import type { DocumentFileType, DocumentMeta } from '@/types/document';

const TYPE_STYLE: Record<DocumentFileType, { icon: typeof FileTextIcon; className: string }> = {
  pdf: { icon: FileTextIcon, className: 'bg-red-500/10 text-red-700 dark:text-red-300' },
  docx: { icon: FileTextIcon, className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  doc: { icon: FileTextIcon, className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  html: { icon: FileCode2Icon, className: 'bg-amber-500/10 text-amber-800 dark:text-amber-300' },
};

interface DocumentCardProps {
  doc: DocumentMeta;
  onRename: (doc: DocumentMeta) => void;
  onDelete: (doc: DocumentMeta) => void;
}

export function DocumentCard({ doc, onRename, onDelete }: DocumentCardProps) {
  const { icon: Icon, className } = TYPE_STYLE[doc.fileType];
  const progress = Math.round((doc.progress ?? 0) * 100);
  const href = `/reader/${doc.id}`;

  return (
    <article className="group bg-card hover:border-foreground/20 focus-within:ring-ring/50 relative flex h-full flex-col gap-3 rounded-xl border p-4 transition-colors focus-within:ring-3">
      <div className="flex items-start gap-3">
        <span
          className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', className)}
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 leading-snug font-semibold">
            {/* enlace "estirado": toda la tarjeta abre el lector */}
            <Link href={href} className="outline-none after:absolute after:inset-0 after:rounded-xl">
              {doc.title}
            </Link>
          </h3>
          <p className="text-muted-foreground mt-0.5 truncate text-xs" title={doc.fileName}>
            {doc.fileName}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="relative z-10 -mt-1 -mr-1"
                aria-label={`Acciones para ${doc.title}`}
              />
            }
          >
            <MoreVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem render={<Link href={href} />}>
              <BookOpenIcon /> Abrir
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRename(doc)}>
              <PencilIcon /> Renombrar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(doc)}>
              <Trash2Icon /> Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <dl className="text-muted-foreground mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <Badge variant="secondary">{TYPE_LABELS[doc.fileType]}</Badge>
        <div>
          <dt className="sr-only">Páginas</dt>
          <dd>
            {doc.pages} {doc.pages === 1 ? 'página' : 'páginas'}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Tamaño</dt>
          <dd>{formatBytes(doc.size)}</dd>
        </div>
        <div>
          <dt className="sr-only">Añadido</dt>
          <dd>
            <time dateTime={new Date(doc.createdAt).toISOString()}>{formatDate(doc.createdAt)}</time>
          </dd>
        </div>
      </dl>

      {progress > 0 && (
        <div className="flex items-center gap-2" aria-label={`Leído ${progress}%`}>
          <div className="bg-muted h-1 flex-1 overflow-hidden rounded-full" aria-hidden>
            <div className="bg-primary h-full rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-muted-foreground text-xs tabular-nums" aria-hidden>
            {progress}%
          </span>
        </div>
      )}
    </article>
  );
}
