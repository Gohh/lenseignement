import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiGet, type LearnerDetail } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fiche élève' };

/**
 * Fiche d'un élève (mineur le plus souvent) : lui-même, son parent au lien vérifié ou le personnel
 * de son périmètre. L'API décide ; un refus et un élève inexistant s'affichent de la même façon.
 */
export default async function LearnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=/mon-espace/eleves/${encodeURIComponent(id)}`);

  const learner = await apiGet<LearnerDetail>(
    session.accessToken,
    `/learners/${encodeURIComponent(id)}`,
  );

  return (
    <section className="space-y-6">
      <Link href="/mon-espace" className="inline-flex min-h-[44px] items-center underline">
        ← Retour à mon espace
      </Link>
      {learner.ok ? (
        <>
          <h1 className="text-3xl font-bold">{learner.data.displayName}</h1>
          <div className="rounded-card border border-line bg-surface p-4">
            <h2 className="text-lg font-bold">Classes</h2>
            {learner.data.cohorts.length > 0 ? (
              <ul className="mt-2 list-disc pl-6" data-testid="learner-cohorts">
                {learner.data.cohorts.map((c) => (
                  <li key={c.id}>
                    {c.name} · année {c.schoolYear}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2">Aucune classe pour l’instant.</p>
            )}
          </div>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold">Accès refusé</h1>
          <p>Cette fiche n’existe pas ou vous n’avez pas le droit de la consulter.</p>
        </>
      )}
    </section>
  );
}
