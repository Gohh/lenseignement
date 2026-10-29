import { levelLabel, type LevelPromotion, type RemediationOverview } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { PlanCard, SkillResults } from '@/components/Remediation';
import { apiGet, type LearnerDetail } from '@/lib/api';
import { READING_DIAGNOSTIC as CODE } from '@/lib/remediation';
import { getSession } from '@/lib/session';
import { decidePromotionAction, overrideRemediationAction } from '../../bilan-lecture/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fiche élève' };

/**
 * Fiche d'un élève (mineur le plus souvent) : lui-même, son parent au lien vérifié ou le personnel
 * de son périmètre. L'API décide ; un refus et un élève inexistant s'affichent de la même façon.
 */
export default async function LearnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=/mon-espace/eleves/${encodeURIComponent(id)}`);

  const learner = await apiGet<LearnerDetail>(
    session.accessToken,
    `/learners/${encodeURIComponent(id)}`,
  );
  const remediation = learner.ok
    ? await apiGet<RemediationOverview>(
        session.accessToken,
        `/learners/${encodeURIComponent(id)}/remediation/${CODE}`,
      )
    : null;

  const promotion = learner.ok
    ? await apiGet<LevelPromotion>(
        session.accessToken,
        `/learners/${encodeURIComponent(id)}/promotion`,
      )
    : null;
  const promo = promotion?.ok ? promotion.data : null;

  return (
    <section className="space-y-6">
      <Link href="/mon-espace" className="inline-flex min-h-[44px] items-center underline">
        ← Retour à mon espace
      </Link>
      {learner.ok ? (
        <>
          <h1 className="text-3xl font-bold">{learner.data.displayName}</h1>
          <Notice message={param(query.message)} error={param(query.erreur)} />
          {promo?.level && (
            <div className="space-y-3 rounded-card border border-line bg-surface p-4">
              <h2 className="text-lg font-bold">Niveau</h2>
              <p data-testid="learner-level">{levelLabel(promo.level) ?? promo.level}</p>
              {promo.canDecide && promo.nextLevel && (
                <form action={decidePromotionAction} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="learnerId" value={id} />
                  {promo.pending && (
                    <p className="w-full font-bold">
                      Une demande de passage en {levelLabel(promo.nextLevel) ?? promo.nextLevel}{' '}
                      attend votre décision.
                    </p>
                  )}
                  <button type="submit" name="decision" value="approve" className={buttonClass}>
                    {promo.pending ? 'Accepter' : 'Passer'} en{' '}
                    {levelLabel(promo.nextLevel) ?? promo.nextLevel}
                  </button>
                  {promo.pending && (
                    <button
                      type="submit"
                      name="decision"
                      value="decline"
                      className={secondaryButtonClass}
                    >
                      Refuser
                    </button>
                  )}
                </form>
              )}
              {!promo.canDecide && promo.pending && <p>Passage au niveau supérieur demandé.</p>}
            </div>
          )}
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
          {remediation?.ok && <ReadingSection learnerId={id} data={remediation.data} />}
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

/** Rattrapage en lecture (ADR-013) : bilan, orientation expliquée, correction par l'enseignant. */
function ReadingSection({ learnerId, data }: { learnerId: string; data: RemediationOverview }) {
  return (
    <div
      className="space-y-4 rounded-card border border-line bg-surface p-4"
      data-testid="learner-reading"
    >
      <h2 className="text-lg font-bold">Rattrapage en lecture</h2>
      {!data.latest ? (
        <p>Pas encore de bilan de lecture.</p>
      ) : (
        <>
          <SkillResults results={data.latest.results} />
          {data.plan ? (
            <PlanCard plan={data.plan} />
          ) : (
            <p className="font-bold">Tout est acquis dans le dernier bilan.</p>
          )}
          {data.postTest && (
            <p>
              Dernier petit test : {data.postTest.score} sur {data.postTest.total}
              {data.postTest.mastered ? ' (acquis).' : '.'}
            </p>
          )}
          {data.canAdjust && (
            <form
              action={overrideRemediationAction}
              className="space-y-3 border-t border-line pt-3"
            >
              <h3 className="font-bold">Corriger l’orientation</h3>
              <input type="hidden" name="learnerId" value={learnerId} />
              <label className="block">
                Compétence à travailler
                <select name="competencyCode" required className={inputClass}>
                  {data.latest.results.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Pourquoi ce choix ? (visible par l’élève et sa famille)
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  maxLength={500}
                  className={inputClass}
                />
              </label>
              <button type="submit" className={secondaryButtonClass}>
                Enregistrer l’orientation
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
