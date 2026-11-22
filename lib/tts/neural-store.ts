/**
 * Descarga y guardado del modelo de la voz integrada en OPFS (carpeta `piper/`,
 * la misma que lee @mintplex-labs/piper-tts-web).
 *
 * Se reemplaza el `download()` de la librería porque:
 * - no espera a que termine la escritura (el archivo aún está vacío o a medias al usarlo),
 * - no comprueba `res.ok` (una página de error se guardaría como modelo),
 * - no comprueba que llegaron todos los bytes (con datos móviles la descarga se corta).
 *
 * Además se guarda una marca `<voz>.ok` con el tamaño verificado: sin esa marca,
 * o si el tamaño no coincide, la voz se considera no descargada.
 */

export const PIPER_DIR = 'piper';

export type Progress = { loaded: number; total: number };

export type VoiceFiles = { model: string; config: string };

/** URLs del modelo (.onnx) y su configuración (.onnx.json) en Hugging Face. */
export function voiceFiles(base: string, path: string): VoiceFiles {
  return { model: `${base}/${path}`, config: `${base}/${path}.json` };
}

function fileName(url: string) {
  return url.split('/').at(-1) as string;
}

function markerName(voiceId: string) {
  return `${voiceId}.ok`;
}

async function piperDir(root: FileSystemDirectoryHandle) {
  return root.getDirectoryHandle(PIPER_DIR, { create: true });
}

async function fileSize(dir: FileSystemDirectoryHandle, name: string): Promise<number | null> {
  try {
    const handle = await dir.getFileHandle(name);
    return (await handle.getFile()).size;
  } catch {
    return null;
  }
}

/**
 * Descarga `url` escribiendo directo al archivo (sin juntar 60 MB en memoria).
 * Lanza error si la respuesta no es 200 o si llegan menos bytes de los anunciados;
 * en ese caso descarta lo escrito. Devuelve los bytes guardados.
 */
export async function downloadToFile(
  dir: FileSystemDirectoryHandle,
  url: string,
  onProgress?: (p: Progress) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const res = await fetchImpl(url);
  if (!res.ok || !res.body) throw new Error(`La descarga falló (HTTP ${res.status}).`);
  const total = Number(res.headers.get('Content-Length') ?? 0);

  const handle = await dir.getFileHandle(fileName(url), { create: true });
  const writable = await handle.createWritable();
  const reader = res.body.getReader();
  let loaded = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      loaded += value.byteLength;
      onProgress?.({ loaded, total });
    }
    if (total > 0 && loaded < total) {
      throw new Error(`La descarga se cortó (${loaded} de ${total} bytes).`);
    }
    if (loaded === 0) throw new Error('La descarga llegó vacía.');
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    await dir.removeEntry(fileName(url)).catch(() => undefined);
    throw error;
  }

  // se relee el tamaño ya guardado: es lo que de verdad hay en disco
  const saved = await fileSize(dir, fileName(url));
  if (saved !== loaded) {
    await dir.removeEntry(fileName(url)).catch(() => undefined);
    throw new Error('No se pudo guardar la voz en el almacenamiento del navegador.');
  }
  return saved;
}

/** Descarga config y modelo y, solo si ambos quedan completos, escribe la marca. */
export async function downloadVoice(
  root: FileSystemDirectoryHandle,
  voiceId: string,
  files: VoiceFiles,
  onProgress?: (p: Progress) => void,
  fetchImpl: typeof fetch = fetch,
) {
  const dir = await piperDir(root);
  await dir.removeEntry(markerName(voiceId)).catch(() => undefined);
  await downloadToFile(dir, files.config, undefined, fetchImpl);
  const size = await downloadToFile(dir, files.model, onProgress, fetchImpl);

  const marker = await dir.getFileHandle(markerName(voiceId), { create: true });
  const writable = await marker.createWritable();
  await writable.write(String(size));
  await writable.close();
}

/** La voz cuenta como descargada solo si la marca existe y el modelo mide lo verificado. */
export async function isVoiceStored(root: FileSystemDirectoryHandle, voiceId: string, files: VoiceFiles) {
  const dir = await piperDir(root);
  try {
    const marker = await dir.getFileHandle(markerName(voiceId));
    const expected = Number(await (await marker.getFile()).text());
    if (!expected) return false;
    const [model, config] = await Promise.all([
      fileSize(dir, fileName(files.model)),
      fileSize(dir, fileName(files.config)),
    ]);
    return model === expected && !!config;
  } catch {
    return false;
  }
}

/** Borra modelo, configuración y marca (para volver a descargar limpia). */
export async function removeVoice(root: FileSystemDirectoryHandle, voiceId: string, files: VoiceFiles) {
  const dir = await piperDir(root);
  await Promise.all(
    [markerName(voiceId), fileName(files.model), fileName(files.config)].map((name) =>
      dir.removeEntry(name).catch(() => undefined),
    ),
  );
}
