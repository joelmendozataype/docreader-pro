import Link from 'next/link';

import { MissingDocumentIllustration } from '@/components/illustrations';
import { buttonVariants } from '@/components/ui/button-variants';

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <MissingDocumentIllustration className="text-muted-foreground" />
      <h1 className="text-2xl font-bold tracking-tight">Página no encontrada</h1>
      <p className="text-muted-foreground">La dirección que abriste no existe en DocReader Pro.</p>
      <Link href="/" className={buttonVariants()}>
        Ir a la biblioteca
      </Link>
    </main>
  );
}
