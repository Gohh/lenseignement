import { BRANCHES, type CurriculaAdminOverview } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { Notice, param } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { Dialog } from '../Dialog';
import { versionState } from './format';
import { ImportCurriculum } from './ImportCurriculum';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Programmes' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';

const branchTitle = (code: string) => BRANCHES.find((b) => b.code === code)?.title ?? code;

export default async function ProgrammesPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/configuration/programmes');
  const query = await searchParams;
  const result = await apiGet<CurriculaAdminOverview>(session.accessToken, '/admin/curricula');
  if (!result.ok) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Programmes</h1>
        <p>Cette page est réservée au superadministrateur et à l’administrateur.</p>
      </section>
    );
  }
  const { items, canPublish } = result.data;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="font-bold text-ink-muted">Référentiels / Programmes</p>
          <h1 className="text-4xl font-extrabold">Programmes</h1>
          <p className="text-ink-muted">
            Les programmes officiels et leurs versions. Une nouvelle version arrive en brouillon ;
            {canPublish
              ? ' vous la publiez avec sa date d’entrée en vigueur.'
              : ' le superadministrateur la publie avec sa date d’entrée en vigueur.'}{' '}
            L’ancienne version reste consultable.
          </p>
        </div>
        <Dialog primary label="+ Importer un programme" title="Importer un programme">
          <ImportCurriculum />
        </Dialog>
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      {items.length === 0 ? (
        <p className={cardClass}>
          Aucun programme pour l’instant. Importez le premier avec « + Importer un programme ».
        </p>
      ) : (
        <ul className="space-y-4" data-testid="curricula">
          {items.map((c) => (
            <li key={c.code} className={cardClass}>
              <h2 className="text-xl font-bold">{c.title}</h2>
              <p className="text-ink-muted">
                {branchTitle(c.branch)} · code {c.code}
              </p>
              <ul className="mt-3 divide-y divide-line">
                {c.versions.map((v) => (
                  <li
                    key={v.label}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div>
                      <a
                        href={`/mon-espace/configuration/programmes/${encodeURIComponent(c.code)}/${encodeURIComponent(v.label)}`}
                        className="font-bold"
                      >
                        Version {v.label}
                      </a>
                      <p className="text-sm">
                        <span className={v.status === 'draft' ? 'font-bold' : 'text-ink-muted'}>
                          {versionState(v, today)}
                        </span>
                        {' · '}
                        {v.counts.subjects} matière{v.counts.subjects > 1 ? 's' : ''},{' '}
                        {v.counts.competencies} compétence{v.counts.competencies > 1 ? 's' : ''}
                      </p>
                    </div>
                    {!v.source.isOfficial && (
                      <span className="rounded-card border border-line-strong px-2 text-sm">
                        Source non officielle
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
