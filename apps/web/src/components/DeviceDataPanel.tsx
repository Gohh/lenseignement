'use client';

import { useEffect, useState } from 'react';
import { clearDeviceData, onActionsChanged, pendingActions } from '@/lib/offline-queue';
import { secondaryButtonClass } from './Notice';

/**
 * « Effacer mes données sur cet appareil » (cahier §5.4) : pages gardées et actions pas encore
 * envoyées. Utile sur un appareil partagé ; la déconnexion efface aussi tout.
 */
export function DeviceDataPanel() {
  const [pending, setPending] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    const refresh = () => void pendingActions().then((a) => setPending(a.length));
    refresh();
    return onActionsChanged(refresh);
  }, []);

  async function clear() {
    await clearDeviceData();
    setConfirming(false);
    setCleared(true);
  }

  return (
    <div className="space-y-2">
      <p>
        Les cours gardés pour être lus sans connexion et les actions pas encore envoyées restent sur
        cet appareil jusqu’à leur envoi, votre déconnexion ou leur effacement.
      </p>
      {confirming ? (
        <div className="space-y-2">
          <p className="font-bold">
            {pending > 0
              ? `Attention : ${pending} action${pending > 1 ? 's' : ''} pas encore envoyée${pending > 1 ? 's' : ''} ser${pending > 1 ? 'ont' : 'a'} perdue${pending > 1 ? 's' : ''}. Confirmer ?`
              : 'Confirmer l’effacement ?'}
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void clear()} className={secondaryButtonClass}>
              Oui, tout effacer
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={secondaryButtonClass}
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setCleared(false);
            setConfirming(true);
          }}
          className={secondaryButtonClass}
        >
          Effacer mes données sur cet appareil
        </button>
      )}
      <p role="status" aria-live="polite" data-testid="device-status">
        {cleared && '✓ Données effacées de cet appareil.'}
      </p>
    </div>
  );
}
