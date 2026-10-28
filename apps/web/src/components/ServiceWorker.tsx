'use client';

import { useEffect } from 'react';

/** Installe le service worker (ADR-012) : pages gardées et page « Hors connexion ». */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: Error) => {
      console.warn('Service worker non installé :', error.message);
    });
  }, []);
  return null;
}
