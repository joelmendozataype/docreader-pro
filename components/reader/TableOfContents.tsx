'use client';

import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';
import type { DocumentSection } from '@/types/document';

const INDENT: Record<number, string> = { 1: 'pl-3', 2: 'pl-6', 3: 'pl-9' };

interface TableOfContentsProps {
  sections: DocumentSection[];
  activeId: string | null;
  onNavigate: (id: string) => void;
  className?: string;
}

/** Índice navegable. El enlace de la sección actual se marca con aria-current. */
export function TableOfContents({ sections, activeId, onNavigate, className }: TableOfContentsProps) {
  const listRef = useRef<HTMLOListElement>(null);

  // mantener visible la sección actual dentro del panel del índice
  useEffect(() => {
    if (!activeId || !listRef.current) return;
    const link = listRef.current.querySelector<HTMLElement>(`[data-section="${CSS.escape(activeId)}"]`);
    link?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  if (sections.length === 0) {
    return (
      <p className={cn('text-muted-foreground px-3 text-sm', className)}>
        No se detectaron títulos en este documento.
      </p>
    );
  }

  return (
    <nav aria-label="Índice del documento" className={className}>
      <ol ref={listRef} className="space-y-0.5 text-sm">
        {sections.map((section) => {
          const active = section.id === activeId;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                data-section={section.id}
                aria-current={active ? 'location' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate(section.id);
                }}
                className={cn(
                  'focus-visible:ring-ring/50 block rounded-md border-l-2 py-1.5 pr-2 leading-snug transition-colors outline-none focus-visible:ring-3',
                  INDENT[section.level] ?? 'pl-9',
                  section.level === 1 && 'font-medium',
                  active
                    ? 'border-primary bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border-transparent',
                )}
              >
                {section.title}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
