'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/comptes';

/** Suspend ou réactive un compte, puis revient à la même liste (mêmes filtres). */
export async function setAccountStatusAction(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  const id = String(form.get('id') ?? '');
  const status = String(form.get('status') ?? '');
  const back = String(form.get('back') ?? '');
  // Retour à la liste filtrée, sans l'ancien message.
  const path = back.startsWith(`${PATH}?`)
    ? back.replace(/&?(message|erreur)=[^&]*/g, '').replace(/\?$/, '')
    : PATH;
  const result = await apiSend(session.accessToken, 'POST', `/admin/accounts/${id}/status`, {
    status,
  });
  const separator = path.includes('?') ? '&' : '?';
  const notice = result.ok
    ? `message=${encodeURIComponent(status === 'suspended' ? 'Compte suspendu.' : 'Compte réactivé.')}`
    : `erreur=${encodeURIComponent(result.message ?? 'Changement impossible.')}`;
  redirect(`${path}${separator}${notice}`);
}
