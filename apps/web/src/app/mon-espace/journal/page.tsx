import { AUDIT_ACTION_LABELS, AUDIT_DOMAIN_LABELS, type AuditLogPage } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { inputClass, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Journal des actions' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';
const cell = 'px-4 py-3 align-top';

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(iso));

export default async function JournalPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/journal');
  const query = await searchParams;
  const values = {
    domaine: param(query.domaine) ?? '',
    decision: param(query.decision) ?? '',
    qui: param(query.qui) ?? '',
    du: param(query.du) ?? '',
    au: param(query.au) ?? '',
  };
  const page = Math.max(1, Number(param(query.page)) || 1);
  const filter = new URLSearchParams();
  if (values.domaine) filter.set('domain', values.domaine);
  if (values.decision) filter.set('decision', values.decision);
  if (values.qui) filter.set('actor', values.qui);
  if (values.du) filter.set('from', values.du);
  if (values.au) filter.set('to', values.au);
  filter.set('page', String(page));
  const result = await apiGet<AuditLogPage>(session.accessToken, `/admin/audit?${filter}`);
  if (!result.ok) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Journal des actions</h1>
        <p>
          {result.status === 400
            ? 'Un filtre est mal rempli (les dates s’écrivent AAAA-MM-JJ).'
            : 'Le journal est réservé au superadministrateur et aux administrateurs.'}
        </p>
        <a href="/mon-espace/journal">Effacer les filtres</a>
      </section>
    );
  }
  const { items, hasMore } = result.data;
  const link = (target: number) => {
    const params = new URLSearchParams(
      Object.entries(values).filter(([, v]) => v !== '') as Array<[string, string]>,
    );
    params.set('page', String(target));
    return `/mon-espace/journal?${params}`;
  };

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <p className="font-bold text-ink-muted">Comptes et droits / Journal</p>
        <h1 className="text-4xl font-extrabold">Journal des actions</h1>
        <p className="text-ink-muted">
          Qui a fait quoi, et quand : créations, changements de rôle, consultations de données
          d’élèves, accès refusés. Le journal ne s’efface pas. Heures en temps universel (heure
          d’Abidjan).
        </p>
      </div>

      <form method="get" className={`${cardClass} flex flex-wrap items-end gap-4`}>
        <label className="block flex-1 basis-40 font-bold">
          Domaine
          <select name="domaine" defaultValue={values.domaine} className={inputClass}>
            <option value="">Tous</option>
            {Object.entries(AUDIT_DOMAIN_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block flex-1 basis-32 font-bold">
          Résultat
          <select name="decision" defaultValue={values.decision} className={inputClass}>
            <option value="">Tous</option>
            <option value="allow">Accordé</option>
            <option value="deny">Refusé</option>
          </select>
        </label>
        <label className="block flex-1 basis-40 font-bold">
          Qui
          <input name="qui" defaultValue={values.qui} placeholder="Nom" className={inputClass} />
        </label>
        <label className="block flex-1 basis-36 font-bold">
          Du
          <input type="date" name="du" defaultValue={values.du} className={inputClass} />
        </label>
        <label className="block flex-1 basis-36 font-bold">
          Au
          <input type="date" name="au" defaultValue={values.au} className={inputClass} />
        </label>
        <button type="submit" className={secondaryButtonClass}>
          Filtrer
        </button>
      </form>

      <div className={`${cardClass} p-0`}>
        {items.length === 0 ? (
          <p className="p-5">Aucune action ne correspond.</p>
        ) : (
          <div className="overflow-x-auto" data-testid="journal">
            <table className="w-full min-w-[40rem] text-left">
              <thead className="bg-primary-soft text-sm uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className={cell}>
                    Quand
                  </th>
                  <th scope="col" className={cell}>
                    Qui
                  </th>
                  <th scope="col" className={cell}>
                    Action
                  </th>
                  <th scope="col" className={cell}>
                    Résultat
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className={`${cell} whitespace-nowrap`}>{formatTime(i.occurredAt)}</td>
                    <td className={cell}>{i.actorName ?? 'Système'}</td>
                    <td className={cell}>
                      {AUDIT_ACTION_LABELS[i.action] ?? i.action}
                      <span className="block text-sm text-ink-muted">
                        {i.resourceType} {i.resourceId}
                      </span>
                    </td>
                    <td className={cell}>
                      {i.decision === 'allow' ? 'Accordé' : <strong>Refusé</strong>}
                      <span className="block text-sm text-ink-muted">{i.reason}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(page > 1 || hasMore) && (
        <nav aria-label="Pages" className="flex flex-wrap items-center gap-4">
          {page > 1 && <a href={link(page - 1)}>← Plus récentes</a>}
          <span>Page {page}</span>
          {hasMore && <a href={link(page + 1)}>Plus anciennes →</a>}
        </nav>
      )}
    </section>
  );
}
