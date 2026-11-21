import type { Metadata } from 'next';

import { DocumentReader } from '@/components/reader/DocumentReader';

export const metadata: Metadata = { title: 'Lector · DocReader Pro' };

export default async function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentReader id={decodeURIComponent(id)} />;
}
