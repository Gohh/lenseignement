import { HELP_KIND_LABELS, type HelpInboxItem } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { HelpAttachmentList } from '@/components/HelpAttachmentList';
import { buttonClass, inputClass, Notice, param } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { answerHelpAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Questions des élèves' };

interface Props {
  searchParams: Promise<{ message?: string | string[]; erreur?: string | string[] }>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

export default async function QuestionsPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/questions');
  const query = await searchParams;
  const result = await apiGet<{ items: HelpInboxItem[] }>(session.accessToken, '/help/inbox');
  const items = result.ok ? result.data.items : [];
  const open = items.filter((q) => q.status === 'open');
  const done = items.filter((q) => q.status === 'answered');

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-extrabold">Questions des élèves</h1>
      <p>Les questions de vos classes et des élèves qui vous sont confiés.</p>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      <div className={cardClass}>
        <h2 className="text-xl font-bold">En attente ({open.length})</h2>
        {open.length === 0 ? (
          <p className="mt-2">Aucune question en attente. Bravo !</p>
        ) : (
          <ul className="mt-3 space-y-4" role="list" data-testid="open-questions">
            {open.map((q) => (
              <li key={q.id} className="rounded-card border border-line p-4">
                <p className="font-bold">
                  {q.learnerName}{' '}
                  <span className="font-normal text-ink-muted">
                    · {HELP_KIND_LABELS[q.kind]} · {dateFormat.format(new Date(q.createdAt))}
                    {q.courseTitle ? ` · ${q.courseTitle}` : ''}
                    {q.lessonNumber ? `, leçon ${q.lessonNumber}` : ''}
                  </span>
                </p>
                <p className="mt-2 whitespace-pre-line">{q.body}</p>
                <HelpAttachmentList attachments={q.attachments} />
                <form action={answerHelpAction} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={q.id} />
                  <label className="block font-bold">
                    Votre réponse
                    <textarea
                      name="answer"
                      required
                      maxLength={2000}
                      rows={3}
                      className={inputClass}
                    />
                  </label>
                  <button type="submit" className={buttonClass}>
                    Répondre
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      {done.length > 0 && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Déjà répondu ({done.length})</h2>
          <ul className="mt-3 space-y-3" role="list">
            {done.map((q) => (
              <li key={q.id} className="rounded-card border border-line p-3">
                <p className="font-bold">{q.learnerName}</p>
                <p className="whitespace-pre-line">{q.body}</p>
                <HelpAttachmentList attachments={q.attachments} />
                <p className="mt-1 whitespace-pre-line text-ink-muted">Réponse : {q.answer}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
