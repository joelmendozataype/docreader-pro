'use client';

import { RotateCcwIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { MissingDocumentIllustration } from '@/components/illustrations';
import { buttonVariants } from '@/components/ui/button-variants';

/** Límite de error de la app: cualquier fallo inesperado de una página cae aquí. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[DocReader Pro]', error);
  }, [error]);

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <MissingDocumentIllustration className="text-muted-foreground" />
      <h1 className="text-2xl font-bold tracking-tight">Algo salió mal</h1>
      <p className="text-muted-foreground">
        Ocurrió un error inesperado. Tus documentos siguen guardados en este navegador.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className={buttonVariants()}>
          <RotateCcwIcon /> Reintentar
        </button>
        <Link href="/" className={buttonVariants({ variant: 'outline' })}>
          Ir a la biblioteca
        </Link>
      </div>
    </main>
  );
}
