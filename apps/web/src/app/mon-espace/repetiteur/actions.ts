'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/repetiteur';

export async function redeemCodeAction(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  const result = await apiSend<{ children: number }>(
    session.accessToken,
    'POST',
    '/family/invitations/redeem',
    { code: String(form.get('code') ?? '').trim() },
  );
  if (!result.ok) {
    redirect(`${PATH}?erreur=${encodeURIComponent(result.message ?? 'Code invalide ou expiré.')}`);
  }
  redirect(`${PATH}?message=${encodeURIComponent('Accès accordé.')}`);
}
