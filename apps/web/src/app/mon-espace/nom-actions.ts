'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

/** Enregistre le nom affiché demandé à la première connexion. */
export async function setMyNameAction(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace');
  const result = await apiSend(session.accessToken, 'PUT', '/me/name', {
    displayName: String(form.get('displayName') ?? ''),
  });
  if (!result.ok) {
    redirect(`/mon-espace?erreur=${encodeURIComponent(result.message ?? 'Nom refusé.')}`);
  }
  redirect('/mon-espace');
}
