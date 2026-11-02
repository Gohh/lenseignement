'use server';

import { EXAM_MODELS, EXERCISE_DOMAINS } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

// Épreuves : le navigateur n'a jamais le jeton, et l'API décide des droits.

const ID = /^[0-9a-f-]{36}$/i;
const HOME = '/mon-espace/epreuves';
const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const int = (form: FormData, name: string) => Number.parseInt(text(form, name), 10) || 0;

async function token(returnTo: string): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  return session.accessToken;
}

function back(path: string, kind: 'message' | 'erreur', value: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(value)}`);
}

function idOf(form: FormData): string {
  const id = text(form, 'id');
  if (!ID.test(id)) redirect(HOME);
  return id;
}

export async function createExamAction(form: FormData): Promise<void> {
  const path = `${HOME}/nouvelle`;
  const model = text(form, 'model');
  const shares: Record<string, number> = {};
  for (const d of EXERCISE_DOMAINS) {
    const v = int(form, `share-${d}`);
    if (v > 0) shares[d] = v;
  }
  const result = await apiSend<{ id: string }>(await token(path), 'POST', '/authoring/exams', {
    organizationId: text(form, 'organizationId'),
    curriculumVersionId: text(form, 'curriculumVersionId'),
    model: (EXAM_MODELS as readonly string[]).includes(model) ? model : 'libre',
    title: text(form, 'title'),
    shares,
    questionCount: int(form, 'questionCount'),
    durationMinutes: int(form, 'durationMinutes'),
    threshold: int(form, 'threshold'),
  });
  if (!result.ok) back(path, 'erreur', result.message ?? 'Création impossible.');
  back(
    `${HOME}/${result.data.id}`,
    'message',
    'Épreuve composée avec des exercices publiés de la banque. Relisez les questions, puis donnez-la à vos classes.',
  );
}

export async function updateExamAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `${HOME}/${id}`;
  const result = await apiSend(await token(path), 'PUT', `/authoring/exams/${id}`, {
    title: text(form, 'title'),
    durationMinutes: int(form, 'durationMinutes'),
    threshold: int(form, 'threshold'),
  });
  if (!result.ok) back(path, 'erreur', result.message ?? 'Enregistrement impossible.');
  back(path, 'message', 'Réglages enregistrés.');
}

export async function reassembleExamAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `${HOME}/${id}`;
  const result = await apiSend(await token(path), 'POST', `/authoring/exams/${id}/assemble`);
  if (!result.ok) back(path, 'erreur', result.message ?? 'Tirage impossible.');
  back(path, 'message', 'Nouveau tirage des questions fait.');
}

export async function examItemAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `${HOME}/${id}`;
  const exerciseId = text(form, 'exerciseId');
  if (!ID.test(exerciseId)) redirect(path);
  const remove = text(form, 'step') === 'remove';
  const result = await apiSend(
    await token(path),
    remove ? 'DELETE' : 'POST',
    `/authoring/exams/${id}/items/${exerciseId}${remove ? '' : '/replace'}`,
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Changement impossible.');
  back(path, 'message', remove ? 'Question retirée.' : 'Question remplacée.');
}

export async function giveExamAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `${HOME}/${id}`;
  const cohortIds = form
    .getAll('cohortIds')
    .map(String)
    .filter((c) => ID.test(c));
  const due = text(form, 'dueAt');
  const onPaper = text(form, 'mode') === 'papier';
  const result = await apiSend<{ given: number; skipped: number }>(
    await token(path),
    'POST',
    `/authoring/exams/${id}/give`,
    {
      cohortIds,
      onPaper,
      ...(due ? { dueAt: `${due}:00Z` } : {}),
    },
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Envoi impossible.');
  const { given, skipped } = result.data;
  back(
    path,
    'message',
    given === 0
      ? 'Ces classes ont déjà reçu l’épreuve.'
      : `Épreuve donnée à ${given} classe${given > 1 ? 's' : ''} : ${onPaper ? 'imprimez le livret, puis saisissez les copies.' : 'elle apparaît dans leurs devoirs.'}${skipped ? ` ${skipped} autre${skipped > 1 ? 's l’avaient' : ' l’avait'} déjà.` : ''}`,
  );
}

export async function deleteExamAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `${HOME}/${id}`;
  const result = await apiSend(await token(path), 'DELETE', `/authoring/exams/${id}`);
  if (!result.ok) back(path, 'erreur', result.message ?? 'Suppression impossible.');
  back(HOME, 'message', 'Épreuve supprimée.');
}

/** Grille papier : « Copie » cochée = copie rendue ; chaque case cochée = réponse juste. */
export async function saveExamPaperAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const cohortId = text(form, 'cohortId');
  if (!ID.test(cohortId)) redirect(`${HOME}/${id}`);
  const path = `${HOME}/${id}/saisie?classe=${cohortId}`;
  const count = Math.min(Math.max(int(form, 'count'), 0), 40);
  const rows = form
    .getAll('learners')
    .map(String)
    .filter((l) => ID.test(l))
    .map((learnerId) => {
      const marks = Array.from({ length: count }, (_, i) =>
        form.get(`m:${learnerId}:${i}`) ? 1 : 0,
      );
      const handedIn = Boolean(form.get(`copie:${learnerId}`)) || marks.some((m) => m === 1);
      return { learnerId, marks: handedIn ? marks : null };
    });
  const result = await apiSend<{ saved: number; removed: number }>(
    await token(path),
    'PUT',
    `/authoring/exams/${id}/paper`,
    { cohortId, rows },
  );
  const sep = '&';
  if (!result.ok) {
    redirect(
      `${path}${sep}erreur=${encodeURIComponent(result.message ?? 'Enregistrement impossible.')}`,
    );
  }
  const { saved, removed } = result.data;
  const msg = `Copies enregistrées : ${saved}.${removed ? ` Copies effacées : ${removed}.` : ''}`;
  redirect(`${path}${sep}message=${encodeURIComponent(msg)}`);
}
