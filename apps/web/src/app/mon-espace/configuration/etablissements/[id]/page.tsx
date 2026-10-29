import {
  ORGANIZATION_TYPE_LABELS,
  TEAM_ROLE_LABELS,
  type OrganizationDetail,
  type TeamOverview,
} from '@lenseignement/types';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import {
  archiveOrganizationAction,
  restoreOrganizationAction,
  updateOrganizationAction,
} from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fiche d’établissement' };

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';

export default async function OrganizationPage({ params, searchParams }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=/mon-espace/configuration/etablissements/${id}`);
  const query = await searchParams;
  const [result, overview] = await Promise.all([
    apiGet<OrganizationDetail>(session.accessToken, `/organizations/${id}`),
    apiGet<TeamOverview>(session.accessToken, '/team'),
  ]);
  if (!result.ok) notFound();
  const o = result.data;
  const directions = overview.ok ? overview.data.directions : [];
  const isDirection = o.type === 'authority';

  return (
    <section className="space-y-6">
      <Link
        href="/mon-espace/configuration"
        className="inline-flex min-h-[44px] items-center font-bold"
      >
        ← Configuration
      </Link>
      <h1 className="text-3xl font-bold">{o.name}</h1>
      {o.archivedAt && (
        <p
          className="rounded-card border-2 border-primary bg-primary-soft p-4 font-bold"
          role="status"
        >
          Cet établissement est archivé.
        </p>
      )}
      <Notice message={param(query.message)} error={param(query.erreur)} />

      <form action={updateOrganizationAction} className={`${cardClass} space-y-4`}>
        <h2 className="text-xl font-bold">Informations</h2>
        <input type="hidden" name="id" value={o.id} />
        <label className="block font-bold">
          Nom officiel
          <input
            name="name"
            defaultValue={o.name}
            className={inputClass}
            disabled={!o.can.edit}
            required
            minLength={3}
            maxLength={160}
          />
        </label>
        {o.can.editStructure && !isDirection ? (
          <>
            <label className="block font-bold">
              Type
              <select name="type" defaultValue={o.type} className={inputClass}>
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
              Direction régionale
              <select name="parentId" defaultValue={o.direction?.id ?? ''} className={inputClass}>
                {directions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
            <dt className="font-bold">Type</dt>
            <dd>
              {ORGANIZATION_TYPE_LABELS[o.type as keyof typeof ORGANIZATION_TYPE_LABELS] ?? o.type}
            </dd>
            {o.direction && (
              <>
                <dt className="font-bold">Direction régionale</dt>
                <dd>{o.direction.name}</dd>
              </>
            )}
          </dl>
        )}
        {!isDirection && (
          <>
            <label className="block font-bold">
              Localité
              <input
                name="locality"
                defaultValue={o.locality ?? ''}
                className={inputClass}
                disabled={!o.can.edit}
                maxLength={160}
              />
            </label>
            <label className="block font-bold">
              Responsable (nom)
              <input
                name="managerName"
                defaultValue={o.managerName ?? ''}
                className={inputClass}
                disabled={!o.can.edit}
                maxLength={160}
              />
            </label>
            <label className="block font-bold">
              Contact du responsable
              <input
                name="managerContact"
                defaultValue={o.managerContact ?? ''}
                className={inputClass}
                disabled={!o.can.edit}
                maxLength={160}
              />
            </label>
          </>
        )}
        {o.can.edit && (
          <button type="submit" className={buttonClass}>
            Enregistrer
          </button>
        )}
      </form>

      <div className={cardClass}>
        <h2 className="text-xl font-bold">Dans cet établissement</h2>
        <p className="mt-2" data-testid="organization-counts">
          {isDirection
            ? `${o.activeChildren} établissement${o.activeChildren > 1 ? 's' : ''} actif${o.activeChildren > 1 ? 's' : ''}`
            : `${o.cohortCount} classe${o.cohortCount > 1 ? 's' : ''}`}
        </p>
        {o.members.length > 0 && (
          <ul className="mt-3 list-disc pl-6">
            {o.members.map((m, i) => (
              <li key={i}>
                {m.userName ?? 'Sans nom'} : {TEAM_ROLE_LABELS[m.role] ?? m.role}
              </li>
            ))}
          </ul>
        )}
      </div>

      {o.can.archive && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Archivage</h2>
          <p className="mt-2">
            Un établissement archivé n’apparaît plus dans les listes. Son historique est gardé et
            vous pouvez le rétablir.
          </p>
          <form
            action={o.archivedAt ? restoreOrganizationAction : archiveOrganizationAction}
            className="mt-3"
          >
            <input type="hidden" name="id" value={o.id} />
            <button type="submit" className={secondaryButtonClass}>
              {o.archivedAt ? 'Rétablir' : 'Archiver'}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
