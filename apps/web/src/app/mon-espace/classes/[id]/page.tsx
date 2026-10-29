import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { CohortRosterTools } from '@lenseignement/types';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet, type CohortDetail } from '@/lib/api';
import { getSession } from '@/lib/session';
import { removeLearnerAction, transferLearnersAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ma classe' };

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CohortPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=/mon-espace/classes/${encodeURIComponent(id)}`);

  const cohort = await apiGet<CohortDetail>(
    session.accessToken,
    `/cohorts/${encodeURIComponent(id)}`,
  );

  // Outils réservés à la direction : l'API répond « introuvable » aux autres.
  const tools = await apiGet<CohortRosterTools>(
    session.accessToken,
    `/cohorts/${encodeURIComponent(id)}/roster-tools`,
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
          <Notice
            message={param(query.message as string | undefined)}
            error={param(query.erreur as string | undefined)}
          />
          <div className="rounded-card border border-line bg-surface p-4">
            <h2 className="text-lg font-bold">Élèves</h2>
            {tools.ok ? (
              <form action={transferLearnersAction} className="mt-2 space-y-4">
                <input type="hidden" name="cohortId" value={id} />
                <ul className="space-y-1" role="list" data-testid="roster">
                  {cohort.data.learners.map((learner) => (
                    <li key={learner.id} className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex min-h-[44px] items-center gap-2">
                        <input type="checkbox" name="learnerId" value={learner.id} />
                        <span>{learner.displayName}</span>
                      </label>
                      <Link
                        href={`/mon-espace/eleves/${learner.id}`}
                        className="inline-flex min-h-[44px] items-center underline"
                      >
                        Voir<span className="sr-only"> {learner.displayName}</span>
                      </Link>
                      <button
                        type="submit"
                        formAction={removeLearnerAction}
                        name="removeId"
                        value={learner.id}
                        className={secondaryButtonClass}
                      >
                        Retirer<span className="sr-only"> {learner.displayName}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {tools.data.targets.length > 0 ? (
                  <div className="space-y-2 rounded-card border border-line p-3">
                    <p className="font-bold">Passage de classe</p>
                    <p className="text-ink-muted">
                      Coche les élèves à faire passer, ou ne coche personne pour faire passer toute
                      la classe.
                    </p>
                    <label className="block font-bold">
                      Nouvelle classe
                      <select name="toCohortId" className={inputClass} required>
                        {tools.data.targets.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.schoolYear}){t.levelLabel ? ` · ${t.levelLabel}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className={buttonClass}>
                      Faire passer
                    </button>
                  </div>
                ) : (
                  <p className="text-ink-muted">
                    Crée d’abord la classe suivante pour pouvoir y faire passer les élèves.
                  </p>
                )}
              </form>
            ) : (
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
            )}
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
