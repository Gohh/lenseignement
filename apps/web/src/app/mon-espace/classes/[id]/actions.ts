'use server';

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
