'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

// Actions serveur de la famille : le navigateur n'a jamais le jeton, l'API décide des droits.

const PATH = '/mon-espace/famille';

async function token(): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  return session.accessToken;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function back(kind: 'message' | 'erreur' | 'code', value: string): never {
  redirect(`${PATH}?${kind}=${encodeURIComponent(value)}`);
}

export async function addChildAction(form: FormData): Promise<void> {
  const level = text(form, 'level');
  const result = await apiSend(await token(), 'POST', '/family/children', {
    displayName: text(form, 'displayName'),
    ...(level ? { level } : {}),
  });
  if (!result.ok) back('erreur', result.message ?? 'Ajout impossible.');
  back('message', 'Enfant ajouté.');
}

export async function linkChildAction(form: FormData): Promise<void> {
  const result = await apiSend<{ displayName: string | null }>(
    await token(),
    'POST',
    '/family/children/link',
    { code: text(form, 'code') },
  );
  if (!result.ok) back('erreur', result.message ?? 'Code parent refusé.');
  back(
    'message',
    `C’est fait : vous suivez maintenant ${result.data.displayName ?? 'votre enfant'}.`,
  );
}

export async function inviteTutorAction(form: FormData): Promise<void> {
  const learnerIds = form.getAll('learnerId').map(String);
  const result = await apiSend<{ code: string }>(await token(), 'POST', '/family/invitations', {
    learnerIds,
  });
  if (!result.ok) back('erreur', result.message ?? 'Invitation impossible.');
  back('code', result.data.code);
}

export async function revokeTutorAction(form: FormData): Promise<void> {
  const linkId = text(form, 'linkId');
  const result = await apiSend(await token(), 'DELETE', `/family/tutors/${linkId}`);
  if (!result.ok) back('erreur', result.message ?? 'Retrait impossible.');
  back('message', 'Accès retiré.');
}
