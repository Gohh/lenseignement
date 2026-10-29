import {
  ACCOUNT_PROFILES,
  LEVEL_GROUPS,
  levelLabel,
  TEAM_ROLE_LABELS,
  type AccountList,
  type TeamOverview,
} from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { Dialog } from '../configuration/Dialog';
import { CreateAccount } from '../equipe/CreateAccount';
import { deleteAccountAction, setAccountStatusAction, updateAccountAction } from './actions';
import { ImportAccounts } from './ImportAccounts';

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
  const [result, team, accountStatus] = await Promise.all([
    apiGet<AccountList>(session.accessToken, `/admin/accounts?${filter}`),
    apiGet<TeamOverview>(session.accessToken, '/team'),
    apiGet<{ configured: boolean }>(session.accessToken, '/team/accounts/status'),
  ]);
  const configured = accountStatus.ok && accountStatus.data.configured;
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
          plateforme, jusqu’à sa réactivation. Un compte jamais utilisé peut être supprimé.
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

      <div className="flex flex-wrap gap-3">
        {team.ok && (
          <Dialog primary label="+ Créer un compte" title="Créer un compte">
            <CreateAccount
              organizations={team.data.organizations}
              grantable={team.data.grantable}
              configured={configured}
            />
          </Dialog>
        )}
        <Dialog label="Importer (tableau)" title="Importer des comptes">
          <ImportAccounts configured={configured} />
        </Dialog>
      </div>

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
                {a.level ? `${levelLabel(a.level) ?? a.level} · ` : ''}
                Inscrit le {formatDate(a.createdAt)}
                {a.lastSeenAt ? ` · vu le ${formatDate(a.lastSeenAt)}` : ' · jamais connecté'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Dialog label="Modifier" title={`Modifier : ${a.displayName ?? 'compte sans nom'}`}>
                <form action={updateAccountAction} className="space-y-4">
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="back" value={here} />
                  <label className="block font-bold">
                    Nom affiché
                    <input
                      name="displayName"
                      required
                      defaultValue={a.displayName ?? ''}
                      className={inputClass}
                    />
                  </label>
                  <fieldset>
                    <legend className="font-bold">Profils</legend>
                    {ACCOUNT_PROFILES.map((p) => (
                      <label key={p} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          name="profiles"
                          value={p}
                          defaultChecked={a.profiles.includes(p)}
                          className="h-5 w-5"
                        />
                        {PROFILE_LABELS[p]}
                      </label>
                    ))}
                  </fieldset>
                  <label className="block font-bold">
                    Niveau (pour un apprenant)
                    <select name="level" defaultValue={a.level ?? ''} className={inputClass}>
                      <option value="">Aucun</option>
                      {LEVEL_GROUPS.map((g) => (
                        <optgroup key={g.code} label={g.title}>
                          {g.levels.map((l) => (
                            <option key={l.code} value={l.code}>
                              {l.title}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <p className="text-sm text-ink-muted">
                    Les rôles d’équipe (enseignant, direction…) se changent dans « Équipe et
                    invitations ».
                  </p>
                  <button type="submit" className={buttonClass}>
                    Enregistrer
                  </button>
                </form>
              </Dialog>
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
              {!a.lastSeenAt && (
                <form action={deleteAccountAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="back" value={here} />
                  <button
                    type="submit"
                    className={secondaryButtonClass}
                    aria-label={`Supprimer ${a.displayName ?? 'ce compte'}`}
                  >
                    Supprimer
                  </button>
                </form>
              )}
            </div>
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
