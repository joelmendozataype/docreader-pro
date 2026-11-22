/**
 * Aislamiento de origen cruzado (COOP same-origin + COEP credentialless) solo donde
 * suena la voz integrada: lo necesita ONNX Runtime para usar varios hilos.
 *
 * El resto del sitio NO se aísla porque el inicio de sesión de Google (ventana
 * emergente) y el selector de Google Drive (iframe) no funcionan con esas cabeceras.
 */
export const ISOLATED_ROUTES = ['/reader', '/prueba-voz'] as const;

export function isIsolatedPath(pathname: string) {
  return ISOLATED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * El aislamiento se decide al cargar el documento: si se llega por navegación interna
 * de Next desde una página con otras cabeceras, hay que recargar.
 * - Para salir del aislamiento siempre se recarga (el navegador lo permite siempre).
 * - Para entrar se recarga una sola vez por ruta: hay navegadores sin
 *   COEP credentialless que nunca quedan aislados (evita recargas en bucle).
 */
export function shouldReloadForIsolation(pathname: string, isolated: boolean, alreadyTried: boolean) {
  const wanted = isIsolatedPath(pathname);
  if (wanted === isolated) return false;
  return wanted ? !alreadyTried : true;
}
