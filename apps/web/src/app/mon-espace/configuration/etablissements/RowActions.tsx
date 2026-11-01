'use client';

import { useEffect, useRef, useState } from 'react';
import { buttonClass, secondaryButtonClass } from '@/components/Notice';
import { Icon, iconButtonClass, Tip, type IconName } from '@/components/IconAction';
import { archiveOrganizationAction, restoreOrganizationAction } from '../actions';

export type { IconName };

const iconButton = iconButtonClass;

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
  from: 'liste' | 'fiche' | 'drena' | 'services';
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
            {from === 'drena'
              ? 'Elle n’apparaîtra plus dans les listes ni dans les choix. Rien n’est effacé. Ce n’est possible que si plus aucun établissement actif n’y est rattaché. Vous pourrez la rétablir depuis « Archivés ».'
              : from === 'services'
                ? 'Elle n’apparaîtra plus dans les listes ni dans les choix. Rien n’est effacé : son équipe et son historique sont gardés. Vous pourrez la rétablir depuis « Archivés ».'
                : 'Il n’apparaîtra plus dans les listes ni dans les choix des autres écrans. Rien n’est effacé : ses classes, ses élèves et son historique sont gardés. Vous pourrez le rétablir depuis « Archivés ».'}
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
