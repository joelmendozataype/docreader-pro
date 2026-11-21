import { BookOpenTextIcon, FileTextIcon, ListTreeIcon, Volume2Icon } from 'lucide-react';

import { ThemeToggle } from '@/components/theme-toggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const features = [
  {
    icon: FileTextIcon,
    title: 'PDF, Word y HTML',
    description:
      'Sube .pdf, .docx, .doc y .html. Se procesan en tu navegador, sin límite de tamaño de servidor.',
  },
  {
    icon: ListTreeIcon,
    title: 'Índice automático',
    description: 'Detecta títulos y secciones para que saltes directo a lo que necesitas.',
  },
  {
    icon: Volume2Icon,
    title: 'Lectura por voz',
    description: 'Escucha el documento con una voz en español y sigue el texto resaltado.',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2 font-semibold">
          <BookOpenTextIcon className="size-6" aria-hidden />
          <span>DocReader Pro</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-12 pb-20">
        <section className="max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">DocReader Pro</h1>
          <p className="text-muted-foreground mt-4 text-lg">
            Lee tus documentos sin distracciones: modo lectura limpia, índice de contenido y lectura en voz
            alta.
          </p>
          <div
            className="text-muted-foreground mt-8 rounded-xl border border-dashed p-10 text-center"
            role="status"
          >
            La zona para subir archivos llegará en la Fase 4.
          </div>
        </section>

        <section aria-labelledby="features" className="mt-16">
          <h2 id="features" className="sr-only">
            Funciones
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <Card key={title}>
                <CardHeader>
                  <Icon className="mb-2 size-6" aria-hidden />
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
