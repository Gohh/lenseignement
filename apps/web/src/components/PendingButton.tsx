'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/** Bouton d'envoi qui dit « en cours » pendant une action longue (et ne s'envoie pas deux fois). */
export function PendingButton({
  children,
  pendingLabel,
  className,
}: {
  children: ReactNode;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
