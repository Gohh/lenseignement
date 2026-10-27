import { BRANCHES, CatalogQuerySchema, type CatalogPage } from '@lenseignement/types';
import { CourseCard } from '@lenseignement/ui';
import Link from 'next/link';
import { buttonClass, inputClass } from '@/components/Notice';
import { publicApiGet } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Catalogue des cours' };

type SearchParams = Record<string, string | string[] | undefined>;

interface Props {
  searchParams: Promise<SearchParams>;
}

const BRANCH_TITLES = new Map<string, string>(BRANCHES.map((b) => [b.code, b.title]));

/** Garde seulement les filtres valides : un lien abîmé affiche le catalogue complet. */
function readFilters(params: SearchParams) {
  const single = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);
  const parsed = CatalogQuerySchema.safeParse({
    branch: single(params.branch),
    q: single(params.q),
    competency: single(params.competency),
    page: single(params.page),
  });
  return parsed.success ? parsed.data : { page: 1 };
}

/** Paramètres d'URL des filtres, partagés par les liens de la page et l'appel à l'API. */
function toQuery(filters: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

const minutes = (n: number | null) => (n ? `${n} min` : null);

export default async function CataloguePage({ searchParams }: Props) {
  const filters = readFilters(await searchParams);
  const result = await publicApiGet<CatalogPage>(`/catalog/courses${toQuery(filters)}`);

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Catalogue des cours</h1>
      <p className="max-w-2xl text-ink-muted">
        Tous les cours affichés ont été relus par un référent pédagogique puis publiés par une
        deuxième personne. Version de démonstration : les contenus sont fictifs.
      </p>

      {/* Formulaire GET classique : fonctionne sans JavaScript et sur réseau faible. */}
      <form
        method="get"
        action="/catalogue"
        role="search"
        aria-label="Filtrer les cours"
        className="grid gap-4 rounded-card border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
      >
        <label className="block font-bold">
          Espace
          <select name="branch" defaultValue={filters.branch ?? ''} className={inputClass}>
            <option value="">Tous les espaces</option>
            {BRANCHES.map((b) => (
              <option key={b.code} value={b.code}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block font-bold">
          Rechercher
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ''}
            maxLength={100}
            className={inputClass}
          />
        </label>
        <label className="block font-bold">
          Compétence
          <select name="competency" defaultValue={filters.competency ?? ''} className={inputClass}>
            <option value="">Toutes les compétences</option>
            {result.ok &&
              result.data.competencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.title}
                </option>
              ))}
          </select>
        </label>
        <button type="submit" className={`${buttonClass} justify-center`}>
          Filtrer
        </button>
      </form>

      {!result.ok ? (
        <p role="alert">Le catalogue est momentanément indisponible. Réessayez dans un instant.</p>
      ) : (
        <>
          <p role="status" className="font-bold" data-testid="catalogue-count">
            {result.data.total === 0
              ? 'Aucun cours ne correspond à votre recherche.'
              : `${result.data.total} cours trouvé${result.data.total > 1 ? 's' : ''}`}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list">
            {result.data.items.map((course) => (
              <li key={course.id}>
                <CourseCard
                  href={`/catalogue/${course.id}`}
                  title={course.title}
                  summary={course.summary}
                  meta={[
                    BRANCH_TITLES.get(course.branch) ?? course.branch,
                    course.audience,
                    `${course.lessonCount} leçon${course.lessonCount > 1 ? 's' : ''}`,
                    minutes(course.estimatedMinutes),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              </li>
            ))}
          </ul>
          <Pagination filters={filters} page={result.data} />
        </>
      )}
    </section>
  );
}

function Pagination({
  filters,
  page,
}: {
  filters: ReturnType<typeof readFilters>;
  page: CatalogPage;
}) {
  const pages = Math.ceil(page.total / page.pageSize);
  if (pages <= 1) return null;
  const linkClass = 'inline-flex min-h-[44px] items-center font-bold underline';
  return (
    <nav aria-label="Pages du catalogue" className="flex flex-wrap items-center gap-4">
      {page.page > 1 && (
        <Link
          href={`/catalogue${toQuery({ ...filters, page: page.page - 1 })}`}
          className={linkClass}
        >
          ← Page précédente
        </Link>
      )}
      <span>
        Page {page.page} sur {pages}
      </span>
      {page.page < pages && (
        <Link
          href={`/catalogue${toQuery({ ...filters, page: page.page + 1 })}`}
          className={linkClass}
        >
          Page suivante →
        </Link>
      )}
    </nav>
  );
}
