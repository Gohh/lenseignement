'use client';

import type { SimulationStep, WorkshopTrade } from '@lenseignement/types';
import { useEffect, useState } from 'react';
import {
  forgetWorkshop,
  keepWorkshop,
  useKeptWorkshops,
  workshopBytes,
} from '@/lib/offline-workshops';
import { secondaryButtonClass } from './Notice';

type State = 'idle' | 'busy' | 'done' | 'failed';

const megabytes = (bytes: number) =>
  bytes < 100_000 ? 'moins de 0,1 Mo' : `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} Mo`;

/** Demande au service worker de garder la page « Hors connexion » à jour (elle montre l'atelier). */
async function keepOfflinePage(): Promise<void> {
  const worker = (await navigator.serviceWorker?.ready)?.active;
  if (!worker) return;
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    setTimeout(resolve, 20_000);
    worker.postMessage({ type: 'keep', paths: ['/hors-ligne'] }, [channel.port2]);
  });
}

/**
 * « Garder cet atelier sur cet appareil » : l'élève pourra le faire sans connexion. Son essai est
 * gardé, puis corrigé et compté au retour d'internet.
 */
export function KeepWorkshopButton({
  workshop,
}: {
  workshop: {
    code: string;
    title: string;
    trade: WorkshopTrade;
    summary: string;
    steps: SimulationStep[];
    owner: string;
  };
}) {
  const kept = useKeptWorkshops().some((w) => w.code === workshop.code);
  const [state, setState] = useState<State>('idle');
  const [bytes, setBytes] = useState<number | null>(null);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    let alive = true;
    workshopBytes(workshop.steps)
      .then((b) => alive && setBytes(b))
      .catch(() => alive && setBytes(null));
    return () => {
      alive = false;
    };
  }, [workshop.steps]);

  async function keep() {
    setState('busy');
    try {
      await keepOfflinePage();
      await keepWorkshop(workshop, (done, total) =>
        setProgress(`${Math.round((done / total) * 100)} %`),
      );
      setState('done');
    } catch {
      setState('failed');
    } finally {
      setProgress('');
    }
  }

  async function forget() {
    await forgetWorkshop(workshop.code);
    setState('idle');
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {kept ? (
          <button type="button" onClick={() => void forget()} className={secondaryButtonClass}>
            Retirer de cet appareil
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void keep()}
            disabled={state === 'busy'}
            className={secondaryButtonClass}
          >
            {state === 'busy'
              ? `Téléchargement… ${progress}`
              : `Garder cet atelier sur cet appareil${bytes ? ` (${megabytes(bytes)})` : ''}`}
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" data-testid="keep-workshop-status">
        {kept &&
          '✓ Cet atelier est sur cet appareil : tu peux le faire sans connexion. Ton essai sera envoyé au retour d’internet.'}
        {!kept &&
          state === 'failed' &&
          'L’atelier n’a pas pu être gardé en entier. Vérifie la connexion et la place libre, puis réessaie.'}
      </p>
    </div>
  );
}
