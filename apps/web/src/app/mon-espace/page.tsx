import type { LearningPlanItem } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DeviceDataPanel } from '@/components/DeviceDataPanel';
import { apiGet, type Child, type CohortSummary, type Me } from '@/lib/api';
import { AUTHOR_ROLES, VALIDATOR_ROLES } from '@/lib/roles';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mon espace' };

const ROLE_LABELS: Record<string, string> = {
  apprenant: 'Apprenant',
  parent: 'Parent ou tuteur',
  enseignant: 'Enseignant ou formateur',
  alphabetiseur: 'Alphabétiseur',
  'chef-etablissement': 'Chef d’établissement',
  'referent-pedagogique': 'Référent pédagogique',
  'admin-plateforme': 'Administrateur de la plateforme',
};

const cardClass = 'rounded-big border border-line bg-surface p-5';

export default async function MyspacePage() {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace');

  // Lectures indépendantes : l'API ne renvoie que ce que la personne a le droit de voir.
  const [me, cohorts, children, plan] = await Promise.all([
    apiGet<Me>(session.accessToken, '/me'),
    apiGet<CohortSummary[]>(session.accessToken, '/cohorts'),
    apiGet<Child[]>(session.accessToken, '/me/children'),
    apiGet<{ items: LearningPlanItem[] }>(session.accessToken, '/me/learning-plan'),
  ]);
  const followed = plan.ok ? plan.data.items : [];
  const roles = session.roles.filter((role) => role in ROLE_LABELS);

  return (
    <section className="space-y-6">
      <h1 className="text-4xl font-extrabold">Bonjour, {session.displayName}</h1>

      <div className={cardClass}>
        <h2 className="text-xl font-extrabold">Vos profils</h2>
        {roles.length > 0 ? (
          <ul className="mt-2 list-disc pl-6">
            {roles.map((role) => (
              <li key={role}>{ROLE_LABELS[role]}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2">Aucun profil n’est encore attribué à votre compte.</p>
        )}
        {me.ok && me.data.memberships.length > 0 && (
          <>
            <h3 className="mt-4 font-bold">Vos établissements</h3>
            <ul className="mt-2 list-disc pl-6" data-testid="memberships">
              {me.data.memberships.map((m) => (
                <li key={`${m.organizationId}-${m.role}`}>
                  {m.organizationName} : {ROLE_LABELS[m.role] ?? m.role}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-3 text-sm text-ink-muted" data-testid="api-status">
          {me.ok ? 'Compte reconnu par le service.' : 'Service momentanément indisponible.'}
        </p>
      </div>

      {(followed.length > 0 || session.roles.includes('apprenant')) && (
        <div className={cardClass}>
          <h2 className="text-xl font-extrabold">Mes cours suivis</h2>
          {followed.length > 0 ? (
            <ul className="mt-2 space-y-3" data-testid="learning-plan">
              {followed.map((c) => (
                <li key={c.courseId}>
                  <Link
                    href={`/catalogue/${c.courseId}`}
                    className="inline-flex min-h-[44px] items-center font-bold underline"
                  >
                    {c.title}
                  </Link>
                  <div
                    role="progressbar"
                    aria-label={`Avancement de « ${c.title} »`}
                    aria-valuemin={0}
                    aria-valuemax={c.total}
                    aria-valuenow={c.completed.length}
                    className="my-1 h-3 max-w-sm overflow-hidden rounded-full bg-primary-soft"
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${c.total ? Math.round((c.completed.length / c.total) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <p className="text-ink-muted">
                    {c.finished
                      ? 'Cours terminé.'
                      : `${c.completed.length} leçon${c.completed.length > 1 ? 's' : ''} sur ${c.total} terminée${c.completed.length > 1 ? 's' : ''}.`}
                  </p>
                  {c.resumeAt && (
                    <Link
                      href={`/catalogue/${c.courseId}/lecons/${c.resumeAt}`}
                      className="inline-flex min-h-[44px] items-center underline"
                    >
                      Reprendre : leçon {c.resumeAt}
                      <span className="sr-only"> de « {c.title} »</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2">
              Vous ne suivez encore aucun cours.{' '}
              <Link href="/catalogue" className="inline-flex min-h-[44px] items-center underline">
                Parcourir le catalogue
              </Link>
            </p>
          )}
        </div>
      )}

      {session.roles.includes('apprenant') && (
        <div className={cardClass}>
          <h2 className="text-xl font-extrabold">Lecture</h2>
          <Link
            href="/mon-espace/bilan-lecture"
            className="inline-flex min-h-[44px] items-center font-bold underline"
          >
            Mon bilan de lecture
          </Link>
          <p className="text-ink-muted">
            Quelques questions pour voir ce que tu sais lire, puis un rattrapage adapté.
          </p>
        </div>
      )}

      {session.roles.includes('apprenant') && (
        <div className={cardClass}>
          <h2 className="text-xl font-extrabold">Atelier</h2>
          <Link
            href="/mon-espace/atelier-securite"
            className="inline-flex min-h-[44px] items-center font-bold underline"
          >
            Atelier virtuel : sécurité
          </Link>
          <p className="text-ink-muted">
            Une simulation pour apprendre les gestes sûrs, avant la séance pratique avec ton
            formateur.
          </p>
        </div>
      )}

      {cohorts.ok && cohorts.data.length > 0 && (
        <div className={cardClass}>
          <h2 className="text-xl font-extrabold">Mes classes</h2>
          <ul className="mt-2 space-y-2">
            {cohorts.data.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/mon-espace/classes/${c.id}`}
                  className="inline-flex min-h-[44px] items-center font-bold underline"
                >
                  {c.name}
                </Link>{' '}
                <span className="text-ink-muted">
                  · {c.organization.name} · {c.learnerCount} élève{c.learnerCount > 1 ? 's' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {me.ok && me.data.memberships.some((m) => AUTHOR_ROLES.has(m.role)) && (
        <div className={cardClass}>
          <h2 className="text-xl font-extrabold">Rédaction</h2>
          <ul className="mt-2 space-y-1">
            <li>
              <Link
                href="/mon-espace/cours"
                className="inline-flex min-h-[44px] items-center font-bold underline"
              >
                Mes cours
              </Link>
            </li>
            {me.data.memberships.some((m) => VALIDATOR_ROLES.has(m.role)) && (
              <li>
                <Link
                  href="/mon-espace/relecture"
                  className="inline-flex min-h-[44px] items-center font-bold underline"
                >
                  À relire et à publier
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}

      {me.ok && me.data.memberships.some((m) => VALIDATOR_ROLES.has(m.role)) && (
        <div className={cardClass}>
          <h2 className="text-xl font-extrabold">Pilotage</h2>
          <Link
            href="/mon-espace/statistiques"
            className="inline-flex min-h-[44px] items-center font-bold underline"
          >
            Statistiques anonymes
          </Link>
          <p className="text-ink-muted">
            Des chiffres sur vos structures, sans aucun nom : cours, rattrapage, atelier.
          </p>
        </div>
      )}

      {children.ok && children.data.length > 0 && (
        <div className={cardClass}>
          <h2 className="text-xl font-extrabold">Mes enfants</h2>
          <ul className="mt-2 list-disc pl-6">
            {children.data.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/mon-espace/eleves/${child.id}`}
                  className="inline-flex min-h-[44px] items-center underline"
                >
                  {child.displayName}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={cardClass}>
        <h2 className="text-xl font-extrabold">Cet appareil</h2>
        <DeviceDataPanel />
      </div>

      <form method="post" action="/auth/logout">
        <button
          type="submit"
          className="min-h-[44px] rounded-card border border-line-strong bg-surface px-5 font-bold text-ink"
        >
          Se déconnecter
        </button>
      </form>
    </section>
  );
}
