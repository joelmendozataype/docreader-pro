import { BookOpenTextIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/theme-toggle';

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 rounded-md font-semibold">
          <BookOpenTextIcon className="size-5" aria-hidden />
          <span>DocReader Pro</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          {children}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
