'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/aide';

export async function askHelpAction(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  const courseId = String(form.get('courseId') ?? '');
  const lesson = Number(form.get('lessonNumber'));
  const result = await apiSend(session.accessToken, 'POST', '/me/help-questions', {
    kind: String(form.get('kind') ?? ''),
    body: String(form.get('body') ?? ''),
    ...(courseId ? { courseId } : {}),
    ...(courseId && Number.isInteger(lesson) && lesson > 0 ? { lessonNumber: lesson } : {}),
  });
  if (!result.ok) {
    redirect(`${PATH}?erreur=${encodeURIComponent(result.message ?? 'Envoi impossible.')}`);
  }
  redirect(
    `${PATH}?message=${encodeURIComponent('Ta question est envoyée. Une réponse arrive bientôt.')}`,
  );
}
