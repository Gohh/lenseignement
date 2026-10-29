import {
  ORGANIZATION_TYPE_LABELS,
  type OrganizationListItem,
  type TeamOverview,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { createOrganizationAction } from './actions';
import { ImportOrganizations } from './ImportOrganizations';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Configuration' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';

export default async function ConfigurationPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/configuration');
  const query = await searchParams;
  const code = param(query.code);
  const q = param(query.q) ?? '';
  const direction = param(query.direction) ?? '';
  const type = param(query.type) ?? '';
  const archived = param(query.archives) === '1';

  const filter = new URLSearchParams();
  if (q) filter.set('search', q);
  if (direction) filter.set('direction', direction);
  if (type) filter.set('type', type);
  if (archived) filter.set('archived', '1');
  const [list, overview] = await Promise.all([
    apiGet<{ items: OrganizationListItem[] }>(
      session.accessToken,
      `/organizations${filter.size ? `?${filter}` : ''}`,
    ),
    apiGet<TeamOverview>(session.accessToken, '/team'),
  ]);
  if (!list.ok) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Configuration</h1>
        <p>Cette page est réservée à la direction, aux gestionnaires et aux administrateurs.</p>
      </section>
    );
  }
  const team: TeamOverview = overview.ok
    ? overview.data
    : {
        organizations: [],
        members: [],
        grantable: [],
        canCreateOrganization: false,
        everywhere: false,
        directions: [],
      };
  const items = list.data.items;

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Configuration</h1>
      <p>
        Les établissements et les directions régionales que vous gérez. Ce que vous créez ici
        apparaît ensuite dans les listes des autres écrans.
      </p>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      {code && (
        <div className="rounded-big border-2 border-primary bg-primary-soft p-5" role="status">
          <h2 className="text-xl font-bold">Code d’invitation du responsable</h2>
          <p className="mt-2 text-4xl font-bold tracking-widest" data-testid="invitation-code">
            {code}
          </p>
          <p className="mt-2">
            À donner au responsable de l’établissement : il le saisit dans « Mon compte », puis «
            Rejoindre une équipe ». Il est valable 7 jours et sert une seule fois.
          </p>
        </div>
      )}

      <form method="get" className={`${cardClass} space-y-4`}>
        <h2 className="text-xl font-bold">Établissements</h2>
        <label className="block font-bold">
          Rechercher
          <input
            name="q"
            defaultValue={q}
            placeholder="Nom, localité ou responsable"
            className={inputClass}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block font-bold">
            Direction régionale
            <select name="direction" defaultValue={direction} className={inputClass}>
              <option value="">Toutes</option>
              {team.directions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-bold">
            Type
            <select name="type" defaultValue={type} className={inputClass}>
              <option value="">Tous</option>
              {Object.entries(ORGANIZATION_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex min-h-[44px] items-center gap-3">
          <input
            type="checkbox"
            name="archives"
            value="1"
            defaultChecked={archived}
            className="h-6 w-6 accent-primary"
          />
          Voir les établissements archivés
        </label>
        <button type="submit" className={secondaryButtonClass}>
          Filtrer
        </button>
      </form>

      <div className={cardClass}>
        <h2 className="text-xl font-bold">
          {archived ? 'Archivés' : 'Actifs'} ({items.length})
        </h2>
        {items.length === 0 ? (
          <p className="mt-2">Aucun établissement ne correspond.</p>
        ) : (
          <ul className="mt-3 space-y-3" role="list" data-testid="organization-list">
            {items.map((o) => (
              <li key={o.id} className="rounded-card border border-line p-4">
                <Link
                  href={`/mon-espace/configuration/etablissements/${o.id}`}
                  className="inline-flex min-h-[44px] items-center text-lg font-bold underline"
                >
                  {o.name}
                </Link>
                <p className="text-ink-muted">
                  {ORGANIZATION_TYPE_LABELS[o.type as keyof typeof ORGANIZATION_TYPE_LABELS] ??
                    o.type}
                  {o.direction ? ` · ${o.direction.name}` : ''}
                  {o.locality ? ` · ${o.locality}` : ''}
                </p>
                {o.managerName && <p className="text-ink-muted">Responsable : {o.managerName}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {team.canCreateOrganization && (team.everywhere || team.directions.length > 0) && (
        <form action={createOrganizationAction} className={`${cardClass} space-y-4`}>
          <h2 className="text-xl font-bold">Créer un établissement</h2>
          <label className="block font-bold">
            Nom officiel
            <input name="name" className={inputClass} required minLength={3} maxLength={160} />
          </label>
          <label className="block font-bold">
            Type
            <select name="type" className={inputClass} defaultValue="primary_public">
              {Object.entries(ORGANIZATION_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-bold">
            Direction régionale
            <select name="parentId" className={inputClass} defaultValue="">
              <option value="">
                {team.everywhere ? 'Aucune (si vous créez une direction régionale)' : 'Choisir…'}
              </option>
              {team.directions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-bold">
            Localité
            <input name="locality" className={inputClass} maxLength={160} />
          </label>
          <label className="block font-bold">
            Responsable (nom)
            <input name="managerName" className={inputClass} maxLength={160} />
          </label>
          <label className="block font-bold">
            Contact du responsable (facultatif)
            <input name="managerContact" className={inputClass} maxLength={160} />
          </label>
          <button type="submit" className={buttonClass}>
            Créer l’établissement
          </button>
        </form>
      )}
      {team.canCreateOrganization && <ImportOrganizations />}
    </section>
  );
}
