'use server';

import { parseLearnerList, type AddLearnersResult } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

async function token(path: string): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(path)}`);
  return session.accessToken;
}

function back(path: string, kind: 'message' | 'erreur', value: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(value)}`);
}

export async function transferLearnersAction(form: FormData): Promise<void> {
  const id = text(form, 'cohortId');
  const path = `/mon-espace/classes/${id}`;
  const learnerIds = form.getAll('learnerId').map(String);
  // Aucune case cochée : toute la classe passe.
  const result = await apiSend<{ moved: number }>(
    await token(path),
    'POST',
    `/cohorts/${id}/transfer`,
    {
      toCohortId: text(form, 'toCohortId'),
      ...(learnerIds.length > 0 ? { learnerIds } : {}),
    },
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Passage impossible.');
  const n = result.data.moved;
  back(
    path,
    'message',
    `${n} élève${n > 1 ? 's sont passés' : ' est passé'} dans la nouvelle classe.`,
  );
}

export async function removeLearnerAction(form: FormData): Promise<void> {
  const id = text(form, 'cohortId');
  const path = `/mon-espace/classes/${id}`;
  const result = await apiSend(
    await token(path),
    'DELETE',
    `/cohorts/${id}/learners/${text(form, 'removeId')}`,
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Retrait impossible.');
  back(path, 'message', 'Élève retiré de la classe.');
}

export interface AddLearnersState {
  error?: string;
  /** Lignes du fichier ou de la liste qui n'ont pas été comprises. */
  skipped?: string[];
  result?: AddLearnersResult;
}

/** Inscrit les élèves de la liste ; les mots de passe reviennent dans l'état, jamais dans l'adresse. */
export async function addLearnersAction(
  _previous: AddLearnersState,
  form: FormData,
): Promise<AddLearnersState> {
  const id = text(form, 'cohortId');
  const file = form.get('file');
  const fromFile = file instanceof File && file.size > 0 ? await file.text() : '';
  const { learners, errors } = parseLearnerList(`${text(form, 'list')}\n${fromFile}`);
  if (learners.length === 0) {
    return {
      error: 'Aucun élève dans la liste. Écris une ligne par élève : Nom ; Prénom.',
      skipped: errors,
    };
  }
  const result = await apiSend<AddLearnersResult>(
    await token(`/mon-espace/classes/${id}`),
    'POST',
    `/cohorts/${id}/learners`,
    { learners },
  );
  if (!result.ok) return { error: result.message ?? 'Inscription impossible.', skipped: errors };
  return { result: result.data, skipped: errors };
}
