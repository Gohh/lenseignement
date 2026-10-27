import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiGet, type CohortDetail } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ma classe' };

export default async function CohortPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=/mon-espace/classes/${encodeURIComponent(id)}`);

  const cohort = await apiGet<CohortDetail>(
    session.accessToken,
    `/cohorts/${encodeURIComponent(id)}`,
  );

  return (
    <section className="space-y-6">
      <Link href="/mon-espace" className="inline-flex min-h-[44px] items-center underline">
        ← Retour à mon espace
      </Link>
      {cohort.ok ? (
        <>
          <h1 className="text-3xl font-bold">{cohort.data.name}</h1>
          <p className="text-ink-muted">
            {cohort.data.organization.name} · année {cohort.data.schoolYear}
          </p>
          <div className="rounded-card border border-line bg-surface p-4">
            <h2 className="text-lg font-bold">Élèves</h2>
            <ul className="mt-2 list-disc pl-6">
              {cohort.data.learners.map((learner) => (
                <li key={learner.id}>
                  <Link
                    href={`/mon-espace/eleves/${learner.id}`}
                    className="inline-flex min-h-[44px] items-center underline"
                  >
                    {learner.displayName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold">Accès refusé</h1>
          <p>Cette classe n’existe pas ou ne fait pas partie de vos classes.</p>
        </>
      )}
    </section>
  );
}
