/**
 * Tipo central compartido por parsers, persistencia (IndexedDB) y lector.
 *
 * Nota: se añade 'doc' (Word 97-2003) además de lo pedido en el prompt,
 * porque se decidió soportarlo extrayendo solo texto plano.
 */
export type DocumentFileType = 'pdf' | 'docx' | 'doc' | 'html';

export interface DocumentSection {
  /** id del ancla en el HTML renderizado (p. ej. "sec-3") */
  id: string;
  title: string;
  /** 1 = h1, 2 = h2, 3 = h3 */
  level: number;
}

export interface ParsedDocument {
  id: string;
  fileName: string;
  fileType: DocumentFileType;
  title: string;
  author?: string;
  pages: number;
  /** tamaño del archivo original en bytes */
  size: number;
  /** texto plano limpio (para TTS y búsqueda) */
  text: string;
  /** HTML sanitizado para el lector */
  html: string;
  sections: DocumentSection[];
  createdAt: number;
}

export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.html', '.htm'] as const;

/**
 * Datos ligeros de un documento para la biblioteca (sin texto ni HTML),
 * para que listar cientos de documentos grandes sea rápido.
 */
export interface DocumentMeta extends Omit<ParsedDocument, 'text' | 'html' | 'sections'> {
  sectionCount: number;
  wordCount: number;
  updatedAt: number;
  lastOpenedAt?: number;
  /** progreso de lectura 0..1 (lo actualiza el lector en la Fase 5) */
  progress?: number;
}
