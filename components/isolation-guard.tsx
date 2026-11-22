'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { isIsolatedPath, shouldReloadForIsolation } from '@/lib/isolation';

const TRIED_KEY = 'docreader:isolation-reload';

/** Recarga la página cuando la navegación interna cruza entre rutas aisladas y no aisladas. */
export function IsolationGuard() {
  const pathname = usePathname();

  useEffect(() => {
    let tried = false;
    try {
      tried = sessionStorage.getItem(TRIED_KEY) === pathname;
    } catch {
      // sin sessionStorage se intenta igual (como mucho una recarga de más)
    }
    if (shouldReloadForIsolation(pathname, window.crossOriginIsolated, tried)) {
      try {
        if (isIsolatedPath(pathname)) sessionStorage.setItem(TRIED_KEY, pathname);
      } catch {}
      window.location.reload();
      return;
    }
    if (window.crossOriginIsolated) {
      try {
        sessionStorage.removeItem(TRIED_KEY);
      } catch {}
    }
  }, [pathname]);

  return null;
}
