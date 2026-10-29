import { randomUUID } from 'node:crypto';
import type { CatalogLesson, CourseProgress, QuizLastAttempt } from '@lenseignement/types';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AudioLessonPlayer } from '@/components/AudioLessonPlayer';
import { CompleteLessonForm } from '@/components/CompleteLessonForm';
import { buttonClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { QuizRunner } from '@/components/QuizRunner';
import { apiGet, apiSend, publicApiGet } from '@/lib/api';
import { ownerOf } from '@/lib/device-owner';
import { getSession } from '@/lib/session';

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

const linkClass =
  'inline-flex min-h-[48px] items-center rounded-card border-2 border-primary-line bg-surface px-5 font-bold text-primary no-underline hover:bg-primary-soft';

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
  // Téléchargement pour le hors-ligne (« Garder ce cours ») : ce n'est pas une ouverture.
  const keeping = (await headers()).get('x-lse-keep') === '1';
  if (session && mine && !keeping) {
    // Mémorise la leçon ouverte pour « Reprendre » ; un échec ne gêne pas la lecture.
    await apiSend(session.accessToken, 'POST', '/me/progress/opened', {
      courseId: lesson.courseId,
      lessonNumber: lesson.number,
    });
  }
  const done = mine?.completed.includes(lesson.number) ?? false;
  // Compte demandé après la première leçon (ADR-018) : la suite est réservée aux comptes. Le
  // téléchargement « Garder ce cours » n'est pas bloqué, pour que le hors ligne reste complet.
  const here = lessonHref(lesson.number);
  const signupHref = `/auth/login?inscription=1&returnTo=${encodeURIComponent(here)}`;
  const loginHref = `/auth/login?returnTo=${encodeURIComponent(here)}`;
  if (!session && lesson.number > 1 && !keeping) {
    return (
      <article className="mx-auto max-w-prose space-y-6">
        <section
          aria-labelledby="gate-title"
          className="space-y-4 rounded-[28px] bg-primary p-6 text-surface sm:p-8"
        >
          <h1 id="gate-title" className="text-3xl font-extrabold !text-surface sm:text-4xl">
            Crée ton compte pour continuer
          </h1>
          <p className="text-lg">
            Tu as terminé la première leçon de « {lesson.courseTitle} ». Avec un compte, ta
            progression et tes résultats sont gardés, et tu peux reprendre où tu en étais.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href={signupHref} className={`${buttonClass} !bg-surface !text-primary`}>
              Créer mon compte
            </a>
            <a
              href={loginHref}
              className={`${secondaryButtonClass} !border-surface !bg-transparent !text-surface`}
            >
              J’ai déjà un compte
            </a>
          </div>
        </section>
        <Link href={lessonHref(1)} className={linkClass}>
          ← Revoir la leçon 1
        </Link>
      </article>
    );
  }
  // Alphabétisation : « écouter d'abord » (cahier §3.1 D, ADR-015) ; l'écoute passe avant le
  // titre, et le texte est plus grand.
  const audioFirst = lesson.branch === 'alphabetisation';
  const player = (
    <AudioLessonPlayer text={`${lesson.title}.\n${lesson.body}`} lang={lesson.language} />
  );
  const last =
    session && mine && lesson.quiz.length > 0
      ? await apiGet<{ attempt: QuizLastAttempt | null }>(
          session.accessToken,
          `/me/quiz-attempts/latest?courseId=${lesson.courseId}&lessonNumber=${lesson.number}`,
        )
      : null;

  return (
    <article className="mx-auto max-w-prose space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/catalogue/${lesson.courseId}`}
          className="inline-flex min-h-[44px] items-center font-bold"
        >
          ← {lesson.courseTitle}
        </Link>
        <div
          role="progressbar"
          aria-label="Avancement dans le cours"
          aria-valuemin={0}
          aria-valuemax={lesson.total}
          aria-valuenow={lesson.number}
          className="ml-auto h-3 w-28 overflow-hidden rounded-full bg-primary-soft sm:w-48"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.round((lesson.number / lesson.total) * 100)}%` }}
          />
        </div>
      </div>
      <Notice error={param(query.erreur)} />
      {audioFirst && player}
      <header className="space-y-1">
        <p className="text-ink-muted">
          Module {lesson.module.number} : {lesson.module.title}
        </p>
        <h1 className="text-3xl font-extrabold sm:text-4xl">{lesson.title}</h1>
        <p className="text-ink-muted" data-testid="lesson-position">
          Leçon {lesson.number} sur {lesson.total}
          {lesson.estimatedMinutes ? ` · environ ${lesson.estimatedMinutes} minutes` : ''}
        </p>
      </header>

      {!audioFirst && player}

      <div
        className={`whitespace-pre-line rounded-big border border-line bg-surface p-5 leading-relaxed sm:p-6 ${audioFirst ? 'text-2xl' : 'text-xl'}`}
        lang={lesson.language}
      >
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
          owner={session && mine ? ownerOf(session.subject) : undefined}
          lang={lesson.language}
        />
      )}

      {session &&
        mine &&
        (done ? (
          <p
            className="rounded-big border-2 border-primary bg-primary-soft p-4 font-bold text-ink-strong"
            data-testid="lesson-status"
          >
            ✓ Leçon terminée
          </p>
        ) : (
          <CompleteLessonForm
            courseId={lesson.courseId}
            lessonNumber={lesson.number}
            owner={ownerOf(session.subject)}
            nextHref={lesson.next ? lessonHref(lesson.next) : `/catalogue/${lesson.courseId}`}
          />
        ))}

      {!session && lesson.number === 1 && lesson.total > 1 && (
        <section
          aria-labelledby="keep-title"
          className="space-y-3 rounded-big border-2 border-primary bg-primary-soft p-5"
        >
          <h2 id="keep-title" className="text-2xl font-extrabold">
            Garde ta progression
          </h2>
          <p>Crée un compte gratuit pour garder tes résultats et continuer le cours.</p>
          <div className="flex flex-wrap gap-3">
            <a href={signupHref} className={buttonClass}>
              Créer mon compte
            </a>
            <a href={loginHref} className={secondaryButtonClass}>
              J’ai déjà un compte
            </a>
          </div>
        </section>
      )}

      {session && (
        <p>
          <Link
            href={`/mon-espace/aide?cours=${lesson.courseId}&lecon=${lesson.number}`}
            className={linkClass}
          >
            🆘 J’ai besoin d’aide pour cette leçon
          </Link>
        </p>
      )}

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
