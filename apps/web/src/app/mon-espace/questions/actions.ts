'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/questions';

export async function answerHelpAction(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  const id = String(form.get('id') ?? '');
  const result = await apiSend(
    session.accessToken,
    'POST',
    `/help/questions/${encodeURIComponent(id)}/answer`,
    { answer: String(form.get('answer') ?? '') },
  );
  if (!result.ok) {
    redirect(`${PATH}?erreur=${encodeURIComponent(result.message ?? 'Réponse impossible.')}`);
  }
  redirect(`${PATH}?message=${encodeURIComponent('Réponse envoyée.')}`);
}
