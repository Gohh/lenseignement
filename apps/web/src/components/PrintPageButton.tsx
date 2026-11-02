'use client';

/** Ouvre la fenêtre d'impression (imprimante, ou « Enregistrer au format PDF »). */
export function PrintPageButton({ className, label }: { className: string; label: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      {label}
    </button>
  );
}
