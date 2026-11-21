'use client';

import { SearchIcon, XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SortOrder, TypeFilter } from '@/lib/utils/library';
import { cn } from '@/lib/utils';

const TYPES: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pdf', label: 'PDF' },
  { value: 'word', label: 'Word' },
  { value: 'html', label: 'HTML' },
];

const SORTS: { value: SortOrder; label: string }[] = [
  { value: 'recent', label: 'Añadidos recientemente' },
  { value: 'opened', label: 'Abiertos recientemente' },
  { value: 'title', label: 'Título (A-Z)' },
  { value: 'size', label: 'Tamaño' },
];

interface LibraryToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  type: TypeFilter;
  onTypeChange: (value: TypeFilter) => void;
  sort: SortOrder;
  onSortChange: (value: SortOrder) => void;
}

export function LibraryToolbar(props: LibraryToolbarProps) {
  const { query, onQueryChange, type, onTypeChange, sort, onSortChange } = props;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <SearchIcon
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Buscar por título, archivo o autor…"
          aria-label="Buscar documentos"
          className="h-9 pr-8 pl-8 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-1/2 right-1.5 -translate-y-1/2"
            onClick={() => onQueryChange('')}
            aria-label="Borrar búsqueda"
          >
            <XIcon />
          </Button>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <div role="group" aria-label="Filtrar por tipo" className="bg-muted flex rounded-lg p-0.5">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={type === t.value}
              onClick={() => onTypeChange(t.value)}
              className={cn(
                'focus-visible:ring-ring/50 rounded-md px-2.5 py-1 text-sm transition-colors outline-none focus-visible:ring-3',
                type === t.value
                  ? 'bg-background text-foreground font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className="sr-only" htmlFor="library-sort">
          Ordenar por
        </label>
        <select
          id="library-sort"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortOrder)}
          className="border-input bg-background focus-visible:ring-ring/50 focus-visible:border-ring dark:bg-input/30 h-9 min-w-0 flex-1 rounded-lg border px-2 text-sm outline-none focus-visible:ring-3 sm:flex-none"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
