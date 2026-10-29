import {
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
  // Année scolaire en cours : de septembre à août.
  const now = new Date();
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const defaultYear = `${startYear}-${startYear + 1}`;

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
                    <input
                      name="schoolYear"
                      className={inputClass}
                      required
                      pattern="[0-9]{4}-[0-9]{4}"
                      defaultValue={defaultYear}
                    />
                  </label>
                  <button type="submit" className={buttonClass}>
                    Créer la classe
                  </button>
                </form>
              </Dialog>
            )}
          </div>
          {classes.data.items.length === 0 ? (
            <p className="mt-2">Cet établissement n’a pas encore de classe.</p>
          ) : (
            <ul className="mt-3 space-y-3" role="list" data-testid="cohort-list">
              {classes.data.items.map((c) => (
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
