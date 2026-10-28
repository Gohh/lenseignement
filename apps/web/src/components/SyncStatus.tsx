'use client';

import { useCallback, useEffect, useState } from 'react';
import { onActionsChanged, pendingActions, syncActions } from '@/lib/offline-queue';
import { secondaryButtonClass } from './Notice';

type Outcome = { kind: 'saved' } | { kind: 'login' } | { kind: 'rejected'; messages: string[] };

/**
 * Indicateur de synchronisation (cahier §4 `SyncStatus`, ADR-012) : actions faites hors ligne en
 * attente, envoi automatique au retour du réseau, et bouton pour envoyer tout de suite.
 */
export function SyncStatus() {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const refresh = useCallback(async () => setPending((await pendingActions()).length), []);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setBusy(true);
    try {
      const result = await syncActions();
      if (result.kind === 'login') setOutcome({ kind: 'login' });
      else if (result.kind === 'done' && result.rejected.length > 0)
        setOutcome({ kind: 'rejected', messages: result.rejected });
      else if (result.kind === 'done' && result.sent > 0) setOutcome({ kind: 'saved' });
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const reconnect = () => {
      update();
      void sync();
    };
    update();
    void refresh().then(() => sync());
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', update);
    const stop = onActionsChanged(() => {
      setOutcome(null);
      void refresh();
    });
    return () => {
      window.removeEventListener('online', reconnect);
      window.removeEventListener('offline', update);
      stop();
    };
  }, [refresh, sync]);

  const returnTo = typeof window === 'undefined' ? '/' : window.location.pathname;

  return (
    <div role="status" aria-live="polite" data-testid="sync-status">
      {pending > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-line-strong bg-surface p-4">
          <p className="font-bold">
            {pending === 1
              ? '1 action en attente de synchronisation.'
              : `${pending} actions en attente de synchronisation.`}{' '}
            <span className="font-normal">
              {online
                ? 'Elles sont gardées sur cet appareil.'
                : 'Elles seront envoyées au retour d’internet.'}
            </span>
          </p>
          {online && (
            <button
              type="button"
              onClick={() => void sync()}
              disabled={busy}
              className={secondaryButtonClass}
            >
              {busy ? 'Envoi…' : 'Synchroniser maintenant'}
            </button>
          )}
        </div>
      )}
      {outcome?.kind === 'saved' && (
        <p className="mb-4 rounded-card border border-line-strong bg-surface p-4 font-bold">
          ✓ Progression enregistrée.
        </p>
      )}
      {outcome?.kind === 'login' && pending > 0 && (
        <p className="mb-4 rounded-card border border-line-strong bg-surface p-4 font-bold">
          <a
            href={`/auth/login?returnTo=${encodeURIComponent(returnTo)}`}
            className="inline-flex min-h-[44px] items-center underline"
          >
            Connectez-vous pour envoyer vos progrès
          </a>
        </p>
      )}
      {outcome?.kind === 'rejected' && (
        <div className="mb-4 rounded-card border-2 border-error bg-surface p-4 text-error">
          <p className="font-bold">Une action n’a pas pu être enregistrée :</p>
          <ul className="list-disc pl-6">
            {outcome.messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
