import 'server-only';

import type { ParsedDocument } from '@/types/document';

import { clientParsers, runParser } from './index';
import type { ParseOptions, ParserInput } from './types';

const serverParsers = {
  ...clientParsers,
  doc: () => import('./doc').then((m) => m.parseDoc),
};

/** Igual que parseDocument, pero también admite .doc (requiere Node). */
export function parseDocumentOnServer(input: ParserInput, options?: ParseOptions): Promise<ParsedDocument> {
  return runParser(input, serverParsers, options);
}
