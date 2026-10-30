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
import { Dialog } from './Dialog';
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
  const open = param(query.ouvrir);
  const typeLabel = (value: string) =>
    ORGANIZATION_TYPE_LABELS[value as keyof typeof ORGANIZATION_TYPE_LABELS] ?? value;
  const cell = 'px-4 py-3 align-top';

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <p className="font-bold text-ink-muted">Référentiels / Établissements</p>
        <h1 className="text-4xl font-extrabold">Configuration</h1>
        <p className="text-ink-muted">
          Les établissements et les directions régionales que vous gérez. Ce que vous créez ici
          apparaît ensuite dans les listes des autres écrans.
        </p>
      </div>
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

      <form method="get" className={`${cardClass} flex flex-wrap items-end gap-4`}>
        <label className="block flex-1 basis-44 font-bold">
          Rechercher
          <input
            name="q"
            defaultValue={q}
            placeholder="Nom, localité ou responsable"
            className={inputClass}
          />
        </label>
        <label className="block flex-1 basis-36 font-bold">
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
        <label className="block flex-1 basis-36 font-bold">
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
        <label className="flex min-h-[44px] items-center gap-3">
          <input
            type="checkbox"
            name="archives"
            value="1"
            defaultChecked={archived}
            className="h-6 w-6 accent-primary"
          />
          Archivés
        </label>
        <button type="submit" className={secondaryButtonClass}>
          Filtrer
        </button>
      </form>

      <div className="overflow-hidden rounded-big border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-xl font-extrabold">
            {archived ? 'Archivés' : 'Actifs'} ({items.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {team.canCreateOrganization && (
              <Dialog
                label="Importer (CSV)"
                title="Importer des établissements"
                openAtStart={open === 'importer'}
              >
                <ImportOrganizations />
              </Dialog>
            )}
            {team.canCreateOrganization && team.everywhere && (
              <Dialog
                label="+ Créer une direction régionale"
                title="Créer une direction régionale (DRENA)"
                openAtStart={open === 'drena'}
              >
                <form action={createOrganizationAction} className="space-y-6">
                  <input type="hidden" name="type" value="authority" />
                  <p className="text-ink-muted">
                    La direction régionale regroupe les établissements d’une région. Créez-la
                    d’abord : chaque école s’y rattache ensuite.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block font-bold sm:col-span-2">
                      Nom officiel
                      <input
                        name="name"
                        className={inputClass}
                        required
                        minLength={3}
                        maxLength={160}
                        placeholder="Exemple : DRENA d’Abidjan 1"
                      />
                    </label>
                    <label className="block font-bold">
                      Localité (siège)
                      <input name="locality" className={inputClass} maxLength={160} />
                    </label>
                    <label className="block font-bold">
                      Responsable (facultatif)
                      <input name="managerName" className={inputClass} maxLength={160} />
                    </label>
                  </div>
                  <button type="submit" className={buttonClass}>
                    Créer la direction régionale
                  </button>
                </form>
              </Dialog>
            )}
            {team.canCreateOrganization && (team.everywhere || team.directions.length > 0) && (
              <Dialog
                primary
                label="+ Créer un établissement"
                title="Créer un établissement"
                openAtStart={open === 'creer'}
              >
                {team.directions.length === 0 ? (
                  <div className="space-y-4" data-testid="needs-direction">
                    <p>
                      Un établissement se rattache toujours à une direction régionale (DRENA). Il
                      n’en existe encore aucune : créez-la d’abord.
                    </p>
                    {team.everywhere && (
                      <a href="/mon-espace/configuration?ouvrir=drena" className={buttonClass}>
                        + Créer une direction régionale
                      </a>
                    )}
                  </div>
                ) : (
                  <form action={createOrganizationAction} className="space-y-6">
                    <fieldset className="space-y-4">
                      <legend className="font-extrabold text-primary">Identité</legend>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block font-bold sm:col-span-2">
                          Nom officiel
                          <input
                            name="name"
                            className={inputClass}
                            required
                            minLength={3}
                            maxLength={160}
                          />
                        </label>
                        <label className="block font-bold">
                          Type
                          <select name="type" className={inputClass} defaultValue="primary_public">
                            {Object.entries(ORGANIZATION_TYPE_LABELS)
                              .filter(([value]) => value !== 'authority')
                              .map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label className="block font-bold">
                          Localité
                          <input
                            name="locality"
                            className={inputClass}
                            required
                            minLength={2}
                            maxLength={160}
                          />
                        </label>
                      </div>
                    </fieldset>
                    <fieldset className="space-y-4">
                      <legend className="font-extrabold text-primary">Rattachement</legend>
                      <label className="block font-bold">
                        Direction régionale (DRENA)
                        <select
                          name="parentId"
                          className={inputClass}
                          required
                          defaultValue={team.directions.length === 1 ? team.directions[0]!.id : ''}
                        >
                          <option value="" disabled>
                            Choisir…
                          </option>
                          {team.directions.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </fieldset>
                    <fieldset className="space-y-4">
                      <legend className="font-extrabold text-primary">Responsable</legend>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block font-bold">
                          Responsable (nom)
                          <input
                            name="managerName"
                            className={inputClass}
                            required
                            minLength={2}
                            maxLength={160}
                          />
                        </label>
                        <label className="block font-bold">
                          Contact du responsable (facultatif)
                          <input name="managerContact" className={inputClass} maxLength={160} />
                        </label>
                      </div>
                    </fieldset>
                    <div className="flex flex-wrap gap-3">
                      <button type="submit" className={buttonClass}>
                        Créer l’établissement
                      </button>
                    </div>
                  </form>
                )}
              </Dialog>
            )}
          </div>
        </div>
        {items.length === 0 ? (
          <p className="p-4">Aucun établissement ne correspond.</p>
        ) : (
          <div className="overflow-x-auto" data-testid="organization-list">
            <table className="w-full min-w-[40rem] text-left">
              <thead className="bg-primary-soft text-sm uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className={cell}>
                    Nom officiel
                  </th>
                  <th scope="col" className={cell}>
                    Type
                  </th>
                  <th scope="col" className={cell}>
                    Direction régionale
                  </th>
                  <th scope="col" className={cell}>
                    Localité
                  </th>
                  <th scope="col" className={cell}>
                    Responsable
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((o) => (
                  <tr key={o.id} className="hover:bg-primary-soft">
                    <th scope="row" className={`${cell} font-bold`}>
                      <Link
                        href={`/mon-espace/configuration/etablissements/${o.id}`}
                        className="inline-flex min-h-[44px] items-center underline"
                      >
                        {o.name}
                      </Link>
                    </th>
                    <td className={cell}>{typeLabel(o.type)}</td>
                    <td className={cell}>{o.direction?.name ?? '–'}</td>
                    <td className={cell}>{o.locality ?? '–'}</td>
                    <td className={cell}>{o.managerName ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
