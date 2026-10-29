'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/bibliotheque';

async function token(): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  return session.accessToken;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function back(kind: 'message' | 'erreur', value: string, suffix = ''): never {
  redirect(`${PATH}?${kind}=${encodeURIComponent(value)}${suffix}`);
}

export async function addResourceAction(form: FormData): Promise<void> {
  const result = await apiSend(
    await token(),
    'POST',
    `/cohorts/${text(form, 'cohortId')}/resources`,
    {
      title: text(form, 'title'),
      description: text(form, 'description'),
      url: text(form, 'url'),
      kind: text(form, 'kind') || 'lien',
    },
  );
  // En cas d'erreur, la fenêtre d'ajout se rouvre.
  if (!result.ok) back('erreur', result.message ?? 'Ajout impossible.', '&ouvrir=ressource');
  back('message', 'Ressource ajoutée. Les élèves de la classe la voient dans la bibliothèque.');
}

export async function removeResourceAction(form: FormData): Promise<void> {
  const result = await apiSend(await token(), 'DELETE', `/resources/${text(form, 'id')}`);
  if (!result.ok) back('erreur', result.message ?? 'Retrait impossible.');
  back('message', 'Ressource retirée.');
}
