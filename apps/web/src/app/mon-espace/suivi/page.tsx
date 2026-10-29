import {
  INACTIVE_DAYS,
  LOW_AVERAGE,
  MISSING_ASSIGNMENTS,
  type DirectionOverview,
} from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { inputClass, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Suivi de l’établissement' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';
const cell = 'px-4 py-3 align-top';

const decimal = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

export default async function SuiviPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/suivi');
  const query = await searchParams;
  const filter = new URLSearchParams();
  const organizationId = param(query.etablissement);
  const schoolYear = param(query.annee);
  if (organizationId) filter.set('organizationId', organizationId);
  if (schoolYear) filter.set('schoolYear', schoolYear);
  const result = await apiGet<DirectionOverview>(
    session.accessToken,
    `/direction/overview${filter.size ? `?${filter}` : ''}`,
  );
  if (!result.ok) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Suivi de l’établissement</h1>
        <p>
          {result.status === 404
            ? 'Cet établissement n’est pas dans votre champ.'
            : 'Cette page est réservée à la direction et à ceux qui gèrent un établissement.'}
        </p>
      </section>
    );
  }
  const d = result.data;
  const tiles = [
    { label: 'Classes', value: d.totals.classes },
    { label: 'Élèves', value: d.totals.learners },
    { label: 'Enseignants', value: d.totals.teachers },
    { label: 'Actifs cette semaine', value: d.totals.activeLast7Days },
    { label: 'Élèves à suivre', value: d.totals.toFollow },
  ];

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <p className="font-bold text-ink-muted">Direction / Suivi</p>
        <h1 className="text-4xl font-extrabold">Suivi de l’établissement</h1>
        <p className="text-ink-muted">
          {d.organization?.name}
          {d.schoolYear ? ` · année ${d.schoolYear}` : ''}
        </p>
      </div>

      {(d.organizations.length > 1 || d.schoolYears.length > 1) && (
        <form method="get" className={`${cardClass} flex flex-wrap items-end gap-4`}>
          {d.organizations.length > 1 && (
            <label className="block flex-1 basis-56 font-bold">
              Établissement
              <select name="etablissement" defaultValue={d.organization?.id} className={inputClass}>
                {d.organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {d.schoolYears.length > 1 && (
            <label className="block flex-1 basis-36 font-bold">
              Année scolaire
              <select name="annee" defaultValue={d.schoolYear ?? ''} className={inputClass}>
                {d.schoolYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className={secondaryButtonClass}>
            Afficher
          </button>
        </form>
      )}

      <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5" role="list" data-testid="totals">
        {tiles.map((t) => (
          <li key={t.label} className={cardClass}>
            <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">{t.label}</p>
            <p className="font-display text-4xl font-extrabold text-ink-strong">{t.value}</p>
          </li>
        ))}
      </ul>

      <div className={cardClass}>
        <h2 className="text-xl font-extrabold">Élèves à suivre</h2>
        <p className="text-sm text-ink-muted">
          Un élève apparaît ici s’il n’a rien fait depuis {INACTIVE_DAYS} jours, si sa moyenne est
          sous {LOW_AVERAGE}/20, ou s’il n’a pas rendu {MISSING_ASSIGNMENTS} devoirs ou plus.
        </p>
        {d.toFollow.length === 0 ? (
          <p className="mt-3">Aucun élève à signaler pour le moment.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line" data-testid="to-follow">
            {d.toFollow.map((l) => (
              <li key={`${l.cohortId}-${l.userId}`} className="py-3">
                <span className="font-bold">{l.name}</span>
                {' · '}
                <a href={`/mon-espace/classes/${l.cohortId}`}>{l.cohortName}</a>
                <p className="text-sm">{l.reasons.join(' · ')}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`${cardClass} p-0`}>
        <h2 className="p-5 pb-2 text-xl font-extrabold">Classes</h2>
        {d.classes.length === 0 ? (
          <p className="p-5 pt-0">Aucune classe ouverte pour cette année.</p>
        ) : (
          <div className="overflow-x-auto" data-testid="direction-classes">
            <table className="w-full min-w-[44rem] text-left">
              <thead className="bg-primary-soft text-sm uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className={cell}>
                    Classe
                  </th>
                  <th scope="col" className={cell}>
                    Enseignants
                  </th>
                  <th scope="col" className={cell}>
                    Élèves
                  </th>
                  <th scope="col" className={cell}>
                    Actifs (7 j)
                  </th>
                  <th scope="col" className={cell}>
                    Devoirs rendus
                  </th>
                  <th scope="col" className={cell}>
                    Moyenne
                  </th>
                  <th scope="col" className={cell}>
                    À suivre
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.classes.map((c) => (
                  <tr key={c.id}>
                    <td className={cell}>
                      <a href={`/mon-espace/classes/${c.id}`} className="font-bold">
                        {c.name}
                      </a>
                      {c.levelLabel && (
                        <span className="block text-sm text-ink-muted">{c.levelLabel}</span>
                      )}
                    </td>
                    <td className={cell}>{c.teachers.join(', ') || 'Aucun'}</td>
                    <td className={cell}>{c.learnerCount}</td>
                    <td className={cell}>{c.activeLast7Days}</td>
                    <td className={cell}>
                      {c.submissionRate === null ? '–' : `${c.submissionRate} %`}
                      <span className="block text-sm text-ink-muted">
                        {c.assignmentCount} devoir{c.assignmentCount > 1 ? 's' : ''} donné
                        {c.assignmentCount > 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className={cell}>
                      {c.average === null ? '–' : `${decimal(c.average)}/20`}
                    </td>
                    <td className={cell}>{c.toFollow}</td>
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
