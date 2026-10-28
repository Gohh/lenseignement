'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/rejoindre';

export async function joinTeamAction(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  const result = await apiSend<{ organization: string; role: string }>(
    session.accessToken,
    'POST',
    '/team/invitations/redeem',
    { code: String(form.get('code') ?? '').trim() },
  );
  if (!result.ok) {
    redirect(`${PATH}?erreur=${encodeURIComponent(result.message ?? 'Code invalide ou expiré.')}`);
  }
  redirect(
    `${PATH}?message=${encodeURIComponent(`Bienvenue dans l’équipe de ${result.data.organization}.`)}`,
  );
}
