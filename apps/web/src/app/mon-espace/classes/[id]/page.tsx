import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { CohortRosterTools } from '@lenseignement/types';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet, type CohortDetail } from '@/lib/api';
import { getSession } from '@/lib/session';
import { Dialog } from '../../configuration/Dialog';
import { removeLearnerAction, renewParentCodeAction, transferLearnersAction } from './actions';
import { AddLearners } from './AddLearners';

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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Élèves</h2>
              {tools.ok && (
                <Dialog label="+ Inscrire des élèves" title="Inscrire des élèves" primary>
                  <AddLearners cohortId={id} configured={tools.data.canCreateAccounts} />
                </Dialog>
              )}
            </div>
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
                      <ParentCode
                        learnerId={learner.id}
                        name={learner.displayName ?? 'cet élève'}
                        info={tools.data.parents.find((p) => p.learnerId === learner.id)}
                      />
                      <button
                        type="submit"
                        formAction={removeLearnerAction.bind(null, learner.id)}
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

/** Code parent d'un élève, à remettre au parent, et bouton pour en donner un nouveau. */
function ParentCode({
  learnerId,
  name,
  info,
}: {
  learnerId: string;
  name: string;
  info: CohortRosterTools['parents'][number] | undefined;
}) {
  const linked = info?.linked ?? 0;
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm" data-testid="parent-code">
      <span>
        Code parent : <strong className="tracking-widest">{info?.code ?? 'aucun'}</strong> ·{' '}
        {linked === 0
          ? 'aucun parent relié'
          : `${linked} parent${linked > 1 ? 's' : ''} relié${linked > 1 ? 's' : ''}`}
      </span>
      <button
        type="submit"
        formAction={renewParentCodeAction.bind(null, learnerId)}
        formNoValidate
        className="inline-flex min-h-[44px] items-center font-bold underline"
      >
        {info?.code ? 'Nouveau code' : 'Créer le code'}
        <span className="sr-only"> parent de {name}</span>
      </button>
    </span>
  );
}
