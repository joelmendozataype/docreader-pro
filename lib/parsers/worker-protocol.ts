import type { ParsedDocument } from '@/types/document';

export interface WorkerRequest {
  name: string;
  mimeType?: string;
  data: ArrayBuffer;
}

export type WorkerResponse =
  | { type: 'progress'; fraction: number }
  | { type: 'done'; doc: ParsedDocument }
  | { type: 'error'; code: string; message: string };
