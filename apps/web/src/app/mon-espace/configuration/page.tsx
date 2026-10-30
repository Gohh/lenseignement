import {
  ORGANIZATION_TYPE_LABELS,
  type OrganizationListEntry,
  type TeamOverview,
} from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { createOrganizationAction } from './actions';
import { Dialog } from './Dialog';
import { asCategory } from './etablissements/fiche';
import { IconLink, RemoveButton } from './etablissements/RowActions';

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
  // Deux onglets : les établissements (par défaut) et les directions régionales.
  const drenaView = param(query.vue) === 'drena';

  const filter = new URLSearchParams();
  if (q) filter.set('search', q);
  if (direction && !drenaView) filter.set('direction', direction);
  if (type && !drenaView) filter.set('type', type);
  if (archived) filter.set('archived', '1');
  filter.set('kind', drenaView ? 'directions' : 'etablissements');
  const [list, overview] = await Promise.all([
    apiGet<{ items: OrganizationListEntry[] }>(session.accessToken, `/organizations?${filter}`),
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
  const showDrenaTab = team.everywhere || team.directions.length > 0;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <p className="font-bold text-ink-muted">Référentiels / Établissements</p>
        <h1 className="text-4xl font-extrabold">Configuration</h1>
        <p className="text-ink-muted">
          Les établissements et les directions régionales que vous gérez, chacun dans son onglet. Le
          tableau montre l’essentiel ; l’icône en forme d’œil ouvre la fiche complète.
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

      {showDrenaTab && (
        <nav aria-label="Référentiels" className="flex flex-wrap gap-2 border-b border-line">
          {[
            { href: '/mon-espace/configuration', label: 'Établissements', current: !drenaView },
            {
              href: '/mon-espace/configuration?vue=drena',
              label: 'Directions régionales (DRENA)',
              current: drenaView,
            },
          ].map((tab) => (
            <a
              key={tab.href}
              href={tab.href}
              aria-current={tab.current ? 'page' : undefined}
              className="-mb-px inline-flex min-h-[44px] items-center rounded-t-card border border-transparent px-5 font-bold text-ink-muted no-underline hover:text-primary aria-[current=page]:border-line aria-[current=page]:border-b-surface aria-[current=page]:bg-surface aria-[current=page]:text-primary"
            >
              {tab.label}
            </a>
          ))}
        </nav>
      )}

      <form method="get" className={`${cardClass} flex flex-wrap items-end gap-4`}>
        {drenaView && <input type="hidden" name="vue" value="drena" />}
        <label className="block flex-1 basis-44 font-bold">
          Rechercher
          <input
            name="q"
            defaultValue={q}
            placeholder={
              drenaView ? 'Nom, localité ou responsable' : 'Nom, code, localité ou responsable'
            }
            className={inputClass}
          />
        </label>
        {!drenaView && (
          <>
            <label className="block flex-1 basis-36 font-bold">
              DRENA
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
                {Object.entries(ORGANIZATION_TYPE_LABELS)
                  .filter(([value]) => value !== 'authority')
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
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
            {drenaView ? 'Directions régionales' : 'Établissements'}{' '}
            {archived ? 'archivé' : 'actif'}
            {drenaView ? 'es' : 's'} ({items.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {drenaView && team.canCreateOrganization && team.everywhere && (
              <Dialog
                primary
                label="+ Créer une direction régionale"
                title="Créer une direction régionale (DRENA)"
                openAtStart={open === 'drena'}
              >
                <form action={createOrganizationAction} className="space-y-6">
                  <input type="hidden" name="type" value="authority" />
                  <p className="text-ink-muted">
                    La direction régionale regroupe les établissements d’une région. Créez-la
                    d’abord : chaque établissement s’y rattache ensuite.
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
            {!drenaView &&
              team.canCreateOrganization &&
              (team.everywhere || team.directions.length > 0) && (
                <a href="/mon-espace/configuration/etablissements/nouveau" className={buttonClass}>
                  + Ajouter un établissement
                </a>
              )}
          </div>
        </div>
        {items.length === 0 ? (
          <p className="p-4">
            {drenaView
              ? 'Aucune direction régionale ne correspond.'
              : 'Aucun établissement ne correspond.'}
          </p>
        ) : drenaView ? (
          <div className="overflow-x-auto" data-testid="direction-list">
            <table className="w-full min-w-[40rem] text-left">
              <thead className="bg-primary-soft text-sm uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className={cell}>
                    Direction régionale
                  </th>
                  <th scope="col" className={cell}>
                    Siège
                  </th>
                  <th scope="col" className={cell}>
                    Responsable
                  </th>
                  <th scope="col" className={cell}>
                    Établissements
                  </th>
                  <th scope="col" className={`${cell} text-right`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((o) => {
                  const fiche = `/mon-espace/configuration/etablissements/${o.id}`;
                  return (
                    <tr key={o.id} className="hover:bg-primary-soft">
                      <th scope="row" className={`${cell} font-bold`}>
                        <a href={fiche} className="underline">
                          {o.name}
                        </a>
                      </th>
                      <td className={cell}>{o.locality ?? '–'}</td>
                      <td className={cell}>{o.managerName ?? '–'}</td>
                      <td className={cell}>
                        <a href={`/mon-espace/configuration?direction=${o.id}`}>
                          {o.activeChildren} actif{o.activeChildren > 1 ? 's' : ''}
                          <span className="sr-only"> : voir les établissements de {o.name}</span>
                        </a>
                      </td>
                      <td className={`${cell} py-2`}>
                        <div className="flex justify-end gap-2">
                          <IconLink
                            href={fiche}
                            icon="voir"
                            label={`Voir la fiche de ${o.name}`}
                            tip="Voir : la fiche de la DRENA"
                          />
                          {o.can.edit && !o.archivedAt && (
                            <IconLink
                              href={fiche}
                              icon="modifier"
                              label={`Modifier ${o.name}`}
                              tip="Modifier : corriger le nom, le siège ou le responsable"
                            />
                          )}
                          {o.can.archive && (
                            <RemoveButton
                              id={o.id}
                              name={o.name}
                              archived={Boolean(o.archivedAt)}
                              from="drena"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto" data-testid="organization-list">
            <table className="w-full min-w-[40rem] text-left">
              <thead className="bg-primary-soft text-sm uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className={cell}>
                    Établissement
                  </th>
                  <th scope="col" className={cell}>
                    Type
                  </th>
                  <th scope="col" className={cell}>
                    DRENA
                  </th>
                  <th scope="col" className={cell}>
                    Localité
                  </th>
                  <th scope="col" className={`${cell} text-right`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((o) => {
                  const fiche = `/mon-espace/configuration/etablissements/${o.id}`;
                  const isEstablishment = asCategory(o.type) !== null;
                  const editable = o.can.edit && !o.archivedAt;
                  return (
                    <tr key={o.id} className="hover:bg-primary-soft">
                      <th scope="row" className={`${cell} font-bold`}>
                        <a href={fiche} className="underline">
                          {o.name}
                        </a>
                        {o.officialCode && (
                          <span className="block text-sm font-normal text-ink-muted">
                            Code {o.officialCode}
                          </span>
                        )}
                      </th>
                      <td className={cell}>{typeLabel(o.type)}</td>
                      <td className={cell}>{o.direction?.name ?? '–'}</td>
                      <td className={cell}>{o.locality ?? '–'}</td>
                      <td className={`${cell} py-2`}>
                        <div className="flex justify-end gap-2">
                          <IconLink
                            href={fiche}
                            icon="voir"
                            label={`Voir la fiche de ${o.name}`}
                            tip="Voir : la fiche complète"
                          />
                          {editable && (
                            <IconLink
                              href={isEstablishment ? `${fiche}/modifier` : fiche}
                              icon="modifier"
                              label={`Modifier ${o.name}`}
                              tip="Modifier : corriger une erreur de saisie"
                            />
                          )}
                          {editable && isEstablishment && (
                            <IconLink
                              href={`${fiche}?ouvrir=maj`}
                              icon="actualiser"
                              label={`Mettre à jour ${o.name}`}
                              tip="Mettre à jour : enregistrer un changement daté (historique)"
                            />
                          )}
                          {o.can.archive && (
                            <RemoveButton
                              id={o.id}
                              name={o.name}
                              archived={Boolean(o.archivedAt)}
                              from="liste"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
