'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/compte';

export async function setLevelAction(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  const level = String(form.get('level') ?? '');
  if (!level) redirect(`${PATH}?erreur=${encodeURIComponent('Choisissez un niveau.')}`);
  const result = await apiSend(session.accessToken, 'PUT', '/me/level', { level });
  if (!result.ok) {
    redirect(
      `${PATH}?erreur=${encodeURIComponent(result.message ?? 'Enregistrement impossible.')}`,
    );
  }
  const next = String(form.get('next') ?? '');
  redirect(
    next.startsWith('/') && !next.startsWith('//')
      ? next
      : `${PATH}?message=${encodeURIComponent('Niveau enregistré.')}`,
  );
}
