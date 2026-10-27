'use server';

import type { CourseProgress } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

// Inscription et progression (ADR-009) : l'identité vient de la session, jamais du formulaire.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function token(returnTo: string): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  return session.accessToken;
}

function courseIdOf(form: FormData): string {
  const id = String(form.get('courseId') ?? '');
  if (!UUID.test(id)) redirect('/catalogue');
  return id;
}

function back(path: string, kind: 'message' | 'erreur', value: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(value)}`);
}

export async function enrollAction(form: FormData): Promise<void> {
  const courseId = courseIdOf(form);
  const path = `/catalogue/${courseId}`;
  const result = await apiSend<CourseProgress>(await token(path), 'POST', '/enrollments', {
    courseId,
  });
  if (!result.ok) back(path, 'erreur', result.message ?? 'Inscription impossible.');
  back(path, 'message', 'Vous suivez ce cours. Votre progression sera enregistrée.');
}

/** Leçon terminée, puis leçon suivante (ou retour au plan à la fin du cours). */
export async function completeLessonAction(form: FormData): Promise<void> {
  const courseId = courseIdOf(form);
  const lessonNumber = Number(form.get('lessonNumber'));
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1) redirect(`/catalogue/${courseId}`);
  const path = `/catalogue/${courseId}/lecons/${lessonNumber}`;
  const result = await apiSend<CourseProgress>(
    await token(path),
    'POST',
    '/me/progress/completed',
    {
      courseId,
      lessonNumber,
    },
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Enregistrement impossible.');
  if (result.data.finished) {
    back(`/catalogue/${courseId}`, 'message', 'Bravo, vous avez terminé ce cours !');
  }
  if (lessonNumber < result.data.total)
    redirect(`/catalogue/${courseId}/lecons/${lessonNumber + 1}`);
  redirect(`/catalogue/${courseId}`);
}
