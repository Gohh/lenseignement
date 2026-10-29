import { RESOURCE_KINDS, type ResourceItem } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet, type CohortSummary } from '@/lib/api';
import { getSession } from '@/lib/session';
import { Dialog } from '../configuration/Dialog';
import { addResourceAction, removeResourceAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bibliothèque' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' });

export default async function LibraryPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/bibliotheque');
  const query = await searchParams;
  const [result, cohorts] = await Promise.all([
    apiGet<{ items: ResourceItem[] }>(session.accessToken, '/me/resources'),
    apiGet<CohortSummary[]>(session.accessToken, '/cohorts'),
  ]);
  const items = result.ok ? result.data.items : [];
  const teaching = cohorts.ok ? cohorts.data : [];
  const kindLabel = (code: string) => RESOURCE_KINDS.find((k) => k.code === code)?.label ?? code;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">Bibliothèque</h1>
        {teaching.length > 0 && (
          <Dialog
            label="+ Ajouter une ressource"
            title="Ajouter une ressource"
            primary
            openAtStart={param(query.ouvrir as string | undefined) === 'ressource'}
          >
            <form action={addResourceAction} className="space-y-4">
              <label className="block font-bold">
                Classe
                <select name="cohortId" className={inputClass} required>
                  {teaching.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.organization.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block font-bold">
                Titre
                <input name="title" className={inputClass} required maxLength={120} />
              </label>
              <label className="block font-bold">
                Lien (commence par https://)
                <input name="url" type="url" className={inputClass} required maxLength={500} />
              </label>
              <label className="block font-bold">
                Type
                <select name="kind" className={inputClass}>
                  {RESOURCE_KINDS.map((k) => (
                    <option key={k.code} value={k.code}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block font-bold">
                Description (facultatif)
                <textarea name="description" rows={3} className={inputClass} maxLength={1000} />
              </label>
              <button type="submit" className={buttonClass}>
                Ajouter
              </button>
            </form>
          </Dialog>
        )}
      </div>
      <Notice
        message={param(query.message as string | undefined)}
        error={param(query.erreur as string | undefined)}
      />

      <div className={cardClass}>
        {items.length === 0 ? (
          <p>Aucune ressource pour le moment. Ton enseignant en ajoutera pour ta classe.</p>
        ) : (
          <ul className="space-y-3" role="list" data-testid="resources">
            {items.map((r) => (
              <li key={r.id} className="rounded-card border border-line p-4">
                <p className="text-sm font-bold text-ink-muted">{kindLabel(r.kind)}</p>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center text-lg font-bold underline"
                >
                  {r.title}
                  <span className="sr-only"> (s’ouvre dans un nouvel onglet)</span>
                </a>
                {r.description && <p className="whitespace-pre-line">{r.description}</p>}
                <p className="text-ink-muted">
                  {r.cohortName}
                  {r.teacherName ? ` · ${r.teacherName}` : ''} ·{' '}
                  {dateFormat.format(new Date(r.addedAt))}
                </p>
                {r.canManage && (
                  <form action={removeResourceAction} className="mt-2">
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className={secondaryButtonClass}>
                      Retirer<span className="sr-only"> « {r.title} »</span>
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
