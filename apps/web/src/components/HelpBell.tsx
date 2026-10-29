import type { HelpBadge } from '@lenseignement/types';
import { apiGet } from '@/lib/api';

/**
 * Cloche de l'en-tête : un point orange quand une réponse t'attend (apprenant) ou qu'une question
 * attend ta réponse (enseignant, répétiteur). Le clic mène à la bonne page.
 */
export async function HelpBell({
  accessToken,
  quietWhenEmpty,
}: {
  accessToken: string;
  quietWhenEmpty: boolean;
}) {
  const result = await apiGet<HelpBadge>(accessToken, '/me/help-badge');
  const badge = result.ok ? result.data : { answers: 0, questions: 0 };
  const count = badge.answers + badge.questions;
  if (count === 0 && quietWhenEmpty) return null;
  const href = badge.questions > 0 ? '/mon-espace/questions' : '/mon-espace/aide';
  const label =
    count === 0
      ? 'Aucune nouveauté'
      : [
          badge.answers > 0 &&
            `${badge.answers} réponse${badge.answers > 1 ? 's' : ''} reçue${badge.answers > 1 ? 's' : ''}`,
          badge.questions > 0 &&
            `${badge.questions} question${badge.questions > 1 ? 's' : ''} en attente`,
        ]
          .filter(Boolean)
          .join(', ');
  return (
    <a
      href={href}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-xl no-underline hover:bg-primary-soft"
      data-testid="help-bell"
    >
      <span aria-hidden="true">🔔</span>
      <span className="sr-only">Notifications : {label}</span>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-ink-strong"
        >
          {count}
        </span>
      )}
    </a>
  );
}
