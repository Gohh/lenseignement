'use client';

/**
 * Ouvre la fenêtre d'impression : on y choisit l'imprimante ou « Enregistrer au format PDF ».
 * Les menus sont masqués à l'impression : il ne reste que le rapport.
 */
export function PrintButton({ className }: { className: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.print()}
      title="Imprimer le tableau, ou choisir « Enregistrer au format PDF »"
    >
      Rapport PDF
    </button>
  );
}
