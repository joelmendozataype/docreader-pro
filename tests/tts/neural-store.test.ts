import { describe, expect, it } from 'vitest';

import { downloadVoice, isVoiceStored, removeVoice, voiceFiles } from '@/lib/tts/neural-store';

/** OPFS mínimo en memoria: como en Chrome, lo escrito solo aparece al cerrar (close). */
class FakeDir {
  files = new Map<string, Uint8Array>();
  dirs = new Map<string, FakeDir>();

  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    let dir = this.dirs.get(name);
    if (!dir) {
      if (!opts?.create) throw new DOMException('no existe', 'NotFoundError');
      dir = new FakeDir();
      this.dirs.set(name, dir);
    }
    return dir;
  }

  async getFileHandle(name: string, opts?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!opts?.create) throw new DOMException('no existe', 'NotFoundError');
      this.files.set(name, new Uint8Array());
    }
    const files = this.files;
    return {
      async getFile() {
        const data = files.get(name) as Uint8Array;
        return new Blob([data as Uint8Array<ArrayBuffer>]);
      },
      async createWritable() {
        const parts: Uint8Array[] = [];
        return {
          async write(chunk: Uint8Array | string) {
            parts.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
          },
          async close() {
            const size = parts.reduce((n, p) => n + p.byteLength, 0);
            const out = new Uint8Array(size);
            let at = 0;
            for (const p of parts) {
              out.set(p, at);
              at += p.byteLength;
            }
            files.set(name, out);
          },
          async abort() {},
        };
      },
    };
  }

  async removeEntry(name: string) {
    if (!this.files.delete(name)) throw new DOMException('no existe', 'NotFoundError');
  }
}

const FILES = voiceFiles('https://hf.test', 'es/voz.onnx');
const VOICE = 'es_MX-test';

function response(bytes: number, { status = 200, announced = bytes } = {}) {
  const chunk = new Uint8Array(Math.max(bytes, 0)).fill(7);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (bytes > 0) {
        controller.enqueue(chunk.slice(0, Math.ceil(bytes / 2)));
        controller.enqueue(chunk.slice(Math.ceil(bytes / 2)));
      }
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'Content-Length': String(announced) } });
}

function fakeFetch(map: Record<string, () => Response>) {
  return (async (url: string) => map[url]()) as unknown as typeof fetch;
}

const asRoot = (dir: FakeDir) => dir as unknown as FileSystemDirectoryHandle;

describe('neural-store', () => {
  it('guarda modelo y configuración completos y marca la voz como descargada', async () => {
    const root = new FakeDir();
    const progress: number[] = [];
    await downloadVoice(
      asRoot(root),
      VOICE,
      FILES,
      (p) => progress.push(p.loaded),
      fakeFetch({ [FILES.config]: () => response(10), [FILES.model]: () => response(1000) }),
    );

    const piper = root.dirs.get('piper') as FakeDir;
    expect(piper.files.get('voz.onnx')?.byteLength).toBe(1000);
    expect(piper.files.get('voz.onnx.json')?.byteLength).toBe(10);
    expect(progress.at(-1)).toBe(1000);
    expect(await isVoiceStored(asRoot(root), VOICE, FILES)).toBe(true);
  });

  it('una descarga cortada no se guarda ni cuenta como descargada', async () => {
    const root = new FakeDir();
    await expect(
      downloadVoice(
        asRoot(root),
        VOICE,
        FILES,
        undefined,
        fakeFetch({
          [FILES.config]: () => response(10),
          [FILES.model]: () => response(600, { announced: 1000 }),
        }),
      ),
    ).rejects.toThrow(/se cortó/);

    const piper = root.dirs.get('piper') as FakeDir;
    expect(piper.files.has('voz.onnx')).toBe(false);
    expect(await isVoiceStored(asRoot(root), VOICE, FILES)).toBe(false);
  });

  it('una respuesta de error (HTTP 404) no se guarda como modelo', async () => {
    const root = new FakeDir();
    await expect(
      downloadVoice(
        asRoot(root),
        VOICE,
        FILES,
        undefined,
        fakeFetch({ [FILES.config]: () => response(10), [FILES.model]: () => response(50, { status: 404 }) }),
      ),
    ).rejects.toThrow(/HTTP 404/);
    expect(await isVoiceStored(asRoot(root), VOICE, FILES)).toBe(false);
  });

  it('un modelo guardado sin marca (descarga antigua o a medias) no cuenta', async () => {
    const root = new FakeDir();
    const piper = await root.getDirectoryHandle('piper', { create: true });
    piper.files.set('voz.onnx', new Uint8Array(400));
    piper.files.set('voz.onnx.json', new Uint8Array(10));
    expect(await isVoiceStored(asRoot(root), VOICE, FILES)).toBe(false);
  });

  it('si el modelo cambia de tamaño después de verificado, ya no cuenta', async () => {
    const root = new FakeDir();
    await downloadVoice(
      asRoot(root),
      VOICE,
      FILES,
      undefined,
      fakeFetch({ [FILES.config]: () => response(10), [FILES.model]: () => response(1000) }),
    );
    (root.dirs.get('piper') as FakeDir).files.set('voz.onnx', new Uint8Array(300));
    expect(await isVoiceStored(asRoot(root), VOICE, FILES)).toBe(false);
  });

  it('removeVoice borra modelo, configuración y marca', async () => {
    const root = new FakeDir();
    await downloadVoice(
      asRoot(root),
      VOICE,
      FILES,
      undefined,
      fakeFetch({ [FILES.config]: () => response(10), [FILES.model]: () => response(1000) }),
    );
    await removeVoice(asRoot(root), VOICE, FILES);
    expect((root.dirs.get('piper') as FakeDir).files.size).toBe(0);
    expect(await isVoiceStored(asRoot(root), VOICE, FILES)).toBe(false);
  });
});
