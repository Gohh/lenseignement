import { TEAM_ROLE_LABELS, type AccountList } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { setAccountStatusAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Comptes' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';

const PROFILE_LABELS: Record<string, string> = {
  apprenant: 'Apprenant',
  parent: 'Parent',
  repetiteur: 'Répétiteur',
};

const ROLE_FILTERS = [
  ...Object.entries(PROFILE_LABELS),
  ...Object.entries(TEAM_ROLE_LABELS),
] as const;

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso));

export default async function ComptesPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/comptes');
  const query = await searchParams;
  const q = param(query.q) ?? '';
  const status = param(query.statut) ?? '';
  const role = param(query.role) ?? '';
  const page = Math.max(1, Number(param(query.page)) || 1);

  const filter = new URLSearchParams();
  if (q) filter.set('search', q);
  if (status === 'active' || status === 'suspended') filter.set('status', status);
  if (role) filter.set('role', role);
  filter.set('page', String(page));
  const result = await apiGet<AccountList>(session.accessToken, `/admin/accounts?${filter}`);
  if (!result.ok) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Comptes</h1>
        <p>Cette page est réservée au superadministrateur et à l’administrateur.</p>
      </section>
    );
  }
  const { items, total, pageSize, canSeeJournal } = result.data;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('statut', status);
    if (role) params.set('role', role);
    params.set('page', String(target));
    return `/mon-espace/comptes?${params}`;
  };
  const here = link(page);

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <p className="font-bold text-ink-muted">Comptes et droits / Comptes</p>
        <h1 className="text-4xl font-extrabold">Comptes</h1>
        <p className="text-ink-muted">
          Toutes les personnes inscrites. Un compte suspendu ne peut plus rien faire sur la
          plateforme, jusqu’à sa réactivation.
          {canSeeJournal && (
            <>
              {' '}
              Chaque changement est noté dans le{' '}
              <a href="/mon-espace/journal">journal des actions</a>.
            </>
          )}
        </p>
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      <form method="get" className={`${cardClass} flex flex-wrap items-end gap-4`}>
        <label className="block flex-1 basis-44 font-bold">
          Rechercher
          <input name="q" defaultValue={q} placeholder="Nom" className={inputClass} />
        </label>
        <label className="block flex-1 basis-36 font-bold">
          Rôle ou profil
          <select name="role" defaultValue={role} className={inputClass}>
            <option value="">Tous</option>
            {ROLE_FILTERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block flex-1 basis-36 font-bold">
          État
          <select name="statut" defaultValue={status} className={inputClass}>
            <option value="">Tous</option>
            <option value="active">Actifs</option>
            <option value="suspended">Suspendus</option>
          </select>
        </label>
        <button type="submit" className={secondaryButtonClass}>
          Filtrer
        </button>
      </form>

      <p className="font-bold" data-testid="account-total">
        {total} compte{total > 1 ? 's' : ''}
      </p>
      <ul className="space-y-3" data-testid="accounts">
        {items.map((a) => (
          <li key={a.id} className={`${cardClass} flex flex-wrap items-center gap-4`}>
            <div className="min-w-0 flex-1 basis-64">
              <p className="font-bold">
                {a.displayName ?? 'Sans nom'}
                {a.status === 'suspended' && (
                  <span className="ml-2 rounded-full bg-line px-3 py-1 text-sm">Suspendu</span>
                )}
              </p>
              <p className="text-sm">
                {[
                  ...a.profiles.map((p) => PROFILE_LABELS[p] ?? p),
                  ...a.roles.map(
                    (r) => `${TEAM_ROLE_LABELS[r.role] ?? r.role} (${r.organization})`,
                  ),
                ].join(' · ') || 'Aucun rôle'}
              </p>
              <p className="text-sm text-ink-muted">
                Inscrit le {formatDate(a.createdAt)}
                {a.lastSeenAt ? ` · vu le ${formatDate(a.lastSeenAt)}` : ' · jamais connecté'}
              </p>
            </div>
            <form action={setAccountStatusAction}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="back" value={here} />
              <input
                type="hidden"
                name="status"
                value={a.status === 'suspended' ? 'active' : 'suspended'}
              />
              <button
                type="submit"
                className={secondaryButtonClass}
                aria-label={`${a.status === 'suspended' ? 'Réactiver' : 'Suspendre'} ${a.displayName ?? 'ce compte'}`}
              >
                {a.status === 'suspended' ? 'Réactiver' : 'Suspendre'}
              </button>
            </form>
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex flex-wrap items-center gap-4">
          {page > 1 && <a href={link(page - 1)}>← Page précédente</a>}
          <span>
            Page {page} sur {pages}
          </span>
          {page < pages && <a href={link(page + 1)}>Page suivante →</a>}
        </nav>
      )}
    </section>
  );
}
