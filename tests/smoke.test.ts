import { describe, expect, it } from 'vitest';

import { cn } from '@/lib/utils';
import { ACCEPTED_EXTENSIONS } from '@/types/document';

describe('configuración base', () => {
  it('resuelve el alias @ y combina clases de Tailwind', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('acepta los formatos acordados', () => {
    expect(ACCEPTED_EXTENSIONS).toEqual(['.pdf', '.docx', '.doc', '.html', '.htm']);
  });
});
