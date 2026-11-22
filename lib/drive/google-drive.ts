/**
 * Importar documentos desde Google Drive con el selector oficial de Google (Picker).
 *
 * - Permiso pedido: `drive.file`. La app solo puede leer los archivos que el
 *   usuario elige en el selector; no ve el resto de su Drive.
 * - Todo ocurre en el navegador: el archivo se descarga de la API de Drive con el
 *   token del usuario y entra al mismo flujo que un archivo local (sin pasar por el servidor).
 * - Necesita 3 valores públicos de Google Cloud (ver .env.example). Si falta alguno,
 *   el botón de Drive no se muestra.
 */

export type DriveConfig = { clientId: string; apiKey: string; appId: string };

export type DriveDoc = { id: string; name: string; mimeType: string };

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const GOOGLE_DOC = 'application/vnd.google-apps.document';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Tipos que se muestran en el selector (los Documentos de Google se exportan a .docx). */
export const DRIVE_MIME_TYPES = [
  'application/pdf',
  DOCX,
  'application/msword',
  'text/html',
  GOOGLE_DOC,
] as const;

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  [DOCX]: '.docx',
  'application/msword': '.doc',
  'text/html': '.html',
};

export function driveConfig(
  env: Record<string, string | undefined> = {
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
    appId: process.env.NEXT_PUBLIC_GOOGLE_APP_ID,
  },
): DriveConfig | null {
  const { clientId, apiKey, appId } = env;
  if (!clientId || !apiKey || !appId) return null;
  return { clientId, apiKey, appId };
}

/** Nombre con la extensión correcta (la app detecta el formato por extensión y contenido). */
export function driveFileName(doc: DriveDoc) {
  const ext = doc.mimeType === GOOGLE_DOC ? '.docx' : (EXTENSION_BY_MIME[doc.mimeType] ?? '');
  if (!ext || doc.name.toLowerCase().endsWith(ext)) return doc.name;
  return `${doc.name}${ext}`;
}

export function driveDownloadUrl(doc: DriveDoc) {
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(doc.id)}`;
  return doc.mimeType === GOOGLE_DOC
    ? `${base}/export?mimeType=${encodeURIComponent(DOCX)}`
    : `${base}?alt=media&supportsAllDrives=true`;
}

/** Descarga un archivo elegido y lo devuelve como File, listo para el lector. */
export async function downloadDriveFile(
  doc: DriveDoc,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<File> {
  const res = await fetchImpl(driveDownloadUrl(doc), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403)
      throw new Error(`Google Drive no dio permiso para leer «${doc.name}».`);
    throw new Error(`No se pudo descargar «${doc.name}» de Google Drive (HTTP ${res.status}).`);
  }
  const blob = await res.blob();
  const type = doc.mimeType === GOOGLE_DOC ? DOCX : doc.mimeType;
  return new File([blob], driveFileName(doc), { type });
}

/* ------------------------------------------------------------------ */
/* Scripts de Google (solo navegador)                                  */
/* ------------------------------------------------------------------ */

type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type TokenClient = {
  callback: (response: TokenResponse) => void;
  requestAccessToken: (options?: { prompt?: string }) => void;
};
type PickerDoc = { id: string; name: string; mimeType: string };
type PickerData = { action: string; docs?: PickerDoc[] };
type PickerBuilder = {
  addView(view: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setLocale(locale: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setCallback(cb: (data: PickerData) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
};
type GoogleGlobal = {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string; message?: string }) => void;
      }): TokenClient;
    };
  };
  picker: {
    PickerBuilder: new () => PickerBuilder;
    DocsView: new (viewId?: string) => {
      setMimeTypes(types: string): unknown;
      setIncludeFolders(include: boolean): unknown;
      setSelectFolderEnabled(enabled: boolean): unknown;
    };
    ViewId: { DOCS: string };
    Feature: { MULTISELECT_ENABLED: string };
    Action: { PICKED: string; CANCEL: string };
  };
};
type GapiGlobal = { load(name: string, callback: () => void): void };

declare global {
  interface Window {
    google?: GoogleGlobal;
    gapi?: GapiGlobal;
  }
}

const scripts = new Map<string, Promise<void>>();

function loadScript(src: string) {
  let pending = scripts.get(src);
  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scripts.delete(src);
        reject(new Error('No se pudo conectar con Google. Revisa tu conexión.'));
      };
      document.head.appendChild(el);
    });
    scripts.set(src, pending);
  }
  return pending;
}

let ready: Promise<void> | null = null;

/** Carga los scripts de Google por adelantado (así la ventana de acceso no se bloquea). */
export function prepareDrive() {
  ready ??= Promise.all([
    loadScript('https://accounts.google.com/gsi/client'),
    loadScript('https://apis.google.com/js/api.js').then(
      () => new Promise<void>((resolve) => window.gapi!.load('picker', resolve)),
    ),
  ])
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

let tokenClient: TokenClient | null = null;
let token: { value: string; expiresAt: number } | null = null;
let rejectToken: ((error: Error) => void) | null = null;

function requestToken(config: DriveConfig): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return Promise.resolve(token.value);
  const google = window.google!;
  tokenClient ??= google.accounts.oauth2.initTokenClient({
    client_id: config.clientId,
    scope: DRIVE_SCOPE,
    callback: () => undefined,
    error_callback: (error) => {
      rejectToken?.(
        new Error(
          error.type === 'popup_closed'
            ? 'Cerraste la ventana de Google antes de terminar.'
            : error.type === 'popup_failed_to_open'
              ? 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes para este sitio.'
              : 'No se pudo iniciar sesión con Google.',
        ),
      );
    },
  });
  return new Promise<string>((resolve, reject) => {
    rejectToken = reject;
    tokenClient!.callback = (response) => {
      if (response.error || !response.access_token) {
        reject(new Error('Google no dio permiso para abrir tu Drive.'));
        return;
      }
      token = {
        value: response.access_token,
        expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
      };
      resolve(response.access_token);
    };
    tokenClient!.requestAccessToken({ prompt: token ? '' : undefined });
  });
}

function showPicker(config: DriveConfig, accessToken: string): Promise<DriveDoc[]> {
  const { picker } = window.google!;
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS);
    view.setMimeTypes(DRIVE_MIME_TYPES.join(','));
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(false);
    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setLocale('es')
      .setTitle('Elige documentos de Google Drive')
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) {
          resolve((data.docs ?? []).map(({ id, name, mimeType }) => ({ id, name, mimeType })));
        } else if (data.action === picker.Action.CANCEL) {
          resolve([]);
        }
      })
      .build()
      .setVisible(true);
  });
}

/**
 * Pide acceso (solo la primera vez o cuando caduca), abre el selector y descarga
 * lo elegido. Devuelve [] si el usuario cancela.
 */
export async function pickFromDrive(
  config: DriveConfig,
  onDownloading?: (docs: DriveDoc[]) => void,
): Promise<File[]> {
  await prepareDrive();
  const accessToken = await requestToken(config);
  const docs = await showPicker(config, accessToken);
  if (!docs.length) return [];
  onDownloading?.(docs);
  return Promise.all(docs.map((doc) => downloadDriveFile(doc, accessToken)));
}
