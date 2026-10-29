import type { EvaluationSheet } from '@lenseignement/types';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { saveScoresAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Carnet de notes' };

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SheetPage({ params, searchParams }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=/mon-espace/evaluations/${id}`);
  const query = await searchParams;
  const result = await apiGet<EvaluationSheet>(session.accessToken, `/evaluations/${id}/sheet`);
  if (!result.ok) notFound();
  const { evaluation: e, rows } = result.data;

  return (
    <section className="space-y-6">
      <Link
        href="/mon-espace/evaluations"
        className="inline-flex min-h-[44px] items-center font-bold"
      >
        ← Évaluations
      </Link>
      <h1 className="text-3xl font-extrabold">{e.title}</h1>
      <p className="text-ink-muted">
        {e.cohortName} · note sur {e.maxScore} · coefficient {e.coefficient}. Laisse une case vide
        pour un élève absent ou pas encore noté.
      </p>
      <Notice
        message={param(query.message as string | undefined)}
        error={param(query.erreur as string | undefined)}
      />
      {rows.length === 0 ? (
        <p>Cette classe n’a pas encore d’élèves.</p>
      ) : (
        <form action={saveScoresAction} className="space-y-4">
          <input type="hidden" name="evaluationId" value={e.id} />
          <ul className="space-y-3" role="list" data-testid="score-sheet">
            {rows.map((r) => (
              <li
                key={r.learnerId}
                className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-[1fr_8rem_1fr] sm:items-end"
              >
                <input type="hidden" name="learnerId" value={r.learnerId} />
                <p className="text-lg font-bold">{r.learnerName}</p>
                <label className="block font-bold">
                  Note sur {e.maxScore}
                  <span className="sr-only"> de {r.learnerName}</span>
                  <input
                    name={`score-${r.learnerId}`}
                    type="number"
                    min={0}
                    max={e.maxScore}
                    step={0.25}
                    defaultValue={r.score ?? ''}
                    className={inputClass}
                  />
                </label>
                <label className="block font-bold">
                  Commentaire
                  <span className="sr-only"> pour {r.learnerName}</span>
                  <input
                    name={`comment-${r.learnerId}`}
                    maxLength={500}
                    defaultValue={r.comment ?? ''}
                    className={inputClass}
                  />
                </label>
              </li>
            ))}
          </ul>
          <button type="submit" className={buttonClass}>
            Enregistrer les notes
          </button>
        </form>
      )}
    </section>
  );
}
