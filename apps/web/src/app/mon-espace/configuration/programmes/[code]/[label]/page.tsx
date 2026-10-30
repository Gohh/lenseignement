import type { AdminCurriculumDetail } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { deleteCurriculumDraftAction, publishCurriculumAction } from '../../actions';
import { versionState } from '../../format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Programme' };

interface Props {
  params: Promise<{ code: string; label: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';

export default async function CurriculumVersionPage({ params, searchParams }: Props) {
  const { code, label } = await params;
  const self = `/mon-espace/configuration/programmes/${code}/${label}`;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(self)}`);
  const query = await searchParams;
  const result = await apiGet<AdminCurriculumDetail>(
    session.accessToken,
    `/admin/curricula/${encodeURIComponent(code)}/versions/${encodeURIComponent(label)}`,
  );
  if (!result.ok) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Programme</h1>
        <p>
          {result.status === 404
            ? 'Cette version n’existe pas (ou plus).'
            : 'Cette page est réservée au superadministrateur, à l’administrateur et au référent pédagogique.'}
        </p>
        <a href="/mon-espace/configuration/programmes">Retour aux programmes</a>
      </section>
    );
  }
  const p = result.data;
  const v = p.version;
  const today = new Date().toISOString().slice(0, 10);
  const draft = v.status === 'draft';
  const levelTitle = new Map(p.levels.map((l) => [l.code, l.title]));
  const competencyTitle = new Map(p.competencies.map((c) => [c.code, c.title]));

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <p className="font-bold text-ink-muted">
          <a href="/mon-espace/configuration/programmes">Programmes</a> / {p.code}
        </p>
        <h1 className="text-4xl font-extrabold">
          {p.title} · version {v.label}
        </h1>
        <p className={draft ? 'font-bold' : 'text-ink-muted'} data-testid="version-state">
          {versionState(v, today)}
        </p>
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      <div className={`${cardClass} space-y-2`}>
        <h2 className="text-xl font-bold">Source</h2>
        <p>
          {v.source.title} — {v.source.issuer}
          {v.source.publishedOn ? `, ${v.source.publishedOn}` : ''}
          {v.source.url && (
            <>
              {' · '}
              <a href={v.source.url} rel="noreferrer" target="_blank">
                voir le texte
              </a>
            </>
          )}
        </p>
        {!v.source.isOfficial && (
          <p className="font-bold">
            Source non officielle : à ne pas présenter comme le programme du ministère.
          </p>
        )}
        {v.notes && <p className="text-ink-muted">{v.notes}</p>}
        <p>
          {v.counts.levels} niveau{v.counts.levels > 1 ? 'x' : ''}, {v.counts.subjects} matière
          {v.counts.subjects > 1 ? 's' : ''}, {v.counts.competencies} compétence
          {v.counts.competencies > 1 ? 's' : ''}.
        </p>
      </div>

      {draft && (
        <div className={`${cardClass} space-y-4 border-2 border-primary`}>
          <h2 className="text-xl font-bold">Publier ce brouillon</h2>
          {p.canPublish ? (
            <form action={publishCurriculumAction} className="flex flex-wrap items-end gap-4">
              <input type="hidden" name="code" value={p.code} />
              <input type="hidden" name="label" value={v.label} />
              <label className="block font-bold">
                Date d’entrée en vigueur
                <input
                  type="date"
                  name="effectiveFrom"
                  required
                  defaultValue={today}
                  className={inputClass}
                />
              </label>
              <button type="submit" className={buttonClass}>
                Publier la version {v.label}
              </button>
            </form>
          ) : (
            <p>Relisez le contenu ci-dessous ; le référent pédagogique le publiera.</p>
          )}
          <p className="text-ink-muted">
            Une fois publiée, la version ne se modifie plus. La version en vigueur jusque-là
            s’arrête à cette date et reste consultable.
          </p>
          <form action={deleteCurriculumDraftAction}>
            <input type="hidden" name="code" value={p.code} />
            <input type="hidden" name="label" value={v.label} />
            <button type="submit" className={secondaryButtonClass}>
              Supprimer ce brouillon
            </button>
          </form>
        </div>
      )}

      <div className="space-y-4" data-testid="subjects">
        {p.subjects.map((s) => {
          const list = p.competencies.filter((c) => c.subject === s.code);
          return (
            <section key={s.code} className={cardClass}>
              <h2 className="text-xl font-bold">
                {s.title}{' '}
                <span className="text-base font-normal text-ink-muted">
                  ({list.length} compétence{list.length > 1 ? 's' : ''})
                </span>
              </h2>
              <ul className="mt-3 space-y-2">
                {list.map((c) => (
                  <li key={c.code}>
                    <span className="font-bold">{c.title}</span>
                    <span className="text-sm text-ink-muted">
                      {' · '}
                      {c.code}
                      {c.level ? ` · ${levelTitle.get(c.level) ?? c.level}` : ''}
                    </span>
                    {c.description && <p className="text-sm">{c.description}</p>}
                    {c.prerequisites.length > 0 && (
                      <p className="text-sm">
                        Prérequis :{' '}
                        {c.prerequisites.map((pr) => competencyTitle.get(pr) ?? pr).join(', ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </section>
  );
}
