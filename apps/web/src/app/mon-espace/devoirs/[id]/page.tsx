import type { AssignmentReview } from '@lenseignement/types';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { gradeSubmissionAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Correction du devoir' };

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';

export default async function ReviewPage({ params, searchParams }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=/mon-espace/devoirs/${id}`);
  const query = await searchParams;
  const result = await apiGet<AssignmentReview>(session.accessToken, `/assignments/${id}/review`);
  if (!result.ok) notFound();
  const { assignment: a, rows } = result.data;

  return (
    <section className="space-y-6">
      <Link href="/mon-espace/devoirs" className="inline-flex min-h-[44px] items-center font-bold">
        ← Devoirs
      </Link>
      <h1 className="text-3xl font-extrabold">{a.title}</h1>
      <p className="whitespace-pre-line">{a.instructions}</p>
      <Notice
        message={param(query.message as string | undefined)}
        error={param(query.erreur as string | undefined)}
      />
      <ul className="space-y-4" role="list" data-testid="submissions">
        {rows.map((r) => (
          <li key={r.learnerId} className={cardClass}>
            <p className="text-lg font-bold">{r.learnerName}</p>
            {!r.submission ? (
              <p className="text-ink-muted">Pas encore rendu.</p>
            ) : (
              <>
                <p className="mt-2 whitespace-pre-line">{r.submission.body}</p>
                <form action={gradeSubmissionAction} className="mt-3 space-y-2">
                  <input type="hidden" name="assignmentId" value={a.id} />
                  <input type="hidden" name="submissionId" value={r.submission.id} />
                  <label className="block font-bold">
                    Note sur {a.maxScore}
                    <input
                      name="score"
                      type="number"
                      min={0}
                      max={a.maxScore}
                      step={1}
                      required
                      defaultValue={r.submission.score ?? ''}
                      className={inputClass}
                    />
                  </label>
                  <label className="block font-bold">
                    Commentaire (facultatif)
                    <textarea
                      name="comment"
                      rows={2}
                      maxLength={2000}
                      defaultValue={r.submission.comment ?? ''}
                      className={inputClass}
                    />
                  </label>
                  <button type="submit" className={buttonClass}>
                    {r.submission.score != null ? 'Modifier la correction' : 'Enregistrer la note'}
                    <span className="sr-only"> de {r.learnerName}</span>
                  </button>
                </form>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
