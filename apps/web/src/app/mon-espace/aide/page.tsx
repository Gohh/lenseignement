import { HELP_KIND_LABELS, HELP_KINDS, type HelpQuestion } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param } from '@/components/Notice';
import { apiGet, apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';
import { askHelpAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Aide et tutorat' };

interface Props {
  searchParams: Promise<{
    message?: string | string[];
    erreur?: string | string[];
    cours?: string | string[];
    lecon?: string | string[];
  }>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

export default async function HelpPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/aide');
  const query = await searchParams;
  const result = await apiGet<{ items: HelpQuestion[] }>(session.accessToken, '/me/help-questions');
  const items = result.ok ? result.data.items : [];
  // Les réponses affichées ci-dessous sont lues : la cloche s'éteint à la page suivante.
  if (items.some((q) => q.unseen)) {
    await apiSend(session.accessToken, 'POST', '/me/help-questions/seen');
  }
  const courseId = param(query.cours) ?? '';
  const lesson = param(query.lecon) ?? '';
  const withLesson = /^[0-9a-f-]{36}$/.test(courseId);

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-extrabold">Aide et tutorat</h1>
      <p>Tu es bloqué ? Écris ta question. Ton enseignant ou ton répétiteur te répond ici.</p>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      <form action={askHelpAction} className={`${cardClass} space-y-4`}>
        <h2 className="text-xl font-bold">Poser une question</h2>
        {withLesson && (
          <>
            <input type="hidden" name="courseId" value={courseId} />
            <input type="hidden" name="lessonNumber" value={lesson} />
            <p className="rounded-card bg-primary-soft p-3 font-bold text-primary">
              Ta question porte sur la leçon {lesson} du cours que tu lisais.
            </p>
          </>
        )}
        <fieldset>
          <legend className="font-bold">Que se passe-t-il ?</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {HELP_KINDS.map((kind, index) => (
              <label key={kind} className="inline-flex min-h-[44px] items-center gap-2">
                <input type="radio" name="kind" value={kind} defaultChecked={index === 0} />
                {HELP_KIND_LABELS[kind]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block font-bold">
          Ta question
          <textarea
            name="body"
            required
            minLength={3}
            maxLength={2000}
            rows={4}
            className={inputClass}
          />
        </label>
        <button type="submit" className={buttonClass}>
          Envoyer ma question
        </button>
      </form>

      <div className={cardClass}>
        <h2 className="text-xl font-bold">Mes questions</h2>
        {items.length === 0 ? (
          <p className="mt-2">Tu n’as pas encore posé de question.</p>
        ) : (
          <ul className="mt-3 space-y-4" role="list" data-testid="my-questions">
            {items.map((q) => (
              <li key={q.id} className="rounded-card border border-line p-4">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary-soft px-3 py-1 text-sm font-bold text-primary">
                    {HELP_KIND_LABELS[q.kind]}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-bold ${q.status === 'answered' ? 'bg-primary-soft text-primary' : 'bg-accent-soft text-accent-ink'}`}
                  >
                    {q.status === 'answered' ? 'Réponse reçue' : 'En attente'}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {dateFormat.format(new Date(q.createdAt))}
                    {q.courseTitle ? ` · ${q.courseTitle}` : ''}
                    {q.lessonNumber ? `, leçon ${q.lessonNumber}` : ''}
                  </span>
                </p>
                <p className="mt-2 whitespace-pre-line">{q.body}</p>
                {q.answer && (
                  <blockquote className="mt-3 rounded-card border-l-4 border-primary bg-primary-soft p-3">
                    <p className="font-bold">{q.answeredByName ?? 'Ton enseignant'} répond :</p>
                    <p className="whitespace-pre-line">{q.answer}</p>
                  </blockquote>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
