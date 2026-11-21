import type { DocumentFileType, DocumentMeta } from '@/types/document';

export type TypeFilter = 'all' | 'pdf' | 'word' | 'html';
export type SortOrder = 'recent' | 'title' | 'size' | 'opened';

export const TYPE_LABELS: Record<DocumentFileType, string> = {
  pdf: 'PDF',
  docx: 'Word',
  doc: 'Word 97',
  html: 'HTML',
};

/** minúsculas y sin tildes: "Programación" → "programacion" */
export function foldForSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function filterDocuments(
  docs: DocumentMeta[],
  { query = '', type = 'all', sort = 'recent' }: { query?: string; type?: TypeFilter; sort?: SortOrder },
): DocumentMeta[] {
  const terms = foldForSearch(query).split(/\s+/).filter(Boolean);

  const filtered = docs.filter((doc) => {
    if (type === 'pdf' && doc.fileType !== 'pdf') return false;
    if (type === 'word' && doc.fileType !== 'docx' && doc.fileType !== 'doc') return false;
    if (type === 'html' && doc.fileType !== 'html') return false;
    if (!terms.length) return true;
    const haystack = foldForSearch(`${doc.title} ${doc.fileName} ${doc.author ?? ''}`);
    return terms.every((term) => haystack.includes(term));
  });

  const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
  return filtered.sort((a, b) => {
    switch (sort) {
      case 'title':
        return collator.compare(a.title, b.title);
      case 'size':
        return b.size - a.size;
      case 'opened':
        return (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.createdAt - a.createdAt;
      default:
        return b.createdAt - a.createdAt;
    }
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${new Intl.NumberFormat('es-PE', { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${units[unit]}`;
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    timestamp,
  );
}
