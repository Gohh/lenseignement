import type { CourseSummary, OrganizationListItem } from '@lenseignement/types';
import Link from 'next/link';
import { STATUS_LABELS } from '@/components/Notice';
import { apiGet, type CohortSummary } from '@/lib/api';

const STEPS = ['draft', 'in_review', 'approved', 'published'] as const;

// Pastilles : pas d'orange en texte (charte) ; l'orange sert seulement de fond doux.
const BADGE: Record<string, string> = {
  draft: 'bg-line text-ink',
  in_review: 'bg-accent-soft text-accent-ink',
  approved: 'bg-primary-soft text-primary',
  published: 'bg-primary text-surface',
  archived: 'bg-line text-ink-muted',
};

const cardClass = 'rounded-big border border-line bg-surface p-5';

/** Tableau de bord de l'espace d'administration : chiffres, circuit des cours, derniers cours. */
export async function StaffDashboard({
  accessToken,
  displayName,
  roleLabel,
}: {
  accessToken: string;
  displayName: string;
  roleLabel: string;
}) {
  const [organizations, courses, cohorts] = await Promise.all([
    apiGet<{ items: OrganizationListItem[] }>(accessToken, '/organizations'),
    apiGet<{ items: CourseSummary[] }>(accessToken, '/authoring/courses'),
    apiGet<CohortSummary[]>(accessToken, '/cohorts'),
  ]);
  const schools = organizations.ok
    ? organizations.data.items.filter((o) => o.type !== 'authority').length
    : null;
  const list = courses.ok ? courses.data.items : [];
  const count = (status: string) => list.filter((c) => c.latest.status === status).length;
  const latest = [...list]
    .sort((a, b) => b.latest.updatedAt.localeCompare(a.latest.updatedAt))
    .slice(0, 6);

  const stats: Array<{ label: string; value: number | null }> = [
    { label: 'Établissements', value: schools },
    { label: 'Classes', value: cohorts.ok ? cohorts.data.length : null },
    { label: 'Cours', value: courses.ok ? list.length : null },
    { label: 'Cours publiés', value: courses.ok ? count('published') : null },
  ];

  return (
    <section aria-labelledby="dashboard-title" className="space-y-6">
      <div className="space-y-1">
        <p className="font-bold text-ink-muted">Section / Tableau de bord</p>
        <h1 id="dashboard-title" className="text-4xl font-extrabold">
          Bonjour, {displayName}
        </h1>
        <p className="font-bold text-primary">Espace {roleLabel}</p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="list">
        {stats.map((s) => (
          <li key={s.label} className={cardClass}>
            <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">{s.label}</p>
            <p className="font-display text-4xl font-extrabold text-ink-strong">{s.value ?? '–'}</p>
          </li>
        ))}
      </ul>

      <div className={cardClass}>
        <h2 className="text-xl font-extrabold">Circuit des cours</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-4" aria-label="Étapes du circuit">
          {STEPS.map((step, i) => (
            <li
              key={step}
              className="flex items-center gap-3 rounded-card bg-primary-soft p-3"
              data-testid={`circuit-${step}`}
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary font-bold text-surface"
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-ink-muted">{STATUS_LABELS[step]}</span>
                <span className="block font-display text-2xl font-extrabold">{count(step)}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold">Derniers cours</h2>
          <Link
            href="/mon-espace/cours"
            className="inline-flex min-h-[44px] items-center underline"
          >
            Voir tous les cours
          </Link>
        </div>
        {latest.length > 0 ? (
          <ul className="mt-2 divide-y divide-line" role="list">
            {latest.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  <Link
                    href={`/mon-espace/cours/${c.id}`}
                    className="inline-flex min-h-[44px] items-center font-bold underline"
                  >
                    {c.latest.title}
                  </Link>
                  <p className="text-sm text-ink-muted">{c.organization.name}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-bold ${BADGE[c.latest.status] ?? BADGE.draft}`}
                >
                  {STATUS_LABELS[c.latest.status] ?? c.latest.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-ink-muted">Aucun cours pour le moment.</p>
        )}
      </div>
    </section>
  );
}
