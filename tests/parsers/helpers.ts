import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const FIXTURES = join(__dirname, '..', 'fixtures');

/** Lee un fixture como Uint8Array "puro" (como lo daría File.arrayBuffer en el navegador). */
export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, name)));
}
