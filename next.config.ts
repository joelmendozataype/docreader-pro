import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Se cargan tal cual desde node_modules en el servidor (sin empaquetar):
  // pdfjs carga su worker dinámicamente y word-extractor usa fs/stream de Node.
  serverExternalPackages: ['pdfjs-dist', 'word-extractor', 'mammoth'],
};

export default nextConfig;
