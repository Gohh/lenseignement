'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/compte';

export async function setLevelAction(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  const level = String(form.get('level') ?? '');
  const next = String(form.get('next') ?? '');
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '';
  // Une erreur garde l'étape d'accueil (bienvenue + suite) pour qu'on puisse corriger son choix.
  const failure = (message: string): never =>
    redirect(
      `${PATH}?erreur=${encodeURIComponent(message)}${safeNext ? `&bienvenue=1&next=${encodeURIComponent(safeNext)}` : ''}`,
    );
  if (!level) failure('Choisissez un niveau.');
  const result = await apiSend(session.accessToken, 'PUT', '/me/level', { level });
  if (!result.ok) failure(result.message ?? 'Enregistrement impossible.');
  redirect(safeNext || `${PATH}?message=${encodeURIComponent('Niveau enregistré.')}`);
}

export async function requestPromotionAction(): Promise<void> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  const result = await apiSend<{ status: 'pending' | 'applied'; level: string }>(
    session.accessToken,
    'POST',
    '/me/level-request',
  );
  if (!result.ok) {
    redirect(`${PATH}?erreur=${encodeURIComponent(result.message ?? 'Demande impossible.')}`);
  }
  const message =
    result.data.status === 'applied'
      ? 'Tu passes au niveau supérieur.'
      : 'Demande envoyée. Ton parent ou ton enseignant va la valider.';
  redirect(`${PATH}?message=${encodeURIComponent(message)}`);
}
