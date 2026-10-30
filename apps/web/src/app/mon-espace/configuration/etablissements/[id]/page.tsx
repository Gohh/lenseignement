import {
  COMMON_ESTABLISHMENT_FIELDS,
  establishmentFields,
  establishmentValue,
  formatEstablishmentValue,
  schoolYearChoices,
  schoolYearOf,
  ESTABLISHMENT_CATEGORY_LABELS,
  ORGANIZATION_TYPE_LABELS,
  TEAM_ROLE_LABELS,
  type OrganizationCohorts,
  type OrganizationDetail,
  type TeamOverview,
} from '@lenseignement/types';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { Dialog } from '../../Dialog';
import { ChangeForm } from '../ChangeForm';
import { asCategory, defaultsOf } from '../fiche';
import { RemoveButton } from '../RowActions';
import {
  addCohortTeacherAction,
  archiveCohortAction,
  archiveOrganizationAction,
  createCohortAction,
  removeCohortTeacherAction,
  renewCohortCodeAction,
  restoreCohortAction,
  restoreOrganizationAction,
  updateOrganizationAction,
} from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fiche d’établissement' };

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const COMMON_KEYS = new Set(COMMON_ESTABLISHMENT_FIELDS.map((f) => f.key));
const frenchDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';

export default async function OrganizationPage({ params, searchParams }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=/mon-espace/configuration/etablissements/${id}`);
  const query = await searchParams;
  const [result, overview, classes] = await Promise.all([
    apiGet<OrganizationDetail>(session.accessToken, `/organizations/${id}`),
    apiGet<TeamOverview>(session.accessToken, '/team'),
    apiGet<OrganizationCohorts>(session.accessToken, `/organizations/${id}/cohorts`),
  ]);
  if (!result.ok) notFound();
  const o = result.data;
  const directions = overview.ok ? overview.data.directions : [];
  const isDirection = o.type === 'authority';
  const category = asCategory(o.type);
  const path = `/mon-espace/configuration/etablissements/${o.id}`;
  const code = param(query.code);
  const today = new Date().toISOString().slice(0, 10);
  const fields = category ? establishmentFields(category) : [];
  const shown = (key: string) => {
    const field = fields.find((f) => f.key === key);
    return field ? formatEstablishmentValue(field, establishmentValue(o, key)) : '';
  };
  const label = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
  const rows = (keys: string[]): Array<[string, string]> => keys.map((k) => [label(k), shown(k)]);
  const groups: Array<{ title: string; rows: Array<[string, string]> }> = category
    ? [
        {
          title: 'Identité',
          rows: [
            ['Type', ESTABLISHMENT_CATEGORY_LABELS[category]],
            ...rows(['name', 'officialCode', 'status', 'openedYear']),
          ],
        },
        { title: 'Rattachement et lieu', rows: rows(['direction', 'locality', 'municipality']) },
        { title: 'Responsable et contact', rows: rows(['managerName', 'phone', 'email']) },
        {
          title: `Propre à : ${ESTABLISHMENT_CATEGORY_LABELS[category]}`,
          rows: fields
            .filter((f) => !COMMON_KEYS.has(f.key))
            .map((f): [string, string] => [f.label, shown(f.key)]),
        },
      ]
    : [];
  const defaults = category ? defaultsOf(o, category) : {};
  const changeFields = fields
    .filter((f) => f.evolves)
    .map((f) => ({ field: f, current: shown(f.key), raw: defaults[f.key] ?? '' }));
  const now = new Date();
  const defaultYear = schoolYearOf(now);
  // Les classes se rangent par année scolaire : l'année en cours d'abord, les autres d'un clic.
  const years = classes.ok
    ? [...new Set([defaultYear, ...classes.data.items.map((c) => c.schoolYear)])].sort().reverse()
    : [];
  const wantedYear = param(query.annee);
  const withClasses = classes.ok ? classes.data.items.map((c) => c.schoolYear) : [];
  // Sans choix : l'année en cours, ou à défaut la plus récente qui a des classes.
  const fallbackYear = withClasses.includes(defaultYear)
    ? defaultYear
    : (years.find((y) => withClasses.includes(y)) ?? defaultYear);
  const shownYear =
    wantedYear === 'toutes' || (wantedYear && years.includes(wantedYear))
      ? wantedYear
      : fallbackYear;
  const shownClasses = classes.ok
    ? classes.data.items.filter((c) => shownYear === 'toutes' || c.schoolYear === shownYear)
    : [];

  return (
    <section className="space-y-6">
      <Link
        href={isDirection ? '/mon-espace/configuration?vue=drena' : '/mon-espace/configuration'}
        className="inline-flex min-h-[44px] items-center font-bold"
      >
        {isDirection ? '← Directions régionales' : '← Établissements'}
      </Link>
      <h1 className="text-3xl font-bold">{o.name}</h1>
      {o.archivedAt && (
        <p
          className="rounded-card border-2 border-primary bg-primary-soft p-4 font-bold"
          role="status"
        >
          {category
            ? 'Cet établissement est retiré de la liste active (archivé).'
            : 'Cet établissement est archivé.'}
        </p>
      )}
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

      {category ? (
        <>
          {(o.can.edit || o.can.archive) && (
            <div className={`${cardClass} space-y-3`}>
              <div className="flex flex-wrap gap-3">
                {o.can.edit && !o.archivedAt && (
                  <>
                    <a href={`${path}/modifier`} className={secondaryButtonClass}>
                      Modifier
                    </a>
                    {changeFields.length > 0 && (
                      <Dialog
                        label="Mettre à jour"
                        title="Mettre à jour la fiche"
                        openAtStart={param(query.ouvrir) === 'maj'}
                      >
                        <ChangeForm id={o.id} fields={changeFields} today={today} />
                      </Dialog>
                    )}
                  </>
                )}
                {o.can.archive && (
                  <RemoveButton
                    id={o.id}
                    name={o.name}
                    archived={Boolean(o.archivedAt)}
                    from="fiche"
                    variant="text"
                  />
                )}
              </div>
              {o.can.edit && !o.archivedAt && (
                <ul className="list-disc pl-6 text-ink-muted" data-testid="actions-help">
                  <li>
                    <strong className="text-ink">Modifier</strong> : corriger une erreur de saisie.
                    La fiche est remplacée, sans historique.
                  </li>
                  <li>
                    <strong className="text-ink">Mettre à jour</strong> : enregistrer un vrai
                    changement (nouveau responsable, nouvelle filière…) à sa date. L’ancienne valeur
                    reste dans l’historique.
                  </li>
                </ul>
              )}
            </div>
          )}

          {o.missing.length > 0 && (
            <p
              className="rounded-card border-2 border-error bg-surface p-4"
              role="status"
              data-testid="fiche-incomplete"
            >
              <strong>Fiche incomplète.</strong> À compléter avec « Modifier » :{' '}
              {o.missing.join(', ')}.
            </p>
          )}

          <div className={`${cardClass} space-y-5`} data-testid="fiche">
            <h2 className="text-xl font-bold">Fiche d’identification</h2>
            {groups.map((g) => (
              <div key={g.title}>
                <h3 className="font-extrabold text-primary">{g.title}</h3>
                <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-[15rem_1fr]">
                  {g.rows.map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="font-bold">{label}</dt>
                      <dd>{value || <span className="text-ink-muted">Non renseigné</span>}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>

          <div className={cardClass}>
            <h2 className="text-xl font-bold">Historique des mises à jour</h2>
            {o.changes.length === 0 ? (
              <p className="mt-2">Aucune mise à jour enregistrée.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left" data-testid="change-history">
                  <thead className="bg-primary-soft text-sm uppercase tracking-wide text-ink-muted">
                    <tr>
                      {['Depuis le', 'Information', 'Avant', 'Après', 'Motif', 'Par'].map((h) => (
                        <th key={h} scope="col" className="px-3 py-2">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {o.changes.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2">{frenchDate(c.effectiveOn)}</td>
                        <td className="px-3 py-2 font-bold">{c.label}</td>
                        <td className="px-3 py-2">{c.oldValue || '–'}</td>
                        <td className="px-3 py-2">{c.newValue}</td>
                        <td className="px-3 py-2">{c.note ?? '–'}</td>
                        <td className="px-3 py-2">{c.author ?? '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
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
                {ORGANIZATION_TYPE_LABELS[o.type as keyof typeof ORGANIZATION_TYPE_LABELS] ??
                  o.type}
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
      )}

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

      {!isDirection && classes.ok && (
        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Classes</h2>
            {!o.archivedAt && classes.data.levels.length > 0 && (
              <Dialog
                label="+ Créer une classe"
                title="Créer une classe"
                primary
                openAtStart={param(query.ouvrir) === 'classe'}
              >
                <form action={createCohortAction} className="space-y-4">
                  <input type="hidden" name="organizationId" value={o.id} />
                  <label className="block font-bold">
                    Niveau
                    <select name="level" className={inputClass} required>
                      {classes.data.levels.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block font-bold">
                    Nom de la classe
                    <input
                      name="name"
                      className={inputClass}
                      required
                      maxLength={60}
                      placeholder="Par exemple : CE2 A"
                    />
                  </label>
                  <label className="block font-bold">
                    Année scolaire
                    <select name="schoolYear" className={inputClass} defaultValue={defaultYear}>
                      {schoolYearChoices(now).map((y) => (
                        <option key={y} value={y}>
                          {y}
                          {y === defaultYear ? ' (année en cours)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className={buttonClass}>
                    Créer la classe
                  </button>
                </form>
              </Dialog>
            )}
          </div>
          {years.length > 1 && (
            <nav aria-label="Années scolaires" className="mt-3 flex flex-wrap gap-2">
              {[...years, 'toutes'].map((y) => (
                <a
                  key={y}
                  href={`?annee=${y}`}
                  aria-current={y === shownYear ? 'page' : undefined}
                  className="inline-flex min-h-[44px] items-center rounded-card border border-line px-4 font-bold no-underline aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary"
                >
                  {y === 'toutes' ? 'Toutes les années' : y}
                </a>
              ))}
            </nav>
          )}
          {shownClasses.length === 0 ? (
            <p className="mt-2">
              {classes.data.items.length === 0
                ? 'Cet établissement n’a pas encore de classe.'
                : `Pas de classe pour ${shownYear}.`}
            </p>
          ) : (
            <ul className="mt-3 space-y-3" role="list" data-testid="cohort-list">
              {shownClasses.map((c) => (
                <li key={c.id} className="rounded-card border border-line p-4">
                  <p className="text-lg font-bold">
                    {c.name}{' '}
                    <span className="font-normal text-ink-muted">
                      · {c.levelLabel ?? 'Niveau non précisé'} · {c.schoolYear} · {c.learnerCount}{' '}
                      élève{c.learnerCount > 1 ? 's' : ''}
                      {c.archivedAt ? ' · archivée' : ''}
                    </span>
                  </p>
                  <p className="mt-2">
                    Code de classe :{' '}
                    <span className="text-xl font-bold tracking-widest" data-testid="cohort-code">
                      {c.joinCode ?? 'pas encore de code'}
                    </span>
                  </p>
                  <div className="mt-2">
                    <p className="font-bold">Enseignants</p>
                    {c.teachers.length === 0 ? (
                      <p className="text-ink-muted">Aucun enseignant affecté.</p>
                    ) : (
                      <ul role="list">
                        {c.teachers.map((t) => (
                          <li key={t.userId} className="flex flex-wrap items-center gap-3">
                            {t.name}
                            <form action={removeCohortTeacherAction}>
                              <input type="hidden" name="organizationId" value={o.id} />
                              <input type="hidden" name="cohortId" value={c.id} />
                              <input type="hidden" name="userId" value={t.userId} />
                              <button
                                type="submit"
                                className="min-h-[44px] font-bold text-primary underline"
                              >
                                Retirer
                                <span className="sr-only">
                                  {' '}
                                  {t.name} de {c.name}
                                </span>
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                    {classes.data.teacherCandidates.some(
                      (t) => !c.teachers.some((x) => x.userId === t.userId),
                    ) && (
                      <form
                        action={addCohortTeacherAction}
                        className="mt-2 flex flex-wrap items-end gap-3"
                      >
                        <input type="hidden" name="organizationId" value={o.id} />
                        <input type="hidden" name="cohortId" value={c.id} />
                        <label className="font-bold">
                          Affecter un enseignant
                          <select name="userId" className={inputClass}>
                            {classes.data.teacherCandidates
                              .filter((t) => !c.teachers.some((x) => x.userId === t.userId))
                              .map((t) => (
                                <option key={t.userId} value={t.userId}>
                                  {t.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <button type="submit" className={secondaryButtonClass}>
                          Affecter<span className="sr-only"> à {c.name}</span>
                        </button>
                      </form>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <form action={renewCohortCodeAction}>
                      <input type="hidden" name="organizationId" value={o.id} />
                      <input type="hidden" name="cohortId" value={c.id} />
                      <button type="submit" className={secondaryButtonClass}>
                        {c.joinCode ? 'Changer le code' : 'Créer le code'}
                        <span className="sr-only"> de {c.name}</span>
                      </button>
                    </form>
                    <form action={c.archivedAt ? restoreCohortAction : archiveCohortAction}>
                      <input type="hidden" name="organizationId" value={o.id} />
                      <input type="hidden" name="cohortId" value={c.id} />
                      <button type="submit" className={secondaryButtonClass}>
                        {c.archivedAt ? 'Rétablir' : 'Archiver'}
                        <span className="sr-only"> {c.name}</span>
                      </button>
                    </form>
                    <Link
                      href={`/mon-espace/classes/${c.id}`}
                      className="inline-flex min-h-[44px] items-center font-bold underline"
                    >
                      Voir les élèves<span className="sr-only"> de {c.name}</span>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!category && o.can.archive && (
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
            <input type="hidden" name="name" value={o.name} />
            <button type="submit" className={secondaryButtonClass}>
              {o.archivedAt ? 'Rétablir' : 'Archiver'}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
