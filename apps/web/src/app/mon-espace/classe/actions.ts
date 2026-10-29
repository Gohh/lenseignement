'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/classe';

async function token(): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  return session.accessToken;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function back(kind: 'message' | 'erreur', value: string, suffix = ''): never {
  redirect(`${PATH}?${kind}=${encodeURIComponent(value)}${suffix}`);
}

export async function createSessionAction(form: FormData): Promise<void> {
  // Le Côte d'Ivoire est à l'heure de Greenwich toute l'année : l'heure saisie est l'heure UTC.
  const startsAt = `${text(form, 'startsAt')}:00Z`;
  const result = await apiSend(
    await token(),
    'POST',
    `/cohorts/${text(form, 'cohortId')}/sessions`,
    {
      title: text(form, 'title'),
      ...(text(form, 'subject') ? { subject: text(form, 'subject') } : {}),
      startsAt,
      durationMinutes: Number(text(form, 'durationMinutes')),
    },
  );
  // En cas d'erreur, la fenêtre de programmation se rouvre.
  if (!result.ok) back('erreur', result.message ?? 'Programmation impossible.', '&ouvrir=seance');
  back('message', 'Séance programmée. Les élèves de la classe la voient dans « Ma classe ».');
}

export async function updateSessionAction(form: FormData): Promise<void> {
  const result = await apiSend(await token(), 'PATCH', `/class-sessions/${text(form, 'id')}`, {
    summary: text(form, 'summary'),
    resourceUrl: text(form, 'resourceUrl'),
  });
  if (!result.ok) back('erreur', result.message ?? 'Enregistrement impossible.');
  back('message', 'Résumé enregistré.');
}

export async function deleteSessionAction(form: FormData): Promise<void> {
  const result = await apiSend(await token(), 'DELETE', `/class-sessions/${text(form, 'id')}`);
  if (!result.ok) back('erreur', result.message ?? 'Annulation impossible.');
  back('message', 'Séance annulée.');
}
