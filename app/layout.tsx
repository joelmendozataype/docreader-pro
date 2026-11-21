import type { Metadata } from 'next';
import { Geist_Mono, Inter, Literata } from 'next/font/google';

import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

import './globals.css';

const sans = Inter({ variable: '--font-sans', subsets: ['latin', 'latin-ext'] });
const serif = Literata({ variable: '--font-serif', subsets: ['latin', 'latin-ext'] });
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'DocReader Pro',
  description: 'Lee tus documentos PDF y Word en español, con lectura por voz y modo lectura limpia.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
