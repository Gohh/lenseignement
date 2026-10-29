import type { HelpBadge } from '@lenseignement/types';
import { apiGet } from '@/lib/api';

/**
 * Cloche de l’en-tête : un point orange quand une réponse, un devoir ou une séance t’attend, ou qu’une question
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
  const empty = { answers: 0, questions: 0, homework: 0, toGrade: 0, sessions: 0, messages: 0 };
  const badge = result.ok ? result.data : empty;
  const count =
    badge.answers +
    badge.questions +
    badge.homework +
    badge.toGrade +
    badge.sessions +
    badge.messages;
  if (count === 0 && quietWhenEmpty) return null;
  // Le clic mène à ce qui demande le plus vite une action.
  const href =
    badge.messages > 0 && badge.questions === 0
      ? '/mon-espace/messages'
      : badge.questions > 0
        ? '/mon-espace/questions'
        : badge.toGrade > 0 || badge.homework > 0
          ? '/mon-espace/devoirs'
          : badge.answers > 0
            ? '/mon-espace/aide'
            : badge.sessions > 0
              ? '/mon-espace/classe'
              : '/mon-espace/aide';
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
  const label =
    count === 0
      ? 'Aucune nouveauté'
      : [
          badge.answers > 0 && plural(badge.answers, 'réponse reçue', 'réponses reçues'),
          badge.questions > 0 &&
            plural(badge.questions, 'question en attente', 'questions en attente'),
          badge.homework > 0 && plural(badge.homework, 'devoir à rendre', 'devoirs à rendre'),
          badge.toGrade > 0 && plural(badge.toGrade, 'copie à corriger', 'copies à corriger'),
          badge.messages > 0 && plural(badge.messages, 'message non lu', 'messages non lus'),
          badge.sessions > 0 &&
            plural(badge.sessions, 'séance de classe bientôt', 'séances de classe bientôt'),
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
