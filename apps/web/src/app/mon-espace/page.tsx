import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiGet, type Child, type CohortSummary, type Me } from '@/lib/api';
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

const cardClass = 'rounded-card border border-line bg-surface p-4';

export default async function MyspacePage() {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace');

  // Trois lectures indépendantes : l'API ne renvoie que ce que la personne a le droit de voir.
  const [me, cohorts, children] = await Promise.all([
    apiGet<Me>(session.accessToken, '/me'),
    apiGet<CohortSummary[]>(session.accessToken, '/cohorts'),
    apiGet<Child[]>(session.accessToken, '/me/children'),
  ]);
  const roles = session.roles.filter((role) => role in ROLE_LABELS);

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Bonjour, {session.displayName}</h1>

      <div className={cardClass}>
        <h2 className="text-lg font-bold">Vos profils</h2>
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

      {cohorts.ok && cohorts.data.length > 0 && (
        <div className={cardClass}>
          <h2 className="text-lg font-bold">Mes classes</h2>
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

      {children.ok && children.data.length > 0 && (
        <div className={cardClass}>
          <h2 className="text-lg font-bold">Mes enfants</h2>
          <ul className="mt-2 list-disc pl-6">
            {children.data.map((child) => (
              <li key={child.id}>{child.displayName}</li>
            ))}
          </ul>
        </div>
      )}

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
