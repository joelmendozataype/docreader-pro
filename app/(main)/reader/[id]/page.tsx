'use client';

// Vista provisional: el lector completo (TOC, ajustes, HTML sanitizado) llega en la Fase 5.
import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';

import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { getDocument } from '@/lib/db/indexeddb';

type LoadedDoc = Awaited<ReturnType<typeof getDocument>>;

export default function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [doc, setDoc] = useState<LoadedDoc | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let alive = true;
    getDocument(id)
      .then((d) => {
        if (!alive) return;
        setDoc(d ?? null);
        setState(d ? 'ready' : 'missing');
      })
      .catch(() => alive && setState('missing'));
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Button variant="ghost" render={<Link href="/" />} className="mb-6">
          <ArrowLeftIcon /> Volver a la biblioteca
        </Button>
        {state === 'loading' && <p className="text-muted-foreground">Cargando…</p>}
        {state === 'missing' && <p>Este documento no existe en tu biblioteca.</p>}
        {state === 'ready' && doc && (
          <>
            <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {doc.sections.length} secciones · {doc.wordCount.toLocaleString('es-PE')} palabras
            </p>
            <p className="text-muted-foreground mt-8 rounded-xl border border-dashed p-6 text-center">
              El lector completo estará disponible en la Fase 5.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
