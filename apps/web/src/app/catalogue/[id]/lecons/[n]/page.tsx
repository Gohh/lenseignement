import type { CatalogLesson } from '@lenseignement/types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AudioLessonPlayer } from '@/components/AudioLessonPlayer';
import { publicApiGet } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string; n: string }>;
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
export default async function LessonPage({ params }: Props) {
  const lesson = await load(await params);
  if (!lesson) notFound();
  const lessonHref = (n: number) => `/catalogue/${lesson.courseId}/lecons/${n}`;

  return (
    <article className="mx-auto max-w-prose space-y-6">
      <Link
        href={`/catalogue/${lesson.courseId}`}
        className="inline-flex min-h-[44px] items-center underline"
      >
        ← {lesson.courseTitle}
      </Link>
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
