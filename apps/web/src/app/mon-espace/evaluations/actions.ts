'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/evaluations';

async function token(): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  return session.accessToken;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function back(kind: 'message' | 'erreur', value: string, path = PATH, suffix = ''): never {
  redirect(`${path}?${kind}=${encodeURIComponent(value)}${suffix}`);
}

export async function createEvaluationAction(form: FormData): Promise<void> {
  const result = await apiSend(
    await token(),
    'POST',
    `/cohorts/${text(form, 'cohortId')}/evaluations`,
    {
      title: text(form, 'title'),
      subject: text(form, 'subject'),
      heldOn: text(form, 'heldOn'),
      maxScore: Number(text(form, 'maxScore')) || 20,
      coefficient: Number(text(form, 'coefficient')) || 1,
    },
  );
  // En cas d'erreur, la fenêtre de création se rouvre.
  if (!result.ok)
    back('erreur', result.message ?? 'Création impossible.', PATH, '&ouvrir=evaluation');
  back('message', 'Évaluation créée. Ouvre « Saisir les notes » pour remplir le carnet.');
}

export async function deleteEvaluationAction(form: FormData): Promise<void> {
  const result = await apiSend(await token(), 'DELETE', `/evaluations/${text(form, 'id')}`);
  if (!result.ok) back('erreur', result.message ?? 'Suppression impossible.');
  back('message', 'Évaluation supprimée.');
}

export async function saveScoresAction(form: FormData): Promise<void> {
  const id = text(form, 'evaluationId');
  const path = `${PATH}/${id}`;
  const scores = form
    .getAll('learnerId')
    .map(String)
    .map((learnerId) => {
      const raw = text(form, `score-${learnerId}`).replace(',', '.');
      return {
        learnerId,
        score: raw === '' ? null : Number(raw),
        comment: text(form, `comment-${learnerId}`),
      };
    });
  if (scores.some((s) => s.score !== null && Number.isNaN(s.score))) {
    back('erreur', 'Une note n’est pas un nombre.', path);
  }
  const result = await apiSend(await token(), 'PUT', `/evaluations/${id}/scores`, { scores });
  if (!result.ok) back('erreur', result.message ?? 'Enregistrement impossible.', path);
  back('message', 'Notes enregistrées.', path);
}
