import { randomUUID } from 'node:crypto';
import type { CatalogLesson, CourseProgress, QuizLastAttempt } from '@lenseignement/types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AudioLessonPlayer } from '@/components/AudioLessonPlayer';
import { buttonClass, Notice, param } from '@/components/Notice';
import { QuizRunner } from '@/components/QuizRunner';
import { apiGet, apiSend, publicApiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { completeLessonAction } from '../../../actions';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string; n: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

async function load({ id, n }: { id: string; n: string }) {
  const result = await publicApiGet<CatalogLesson>(
    `/catalog/courses/${encodeURIComponent(id)}/lessons/${encodeURIComponent(n)}`,
  );
  return result.ok ? result.data : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lesson = await load(await params);
  return { title: lesson ? `${lesson.title} · ${lesson.courseTitle}` : 'Leçon introuvable' };
}

const linkClass = 'inline-flex min-h-[44px] items-center font-bold underline';

/** Lecteur de leçon : texte lisible et écoute, sans connexion (ADR-008). */
export default async function LessonPage({ params, searchParams }: Props) {
  const lesson = await load(await params);
  if (!lesson) notFound();
  const lessonHref = (n: number) => `/catalogue/${lesson.courseId}/lecons/${n}`;
  const query = (await searchParams) ?? {};

  // Lecture libre ; la progression n'est suivie que pour une personne inscrite (ADR-009).
  const session = await getSession();
  const progress = session
    ? await apiGet<CourseProgress>(session.accessToken, `/me/courses/${lesson.courseId}/progress`)
    : null;
  const mine = progress?.ok && progress.data.enrolled ? progress.data : null;
  if (session && mine) {
    // Mémorise la leçon ouverte pour « Reprendre » ; un échec ne gêne pas la lecture.
    await apiSend(session.accessToken, 'POST', '/me/progress/opened', {
      courseId: lesson.courseId,
      lessonNumber: lesson.number,
    });
  }
  const done = mine?.completed.includes(lesson.number) ?? false;
  const last =
    session && mine && lesson.quiz.length > 0
      ? await apiGet<{ attempt: QuizLastAttempt | null }>(
          session.accessToken,
          `/me/quiz-attempts/latest?courseId=${lesson.courseId}&lessonNumber=${lesson.number}`,
        )
      : null;

  return (
    <article className="mx-auto max-w-prose space-y-6">
      <Link
        href={`/catalogue/${lesson.courseId}`}
        className="inline-flex min-h-[44px] items-center underline"
      >
        ← {lesson.courseTitle}
      </Link>
      <Notice error={param(query.erreur)} />
      <header className="space-y-1">
        <p className="text-ink-muted">
          Module {lesson.module.number} : {lesson.module.title}
        </p>
        <h1 className="text-3xl font-bold">{lesson.title}</h1>
        <p className="text-ink-muted" data-testid="lesson-position">
          Leçon {lesson.number} sur {lesson.total}
          {lesson.estimatedMinutes ? ` · environ ${lesson.estimatedMinutes} minutes` : ''}
        </p>
      </header>

      <AudioLessonPlayer text={`${lesson.title}.\n${lesson.body}`} lang={lesson.language} />

      <div className="whitespace-pre-line text-xl leading-relaxed" lang={lesson.language}>
        {lesson.body}
      </div>

      {lesson.quiz.length > 0 && (
        <QuizRunner
          courseId={lesson.courseId}
          lessonNumber={lesson.number}
          questions={lesson.quiz}
          mode={mine ? 'attempt' : 'check'}
          attemptId={randomUUID()}
          last={last?.ok ? last.data.attempt : null}
        />
      )}

      {mine &&
        (done ? (
          <p
            className="rounded-card border border-line-strong bg-surface p-4 font-bold"
            data-testid="lesson-status"
          >
            ✓ Leçon terminée
          </p>
        ) : (
          <form action={completeLessonAction}>
            <input type="hidden" name="courseId" value={lesson.courseId} />
            <input type="hidden" name="lessonNumber" value={lesson.number} />
            <button type="submit" className={buttonClass}>
              J’ai terminé cette leçon
            </button>
          </form>
        ))}

      <nav
        aria-label="Leçons du cours"
        className="flex flex-wrap justify-between gap-4 border-t border-line pt-4"
      >
        {lesson.previous ? (
          <Link href={lessonHref(lesson.previous)} rel="prev" className={linkClass}>
            ← Leçon précédente
          </Link>
        ) : (
          <span />
        )}
        {lesson.next ? (
          <Link href={lessonHref(lesson.next)} rel="next" className={linkClass}>
            Leçon suivante →
          </Link>
        ) : (
          <Link href={`/catalogue/${lesson.courseId}`} className={linkClass}>
            Fin du cours : retour au plan
          </Link>
        )}
      </nav>
    </article>
  );
}
