export type ParseErrorCode =
  | 'UNSUPPORTED_FORMAT'
  | 'EMPTY_FILE'
  | 'CORRUPT_FILE'
  | 'PDF_ENCRYPTED'
  | 'PDF_NO_TEXT'
  | 'NEEDS_SERVER'
  | 'ABORTED';

const MESSAGES: Record<ParseErrorCode, string> = {
  UNSUPPORTED_FORMAT: 'Formato no compatible. Usa archivos .pdf, .docx, .doc, .html o .htm.',
  EMPTY_FILE: 'El archivo está vacío o no contiene texto legible.',
  CORRUPT_FILE: 'No se pudo leer el archivo: parece dañado o no es del tipo indicado.',
  PDF_ENCRYPTED: 'El PDF está protegido con contraseña. Quita la protección e inténtalo de nuevo.',
  PDF_NO_TEXT:
    'Este PDF parece escaneado (solo contiene imágenes) y no tiene texto seleccionable. Se necesitaría OCR.',
  NEEDS_SERVER: 'Los archivos .doc (Word 97-2003) se procesan en el servidor.',
  ABORTED: 'Se canceló el procesamiento del archivo.',
};

/** Error de parseo con código estable y mensaje en español apto para mostrar al usuario. */
export class ParseError extends Error {
  readonly code: ParseErrorCode;

  constructor(code: ParseErrorCode, options?: { cause?: unknown; message?: string }) {
    super(options?.message ?? MESSAGES[code], { cause: options?.cause });
    this.name = 'ParseError';
    this.code = code;
  }
}

export function isParseError(error: unknown): error is ParseError {
  return error instanceof ParseError;
}
