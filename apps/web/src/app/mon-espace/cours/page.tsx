import type { AuthoringOrganization, CourseSummary } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, STATUS_LABELS } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes cours' };

export default async function MyCoursesPage() {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/cours');

  const [organizations, courses] = await Promise.all([
    apiGet<{ items: AuthoringOrganization[] }>(session.accessToken, '/authoring/organizations'),
    apiGet<{ items: CourseSummary[] }>(session.accessToken, '/authoring/courses'),
  ]);
  const canAuthor = organizations.ok && organizations.data.items.length > 0;

  return (
    <section className="space-y-6">
      <Link href="/mon-espace" className="inline-flex min-h-[44px] items-center underline">
        ← Retour à mon espace
      </Link>
      <h1 className="text-3xl font-bold">Mes cours</h1>

      {!canAuthor ? (
        <p>
          La rédaction de cours est réservée aux enseignants, formateurs et responsables
          pédagogiques rattachés à un établissement.
        </p>
      ) : (
        <>
          <Link href="/mon-espace/cours/nouveau" className={buttonClass}>
            Créer un cours
          </Link>
          {courses.ok && courses.data.items.length > 0 ? (
            <ul className="space-y-3">
              {courses.data.items.map((course) => (
                <li key={course.id} className="rounded-card border border-line bg-surface p-4">
                  <Link
                    href={`/mon-espace/cours/${course.id}`}
                    className="inline-flex min-h-[44px] items-center text-lg font-bold underline"
                  >
                    {course.latest.title}
                  </Link>
                  <p className="text-sm text-ink-muted">
                    {course.organization.name} · version {course.latest.number} ·{' '}
                    {STATUS_LABELS[course.latest.status] ?? course.latest.status}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p>Aucun cours pour le moment.</p>
          )}
        </>
      )}
    </section>
  );
}
