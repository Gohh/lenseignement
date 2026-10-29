import { BRANCHES, type LearningPlanItem } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiGet, type Child, type CohortSummary, type Me } from '@/lib/api';
import { StaffDashboard } from '@/components/StaffDashboard';
import { topRoleLabel } from '@/components/StaffShell';
import { staffMenu } from '@/lib/space-menu';
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
  gestionnaire: 'Gestionnaire',
  administrateur: 'Administrateur',
  superadministrateur: 'Superadministrateur',
  'admin-plateforme': 'Administrateur de la plateforme',
};

const cardClass = 'rounded-big border border-line bg-surface p-6 sm:p-8';

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
  // Compte neuf, sans profil ni rattachement : on commence par demander qui on est.
  if (
    me.ok &&
    me.data.profiles.length === 0 &&
    me.data.memberships.length === 0 &&
    !session.roles.some((role) => role in ROLE_LABELS)
  ) {
    redirect('/mon-espace/bienvenue');
  }
  // Profils choisis, rôles du jeton et rôles d'équipe reçus par invitation, sans doublon.
  const roles = [
    ...new Set([
      ...session.roles,
      ...(me.ok ? me.data.profiles : []),
      ...(me.ok ? me.data.memberships.map((m) => m.role) : []),
    ]),
  ].filter((role) => role in ROLE_LABELS);
  const resume = followed.find((c) => c.resumeAt && !c.finished);

  const staff = staffMenu(session.roles, me.ok ? me.data : null) !== null;

  return (
    <section className="space-y-10">
      {staff ? (
        <StaffDashboard
          accessToken={session.accessToken}
          displayName={session.displayName}
          roleLabel={topRoleLabel(roles)}
        />
      ) : (
        <div className="space-y-1">
          <p className="font-bold text-ink-muted">
            {(me.ok && me.data.memberships[0]?.organizationName) || 'Mon espace'}
          </p>
          <h1 className="text-4xl font-extrabold">Bonjour, {session.displayName}</h1>
        </div>
      )}

      {resume && (
        <section
          aria-labelledby="reprendre-title"
          className="flex flex-wrap items-center gap-5 rounded-[28px] bg-primary p-6 text-surface"
        >
          <div className="min-w-0 flex-1 basis-72">
            <p id="reprendre-title" className="font-bold">
              Continuer où tu en étais
            </p>
            <p className="font-display text-3xl font-extrabold leading-tight">{resume.title}</p>
            <p>
              {resume.completed.length} leçon{resume.completed.length > 1 ? 's' : ''} sur{' '}
              {resume.total} terminée{resume.completed.length > 1 ? 's' : ''}
            </p>
          </div>
          <Link
            href={`/catalogue/${resume.courseId}/lecons/${resume.resumeAt}`}
            className="inline-flex min-h-[56px] items-center rounded-card bg-surface px-7 font-display text-xl font-bold text-primary no-underline shadow-[0_5px_0_var(--color-primary-dark)]"
          >
            Continuer la leçon {resume.resumeAt}
            <span className="sr-only"> de « {resume.title} »</span>
          </Link>
        </section>
      )}

      <div className="space-y-4">
        {!staff &&
          (roles.length > 0 ? (
            <ul className="flex flex-wrap gap-2" role="list">
              {roles.map((role) => (
                <li
                  key={role}
                  className="rounded-full bg-primary-soft px-4 py-1 font-bold text-primary"
                >
                  {ROLE_LABELS[role]}
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-3">
              <p className="text-ink-muted">Aucun profil n’est encore attribué à votre compte.</p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/mon-espace/bienvenue"
                  className="inline-flex min-h-[44px] items-center rounded-full bg-primary px-5 font-bold text-surface no-underline hover:bg-primary-dark"
                >
                  Choisir mon profil
                </Link>
                <Link
                  href="/mon-espace/rejoindre"
                  className="inline-flex min-h-[44px] items-center rounded-full border border-primary px-5 font-bold text-primary no-underline hover:bg-primary-soft"
                >
                  J’ai un code d’invitation
                </Link>
              </div>
            </div>
          ))}
        {me.ok && me.data.memberships.length > 0 && (
          <ul className="space-y-1 text-ink-muted" data-testid="memberships">
            {me.data.memberships.map((m) => (
              <li key={`${m.organizationId}-${m.role}`}>
                {m.organizationName} : {ROLE_LABELS[m.role] ?? m.role}
              </li>
            ))}
          </ul>
        )}
      </div>

      {(followed.length > 0 || roles.includes('apprenant')) && (
        <div className={cardClass}>
          <h2 className="text-2xl font-extrabold">Mon parcours</h2>
          {followed.length > 0 ? (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2" data-testid="learning-plan">
              {followed.map((c) => (
                <li key={c.courseId} className="rounded-card border border-line p-4">
                  <p className="text-sm font-bold text-ink-muted">
                    {BRANCHES.find((b) => b.code === c.branch)?.title ?? c.branch}
                  </p>
                  <Link
                    href={`/catalogue/${c.courseId}`}
                    className="inline-flex min-h-[44px] items-center font-display text-xl font-bold underline"
                  >
                    {c.title}
                  </Link>
                  <div
                    role="progressbar"
                    aria-label={`Avancement de « ${c.title} »`}
                    aria-valuemin={0}
                    aria-valuemax={c.total}
                    aria-valuenow={c.completed.length}
                    className="my-1 h-3 overflow-hidden rounded-full bg-primary-soft"
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
                      className="inline-flex min-h-[44px] items-center font-bold text-primary underline"
                    >
                      Reprendre : leçon {c.resumeAt}
                      <span className="sr-only"> de « {c.title} »</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 space-y-3">
              <p>Tu ne suis encore aucun cours. Choisis ton premier cours pour commencer.</p>
              <Link
                href="/catalogue"
                className="inline-flex min-h-[48px] items-center rounded-card bg-primary px-6 font-display text-lg font-bold text-surface no-underline hover:bg-primary-dark"
              >
                Choisir un cours
              </Link>
            </div>
          )}
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
    </section>
  );
}
