'use client';

import { useState } from 'react';
import { Shelf } from './Library';
import { useKeptBooks, type KeptBook } from './offline';
import { Reader } from './Reader';

/** Page « Hors connexion » : les livres gardés sur l'appareil restent lisibles. */
export function OfflineShelf() {
  const kept = useKeptBooks();
  const [open, setOpen] = useState<KeptBook | null>(null);
  if (kept.length === 0) return null;
  const ids = new Set(kept.map((b) => b.id));
  return (
    <section className="space-y-3 pt-4" data-testid="offline-books">
      <h2 className="text-2xl font-bold">Mes livres sur cet appareil</h2>
      <p>Ils s’ouvrent même sans connexion.</p>
      <Shelf
        name="Livres gardés"
        books={kept}
        keptIds={ids}
        onOpen={(b) => setOpen(b as KeptBook)}
      />
      {open && <Reader book={open} offline onClose={() => setOpen(null)} />}
    </section>
  );
}
