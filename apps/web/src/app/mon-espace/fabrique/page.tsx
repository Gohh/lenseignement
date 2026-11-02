import {
  EXERCISE_DIFFICULTY_LABELS,
  EXERCISE_DOMAINS,
  EXERCISE_DOMAIN_LABELS,
  EXERCISE_KIND_LABELS,
  EXERCISE_SKILL_LABELS,
  EXERCISE_STATUSES,
  EXERCISE_STATUS_LABELS,
  type ExerciseCompetencyOption,
  type ExerciseDomain,
  type ExerciseSummary,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fabrique d’exercices' };

const HOME = '/mon-espace/fabrique';

const badge: Record<ExerciseSummary['status'], string> = {
  draft: 'bg-line text-ink',
  review: 'bg-accent-soft text-accent-ink',
  published: 'bg-primary-soft text-primary',
  archived: 'bg-line text-ink-muted',
};

function Row({ e }: { e: ExerciseSummary }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1 basis-60">
        <Link href={`${HOME}/${e.id}`} className="font-display text-lg font-bold underline">
          {e.title}
        </Link>
        <p className="text-sm text-ink-muted">
          {e.competency.code} {e.competency.title} · {EXERCISE_KIND_LABELS[e.kind]} ·{' '}
          {EXERCISE_DIFFICULTY_LABELS[e.difficulty]} · {EXERCISE_SKILL_LABELS[e.skill]}
        </p>
        <p className="text-sm text-ink-muted">
          {e.organization.name}
          {e.author ? ` · ${e.author}` : ''}
          {!e.mine && ' · banque commune'}
        </p>
      </div>
      <span className={`rounded-full px-3 py-1 text-sm font-bold ${badge[e.status]}`}>
        {EXERCISE_STATUS_LABELS[e.status]}
      </span>
    </li>
  );
}

/** Lien de filtre qui garde les autres filtres. */
function href(query: Record<string, string>, patch: Record<string, string | null>): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...query, ...patch })) if (v) next.set(k, v);
  const s = next.toString();
  return s ? `${HOME}?${s}` : HOME;
}

/**
 * Banque d'exercices : ceux de ses structures (ou toute la banque publiée), filtrés par programme,
 * domaine, état et mot-clé, avec le nombre d'exercices par domaine.
 */
export default async function ExerciseBankPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${HOME}`);
  const raw = (await searchParams) ?? {};
  const filters = {
    scope: param(raw.banque) === 'toute' ? 'toute' : '',
    etat: (EXERCISE_STATUSES as readonly string[]).includes(param(raw.etat) ?? '')
      ? param(raw.etat)!
      : '',
    domaine: (EXERCISE_DOMAINS as readonly string[]).includes(param(raw.domaine) ?? '')
      ? param(raw.domaine)!
      : '',
    programme: /^[0-9a-f-]{36}$/i.test(param(raw.programme) ?? '') ? param(raw.programme)! : '',
    q: (param(raw.q) ?? '').slice(0, 100),
  };
  const api = new URLSearchParams();
  if (filters.scope) api.set('scope', 'all');
  if (filters.etat) api.set('status', filters.etat);
  if (filters.domaine) api.set('domain', filters.domaine);
  if (filters.programme) api.set('curriculum', filters.programme);
  if (filters.q) api.set('q', filters.q);

  const [list, orgs, comps] = await Promise.all([
    apiGet<{ items: ExerciseSummary[]; byDomain: Record<string, number> }>(
      session.accessToken,
      `/authoring/exercises?${api.toString()}`,
    ),
    apiGet<{ items: Array<{ id: string }> }>(
      session.accessToken,
      '/authoring/exercises/organizations',
    ),
    apiGet<{ items: ExerciseCompetencyOption[] }>(
      session.accessToken,
      '/authoring/exercises/competencies',
    ),
  ]);
  const items = list.ok ? list.data.items : [];
  const byDomain = list.ok ? list.data.byDomain : {};
  const toReview = items.filter((e) => e.status === 'review' && e.canPublish);
  const others = items.filter((e) => !toReview.includes(e));
  const canCreate = orgs.ok && orgs.data.items.length > 0;
  const curricula = [
    ...new Map(
      (comps.ok ? comps.data.items : []).map((c) => [c.curriculumId, c.curriculum]),
    ).entries(),
  ];
  const total = Object.values(byDomain).reduce((a, b) => a + b, 0);
  const domains = EXERCISE_DOMAINS.filter((d) => (byDomain[d] ?? 0) > 0 || d === filters.domaine);
  const chip = (active: boolean) =>
    `inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 font-bold no-underline ${
      active
        ? 'border-primary bg-primary text-surface'
        : 'border-line-strong bg-surface text-ink hover:bg-primary-soft'
    }`;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Fabrique d’exercices</h1>
          <p className="text-ink-muted">
            Exercices rattachés aux compétences des programmes, rangés par domaine comme dans les
            grandes évaluations. Rédigés, relus, puis publiés dans la banque.
          </p>
        </div>
        {canCreate && (
          <div className="flex flex-wrap gap-3">
            <Link href={`${HOME}/ia`} className={secondaryButtonClass}>
              Proposer avec l’IA
            </Link>
            <Link href={`${HOME}/importer`} className={secondaryButtonClass}>
              Importer
            </Link>
            <Link
              href={`${HOME}/nouveau`}
              className="inline-flex min-h-[44px] items-center rounded-card bg-primary px-5 font-bold text-surface no-underline hover:bg-primary-dark"
            >
              Créer un exercice
            </Link>
          </div>
        )}
      </div>
      <Notice message={param(raw.message)} error={param(raw.erreur)} />

      <nav aria-label="Quelle banque" className="flex flex-wrap gap-2">
        <Link href={href(filters, { scope: null })} className={chip(!filters.scope)}>
          Mes structures
        </Link>
        <Link href={href(filters, { scope: 'toute' })} className={chip(!!filters.scope)}>
          Toute la banque publiée
        </Link>
      </nav>

      <form method="get" action={HOME} className="flex flex-wrap items-end gap-3">
        {filters.scope && <input type="hidden" name="banque" value="toute" />}
        {filters.domaine && <input type="hidden" name="domaine" value={filters.domaine} />}
        <label className="block min-w-0 flex-1 basis-56 font-bold">
          Chercher
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Titre, compétence, code…"
            className={inputClass}
          />
        </label>
        <label className="block min-w-0 flex-1 basis-56 font-bold">
          Programme
          <select name="programme" defaultValue={filters.programme} className={inputClass}>
            <option value="">Tous</option>
            {curricula.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0 basis-40 font-bold">
          État
          <select name="etat" defaultValue={filters.etat} className={inputClass}>
            <option value="">Tous</option>
            {EXERCISE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EXERCISE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={secondaryButtonClass}>
          Filtrer
        </button>
      </form>

      <div className="rounded-big border border-line bg-surface p-5" data-testid="exercise-domains">
        <h2 className="text-xl font-extrabold">Par domaine</h2>
        <p className="text-sm text-ink-muted">
          Repérez les domaines où il manque des exercices. Touchez un domaine pour n’afficher que
          lui.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={href(filters, { domaine: null })} className={chip(!filters.domaine)}>
            Tous <span aria-label={`${total} exercices`}>{total}</span>
          </Link>
          {domains.map((d) => (
            <Link
              key={d}
              href={href(filters, { domaine: d })}
              className={chip(filters.domaine === d)}
            >
              {EXERCISE_DOMAIN_LABELS[d as ExerciseDomain]}{' '}
              <span aria-label={`${byDomain[d] ?? 0} exercices`}>{byDomain[d] ?? 0}</span>
            </Link>
          ))}
        </div>
      </div>

      {toReview.length > 0 && (
        <div className="rounded-big border border-line bg-surface p-5">
          <h2 className="text-xl font-extrabold">À relire</h2>
          <ul className="divide-y divide-line" data-testid="exercises-review">
            {toReview.map((e) => (
              <Row key={e.id} e={e} />
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-big border border-line bg-surface p-5">
        <h2 className="text-xl font-extrabold">
          {filters.scope ? 'Banque publiée et mes exercices' : 'Exercices de mes structures'}
        </h2>
        {others.length === 0 ? (
          <p className="mt-2 text-ink-muted">
            {total === 0 && !filters.q && !filters.etat && !filters.programme
              ? 'Aucun exercice pour l’instant.'
              : 'Aucun exercice ne correspond à ces filtres.'}
          </p>
        ) : (
          <ul className="divide-y divide-line" data-testid="exercises-list">
            {others.map((e) => (
              <Row key={e.id} e={e} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
