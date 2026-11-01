'use client';

/** Ouvre la fenêtre d'impression : « Enregistrer en PDF » y est proposé par le navigateur. */
export function PrintButton({ className }: { className: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      Imprimer ou enregistrer en PDF
    </button>
  );
}
