'use server';

import {
  AssignmentAnswersSchema,
  type ExerciseAnswer,
  type MySubmission,
} from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/devoirs';

async function token(): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  return session.accessToken;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function back(kind: 'message' | 'erreur', value: string, path = PATH, suffix = ''): never {
  redirect(`${path}?${kind}=${encodeURIComponent(value)}${suffix}`);
}

export async function createAssignmentAction(form: FormData): Promise<void> {
  const due = text(form, 'dueAt');
  const result = await apiSend(
    await token(),
    'POST',
    `/cohorts/${text(form, 'cohortId')}/assignments`,
    {
      title: text(form, 'title'),
      instructions: text(form, 'instructions'),
      // Heure de Greenwich, comme en Côte d'Ivoire.
      ...(due ? { dueAt: `${due}:00Z` } : {}),
      maxScore: Number(text(form, 'maxScore')) || 20,
    },
  );
  // En cas d'erreur, la fenêtre de création se rouvre.
  if (!result.ok) back('erreur', result.message ?? 'Création impossible.', PATH, '&ouvrir=devoir');
  back('message', 'Devoir donné. Les élèves de la classe le voient dans « Mes devoirs ».');
}

export async function submitAssignmentAction(form: FormData): Promise<void> {
  const result = await apiSend(
    await token(),
    'POST',
    `/assignments/${text(form, 'id')}/submission`,
    { body: text(form, 'body') },
  );
  if (!result.ok) back('erreur', result.message ?? 'Envoi impossible.');
  back('message', 'Ton devoir est rendu. Tu peux encore le modifier jusqu’à sa correction.');
}

export async function deleteAssignmentAction(form: FormData): Promise<void> {
  const result = await apiSend(await token(), 'DELETE', `/assignments/${text(form, 'id')}`);
  if (!result.ok) back('erreur', result.message ?? 'Suppression impossible.');
  back('message', 'Devoir supprimé.');
}

export async function gradeSubmissionAction(form: FormData): Promise<void> {
  const path = `${PATH}/${text(form, 'assignmentId')}`;
  const result = await apiSend(
    await token(),
    'POST',
    `/submissions/${text(form, 'submissionId')}/grade`,
    { score: Number(text(form, 'score')), comment: text(form, 'comment') },
  );
  if (!result.ok) back('erreur', result.message ?? 'Correction impossible.', path);
  back('message', 'Correction enregistrée.', path);
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Ajoute ou retire un exercice de la banque (devoir sans copie rendue). */
export async function assignmentExerciseAction(form: FormData): Promise<void> {
  const id = text(form, 'assignmentId');
  const exerciseId = text(form, 'exerciseId');
  if (!UUID.test(id) || !UUID.test(exerciseId)) redirect(PATH);
  const path = `${PATH}/${id}`;
  const add = text(form, 'op') === 'add';
  const result = add
    ? await apiSend(await token(), 'POST', `/assignments/${id}/exercises`, { exerciseId })
    : await apiSend(await token(), 'DELETE', `/assignments/${id}/exercises/${exerciseId}`);
  // La recherche reste ouverte pour ajouter les exercices suivants.
  const keep = new URLSearchParams();
  for (const name of ['q', 'domaine']) if (text(form, name)) keep.set(name, text(form, name));
  const suffix = keep.toString() ? `&${keep.toString()}` : '';
  if (!result.ok) back('erreur', result.message ?? 'Action impossible.', path, suffix);
  back('message', add ? 'Exercice ajouté au devoir.' : 'Exercice retiré du devoir.', path, suffix);
}

/** L'élève rend ses réponses aux exercices : la plateforme corrige et note. */
export async function answerAssignmentAction(
  id: string,
  answers: ExerciseAnswer[],
  attemptId: string,
): Promise<{ submission: MySubmission } | { error: string }> {
  if (!UUID.test(id)) return { error: 'Devoir introuvable.' };
  const parsed = AssignmentAnswersSchema.safeParse({ attemptId, answers });
  if (!parsed.success) return { error: 'Réponses illisibles.' };
  const session = await getSession();
  if (!session) return { error: 'Connecte-toi de nouveau.' };
  const result = await apiSend<MySubmission>(
    session.accessToken,
    'POST',
    `/assignments/${id}/answers`,
    parsed.data,
  );
  return result.ok ? { submission: result.data } : { error: result.message ?? 'Envoi impossible.' };
}
