'use client';

import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/** Indique clairement l'absence de réseau (cahier §4.2, composant OfflineBadge). */
export function OfflineBadge() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  return (
    <p role="status" aria-live="polite" className="text-sm">
      {online ? null : (
        <span className="rounded-pill bg-accent px-3 py-1 font-bold text-ink">Hors ligne</span>
      )}
    </p>
  );
}
