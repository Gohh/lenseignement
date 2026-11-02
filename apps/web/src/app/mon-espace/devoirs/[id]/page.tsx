import {
  EXERCISE_DOMAINS,
  EXERCISE_DOMAIN_LABELS,
  EXERCISE_KIND_LABELS,
  type AssignmentExerciseSummary,
  type AssignmentReview,
} from '@lenseignement/types';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AssignmentResults } from '@/components/AssignmentExercises';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { assignmentExerciseAction, gradeSubmissionAction } from '../actions';

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
  const { assignment: a, rows, exercises, exercisesLocked } = result.data;
  const q = (param(query.q as string | undefined) ?? '').slice(0, 100);
  const domaine = param(query.domaine as string | undefined) ?? '';
  const search = new URLSearchParams();
  if (q) search.set('q', q);
  if ((EXERCISE_DOMAINS as readonly string[]).includes(domaine)) search.set('domain', domaine);
  const candidates = exercisesLocked
    ? null
    : await apiGet<{ items: AssignmentExerciseSummary[] }>(
        session.accessToken,
        `/assignments/${id}/exercise-candidates?${search.toString()}`,
      );
  const exerciseButton = (e: AssignmentExerciseSummary, op: 'add' | 'remove') => (
    <form action={assignmentExerciseAction}>
      <input type="hidden" name="assignmentId" value={a.id} />
      <input type="hidden" name="exerciseId" value={e.id} />
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="q" value={q} />
      <input type="hidden" name="domaine" value={domaine} />
      <button type="submit" className={secondaryButtonClass}>
        {op === 'add' ? 'Ajouter' : 'Retirer'}
        <span className="sr-only"> « {e.title} »</span>
      </button>
    </form>
  );
  const exerciseLine = (e: AssignmentExerciseSummary) => (
    <div className="min-w-0 flex-1 basis-56">
      <p className="font-bold">{e.title}</p>
      <p className="text-sm text-ink-muted">
        {e.competency} · {EXERCISE_DOMAIN_LABELS[e.domain]} · {EXERCISE_KIND_LABELS[e.kind]}
      </p>
    </div>
  );

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
      <div className={cardClass} data-testid="assignment-exercise-list">
        <h2 className="text-xl font-bold">Exercices de la Fabrique</h2>
        <p className="text-ink-muted">
          {exercises.length === 0
            ? 'Aucun : les élèves rédigent leur réponse. Ajoutez des exercices publiés de la banque pour que la plateforme corrige et note toute seule.'
            : 'La plateforme corrige chaque exercice et calcule la note. Vous pouvez la changer ensuite.'}
          {exercisesLocked &&
            exercises.length > 0 &&
            ' Un élève a rendu : la liste ne change plus.'}
        </p>
        {exercises.length > 0 && (
          <>
            <ol className="mt-3 divide-y divide-line">
              {exercises.map((e, i) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="font-bold">{i + 1}.</span>
                  {exerciseLine(e)}
                  {!exercisesLocked && exerciseButton(e, 'remove')}
                </li>
              ))}
            </ol>
            <Link
              href={`/mon-espace/devoirs/${a.id}/faire`}
              className="mt-2 inline-flex min-h-[44px] items-center font-bold underline"
            >
              Voir comme un élève
            </Link>
          </>
        )}
        {candidates && (
          <details className="mt-4" open={Boolean(q || domaine) || exercises.length === 0}>
            <summary className="min-h-[44px] cursor-pointer font-bold">
              Ajouter des exercices de la banque
            </summary>
            <form method="get" className="mt-2 flex flex-wrap items-end gap-3">
              <label className="block min-w-0 flex-1 basis-56 font-bold">
                Chercher
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Titre, compétence, code…"
                  className={inputClass}
                />
              </label>
              <label className="block min-w-0 flex-1 basis-48 font-bold">
                Domaine
                <select name="domaine" defaultValue={domaine} className={inputClass}>
                  <option value="">Tous</option>
                  {EXERCISE_DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {EXERCISE_DOMAIN_LABELS[d]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className={secondaryButtonClass}>
                Chercher
              </button>
            </form>
            {!candidates.ok || candidates.data.items.length === 0 ? (
              <p className="mt-2 text-ink-muted">
                Aucun exercice publié ne correspond. Les exercices se créent dans Contenus &gt;
                Fabrique d’exercices.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line" data-testid="exercise-candidates">
                {candidates.data.items.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 py-2">
                    {exerciseLine(e)}
                    {exerciseButton(e, 'add')}
                  </li>
                ))}
              </ul>
            )}
          </details>
        )}
      </div>
      <ul className="space-y-4" role="list" data-testid="submissions">
        {rows.map((r) => (
          <li key={r.learnerId} className={cardClass}>
            <p className="text-lg font-bold">{r.learnerName}</p>
            {!r.submission ? (
              <p className="text-ink-muted">Pas encore rendu.</p>
            ) : (
              <>
                {r.submission.results ? (
                  <div className="mt-2">
                    <AssignmentResults
                      results={r.submission.results}
                      score={null}
                      maxScore={a.maxScore}
                    />
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-line">{r.submission.body}</p>
                )}
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
