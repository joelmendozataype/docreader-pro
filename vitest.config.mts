import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/stubs/empty.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html'],
      reportsDirectory: './coverage',
      // lógica de la app; la UI se cubre con tests de componentes y auditorías
      include: ['lib/**/*.ts', 'hooks/**/*.ts'],
      exclude: [
        'lib/parsers/parse.worker.ts', // se ejecuta dentro del Web Worker (probado en el navegador)
        'lib/utils.ts', // solo reexporta cn
        '**/*.d.ts',
      ],
      thresholds: { statements: 80, lines: 80, functions: 80, branches: 75 },
    },
  },
});
