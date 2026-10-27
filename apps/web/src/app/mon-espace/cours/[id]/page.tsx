import type { CourseDetail } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, Notice, param, STATUS_LABELS } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { newVersionAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cours' };

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string | string[] }>;
}

export default async function CoursePage({ params, searchParams }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=/mon-espace/cours/${encodeURIComponent(id)}`);
  const course = await apiGet<CourseDetail>(
    session.accessToken,
    `/authoring/courses/${encodeURIComponent(id)}`,
  );
  const error = param((await searchParams).erreur);

  if (!course.ok) {
    return (
      <section className="space-y-6">
        <Link href="/mon-espace/cours" className="inline-flex min-h-[44px] items-center underline">
          ← Mes cours
        </Link>
        <h1 className="text-3xl font-bold">Accès refusé</h1>
        <p>Ce cours n’existe pas ou ne fait pas partie de vos établissements.</p>
      </section>
    );
  }
  const latest = course.data.versions[0];
  const hasDraft = course.data.versions.some((v) => v.status === 'draft');

  return (
    <section className="space-y-6">
      <Link href="/mon-espace/cours" className="inline-flex min-h-[44px] items-center underline">
        ← Mes cours
      </Link>
      <h1 className="text-3xl font-bold">{latest?.title}</h1>
      <p className="text-ink-muted">{course.data.organization.name}</p>
      <Notice error={error} />

      <div className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-lg font-bold">Versions</h2>
        <ul className="mt-2 space-y-1">
          {course.data.versions.map((v) => (
            <li key={v.id}>
              <Link
                href={`/mon-espace/cours/versions/${v.id}`}
                className="inline-flex min-h-[44px] items-center underline"
              >
                Version {v.number}
              </Link>{' '}
              <span className="text-ink-muted">· {STATUS_LABELS[v.status] ?? v.status}</span>
            </li>
          ))}
        </ul>
      </div>

      {!hasDraft && (
        <form action={newVersionAction}>
          <input type="hidden" name="courseId" value={course.data.id} />
          <button type="submit" className={buttonClass}>
            Créer une nouvelle version
          </button>
        </form>
      )}
    </section>
  );
}
