'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { serverEnv } from '@/lib/env';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/aide';

/** Envoie une photo ou un message vocal choisi dans le formulaire ; vrai si tout est parti. */
async function upload(
  accessToken: string,
  questionId: string,
  kind: 'photo' | 'audio',
  file: FormDataEntryValue | null,
): Promise<boolean> {
  if (!(file instanceof File) || file.size === 0) return true;
  const res = await fetch(
    `${serverEnv().API_INTERNAL_URL}/me/help-questions/${questionId}/attachment/${kind}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': file.type },
      body: Buffer.from(await file.arrayBuffer()),
    },
  ).catch(() => null);
  return res?.ok ?? false;
}

export async function askHelpAction(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  const courseId = String(form.get('courseId') ?? '');
  const lesson = Number(form.get('lessonNumber'));
  const result = await apiSend<{ id: string }>(session.accessToken, 'POST', '/me/help-questions', {
    kind: String(form.get('kind') ?? ''),
    body: String(form.get('body') ?? ''),
    ...(courseId ? { courseId } : {}),
    ...(courseId && Number.isInteger(lesson) && lesson > 0 ? { lessonNumber: lesson } : {}),
  });
  if (!result.ok) {
    redirect(`${PATH}?erreur=${encodeURIComponent(result.message ?? 'Envoi impossible.')}`);
  }
  const photo = await upload(session.accessToken, result.data.id, 'photo', form.get('photo'));
  const audio = await upload(session.accessToken, result.data.id, 'audio', form.get('audio'));
  if (!photo || !audio) {
    redirect(
      `${PATH}?message=${encodeURIComponent('Ta question est envoyée, mais la photo ou la voix n’a pas pu partir. Tu peux écrire plus de détails dans une nouvelle question.')}`,
    );
  }
  redirect(
    `${PATH}?message=${encodeURIComponent('Ta question est envoyée. Une réponse arrive bientôt.')}`,
  );
}
