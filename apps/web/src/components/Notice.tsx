/** Bandeau de retour après une action (succès ou erreur), annoncé aux lecteurs d'écran. */
export function Notice({ message, error }: { message?: string; error?: string }) {
  if (error) {
    return (
      <p
        role="alert"
        className="rounded-card border-2 border-error bg-surface p-4 font-bold text-error"
      >
        {error}
      </p>
    );
  }
  if (message) {
    return (
      <p role="status" className="rounded-card border border-line-strong bg-surface p-4 font-bold">
        {message}
      </p>
    );
  }
  return null;
}

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  in_review: 'En relecture',
  approved: 'Approuvée',
  published: 'Publiée',
  archived: 'Archivée',
};

export const inputClass =
  'mt-1 block w-full min-h-[44px] rounded-card border border-line-strong bg-surface px-3 py-2 text-ink';
export const buttonClass =
  'inline-flex min-h-[44px] items-center rounded-card bg-primary px-5 font-bold text-surface';
export const secondaryButtonClass =
  'inline-flex min-h-[44px] items-center rounded-card border border-line-strong bg-surface px-5 font-bold text-ink';

/** Lit un paramètre d'URL simple (?message=… / ?erreur=…). */
export function param(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length <= 300 ? value : undefined;
}
