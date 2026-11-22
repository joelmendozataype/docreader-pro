import { describe, expect, it, vi } from 'vitest';

import {
  downloadDriveFile,
  driveConfig,
  driveDownloadUrl,
  driveFileName,
  type DriveDoc,
} from '@/lib/drive/google-drive';
import { isIsolatedPath, shouldReloadForIsolation } from '@/lib/isolation';

const PDF: DriveDoc = { id: 'abc', name: 'Tesis final', mimeType: 'application/pdf' };
const GDOC: DriveDoc = { id: 'g1', name: 'Apuntes', mimeType: 'application/vnd.google-apps.document' };
const DOCX: DriveDoc = {
  id: 'd1',
  name: 'informe.DOCX',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

describe('Google Drive', () => {
  it('sin las 3 credenciales no hay configuración (y el botón no aparece)', () => {
    expect(driveConfig({ clientId: 'x', apiKey: 'y', appId: undefined })).toBeNull();
    expect(driveConfig({ clientId: 'x', apiKey: 'y', appId: '123' })).toEqual({
      clientId: 'x',
      apiKey: 'y',
      appId: '123',
    });
  });

  it('añade la extensión que falta y no la repite', () => {
    expect(driveFileName(PDF)).toBe('Tesis final.pdf');
    expect(driveFileName(GDOC)).toBe('Apuntes.docx');
    expect(driveFileName(DOCX)).toBe('informe.DOCX');
  });

  it('los Documentos de Google se exportan a .docx; el resto se descarga tal cual', () => {
    expect(driveDownloadUrl(GDOC)).toContain('/files/g1/export?mimeType=');
    expect(driveDownloadUrl(PDF)).toBe('https://www.googleapis.com/drive/v3/files/abc?alt=media&supportsAllDrives=true');
  });

  it('descarga con el token y devuelve un File con nombre y tipo', async () => {
    const fetchImpl = vi.fn(async () => new Response('%PDF-1.7', { status: 200 }));
    const file = await downloadDriveFile(PDF, 'tok', fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith(driveDownloadUrl(PDF), { headers: { Authorization: 'Bearer tok' } });
    expect(file.name).toBe('Tesis final.pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.size).toBe(8);
  });

  it('un error de Drive se explica en español', async () => {
    const denied = vi.fn(async () => new Response('', { status: 403 }));
    await expect(downloadDriveFile(PDF, 'tok', denied as unknown as typeof fetch)).rejects.toThrow(/no dio permiso/);
    const missing = vi.fn(async () => new Response('', { status: 404 }));
    await expect(downloadDriveFile(PDF, 'tok', missing as unknown as typeof fetch)).rejects.toThrow(/HTTP 404/);
  });
});

describe('aislamiento por ruta', () => {
  it('solo el lector y /prueba-voz van aislados', () => {
    expect(isIsolatedPath('/reader/123')).toBe(true);
    expect(isIsolatedPath('/prueba-voz')).toBe(true);
    expect(isIsolatedPath('/')).toBe(false);
    expect(isIsolatedPath('/readers')).toBe(false);
  });

  it('recarga al cruzar entre grupos, sin bucles si el navegador no puede aislar', () => {
    expect(shouldReloadForIsolation('/', true, false)).toBe(true);
    expect(shouldReloadForIsolation('/', false, false)).toBe(false);
    expect(shouldReloadForIsolation('/reader/1', false, false)).toBe(true);
    expect(shouldReloadForIsolation('/reader/1', false, true)).toBe(false);
    expect(shouldReloadForIsolation('/reader/1', true, false)).toBe(false);
  });
});
