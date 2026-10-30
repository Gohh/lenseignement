'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { buttonClass, secondaryButtonClass } from '@/components/Notice';
import { archiveOrganizationAction, restoreOrganizationAction } from '../actions';

// Petits pictogrammes (traits, 24 × 24) : œil, crayon, flèches, boîte d'archives.
const ICONS = {
  voir: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  modifier: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  actualiser: (
    <>
      <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" />
      <path d="M20 20v-4h-4" />
    </>
  ),
  retirer: (
    <>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
      <path d="m10 13 4 4m0-4-4 4" />
    </>
  ),
  retablir: (
    <>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
      <path d="M12 18v-6m-3 3 3-3 3 3" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICONS;

const iconButton =
  'group relative inline-flex h-11 w-11 items-center justify-center rounded-card border border-line text-primary hover:bg-primary-soft focus-visible:bg-primary-soft';

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}

/** Infobulle visible au survol et au clavier ; le nom accessible vient de `aria-label`. */
function Tip({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-full right-0 z-10 mb-2 hidden w-max max-w-[16rem] rounded-card bg-ink-strong px-3 py-2 text-left text-sm font-bold text-surface group-hover:block group-focus-visible:block"
    >
      {children}
    </span>
  );
}

/** Lien en forme de pictogramme, avec infobulle. */
export function IconLink({
  href,
  icon,
  label,
  tip,
}: {
  href: string;
  icon: IconName;
  label: string;
  tip: string;
}) {
  return (
    <a href={href} aria-label={label} className={iconButton}>
      <Icon name={icon} />
      <Tip>{tip}</Tip>
    </a>
  );
}

/**
 * « Retirer » avec confirmation (fenêtre native, pas d'alerte du navigateur), ou « Rétablir »
 * pour un établissement déjà archivé. `variant="text"` : bouton avec texte, pour la fiche.
 */
export function RemoveButton({
  id,
  name,
  archived,
  from,
  variant = 'icon',
}: {
  id: string;
  name: string;
  archived: boolean;
  from: 'liste' | 'fiche';
  variant?: 'icon' | 'text';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && ref.current && !ref.current.open) ref.current.showModal();
  }, [open]);
  const hidden = (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="retour" value={from} />
    </>
  );

  if (archived) {
    return (
      <form action={restoreOrganizationAction}>
        {hidden}
        {variant === 'icon' ? (
          <button type="submit" aria-label={`Rétablir ${name}`} className={iconButton}>
            <Icon name="retablir" />
            <Tip>Rétablir : remettre dans la liste active</Tip>
          </button>
        ) : (
          <button type="submit" className={secondaryButtonClass}>
            Rétablir
          </button>
        )}
      </form>
    );
  }
  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          aria-label={`Retirer ${name}`}
          onClick={() => setOpen(true)}
          className={iconButton}
        >
          <Icon name="retirer" />
          <Tip>Retirer : sortir de la liste active (avec confirmation)</Tip>
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={secondaryButtonClass}>
          Retirer
        </button>
      )}
      {open && (
        <dialog
          ref={ref}
          onClose={() => setOpen(false)}
          aria-labelledby={`retirer-${id}`}
          className="m-auto w-[min(92vw,32rem)] rounded-big border border-line bg-surface p-6 text-left text-ink shadow-soft backdrop:bg-ink-strong/50"
        >
          <h2 id={`retirer-${id}`} className="text-xl font-extrabold">
            Retirer « {name} » de la liste active ?
          </h2>
          <p className="mt-3">
            Il n’apparaîtra plus dans les listes ni dans les choix des autres écrans. Rien n’est
            effacé : ses classes, ses élèves et son historique sont gardés. Vous pourrez le rétablir
            depuis « Archivés ».
          </p>
          <form action={archiveOrganizationAction} className="mt-5 flex flex-wrap gap-3">
            {hidden}
            <button type="submit" className={buttonClass}>
              Oui, retirer
            </button>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className={secondaryButtonClass}
            >
              Annuler
            </button>
          </form>
        </dialog>
      )}
    </>
  );
}
