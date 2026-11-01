'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

// Actions serveur des invitations : le navigateur n'a jamais le jeton, l'API décide des droits.

const PATH = '/mon-espace/invitations';

async function token(): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  return session.accessToken;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function back(kind: 'message' | 'erreur' | 'code', value: string): never {
  redirect(`${PATH}?${kind}=${encodeURIComponent(value)}`);
}

export async function createInvitationAction(form: FormData): Promise<void> {
  const days = Number(text(form, 'days'));
  const result = await apiSend<{ code: string }>(await token(), 'POST', '/team/invitations', {
    organizationId: text(form, 'organizationId'),
    role: text(form, 'role'),
    branches: null,
    ...(Number.isInteger(days) && days > 0 ? { days } : {}),
  });
  if (!result.ok) back('erreur', result.message ?? 'Invitation impossible.');
  back('code', result.data.code);
}

/** Révoque une invitation ; l'identifiant est lié au bouton (le nom du bouton n'est pas transmis). */
export async function revokeInvitationAction(invitationId: string): Promise<void> {
  const result = await apiSend(await token(), 'DELETE', `/team/invitations/${invitationId}`);
  if (!result.ok) back('erreur', result.message ?? 'Révocation impossible.');
  back('message', 'Invitation révoquée : le code ne marche plus.');
}
