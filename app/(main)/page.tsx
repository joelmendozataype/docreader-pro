import { LibraryView } from '@/components/library/LibraryView';
import { SiteHeader } from '@/components/site-header';

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 pt-8 pb-20">
        <div className="mb-6 max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Lee sin distracciones</h1>
          <p className="text-muted-foreground mt-2">
            Sube tus PDF y documentos de Word y léelos en modo limpio, con índice y lectura en voz alta.
          </p>
        </div>
        <LibraryView />
      </main>
    </div>
  );
}
