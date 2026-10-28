import {
  BRANCHES,
  levelLabel,
  type CatalogCourseDetail,
  type CourseProgress,
} from '@lenseignement/types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KeepCourseButton } from '@/components/KeepCourseButton';
import { buttonClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { SpeakButton } from '@/components/SpeakButton';
import { apiGet, publicApiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { enrollAction } from '../actions';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

async function load(id: string) {
  const result = await publicApiGet<CatalogCourseDetail>(
    `/catalog/courses/${encodeURIComponent(id)}`,
  );
  return result.ok ? result.data : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const course = await load((await params).id);
  return { title: course?.title ?? 'Cours introuvable' };
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeZone: 'Africa/Abidjan',
});

export default async function CatalogCoursePage({ params, searchParams }: Props) {
  const course = await load((await params).id);
  if (!course) notFound();
  const branch = BRANCHES.find((b) => b.code === course.branch);
  const query = (await searchParams) ?? {};
  // La fiche reste publique ; la progression ne s'affiche qu'à la personne connectée.
  const session = await getSession();
  const progress = session
    ? await apiGet<CourseProgress>(session.accessToken, `/me/courses/${course.id}/progress`)
    : null;
  const mine = progress?.ok ? progress.data : null;
  const lessonHref = (n: number) => `/catalogue/${course.id}/lecons/${n}`;
  const lessonCount = course.modules.reduce((n, m) => n + m.lessons.length, 0);

  return (
    <article className="space-y-6">
      <Link
        href={`/catalogue?branch=${course.branch}`}
        className="inline-flex min-h-[44px] items-center font-bold"
      >
        ← Catalogue {branch ? `: ${branch.title}` : ''}
      </Link>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mb-2 inline-block rounded-full bg-primary-soft px-3 py-0.5 text-sm font-bold text-primary">
            {(course.level && levelLabel(course.level)) || branch?.title || course.branch}
          </p>
          <h1 className="text-4xl font-extrabold">{course.title}</h1>
        </div>
        <SpeakButton
          text={[
            `${course.title}.`,
            course.summary,
            ...course.modules
              .flatMap((m) => m.lessons)
              .map((l, i) => `Leçon ${i + 1} : ${l.title}.`),
          ].join('\n')}
          lang={course.language}
          label="Écouter la présentation du cours"
        />
      </div>
      <p className="max-w-3xl text-xl text-ink-muted">{course.summary}</p>

      <dl className="grid gap-x-6 gap-y-2 rounded-big border border-line bg-surface p-5 sm:grid-cols-[auto_1fr]">
        <dt className="font-bold">Établissement</dt>
        <dd>{course.organization}</dd>
        <dt className="font-bold">Niveau</dt>
        <dd>{(course.level && levelLabel(course.level)) || 'Tous niveaux'}</dd>
        <dt className="font-bold">Public</dt>
        <dd>{course.audience || '—'}</dd>
        <dt className="font-bold">Durée estimée</dt>
        <dd>{course.estimatedMinutes ? `${course.estimatedMinutes} minutes` : '—'}</dd>
        <dt className="font-bold">Programme</dt>
        <dd>
          {course.curriculum
            ? `${course.curriculum.code}, version ${course.curriculum.label}`
            : 'Aucun'}
        </dd>
        <dt className="font-bold">Licence</dt>
        <dd>{course.licence}</dd>
        <dt className="font-bold">Version</dt>
        <dd>
          {course.versionNumber}, publiée le {dateFormat.format(new Date(course.publishedAt))} après
          relecture
        </dd>
      </dl>

      {course.competencies.length > 0 && (
        <section aria-labelledby="competences">
          <h2 id="competences" className="text-2xl font-extrabold">
            Compétences visées
          </h2>
          <ul className="mt-2 list-disc pl-6">
            {course.competencies.map((c) => (
              <li key={c.code}>{c.title}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="plan" className="space-y-3">
        <h2 id="plan" className="text-2xl font-extrabold">
          Plan du cours
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {mine?.enrolled ? (
            <>
              <p className="w-full font-bold" data-testid="course-progress">
                {mine.completed.length} leçon{mine.completed.length > 1 ? 's' : ''} sur {mine.total}{' '}
                terminée{mine.completed.length > 1 ? 's' : ''}
                {mine.finished ? ' : cours terminé.' : '.'}
              </p>
              {mine.resumeAt && (
                <Link href={lessonHref(mine.resumeAt)} className={buttonClass}>
                  Reprendre : leçon {mine.resumeAt}
                </Link>
              )}
            </>
          ) : (
            course.lessonCount > 0 && (
              <>
                <Link href={lessonHref(1)} className={buttonClass}>
                  Commencer le cours
                </Link>
                {session ? (
                  <form action={enrollAction}>
                    <input type="hidden" name="courseId" value={course.id} />
                    <button type="submit" className={secondaryButtonClass}>
                      Suivre ce cours
                    </button>
                  </form>
                ) : (
                  <Link
                    href={`/auth/login?returnTo=${encodeURIComponent(`/catalogue/${course.id}`)}`}
                    className="inline-flex min-h-[44px] items-center underline"
                  >
                    Se connecter pour enregistrer sa progression
                  </Link>
                )}
              </>
            )
          )}
        </div>
        {lessonCount > 0 && (
          <KeepCourseButton
            paths={[
              `/catalogue/${course.id}`,
              ...Array.from({ length: lessonCount }, (_, i) => lessonHref(i + 1)),
            ]}
          />
        )}
        {course.modules.map((m, i) => (
          <div key={i} className="rounded-big border border-line bg-surface p-5">
            <h3 className="text-xl font-bold">
              Module {i + 1} : {m.title}
            </h3>
            <ol className="mt-2 list-decimal pl-6 marker:font-bold marker:text-primary">
              {m.lessons.map((l, j) => {
                // Rang de la leçon dans tout le cours, comme dans l'adresse du lecteur.
                const rank =
                  course.modules.slice(0, i).reduce((n, prev) => n + prev.lessons.length, 0) +
                  j +
                  1;
                const done = mine?.completed.includes(rank) ?? false;
                return (
                  <li key={j}>
                    <Link
                      href={lessonHref(rank)}
                      className="inline-flex min-h-[44px] items-center font-bold text-ink-strong underline-offset-4 hover:underline"
                    >
                      {l.title}
                    </Link>
                    {l.estimatedMinutes ? ` (${l.estimatedMinutes} min)` : ''}
                    {done && (
                      <span className="font-bold" data-testid="lesson-done">
                        {' '}
                        ✓ <span className="sr-only">Leçon </span>terminée
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </section>
    </article>
  );
}
