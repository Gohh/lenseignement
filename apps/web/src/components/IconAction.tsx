import type { ReactNode } from 'react';

// Petits pictogrammes (traits, 24 × 24), communs aux listes avec actions en fin de ligne.
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
  suspendre: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9v6m4-6v6" />
    </>
  ),
  reactiver: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8.5 5 3.5-5 3.5v-7Z" />
    </>
  ),
  supprimer: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6m4-6v6" />
    </>
  ),
  cycles: (
    <>
      <path d="M4 6h10m4 0h2M4 12h4m4 0h8M4 18h12m4 0h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  retirerRole: (
    <>
      <circle cx="10" cy="8" r="4" />
      <path d="M3 20a7 7 0 0 1 14 0" />
      <path d="M17 11h5" />
    </>
  ),
  rendreRole: (
    <>
      <circle cx="10" cy="8" r="4" />
      <path d="M3 20a7 7 0 0 1 14 0" />
      <path d="M17 11h5m-2.5-2.5v5" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICONS;

export const iconButtonClass =
  'group relative inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-card border border-line bg-surface text-primary hover:bg-primary-soft focus-visible:bg-primary-soft';

export function Icon({ name }: { name: IconName }) {
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
export function Tip({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-full right-0 z-10 mb-2 hidden w-max max-w-[16rem] rounded-card bg-ink-strong px-3 py-2 text-left text-sm font-bold text-surface group-hover:block group-focus-visible:block"
    >
      {children}
    </span>
  );
}

/** Bouton d'envoi de formulaire en forme de pictogramme, avec infobulle. */
export function IconSubmit({ icon, label, tip }: { icon: IconName; label: string; tip: string }) {
  return (
    <button type="submit" aria-label={label} className={iconButtonClass}>
      <Icon name={icon} />
      <Tip>{tip}</Tip>
    </button>
  );
}
