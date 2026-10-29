'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  /** Texte du bouton qui ouvre la fenêtre. */
  label: string;
  title: string;
  /** Ouverte dès l'affichage de la page (ex. après une erreur de saisie). */
  openAtStart?: boolean;
  primary?: boolean;
  children: ReactNode;
}

const button =
  'inline-flex min-h-[44px] items-center rounded-card px-5 font-bold no-underline cursor-pointer';

/**
 * Bouton + fenêtre (`<dialog>` natif : focus piégé, Échap pour fermer). Le contenu reste dans la
 * page, donc les formulaires gardent leurs actions serveur.
 */
export function Dialog({ label, title, openAtStart = false, primary = false, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (openAtStart && ref.current && !ref.current.open) ref.current.showModal();
  }, [openAtStart]);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className={
          primary
            ? `${button} bg-primary text-surface shadow-[var(--shadow-press)] hover:bg-primary-dark`
            : `${button} border-2 border-primary bg-surface text-primary hover:bg-primary-soft`
        }
      >
        {label}
      </button>
      <dialog
        ref={ref}
        aria-labelledby="dialog-title"
        className="m-auto w-[min(92vw,48rem)] max-h-[90vh] overflow-y-auto rounded-big border border-line bg-surface p-0 text-ink shadow-soft backdrop:bg-ink-strong/50"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 id="dialog-title" className="text-xl font-extrabold">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="inline-flex min-h-[44px] items-center rounded-card px-4 font-bold text-primary hover:bg-primary-soft"
          >
            Fermer
          </button>
        </div>
        <div className="p-6">{children}</div>
      </dialog>
    </>
  );
}
