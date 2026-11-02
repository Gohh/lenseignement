import type { AssignmentWork } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AssignmentExercisesForm, AssignmentResults } from '@/components/AssignmentExercises';
import {
  DoAssignment,
  ForgetDoneAssignment,
  KeepAssignmentButton,
} from '@/components/DoAssignment';
import { apiGet } from '@/lib/api';
import { ownerOf } from '@/lib/device-owner';
import { getSession } from '@/lib/session';
import { answerAssignmentAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Faire le devoir' };

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/** Devoir fait d'exercices de la Fabrique : l'élève le fait ici, la plateforme corrige. */
export default async function DoAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const here = `/mon-espace/devoirs/${id}/faire`;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(here)}`);
  const result = await apiGet<AssignmentWork>(
    session.accessToken,
    `/assignments/${encodeURIComponent(id)}/work`,
  );
  const back = (
    <Link href="/mon-espace/devoirs" className="inline-flex min-h-[44px] items-center font-bold">
      ← Devoirs
    </Link>
  );
  if (!result.ok || result.data.exercises.length === 0) {
    return (
      <section className="space-y-4">
        {back}
        <h1 className="text-3xl font-extrabold">Devoir</h1>
        <p>Ce devoir est introuvable ou n’a pas d’exercice.</p>
      </section>
    );
  }
  const { assignment: a, exercises } = result.data;
  const mine = a.mine;

  return (
    <section className="mx-auto max-w-prose space-y-6">
      {back}
      <div className="space-y-1">
        <p className="font-bold text-ink-muted">
          {a.cohortName}
          {a.teacherName ? ` · ${a.teacherName}` : ''} · {exercises.length} exercice
          {exercises.length > 1 ? 's' : ''}
          {a.dueAt ? ` · à rendre avant le ${dateFormat.format(new Date(a.dueAt))}` : ''}
        </p>
        <h1 className="text-3xl font-extrabold">{a.title}</h1>
      </div>
      <p className="whitespace-pre-line">{a.instructions}</p>

      {a.canManage ? (
        <>
          <p className="rounded-card border-2 border-line-strong p-3 font-bold">
            Aperçu : voici ce que voient les élèves (sans le corrigé).
          </p>
          <AssignmentExercisesForm exercises={exercises} maxScore={a.maxScore} preview />
        </>
      ) : mine ? (
        <div className="space-y-3 rounded-big border border-line bg-surface p-5">
          <ForgetDoneAssignment id={a.id} />
          <h2 className="text-xl font-bold">Ma correction</h2>
          {mine.comment && <p className="whitespace-pre-line">{mine.comment}</p>}
          <AssignmentResults
            results={mine.results ?? []}
            score={mine.score}
            maxScore={a.maxScore}
          />
        </div>
      ) : (
        <>
          <KeepAssignmentButton
            assignment={{
              id: a.id,
              title: a.title,
              instructions: a.instructions,
              cohortName: a.cohortName,
              dueAt: a.dueAt,
              maxScore: a.maxScore,
              exercises,
              owner: ownerOf(session.subject),
            }}
          />
          <DoAssignment
            assignment={{
              id: a.id,
              title: a.title,
              instructions: a.instructions,
              cohortName: a.cohortName,
              dueAt: a.dueAt,
              maxScore: a.maxScore,
              exercises,
              owner: ownerOf(session.subject),
            }}
            answer={answerAssignmentAction}
          />
        </>
      )}
    </section>
  );
}
