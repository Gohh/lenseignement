'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/messages';

async function token(): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  return session.accessToken;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function back(kind: 'message' | 'erreur', value: string, path = PATH, suffix = ''): never {
  redirect(`${path}?${kind}=${encodeURIComponent(value)}${suffix}`);
}

export async function startConversationAction(form: FormData): Promise<void> {
  // Le choix « enfant|personne » tient dans un seul champ de liste.
  const [learnerId, otherUserId] = text(form, 'contact').split('|');
  const result = await apiSend<{ id: string }>(await token(), 'POST', '/conversations', {
    learnerId,
    otherUserId,
    body: text(form, 'body'),
  });
  if (!result.ok) back('erreur', result.message ?? 'Envoi impossible.', PATH, '&ouvrir=nouveau');
  redirect(`${PATH}/${result.data.id}?message=${encodeURIComponent('Message envoyé.')}`);
}

export async function sendMessageAction(form: FormData): Promise<void> {
  const id = text(form, 'conversationId');
  const path = `${PATH}/${id}`;
  const result = await apiSend(await token(), 'POST', `/conversations/${id}/messages`, {
    body: text(form, 'body'),
  });
  if (!result.ok) back('erreur', result.message ?? 'Envoi impossible.', path);
  back('message', 'Message envoyé.', path);
}
