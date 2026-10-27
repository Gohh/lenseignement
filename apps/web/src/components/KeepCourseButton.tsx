'use client';

import { useState } from 'react';
import { secondaryButtonClass } from './Notice';

type State = 'idle' | 'busy' | 'done' | 'failed';

/**
 * « Garder ce cours sur cet appareil » : la fiche et toutes les leçons sont téléchargées pour
 * être lues sans réseau (ADR-012). Rien de personnel n'est ajouté à ce que la page montre déjà.
 */
export function KeepCourseButton({ paths }: { paths: string[] }) {
  const [state, setState] = useState<State>('idle');

  async function keep() {
    setState('busy');
    try {
      const registration = await navigator.serviceWorker.ready;
      const worker = registration.active;
      if (!worker) throw new Error('service worker inactif');
      const kept = await new Promise<number>((resolve, reject) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => resolve((event.data as { kept: number }).kept);
        setTimeout(() => reject(new Error('délai dépassé')), 60_000);
        worker.postMessage({ type: 'keep', paths }, [channel.port2]);
      });
      setState(kept === paths.length ? 'done' : 'failed');
    } catch {
      setState('failed');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void keep()}
        disabled={state === 'busy'}
        className={secondaryButtonClass}
      >
        {state === 'busy' ? 'Téléchargement…' : 'Garder ce cours sur cet appareil'}
      </button>
      <p role="status" aria-live="polite" data-testid="keep-status">
        {state === 'done' && '✓ Ce cours est disponible sans connexion sur cet appareil.'}
        {state === 'failed' &&
          'Le cours n’a pas pu être gardé en entier. Vérifiez la connexion et réessayez.'}
      </p>
    </div>
  );
}
